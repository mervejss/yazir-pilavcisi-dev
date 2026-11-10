-- =====================================================================
-- 35 · FİNANS: günlük otomatik çekim + kargo faturası kalemleri + eksik tablo onarımı
-- Tekrar çalıştırmak güvenlidir (idempotent).
-- ÖN KOŞUL: sql/18 (vault'ta 'cron_secret') ve sql/24 (finans tabloları) çalıştırılmış olmalı.
-- =====================================================================

-- 1) Kargo faturası kalemleri (Trendyol "Kargo Faturası Detayları" servisi)
create table if not exists public.finance_cargo_items (
  id             text primary key,
  platform       text not null default 'trendyol',
  invoice_serial text not null,
  invoice_date   timestamptz,
  parcel_id      text,
  order_number   text,
  package_type   text,                 -- Gönderi Kargo Bedeli / İade Kargo Bedeli
  amount         numeric(14,4) not null default 0,
  desi           numeric(8,2),
  raw            jsonb,
  synced_at      timestamptz not null default now()
);
create index if not exists finance_cargo_invoice_idx on public.finance_cargo_items(invoice_serial);
create index if not exists finance_cargo_order_idx   on public.finance_cargo_items(order_number);
create index if not exists finance_cargo_date_idx    on public.finance_cargo_items(invoice_date desc);

alter table public.finance_cargo_items enable row level security;
drop policy if exists finance_cargo_sel on public.finance_cargo_items;
create policy finance_cargo_sel on public.finance_cargo_items for select to authenticated
  using ((select public.has_permission('integrations.manage')));

grant select on public.finance_cargo_items to authenticated;
grant all on public.finance_cargo_items to service_role;

-- 2) Panelde 404 veren "opening_hours_overrides" tablosu (sql/09 çalıştırılmadıysa burada oluşur)
create table if not exists public.opening_hours_overrides (
  override_date   date primary key,
  open_time       time not null,
  close_time      time not null,
  closes_next_day boolean not null default false,
  is_closed       boolean not null default false,
  note            text,
  created_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id) on delete set null
);
alter table public.opening_hours_overrides enable row level security;
drop policy if exists opening_hours_overrides_select on public.opening_hours_overrides;
create policy opening_hours_overrides_select on public.opening_hours_overrides for select to anon, authenticated using (true);
drop policy if exists opening_hours_overrides_write on public.opening_hours_overrides;
create policy opening_hours_overrides_write on public.opening_hours_overrides for all to authenticated
  using ((select public.has_permission('settings.manage')))
  with check ((select public.has_permission('settings.manage')));
grant select on public.opening_hours_overrides to anon, authenticated;
grant insert, update, delete on public.opening_hours_overrides to authenticated;
-- (effective_hours / is_open_now fonksiyonları için ayrıca sql/09_hours_overrides.sql dosyasını bir kez çalıştırın.)

-- 3) Günlük otomatik finans çekimi (her gün 07:05–07:15 İstanbul; iş günü 03:00'te kapanmış olur)
--    Trendyol finans kayıtları teslimden SONRA oluşur ve payment_order_id sonradan dolar:
--    bu yüzden her gün son 14 gün yeniden çekilir (upsert, çoğaltmaz) + son 4 ödeme emri tam yenilenir.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname in ('trendyol-finance-settlements', 'trendyol-finance-other', 'trendyol-finance-rest');

select cron.schedule('trendyol-finance-settlements', '5 4 * * *', $$
  select net.http_post(
    url := 'https://pgapkexzykydecedgzti.supabase.co/functions/v1/platform-trendyol',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{"action":"finance_daily","part":"settlements"}'::jsonb,
    timeout_milliseconds := 120000);
$$);

select cron.schedule('trendyol-finance-other', '10 4 * * *', $$
  select net.http_post(
    url := 'https://pgapkexzykydecedgzti.supabase.co/functions/v1/platform-trendyol',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{"action":"finance_daily","part":"other"}'::jsonb,
    timeout_milliseconds := 120000);
$$);

select cron.schedule('trendyol-finance-rest', '15 4 * * *', $$
  select net.http_post(
    url := 'https://pgapkexzykydecedgzti.supabase.co/functions/v1/platform-trendyol',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{"action":"finance_daily","part":"rest"}'::jsonb,
    timeout_milliseconds := 120000);
$$);

-- Kontrol:
--   select jobname, schedule, active from cron.job where jobname like 'trendyol-finance%';
--   select jobid, status, return_message, start_time from cron.job_run_details order by start_time desc limit 6;
