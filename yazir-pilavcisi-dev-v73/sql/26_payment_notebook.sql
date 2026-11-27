-- =====================================================================
-- YAZIR PİLAVCISI · 26 · Ödemeler (borç / alacak not defteri)
-- Supabase > SQL Editor'e yapıştırıp bir kez çalıştırın. Tekrar çalıştırmak güvenlidir.
-- Yalnızca "owner" (işletme sahibi) görür ve değiştirir.
--   payment_notes     : ödenecek (borç) veya alınacak (alacak) kayıtlar — tek seferlik ya da aylık
--   payment_note_log  : yapılan ödemelerin geçmişi
--   payment_mark_paid : ödendi işaretle (aylık kayıtta vade bir ay ilerler)
--   payment_undo_log  : yanlış işaretlenen ödemeyi geri al
-- =====================================================================

create table if not exists public.payment_notes (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (length(trim(title)) between 1 and 160),
  direction      text not null default 'payable' check (direction in ('payable', 'receivable')),  -- payable: ben ödeyeceğim · receivable: bana ödenecek
  amount         numeric(12,2) not null check (amount >= 0),
  recurrence     text not null default 'once' check (recurrence in ('once', 'monthly')),
  due_date       date,
  category       text,
  person_name    text,
  person_phone   text,
  person_address text,
  notes          text,
  status         text not null default 'open' check (status in ('open', 'closed')),
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists payment_notes_status_idx on public.payment_notes(status, due_date);

create table if not exists public.payment_note_log (
  id        uuid primary key default gen_random_uuid(),
  note_id   uuid not null references public.payment_notes(id) on delete cascade,
  amount    numeric(12,2) not null check (amount > 0),
  paid_at   timestamptz not null default now(),
  for_date  date,                       -- hangi vadenin ödemesi (aylık kayıtlar için)
  memo      text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists payment_note_log_note_idx on public.payment_note_log(note_id, paid_at desc);

drop trigger if exists set_updated_at_payment_notes on public.payment_notes;
create trigger set_updated_at_payment_notes before update on public.payment_notes
  for each row execute function public.set_updated_at();

alter table public.payment_notes enable row level security;
alter table public.payment_note_log enable row level security;

drop policy if exists payment_notes_owner on public.payment_notes;
create policy payment_notes_owner on public.payment_notes for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));
drop policy if exists payment_note_log_owner on public.payment_note_log;
create policy payment_note_log_owner on public.payment_note_log for select to authenticated
  using ((select public.is_owner()));

revoke all on public.payment_notes, public.payment_note_log from anon;
grant select, insert, update, delete on public.payment_notes to authenticated;
grant select on public.payment_note_log to authenticated;

-- Ödendi işaretle. Tek seferlik: kalan 0'a inerse kapanır (kısmi ödeme desteklenir).
-- Aylık: vade bir ay ilerler, kayıt açık kalır.
create or replace function public.payment_mark_paid(
  p_note uuid, p_amount numeric default null, p_paid_at timestamptz default null, p_memo text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  n public.payment_notes%rowtype; v_amt numeric(12,2); v_paid numeric(12,2); v_due date;
begin
  if not public.is_owner() then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  select * into n from public.payment_notes where id = p_note for update;
  if not found then raise exception 'Kayıt bulunamadı' using errcode = 'P0001'; end if;
  if n.status = 'closed' then raise exception 'Bu kayıt zaten kapalı' using errcode = 'P0001'; end if;

  v_amt := coalesce(p_amount, n.amount);
  if v_amt is null or v_amt <= 0 then raise exception 'Tutar 0''dan büyük olmalı' using errcode = 'P0001'; end if;

  insert into public.payment_note_log (note_id, amount, paid_at, for_date, memo, created_by)
  values (n.id, v_amt, coalesce(p_paid_at, now()), n.due_date, nullif(trim(coalesce(p_memo, '')), ''), auth.uid());

  if n.recurrence = 'monthly' then
    v_due := (coalesce(n.due_date, (now() at time zone 'Europe/Istanbul')::date) + interval '1 month')::date;
    update public.payment_notes set due_date = v_due where id = n.id;
    return jsonb_build_object('status', 'open', 'next_due', v_due);
  end if;

  select coalesce(sum(amount), 0) into v_paid from public.payment_note_log where note_id = n.id;
  if v_paid >= n.amount then
    update public.payment_notes set status = 'closed' where id = n.id;
    return jsonb_build_object('status', 'closed');
  end if;
  return jsonb_build_object('status', 'open', 'remaining', n.amount - v_paid);
end $$;

-- Ödeme kaydını geri al (kayıt yeniden açılır / aylık vade bir ay geri gelir)
create or replace function public.payment_undo_log(p_log uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare l public.payment_note_log%rowtype; n public.payment_notes%rowtype;
begin
  if not public.is_owner() then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  select * into l from public.payment_note_log where id = p_log for update;
  if not found then raise exception 'Ödeme kaydı bulunamadı' using errcode = 'P0001'; end if;
  select * into n from public.payment_notes where id = l.note_id for update;
  delete from public.payment_note_log where id = l.id;
  if n.recurrence = 'monthly' then
    update public.payment_notes
       set due_date = coalesce(l.for_date, (n.due_date - interval '1 month')::date), status = 'open'
     where id = n.id;
  else
    update public.payment_notes set status = 'open' where id = n.id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.payment_mark_paid(uuid, numeric, timestamptz, text), public.payment_undo_log(uuid) from public, anon;
grant execute on function public.payment_mark_paid(uuid, numeric, timestamptz, text), public.payment_undo_log(uuid) to authenticated;

-- Başlangıç kayıtları (yalnızca tablo boşsa). Sonradan sayfadan düzenlenebilir / silinebilir.
insert into public.payment_notes (title, direction, amount, recurrence, category, person_name, notes)
select * from (values
  ('Web sitesi yapım ücreti',                    'payable', 35000::numeric, 'once',    'Web sitesi',   'H&M Software Studio', 'Tek seferlik'),
  ('Reklam yönetimi (aylık)',                    'payable', 10000::numeric, 'monthly', 'Reklam',       'H&M Software Studio', 'Aylık'),
  ('Sosyal medya yönetimi ve içerik üretimi',    'payable', 10000::numeric, 'monthly', 'Sosyal medya', 'H&M Software Studio', 'Aylık')
) as v(title, direction, amount, recurrence, category, person_name, notes)
where not exists (select 1 from public.payment_notes);
