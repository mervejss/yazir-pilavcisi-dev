-- =====================================================================
-- 18 · TRENDYOL 7/24 OTOMATİK SENKRON (sunucu zamanlayıcısı)
-- Site/panel kapalıyken de siparişleri ve durum değişikliklerini çeker.
-- ÖNCE: Dashboard → Database → Extensions: pg_cron ve pg_net AÇIK olsun.
-- SONRA: aşağıdaki iki yeri doldurun:
--   <PROJE_REF>   = pgapkexzykydecedgzti
--   <CRON_SECRET> = Edge Function secret'ında tanımladığınız CRON_SECRET ile AYNI değer
-- Tekrar çalıştırmak güvenlidir.
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Gizli değer vault'ta saklanır (SQL dosyasında/zamanlama kaydında düz yazı kalmaz)
select vault.create_secret('<CRON_SECRET>', 'cron_secret')
where not exists (select 1 from vault.secrets where name = 'cron_secret');

select cron.unschedule(jobid) from cron.job where jobname = 'trendyol-sync-orders';

select cron.schedule(
  'trendyol-sync-orders',
  '30 seconds',                       -- sürüm eski ise '* * * * *' (dakikada bir) kullanın
  $$
  select net.http_post(
    url     := 'https://<PROJE_REF>.supabase.co/functions/v1/platform-trendyol',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body    := '{"action":"sync_orders"}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);

-- Kontrol:  select * from cron.job_run_details order by start_time desc limit 5;
