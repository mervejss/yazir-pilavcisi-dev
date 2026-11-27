-- v36: WhatsApp penceresi ayarları (tekrar çalıştırmak güvenli)
alter table public.business_settings add column if not exists wa_widget_enabled boolean not null default true;
alter table public.business_settings add column if not exists wa_catalog_url text;
alter table public.business_settings add column if not exists wa_quick_messages jsonb;
