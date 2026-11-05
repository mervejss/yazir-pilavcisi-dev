-- =====================================================================
-- YAZIR PİLAVCISI · 13 · Google Reviews Daily Cron Job
-- pg_cron extension ile her gün Google yorumlarını senkronize eder
-- =====================================================================

-- pg_cron extension'ı etkinleştir (Supabase'de genelde etkindir, yoksa dashboard'dan etkinleştirin)
-- create extension if not exists pg_cron;

-- Her gün gece 03:00'de Google yorumlarını senkronize et
-- Not: Bu cron job'u Supabase Dashboard > Database > Extensions > pg_cron üzerinden
-- veya SQL Editor'de çalıştırarak oluşturabilirsiniz.

-- Cron job oluşturma (SQL Editor'de çalıştırın):
/*
select cron.schedule(
  'google-reviews-daily-sync',
  '0 3 * * *', -- Her gün 03:00 UTC (Türkiye yaz saati 06:00, kış saati 05:00)
  $$
  select net.http_post(
    url := current_setting('supabase.url') || '/functions/v1/google-reviews-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
*/

-- Cron job'u silmek isterseniz:
/*
select cron.unschedule('google-reviews-daily-sync');
*/

-- Cron job'ları listelemek:
/*
select * from cron.job;
*/

-- Cron job çalışma geçmişini görmek:
/*
select * from cron.job_run_details
where job_name = 'google-reviews-daily-sync'
order by start_time desc
limit 10;
*/

-- =====================================================================
-- Alternatif: Supabase Edge Function Cron (Supabase Dashboard > Edge Functions > Cron)
-- =====================================================================
-- Supabase Dashboard'dan Edge Function cron job oluşturmak daha kolaydır:
-- 1. Supabase Dashboard > Edge Functions > google-reviews-sync
-- 2. "Create cron job" butonuna tıkla
-- 3. Schedule: "0 3 * * *" (her gün 03:00 UTC)
-- 4. Payload: {} (boş JSON)
-- 5. Save

-- =====================================================================
-- Manual trigger için helper fonksiyon (admin panelden çağrılabilir)
-- =====================================================================
create or replace function public.trigger_google_reviews_sync(
  p_place_id text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_result jsonb;
  v_place_id text := p_place_id;
begin
  -- Eğer place_id verilmediyse business_settings'ten al
  if v_place_id is null then
    select google_maps_url into v_place_id
    from public.business_settings
    where id = 1;
  end if;

  -- Edge Function'ı tetikle (pg_net extension gerekli)
  -- Bu fonksiyon sadece loglama için, gerçek tetikleme HTTP ile olur
  return jsonb_build_object(
    'message', 'Use HTTP POST to Edge Function for actual sync',
    'place_id', v_place_id,
    'endpoint', current_setting('supabase.url') || '/functions/v1/google-reviews-sync'
  );
end;
$$;

grant execute on function public.trigger_google_reviews_sync(text) to authenticated;

-- =====================================================================
-- Admin panelde görüntüleme için view (son sync durumu)
-- =====================================================================
create or replace view public.google_reviews_sync_status as
select
  grsl.place_id,
  grsl.reviews_fetched,
  grsl.reviews_new,
  grsl.reviews_updated,
  grsl.status,
  grsl.error_message,
  grsl.started_at,
  grsl.completed_at,
  (select count(*) from public.site_reviews where source = 'google' and google_place_id = grsl.place_id) as total_google_reviews
from public.google_reviews_sync_log grsl
where grsl.id = (
  select max(id) from public.google_reviews_sync_log where place_id = grsl.place_id
);

grant select on public.google_reviews_sync_status to authenticated;