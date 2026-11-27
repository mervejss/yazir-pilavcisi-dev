-- =====================================================================
-- YAZIR PİLAVCISI · 03 · Row Level Security (RLS) politikaları
-- 02_functions_and_triggers.sql'den SONRA çalıştırın.
-- İlke: her tabloda RLS AÇIK; politika yoksa erişim YOK.
-- (select ...) sarmalı, fonksiyonun satır başına değil sorgu başına bir kez çalışmasını sağlar.
-- =====================================================================

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Şema ve Tablo Genel İzinleri
grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to anon, authenticated;
grant select on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (true);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- Not: kullanıcı yalnızca full_name ve phone sütunlarını güncelleyebilir (aşağıdaki sütun yetkileri).
-- Rol/aktiflik değişimi: set_staff_role / set_staff_active RPC'leri.

-- ---------------------------------------------------------------------
-- yetki katalogları
-- ---------------------------------------------------------------------
create policy permissions_select on public.permissions for select to anon, authenticated
  using (true);
create policy permissions_write on public.permissions for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

create policy role_permissions_select on public.role_permissions for select to anon, authenticated
  using (true);
create policy role_permissions_write on public.role_permissions for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- Personel yetkileri
create policy staff_permissions_select on public.staff_permissions for select to authenticated
  using (true);
create policy staff_permissions_write on public.staff_permissions for all to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- ---------------------------------------------------------------------
-- işletme ayarları, çalışma saatleri, kaynaklar
-- ---------------------------------------------------------------------
create policy business_settings_select on public.business_settings for select to anon, authenticated
  using (true);
create policy business_settings_update on public.business_settings for update to authenticated
  using ((select public.has_permission('settings.manage')))
  with check ((select public.has_permission('settings.manage')));

create policy opening_hours_select on public.opening_hours for select to anon, authenticated
  using (true);
create policy opening_hours_write on public.opening_hours for all to authenticated
  using ((select public.has_permission('settings.manage')))
  with check ((select public.has_permission('settings.manage')));

create policy order_sources_select on public.order_sources for select to authenticated
  using (true);
create policy order_sources_write on public.order_sources for all to authenticated
  using ((select public.has_permission('integrations.manage')))
  with check ((select public.has_permission('integrations.manage')));

-- ---------------------------------------------------------------------
-- menü: herkes ürünleri okur; yazma 'menu.manage'
-- ---------------------------------------------------------------------
create policy categories_select on public.categories for select to anon, authenticated
  using (true);
create policy categories_insert on public.categories for insert to authenticated
  with check ((select public.has_permission('menu.manage')));
create policy categories_update on public.categories for update to authenticated
  using ((select public.has_permission('menu.manage'))) with check ((select public.has_permission('menu.manage')));
create policy categories_delete on public.categories for delete to authenticated
  using ((select public.has_permission('menu.manage')));

create policy products_select on public.products for select to anon, authenticated
  using (true);
create policy products_insert on public.products for insert to authenticated
  with check ((select public.has_permission('menu.manage')));
create policy products_update on public.products for update to authenticated
  using ((select public.has_permission('menu.manage'))) with check ((select public.has_permission('menu.manage')));
create policy products_delete on public.products for delete to authenticated
  using ((select public.has_permission('menu.manage')));

create policy variants_select on public.product_variants for select to anon, authenticated
  using (true);
create policy variants_insert on public.product_variants for insert to authenticated
  with check ((select public.has_permission('menu.manage')));
create policy variants_update on public.product_variants for update to authenticated
  using ((select public.has_permission('menu.manage'))) with check ((select public.has_permission('menu.manage')));
create policy variants_delete on public.product_variants for delete to authenticated
  using ((select public.has_permission('menu.manage')));

-- ---------------------------------------------------------------------
-- müşteriler ve adresleri
-- ---------------------------------------------------------------------
create policy customers_select_own on public.customers for select to authenticated
  using (user_id = (select auth.uid()));
