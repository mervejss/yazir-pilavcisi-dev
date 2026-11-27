-- =====================================================================
-- 43 · TRENDYOL ZAMANLAYICI: yalnızca AÇIK ve ÇALIŞMA SAATİNDE çağır (v67)
-- Supabase → SQL Editor'de bir kez çalıştırın (sql/42'den sonra). Tekrar çalıştırmak güvenlidir.
-- Trendyol Go'da webhook/anlık bildirim YOK; tek yol çekmedir. Yükü azaltmak için:
--   * entegrasyon KAPALIysa hiç istek atılmaz,
--   * isteğe bağlı çalışma saati (İstanbul): integrations.config içine poll_from / poll_to (0-24) yazın.
--     Örn. 10:00-03:00 için  poll_from=10, poll_to=3   (gece yarısını aşan aralık desteklenir). Yazılmazsa 7/24.
--     Örnek:  update integrations set config = config || '{"poll_from":10,"poll_to":3}' where platform='trendyol';
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.yz_trendyol_tick()
returns void language plpgsql security definer set search_path = '' as $$
declare v_cfg jsonb; v_on boolean; v_h numeric; v_from numeric; v_to numeric; v_ok boolean;
begin
  select config, is_enabled into v_cfg, v_on from public.integrations where platform = 'trendyol';
  if not coalesce(v_on, false) then return; end if;
  v_h    := extract(hour from (now() at time zone 'Europe/Istanbul'));
  v_from := nullif(v_cfg->>'poll_from', '')::numeric;
  v_to   := nullif(v_cfg->>'poll_to', '')::numeric;
  v_ok := case
    when v_from is null or v_to is null or v_from = v_to then true
    when v_from < v_to then v_h >= v_from and v_h < v_to
    else v_h >= v_from or v_h < v_to end;
  if not v_ok then return; end if;
  perform net.http_post(
    url     := 'https://pgapkexzykydecedgzti.supabase.co/functions/v1/platform-trendyol',
    headers := jsonb_build_object('Content-Type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body    := '{"action":"sync_orders"}'::jsonb,
    timeout_milliseconds := 55000);
end $$;
revoke all on function public.yz_trendyol_tick() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'trendyol-sync-orders';
select cron.schedule('trendyol-sync-orders', '*/2 * * * *', $$ select public.yz_trendyol_tick(); $$);
