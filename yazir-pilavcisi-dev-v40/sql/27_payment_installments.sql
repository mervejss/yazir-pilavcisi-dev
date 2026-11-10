-- =====================================================================
-- YAZIR PİLAVCISI · 27 · Ödemeler: parça parça ödeme, tarihli kayıt, aylık dönemler
-- 26_payment_notebook.sql çalıştırıldıktan sonra bir kez çalıştırın. Tekrar çalıştırmak güvenlidir.
--   * Aylık kayıtlara başlangıç / bitiş tarihi (dönemleri sayfa kendisi üretir)
--   * Ödeme ekle / düzenle / sil: istenen tarihte, istenen tutarda (geçmişe dönük de)
--   * Tek seferlikte toplam − ödenen = kalan; kalan 0 olunca kayıt kapanır, düşerse yeniden açılır
-- =====================================================================

alter table public.payment_notes add column if not exists start_date date;
alter table public.payment_notes add column if not exists end_date date;

-- Ödeme ekle (p_log null) ya da düzenle (p_log dolu)
create or replace function public.payment_log_save(
  p_log uuid, p_note uuid, p_amount numeric, p_paid_at timestamptz,
  p_for_date date default null, p_memo text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  n public.payment_notes%rowtype; v_note uuid := p_note; v_paid numeric(12,2);
begin
  if not public.is_owner() then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Tutar 0''dan büyük olmalı' using errcode = 'P0001'; end if;

  if p_log is not null then
    select note_id into v_note from public.payment_note_log where id = p_log for update;
    if not found then raise exception 'Ödeme kaydı bulunamadı' using errcode = 'P0001'; end if;
  end if;
  select * into n from public.payment_notes where id = v_note for update;
  if not found then raise exception 'Kayıt bulunamadı' using errcode = 'P0001'; end if;

  if p_log is null then
    insert into public.payment_note_log (note_id, amount, paid_at, for_date, memo, created_by)
    values (v_note, p_amount, coalesce(p_paid_at, now()), p_for_date, nullif(trim(coalesce(p_memo, '')), ''), auth.uid());
  else
    update public.payment_note_log
       set amount = p_amount, paid_at = coalesce(p_paid_at, paid_at), for_date = p_for_date,
           memo = nullif(trim(coalesce(p_memo, '')), '')
     where id = p_log;
  end if;

  select coalesce(sum(amount), 0) into v_paid from public.payment_note_log where note_id = v_note;
  if n.recurrence = 'once' then
    update public.payment_notes set status = case when v_paid >= n.amount then 'closed' else 'open' end where id = v_note;
  end if;
  return jsonb_build_object('paid', v_paid, 'remaining', greatest(n.amount - v_paid, 0));
end $$;

-- Ödeme kaydını sil; tek seferlikte kalan yeniden hesaplanır
create or replace function public.payment_undo_log(p_log uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare l public.payment_note_log%rowtype; n public.payment_notes%rowtype; v_paid numeric(12,2);
begin
  if not public.is_owner() then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  select * into l from public.payment_note_log where id = p_log for update;
  if not found then raise exception 'Ödeme kaydı bulunamadı' using errcode = 'P0001'; end if;
  select * into n from public.payment_notes where id = l.note_id for update;
  delete from public.payment_note_log where id = l.id;
  if n.recurrence = 'once' then
    select coalesce(sum(amount), 0) into v_paid from public.payment_note_log where note_id = n.id;
    update public.payment_notes set status = case when v_paid >= n.amount then 'closed' else 'open' end where id = n.id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.payment_log_save(uuid, uuid, numeric, timestamptz, date, text), public.payment_undo_log(uuid) from public, anon;
grant execute on function public.payment_log_save(uuid, uuid, numeric, timestamptz, date, text), public.payment_undo_log(uuid) to authenticated;