create policy customers_select_staff on public.customers for select to authenticated
  using ((select public.has_permission('customers.view')));
create policy customers_update_own on public.customers for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy customers_update_staff on public.customers for update to authenticated
  using ((select public.has_permission('customers.manage')))
  with check ((select public.has_permission('customers.manage')));

create policy addresses_own on public.customer_addresses for all to authenticated
  using (customer_id = (select public.my_customer_id()))
  with check (customer_id = (select public.my_customer_id()));
create policy addresses_select_staff on public.customer_addresses for select to authenticated
  using ((select public.has_permission('customers.view')));

-- ---------------------------------------------------------------------
-- masalar (müşteri tabloları DOĞRUDAN okuyamaz; QR için resolve_table_qr RPC'si var)
-- ---------------------------------------------------------------------
create policy tables_select on public.dining_tables for select to authenticated
  using (true);
create policy tables_insert on public.dining_tables for insert to authenticated
  with check ((select public.has_permission('tables.manage')));
create policy tables_update on public.dining_tables for update to authenticated
  using ((select public.has_permission('tables.manage'))) with check ((select public.has_permission('tables.manage')));
create policy tables_delete on public.dining_tables for delete to authenticated
  using ((select public.has_permission('tables.manage')));

create policy table_qr_select on public.table_qr_codes for select to authenticated
  using ((select public.has_permission('tables.view')));
create policy table_sessions_select on public.table_sessions for select to authenticated
  using ((select public.has_permission('tables.view')));
create policy table_status_history_select on public.table_status_history for select to authenticated
  using ((select public.has_permission('tables.view')));

-- ---------------------------------------------------------------------
-- siparişler
-- ---------------------------------------------------------------------
create policy orders_select_customer on public.orders for select to authenticated
  using (customer_id is not null and customer_id = (select public.my_customer_id()));
create policy orders_select_courier on public.orders for select to authenticated
  using (courier_id = (select auth.uid()) and (select public.current_app_role()) = 'courier');
create policy orders_select_staff on public.orders for select to authenticated
  using ((select public.has_permission('orders.view')));
create policy orders_update_staff on public.orders for update to authenticated
  using ((select public.has_permission('orders.edit')))
  with check ((select public.has_permission('orders.edit')));
-- INSERT/DELETE politikası YOK: sipariş yalnızca place_order / staff_create_order ile oluşur, hiçbir zaman silinemez.

create policy order_items_select on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));   -- sipariş RLS'i uygulanır
create policy order_history_select on public.order_status_history for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));

create policy order_issues_select on public.order_issues for select to authenticated
  using ((select public.has_permission('orders.view')));
create policy order_issues_insert on public.order_issues for insert to authenticated
  with check ((select public.has_permission('orders.edit')) and reported_by = (select auth.uid()));

-- ---------------------------------------------------------------------
-- kuryeler
-- ---------------------------------------------------------------------
create policy courier_profiles_select on public.courier_profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_permission('couriers.view')));
create policy courier_profiles_update on public.courier_profiles for update to authenticated
  using ((select public.has_permission('couriers.manage')))
  with check ((select public.has_permission('couriers.manage')));

create policy courier_locations_select on public.courier_locations for select to authenticated
  using (courier_id = (select auth.uid()) or (select public.has_permission('couriers.view')));

create policy courier_loc_hist_select on public.courier_location_history for select to authenticated
  using ((select public.has_permission('reports.view')));

create policy courier_deliveries_select on public.courier_deliveries for select to authenticated
  using (courier_id = (select auth.uid())
         or (select public.has_permission('couriers.view'))
         or (select public.has_permission('reports.view')));

-- ---------------------------------------------------------------------
-- bildirimler, cihazlar
-- ---------------------------------------------------------------------
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

create policy device_tokens_own on public.device_tokens for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- geri bildirim, toplu sipariş, yorumlar
-- ---------------------------------------------------------------------
create policy feedback_insert on public.feedback for insert to anon, authenticated
  with check (is_read = false);
