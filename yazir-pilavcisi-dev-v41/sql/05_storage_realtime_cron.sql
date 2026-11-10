-- =====================================================================
-- YAZIR PİLAVCISI · 05 · Storage (fotoğraflar), Realtime ve zamanlanmış görevler
-- 04_reports_and_views.sql'den SONRA çalıştırın.
-- =====================================================================

-- ---------------------------------------------------------------------
-- STORAGE: herkes görür (menü vitrini), yalnızca 'menu.manage' yetkilisi yükler/siler
-- Dosya yolu önerisi:  product-images/<product_slug>/<dosya>.webp
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images',  'product-images',  true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('business-images', 'business-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "yazir_images_public_read" on storage.objects for select
  using (bucket_id in ('product-images', 'business-images'));

create policy "yazir_images_staff_insert" on storage.objects for insert to authenticated
  with check (bucket_id in ('product-images', 'business-images') and (select public.has_permission('menu.manage')));

create policy "yazir_images_staff_update" on storage.objects for update to authenticated
  using (bucket_id in ('product-images', 'business-images') and (select public.has_permission('menu.manage')))
  with check (bucket_id in ('product-images', 'business-images') and (select public.has_permission('menu.manage')));

create policy "yazir_images_staff_delete" on storage.objects for delete to authenticated
  using (bucket_id in ('product-images', 'business-images') and (select public.has_permission('menu.manage')));

-- ---------------------------------------------------------------------
-- REALTIME: anlık sipariş, masa, kurye konumu, bildirim
-- Realtime, RLS'e uyar: kullanıcı yalnızca görmeye yetkili olduğu değişiklikleri alır.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['orders', 'order_items', 'dining_tables', 'table_sessions',
                             'courier_locations', 'courier_profiles', 'notifications',
                             'feedback', 'bulk_order_requests', 'products', 'product_variants']
    loop
      if not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  else
    raise notice 'supabase_realtime yayını bulunamadı; Dashboard > Database > Replication bölümünden tabloları ekleyin.';
  end if;
end $$;

-- Güncellemelerde eski satır da gelsin (durum değişimi karşılaştırması için)
alter table public.orders replica identity full;

-- ---------------------------------------------------------------------
-- ZAMANLANMIŞ GÖREV: eski kurye konum geçmişini her gece 03:30 (TR) siler
-- pg_cron yoksa atlanır; Dashboard > Database > Extensions'dan açıp bu bloğu yeniden çalıştırabilirsiniz.
-- ---------------------------------------------------------------------
do $$
begin
  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception when others then
    raise notice 'pg_cron açılamadı (%). Konum temizliği için elle veya Edge Function ile çağırın: select public.cleanup_courier_location_history();', sqlerrm;
  end;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('yazir-cleanup-courier-locations', '30 0 * * *',   -- 00:30 UTC = 03:30 Türkiye
                          'select public.cleanup_courier_location_history()');
  end if;
exception when others then
  raise notice 'Cron görevi eklenemedi: %', sqlerrm;
end $$;
