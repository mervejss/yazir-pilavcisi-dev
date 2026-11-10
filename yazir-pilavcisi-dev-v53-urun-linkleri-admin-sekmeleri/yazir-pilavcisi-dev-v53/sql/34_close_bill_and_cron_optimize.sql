-- =====================================================================
-- 34 · MASA SİPARİŞİNDEN DOĞRUDAN "HESABI KAPAT"  +  KULLANIM (EGRESS / LOG) OPTİMİZASYONU
-- Tekrar çalıştırmak güvenlidir. Supabase → SQL Editor'de TAMAMINI bir kez çalıştırın.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Sipariş kartından hesabı kapat
--    Masadaki "hazır" siparişleri servis edilmiş yapar ve hesabı tek işlemde kapatır.
--    Mutfakta hâlâ hazırlanan/yeni sipariş varsa kapatmaz (net bir mesajla uyarır).
-- ---------------------------------------------------------------------
create or replace function public.close_table_from_order(
  p_order_id uuid,
  p_payment  public.payment_method default 'cash_at_table'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_o   public.orders%rowtype;
  v_res jsonb;
  v_pending int;
begin
  perform public._require_permission('tables.operate');
  perform public._require_permission('orders.edit');

  select * into v_o from public.orders where id = p_order_id;
  if not found then raise exception 'Sipariş bulunamadı' using errcode = 'P0001'; end if;
  if v_o.table_id is null or v_o.table_session_id is null then
    raise exception 'Bu sipariş bir masa hesabına bağlı değil' using errcode = 'P0001';
  end if;

  -- Mutfakta bekleyen sipariş varsa hesap kapanmaz
  select count(*) into v_pending from public.orders
   where table_session_id = v_o.table_session_id and status in ('new', 'preparing');
  if v_pending > 0 then
    raise exception 'Bu masada mutfakta % sipariş daha var; hazır olunca hesabı kapatın', v_pending using errcode = 'P0001';
  end if;

  -- Hazır olan siparişleri servis edildi yap (ready → delivered geçişi serbesttir)
  perform set_config('app.status_note', 'Hesap kapatılırken servis edildi', true);
  update public.orders set status = 'delivered'
   where table_session_id = v_o.table_session_id and status in ('ready', 'assigned', 'on_the_way');
  perform set_config('app.status_note', '', true);

  v_res := public.close_table_bill(v_o.table_id, p_payment);
  return v_res;
end $$;

revoke execute on function public.close_table_from_order(uuid, public.payment_method) from public, anon;
grant  execute on function public.close_table_from_order(uuid, public.payment_method) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2) Trendyol zamanlayıcısını DOĞRU biçimde 3 dakikaya çek
--    ÖNEMLİ: Önceki denemede iş `net.http_get` ile ve gizli anahtar (x-cron-secret) OLMADAN yeniden yazıldıysa
--    fonksiyon 401 döner ve senkron sessizce DURUR. Aşağısı işi doğru biçimiyle (POST + vault'taki gizli anahtar) kurar.
--    (vault'ta 'cron_secret' sql/18 ile zaten oluşturulmuştu; yoksa önce 18'i çalıştırın.)
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname in ('trendyol-sync-orders', 'trendyol-order-sync');

select cron.schedule(
  'trendyol-sync-orders',
  '*/3 * * * *',                        -- 3 dakikada bir (30 sn'de bir değil)
  $$
  select net.http_post(
    url     := 'https://pgapkexzykydecedgzti.supabase.co/functions/v1/platform-trendyol',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body    := '{"action":"sync_orders"}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);

-- ---------------------------------------------------------------------
-- 3) Kayıt şişmesini durdur: eski cron/http kayıtlarını ve platform olay günlüğünü düzenli temizle
--    (cron.job_run_details ve net._http_response tabloları sınırsız büyür)
-- ---------------------------------------------------------------------
delete from public.integration_events where created_at < now() - interval '14 days';
delete from cron.job_run_details       where end_time   < now() - interval '3 days';
delete from net._http_response         where created    < now() - interval '1 day';

select cron.unschedule(jobid) from cron.job where jobname = 'yz-housekeeping';
select cron.schedule(
  'yz-housekeeping',
  '17 4 * * *',                          -- her gün 04:17
  $$
  delete from public.integration_events where created_at < now() - interval '14 days';
  delete from cron.job_run_details       where end_time   < now() - interval '3 days';
  delete from net._http_response         where created    < now() - interval '1 day';
  $$
);

-- Kontrol:
--   select jobname, schedule, active from cron.job;
--   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
