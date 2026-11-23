-- =====================================================================
-- !!! SADECE GELİŞTİRME İÇİN !!!  Tüm Yazır tablolarını, fonksiyonlarını ve tiplerini siler.
-- Kullanıcıları (auth.users) silmez. Canlıda ASLA çalıştırmayın.
-- =====================================================================
do $$
begin
  if current_setting('app.confirm_reset', true) is distinct from 'EVET' then
    raise exception 'Güvenlik: önce şunu çalıştırın -->  select set_config(''app.confirm_reset'', ''EVET'', false);';
  end if;
end $$;

drop trigger if exists on_auth_user_created       on auth.users;
drop trigger if exists on_auth_user_email_changed on auth.users;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('yazir-cleanup-courier-locations');
  end if;
exception when others then null;
end $$;

drop policy if exists "yazir_images_public_read"   on storage.objects;
drop policy if exists "yazir_images_staff_insert"  on storage.objects;
drop policy if exists "yazir_images_staff_update"  on storage.objects;
drop policy if exists "yazir_images_staff_delete"  on storage.objects;

drop view if exists public.v_couriers_live;

drop table if exists
  public.audit_logs, public.product_platform_mappings, public.integration_events, public.integrations,
  public.site_reviews, public.bulk_order_requests, public.feedback, public.notifications, public.device_tokens,
  public.courier_deliveries, public.courier_location_history, public.courier_locations, public.courier_profiles,
  public.order_issues, public.order_status_history, public.order_items, public.orders,
  public.table_status_history, public.table_sessions, public.table_qr_codes, public.dining_tables,
  public.customer_addresses, public.customers,
  public.product_variants, public.products, public.categories,
  public.order_sources, public.opening_hours, public.business_settings,
  public.staff_permissions, public.role_permissions, public.permissions, public.profiles
cascade;

drop sequence if exists public.orders_order_no_seq;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end $$;

drop type if exists public.notification_type, public.order_issue_type, public.bulk_status, public.feedback_type,
  public.table_status, public.payment_status, public.payment_method, public.order_type,
  public.order_status, public.app_role cascade;
