-- =====================================================================
-- 41 · MASA HESABINI BÖLEREK / AYRI AYRI KAPATMA (v60)
-- Supabase → SQL Editor'de bir kez çalıştırın. Tekrar çalıştırmak güvenlidir.
-- Admin panelinde "Hesabı Kapat" → "👥 Böl / ayrı ayrı öde" bu fonksiyonu kullanır.
-- Varsayılan toplu ödeme eskisi gibi close_table_bill ile çalışmaya devam eder (bu dosya gerekmez).
-- =====================================================================
create table if not exists public.table_split_payments (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.table_sessions(id) on delete cascade,
  table_id    uuid references public.dining_tables(id) on delete set null,
  seq         int  not null default 1,
  label       text,
  method      text not null check (method in ('cash_at_table', 'card_at_table', 'iban')),
  amount      numeric(10,2) not null check (amount >= 0),
  lines       jsonb not null default '[]'::jsonb,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists table_split_session_idx on public.table_split_payments(session_id, seq);
create index if not exists table_split_created_idx on public.table_split_payments(created_at desc);

alter table public.table_split_payments enable row level security;
drop policy if exists table_split_select on public.table_split_payments;
create policy table_split_select on public.table_split_payments for select to authenticated
  using ((select public.is_staff()));
-- Yazma yalnızca aşağıdaki fonksiyonla yapılır.

-- p_payments: [{"label":"Ali","method":"cash_at_table|card_at_table|iban","amount":150.5,"lines":[{"k":"..","n":2}]}, ...]
-- Toplam, hesaptaki (iptal edilmemiş) siparişlerin toplamına KURUŞ düzeyinde eşit olmalı.
-- p_serve = true → hazır/yolda siparişler servis edilmiş sayılır (close_table_from_order ile aynı); mutfakta bekleyen varsa kapatmaz.
create or replace function public.close_table_bill_split(p_table_id uuid, p_payments jsonb, p_serve boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_session uuid; v_total numeric(10,2); v_sum numeric := 0; v_main text; v_res jsonb; s jsonb; n int := 0; v_pending int;
begin
  perform public._require_permission('tables.operate');
  if jsonb_typeof(coalesce(p_payments, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'Ödeme listesi boş' using errcode = 'P0001';
  end if;

  select id into v_session from public.table_sessions
   where table_id = p_table_id and status = 'open' order by opened_at desc, id desc limit 1 for update;
  if v_session is null then raise exception 'Bu masada açık hesap yok' using errcode = 'P0001'; end if;

  if p_serve then
    perform public._require_permission('orders.edit');
    select count(*) into v_pending from public.orders where table_session_id = v_session and status in ('new', 'preparing');
    if v_pending > 0 then
      raise exception 'Bu masada mutfakta % sipariş daha var; hazır olunca hesabı kapatın', v_pending using errcode = 'P0001';
    end if;
    perform set_config('app.status_note', 'Hesap kapatılırken servis edildi', true);
    update public.orders set status = 'delivered'
     where table_session_id = v_session and status in ('ready', 'assigned', 'on_the_way');
    perform set_config('app.status_note', '', true);
  end if;

  select coalesce(sum(total), 0) into v_total from public.orders where table_session_id = v_session and status = 'delivered';

  for s in select * from jsonb_array_elements(p_payments) loop
    if (s->>'method') not in ('cash_at_table', 'card_at_table', 'iban') then
      raise exception 'Geçersiz ödeme yöntemi' using errcode = 'P0001';
    end if;
    if coalesce((s->>'amount')::numeric, -1) < 0 then raise exception 'Geçersiz tutar' using errcode = 'P0001'; end if;
    v_sum := v_sum + (s->>'amount')::numeric;
  end loop;
  if abs(round(v_sum, 2) - v_total) > 0.01 then
    raise exception 'Ödemelerin toplamı (%) hesap tutarına (%) eşit olmalı', round(v_sum, 2), v_total using errcode = 'P0001';
  end if;

  -- Siparişlerdeki tek alan olan payment_method için en çok tutarı alan yöntem yazılır; ayrıntı table_split_payments'ta
  select x.method into v_main from (
    select (e->>'method') as method, sum((e->>'amount')::numeric) as amt
      from jsonb_array_elements(p_payments) e group by 1 order by 2 desc limit 1) x;

  for s in select * from jsonb_array_elements(p_payments) loop
    n := n + 1;
    insert into public.table_split_payments (session_id, table_id, seq, label, method, amount, lines)
    values (v_session, p_table_id, n, nullif(left(coalesce(s->>'label', ''), 40), ''), s->>'method',
            round((s->>'amount')::numeric, 2), coalesce(s->'lines', '[]'::jsonb));
  end loop;

  v_res := public.close_table_bill(p_table_id, v_main::public.payment_method);
  return v_res || jsonb_build_object('payments', n);
end $$;

revoke execute on function public.close_table_bill_split(uuid, jsonb, boolean) from public, anon;
grant  execute on function public.close_table_bill_split(uuid, jsonb, boolean) to authenticated, service_role;