create policy feedback_select on public.feedback for select to authenticated
  using ((select public.has_permission('feedback.view')));
create policy feedback_update on public.feedback for update to authenticated
  using ((select public.has_permission('feedback.view')))
  with check ((select public.has_permission('feedback.view')));

create policy bulk_insert on public.bulk_order_requests for insert to anon, authenticated
  with check (status = 'new' and handled_by is null);
create policy bulk_select on public.bulk_order_requests for select to authenticated
  using ((select public.has_permission('orders.view')));
create policy bulk_update on public.bulk_order_requests for update to authenticated
  using ((select public.has_permission('orders.edit')))
  with check ((select public.has_permission('orders.edit')));

create policy reviews_select on public.site_reviews for select to anon, authenticated
  using (true);
create policy reviews_write on public.site_reviews for all to authenticated
  using ((select public.has_permission('settings.manage')))
  with check ((select public.has_permission('settings.manage')));

-- ---------------------------------------------------------------------
-- entegrasyonlar (yalnızca 'integrations.manage' → varsayılan: sahip)
-- ---------------------------------------------------------------------
create policy integrations_all on public.integrations for all to authenticated
  using ((select public.has_permission('integrations.manage')))
  with check ((select public.has_permission('integrations.manage')));
create policy integration_events_select on public.integration_events for select to authenticated
  using ((select public.has_permission('integrations.manage')));
create policy platform_mappings_all on public.product_platform_mappings for all to authenticated
  using ((select public.has_permission('menu.manage')))
  with check ((select public.has_permission('menu.manage')));

-- ---------------------------------------------------------------------
-- denetim kaydı (yalnızca okuma)
-- ---------------------------------------------------------------------
create policy audit_select on public.audit_logs for select to authenticated
  using ((select public.has_permission('audit.view')));

-- =====================================================================
-- TABLO / SÜTUN YETKİLERİ (RLS'e ek ikinci savunma hattı)
-- =====================================================================
-- Ziyaretçi (anon) hiçbir tabloya yazamaz; yalnızca form tablolarına ekleme yapabilir
revoke insert, update, delete, truncate on all tables in schema public from anon;
grant insert on public.feedback, public.bulk_order_requests to anon;

-- Giriş yapmış kullanıcılar için: TRUNCATE ve zincir yetkileri kapalı
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- Sipariş ve geçmiş kayıtları: doğrudan yazma/silme kapalı (yalnızca RPC ve tetikleyiciler yazar)
revoke insert, delete on public.orders from authenticated;
revoke insert, update, delete on public.order_items, public.order_status_history,
  public.table_status_history, public.table_sessions, public.table_qr_codes,
  public.audit_logs, public.courier_locations, public.courier_location_history,
  public.courier_deliveries, public.integration_events from authenticated;

-- Profil: kullanıcı yalnızca ad ve telefonunu güncelleyebilir (rol/aktiflik DEĞİL)
revoke update on public.profiles from authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- Müşteri kaydı: yalnızca ad/telefon
revoke update on public.customers from authenticated;
grant update (full_name, phone) on public.customers to authenticated;
revoke insert, delete on public.customers from authenticated;

-- Bildirim: yalnızca okundu bilgisi değişir
revoke update on public.notifications from authenticated;
grant update (is_read) on public.notifications to authenticated;

-- Kurye kaydı: personel yalnızca bilgi alanlarını değiştirir (çevrimiçi durumu RPC ile)
revoke update on public.courier_profiles from authenticated;
grant update (vehicle_type, plate, notes) on public.courier_profiles to authenticated;
revoke insert, delete on public.courier_profiles from authenticated;

-- Profillere satır eklenemez/silinemez (auth tetikleyicisi yönetir)
revoke insert, delete on public.profiles from authenticated;

-- Geri bildirim: personel yalnızca okundu işaretler
revoke update on public.feedback from authenticated;
grant update (is_read) on public.feedback to authenticated;
