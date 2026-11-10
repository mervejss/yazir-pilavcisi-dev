-- =====================================================================
-- YAZIR PİLAVCISI · 12 · Google Reviews Integration
-- Google Places API'den çekilen yorumları saklamak için site_reviews tablosunu genişletir
-- =====================================================================

-- business_settings'e google_place_id kolonu ekle
alter table public.business_settings
  add column if not exists google_place_id text,
  add column if not exists last_google_reviews_sync timestamptz;

-- Google yorumları için ek alanlar
alter table public.site_reviews
  add column if not exists source text not null default 'manual' check (source in ('manual', 'google')),
  add column if not exists google_review_id text unique,
  add column if not exists google_place_id text,
  add column if not exists review_time timestamptz,
  add column if not exists profile_photo_url text,
  add column if not exists relative_time_description text,
  add column if not exists language text;

-- Google yorumları için indeksler
create index if not exists site_reviews_source_idx on public.site_reviews(source);
create index if not exists site_reviews_google_place_idx on public.site_reviews(google_place_id);
create index if not exists site_reviews_review_time_idx on public.site_reviews(review_time desc);

-- Google Places API yapılandırması için integrations tablosuna ek config
-- (integrations tablosu zaten var, config jsonb alanını kullanacağız)

-- RLS politikaları zaten mevcut, yeni alanlar da aynı politikalarla korunur
-- (site_reviews için: public select where is_published=true, authenticated insert/update/delete)

-- =====================================================================
-- Google Reviews Sync fonksiyonu (Edge Function tarafından çağrılacak)
-- =====================================================================
create or replace function public.sync_google_reviews(
  p_place_id text,
  p_api_key text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_result jsonb;
begin
  -- Bu fonksiyon Edge Function'dan çağrılacak, burada sadece döndürülen sonucu loglar
  -- Gerçek API çağrısı Edge Function'da yapılır (gizli API key'i korumak için)
  return jsonb_build_object(
    'success', true,
    'message', 'Use Edge Function for actual sync',
    'place_id', p_place_id
  );
end;
$$;

-- =====================================================================
-- Sync log tablosu (son senkronizasyon zamanlarını takip etmek için)
-- =====================================================================
create table if not exists public.google_reviews_sync_log (
  id bigint generated always as identity primary key,
  place_id text not null,
  reviews_fetched int not null default 0,
  reviews_new int not null default 0,
  reviews_updated int not null default 0,
  status text not null check (status in ('success', 'partial', 'error')),
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists google_reviews_sync_log_place_idx on public.google_reviews_sync_log(place_id, started_at desc);

-- RLS for sync log
alter table public.google_reviews_sync_log enable row level security;
create policy "Admins can view sync logs" on public.google_reviews_sync_log
  for select using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('owner', 'sub_admin')
    )
  );
create policy "Service role can insert sync logs" on public.google_reviews_sync_log
  for insert with check (auth.role() = 'service_role');

-- =====================================================================
-- Manuel tetikleme için view (admin panelde son sync durumunu göstermek için)
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