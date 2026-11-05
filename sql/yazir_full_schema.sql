-- =====================================================================
-- YAZIR PİLAVCISI · 01 · Tipler (enum) ve tablolar
-- Boş bir Supabase projesinde BİR KEZ çalıştırın.
-- (Yeniden denemek için önce 99_dev_reset.sql çalıştırın. Sadece geliştirme!)
-- =====================================================================

-- ---------- ENUM TİPLERİ ----------
create type public.app_role as enum ('owner', 'sub_admin', 'operator', 'courier', 'customer');

create type public.order_status as enum
  ('new', 'preparing', 'ready', 'assigned', 'on_the_way', 'delivered', 'cancelled');

create type public.order_type as enum ('delivery', 'dine_in', 'pickup');

create type public.payment_method as enum
  ('cash_on_delivery', 'card_on_delivery', 'iban', 'platform_online', 'cash_at_table', 'card_at_table');

create type public.payment_status as enum ('pending', 'paid', 'refunded');

create type public.table_status as enum
  ('empty', 'awaiting_order', 'preparing', 'served', 'awaiting_bill', 'bill_closed', 'awaiting_cleaning', 'cleaning');

create type public.feedback_type as enum ('suggestion', 'complaint', 'thanks', 'question');

create type public.bulk_status as enum ('new', 'contacted', 'confirmed', 'done', 'cancelled');

create type public.order_issue_type as enum
  ('cancelled', 'missing_item', 'extra_item', 'wrong_item', 'wrong_amount', 'late', 'other');

create type public.notification_type as enum
  ('new_order', 'order_assigned', 'order_status', 'order_cancelled', 'bulk_request', 'feedback', 'system');

-- ---------- SIRA NUMARASI (sipariş no: 1001'den başlar, demo ile aynı) ----------
create sequence public.orders_order_no_seq start with 1001 increment by 1;

-- =====================================================================
-- KULLANICILAR, ROLLER, YETKİLER
-- =====================================================================
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  phone       text,
  email       text,
  role        public.app_role not null default 'customer',
  is_active   boolean not null default true,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.profiles is 'auth.users ile 1-1. Rol buradadır; rol YALNIZCA sahip/servis tarafından değiştirilir.';
create index profiles_role_idx on public.profiles(role) where is_active;

create table public.permissions (
  key         text primary key,
  label       text not null,
  group_name  text not null default 'Genel',
  sort_order  int  not null default 0
);

-- Rol bazlı varsayılan yetkiler (sahip zaten her şeye sahiptir)
create table public.role_permissions (
  role            public.app_role not null,
  permission_key  text not null references public.permissions(key) on delete cascade,
  primary key (role, permission_key)
);

-- Kişiye özel istisna: granted=true ek yetki, granted=false rolün yetkisini geri alır
create table public.staff_permissions (
  user_id         uuid not null references public.profiles(id) on delete cascade,
  permission_key  text not null references public.permissions(key) on delete cascade,
  granted         boolean not null default true,
  granted_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (user_id, permission_key)
);

-- =====================================================================
-- İŞLETME AYARLARI
-- =====================================================================
create table public.business_settings (
  id                              smallint primary key default 1 check (id = 1),
  name                            text not null default 'Yazır Pilavcısı',
  slogan                          text,
  phone                           text,
  whatsapp                        text,
  address                         text,
  lat                             numeric(9,6),
  lng                             numeric(9,6),
  iban                            text,
  iban_holder                     text,
  site_url                        text,                       -- QR kodların açacağı adres (örn. https://yazirpilavcisi.com)
  instagram_url                   text,
  google_maps_url                 text,
  is_accepting_orders             boolean not null default true,   -- false: web siparişi geçici kapalı
  enforce_opening_hours           boolean not null default false,  -- true: çalışma saati dışında web siparişi reddedilir
  min_order_amount                numeric(10,2) not null default 0 check (min_order_amount >= 0),
  delivery_fee                    numeric(10,2) not null default 0 check (delivery_fee >= 0),
  free_delivery_threshold         numeric(10,2) check (free_delivery_threshold is null or free_delivery_threshold >= 0),
  estimated_delivery_min          int not null default 15,
  estimated_delivery_max          int not null default 25,
  bulk_order_min_people           int not null default 10,
  location_history_interval_seconds int not null default 60 check (location_history_interval_seconds >= 10),
  location_history_retention_days   int not null default 14 check (location_history_retention_days >= 1),
  updated_at                      timestamptz not null default now(),
  updated_by                      uuid references public.profiles(id) on delete set null
);

-- ISO gün: 1=Pazartesi ... 7=Pazar. closes_next_day=true ise kapanış ertesi gün (örn. 12:00 → 03:00)
create table public.opening_hours (
  day_of_week     smallint primary key check (day_of_week between 1 and 7),
  open_time       time not null,
  close_time      time not null,
  closes_next_day boolean not null default false,
  is_closed       boolean not null default false
);

-- Sipariş kaynakları (web, telefon, masa, platformlar...). İleride yeni platform = yeni satır.
create table public.order_sources (
  code             text primary key,
  label            text not null,
  color            text not null default '#6b6556',
  is_platform      boolean not null default false,
  commission_rate  numeric(5,2) not null default 0 check (commission_rate between 0 and 100),
  is_active        boolean not null default true,
  sort_order       int not null default 0
);

-- =====================================================================
-- MENÜ
-- =====================================================================
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  slug        text not null unique,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.products (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references public.categories(id) on delete restrict,
  slug         text not null unique,
  name         text not null,
  description  text not null default '',
  emoji        text,
  image_path   text,                              -- Storage: product-images bucket içindeki yol
  kcal         int not null default 0 check (kcal >= 0),
  protein_g    numeric(6,1) not null default 0 check (protein_g >= 0),
  carb_g       numeric(6,1) not null default 0 check (carb_g >= 0),
  is_daily     boolean not null default false,    -- "günlük" ürün (çorbalar): ana vitrinde öne çıkarılmaz
  is_active    boolean not null default true,     -- satışa açık / kapalı (kapalıysa müşteri hiç görmez)
  is_sold_out  boolean not null default false,    -- stokta yok (müşteri görür ama sipariş veremez)
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index products_category_idx on public.products(category_id, sort_order);

create table public.product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  name        text not null,                      -- "1 porsiyon", "1,5 porsiyon"
  price       numeric(10,2) not null check (price >= 0),
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (product_id, name)
);
create index product_variants_product_idx on public.product_variants(product_id, sort_order);

-- =====================================================================
-- MÜŞTERİLER
-- =====================================================================
create table public.customers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique references auth.users(id) on delete set null,  -- null: telefonla gelen, hesabı olmayan müşteri
  full_name   text not null default '',
  phone       text,
  email       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index customers_phone_idx on public.customers(phone) where phone is not null;

create table public.customer_addresses (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.customers(id) on delete cascade,
  title         text not null default 'Adres',
  full_address  text not null,
  district      text,
  lat           numeric(9,6),
  lng           numeric(9,6),
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index customer_addresses_customer_idx on public.customer_addresses(customer_id);
create unique index customer_addresses_one_default on public.customer_addresses(customer_id) where is_default;

-- =====================================================================
-- MASALAR
-- =====================================================================
create table public.dining_tables (
  id                 uuid primary key default gen_random_uuid(),
  number             int  not null check (number > 0),
  name               text,
  capacity           int  not null default 4 check (capacity > 0),
  status             public.table_status not null default 'empty',
  status_changed_at  timestamptz not null default now(),
  pos_x              numeric(7,2) not null default 0,   -- görsel yerleşim ekranı
  pos_y              numeric(7,2) not null default 0,
  width              numeric(7,2) not null default 100,
  height             numeric(7,2) not null default 100,
  shape              text not null default 'square' check (shape in ('square', 'round', 'rect')),
  is_active          boolean not null default true,     -- "silme" = pasifleştirme (geçmiş korunur)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index dining_tables_active_number_uq on public.dining_tables(number) where is_active;

-- QR eşleştirmesi: token tahmin edilemez, yenilenebilir (eski QR iptal olur)
create table public.table_qr_codes (
  id          uuid primary key default gen_random_uuid(),
  table_id    uuid not null references public.dining_tables(id) on delete cascade,
  token       text not null unique default replace(gen_random_uuid()::text, '-', ''),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);
create unique index table_qr_codes_one_active on public.table_qr_codes(table_id) where is_active;

-- Masa oturumu = müşteri oturdu → hesap kapandı
create table public.table_sessions (
  id              uuid primary key default gen_random_uuid(),
  table_id        uuid not null references public.dining_tables(id) on delete restrict,
  status          text not null default 'open' check (status in ('open', 'closed')),
  opened_at       timestamptz not null default now(),
  closed_at       timestamptz,
  closed_by       uuid references public.profiles(id) on delete set null,
  total           numeric(10,2),
  payment_method  public.payment_method,
  note            text
);
create unique index table_sessions_one_open on public.table_sessions(table_id) where status = 'open';
create index table_sessions_opened_idx on public.table_sessions(opened_at);

create table public.table_status_history (
  id           bigint generated always as identity primary key,
  table_id     uuid not null references public.dining_tables(id) on delete cascade,
  from_status  public.table_status,
  to_status    public.table_status not null,
  changed_by   uuid references public.profiles(id) on delete set null,
  note         text,
  created_at   timestamptz not null default now()
);
create index table_status_history_table_idx on public.table_status_history(table_id, created_at desc);

-- =====================================================================
-- SİPARİŞLER
-- =====================================================================
create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  order_no          bigint not null unique default nextval('public.orders_order_no_seq'),
  source            text not null references public.order_sources(code) on update cascade,
  order_type        public.order_type not null default 'delivery',
  status            public.order_status not null default 'new',

  customer_id       uuid references public.customers(id) on delete set null,
  customer_name     text,
  customer_phone    text,
  delivery_address  text,
  district          text,
  lat               numeric(9,6),
  lng               numeric(9,6),
  note              text,

  payment_method    public.payment_method,
  payment_status    public.payment_status not null default 'pending',

  subtotal          numeric(10,2) not null default 0 check (subtotal >= 0),
  delivery_fee      numeric(10,2) not null default 0 check (delivery_fee >= 0),
  discount          numeric(10,2) not null default 0 check (discount >= 0),
  total             numeric(10,2) not null default 0 check (total >= 0),

  table_id          uuid references public.dining_tables(id) on delete restrict,
  table_session_id  uuid references public.table_sessions(id) on delete restrict,
  courier_id        uuid references public.profiles(id) on delete restrict,

  external_ref      text,                      -- platform sipariş no (Yemeksepeti vb.)
  external_payload  jsonb,                     -- platformdan gelen ham veri

  created_by        uuid references public.profiles(id) on delete set null,
  cancel_reason     text,

  created_at        timestamptz not null default now(),
  accepted_at       timestamptz,               -- hazırlanıyor'a alındı
  ready_at          timestamptz,
  assigned_at       timestamptz,               -- kuryeye atandı
  picked_up_at      timestamptz,               -- kurye teslim aldı / yola çıktı
  delivered_at      timestamptz,
  cancelled_at      timestamptz,
  updated_at        timestamptz not null default now(),

  constraint orders_dine_in_needs_table check (order_type <> 'dine_in' or table_id is not null)
);
create index orders_status_created_idx   on public.orders(status, created_at desc);
create index orders_created_idx          on public.orders(created_at desc);
create index orders_courier_status_idx   on public.orders(courier_id, status) where courier_id is not null;
create index orders_customer_idx         on public.orders(customer_id) where customer_id is not null;
create index orders_table_idx            on public.orders(table_id) where table_id is not null;
create index orders_session_idx          on public.orders(table_session_id) where table_session_id is not null;
create index orders_source_created_idx   on public.orders(source, created_at);
create index orders_phone_created_idx    on public.orders(customer_phone, created_at desc) where customer_phone is not null;
create unique index orders_external_uq   on public.orders(source, external_ref) where external_ref is not null;

-- Fiyat ve ürün adı SİPARİŞ ANINDA kopyalanır; sonra menü fiyatı değişse de eski siparişler bozulmaz.
create table public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  product_id    uuid references public.products(id) on delete set null,
  variant_id    uuid references public.product_variants(id) on delete set null,
  product_name  text not null,
  variant_name  text,
  unit_price    numeric(10,2) not null check (unit_price >= 0),
  quantity      int not null check (quantity between 1 and 100),
  line_total    numeric(10,2) generated always as (unit_price * quantity) stored,
  note          text,
  created_at    timestamptz not null default now()
);
create index order_items_order_idx   on public.order_items(order_id);
create index order_items_product_idx on public.order_items(product_id);

create table public.order_status_history (
  id           bigint generated always as identity primary key,
  order_id     uuid not null references public.orders(id) on delete cascade,
  from_status  public.order_status,
  to_status    public.order_status not null,
  changed_by   uuid references public.profiles(id) on delete set null,
  note         text,
  created_at   timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history(order_id, created_at);

-- İptal, eksik, fazla, hatalı sipariş kayıtları
create table public.order_issues (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  issue_type   public.order_issue_type not null,
  description  text,
  reported_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index order_issues_order_idx   on public.order_issues(order_id);
create index order_issues_created_idx on public.order_issues(created_at);

-- =====================================================================
-- KURYELER
-- =====================================================================
create table public.courier_profiles (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  vehicle_type  text not null default 'motorcycle',
  plate         text,
  notes         text,
  is_online     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Canlı konum: kurye başına TEK satır (sürekli güncellenir, geçmişe yazılmaz)
create table public.courier_locations (
  courier_id  uuid primary key references public.profiles(id) on delete cascade,
  lat         numeric(9,6) not null,
  lng         numeric(9,6) not null,
  accuracy    real,
  speed       real,
  heading     real,
  battery     smallint,
  updated_at  timestamptz not null default now()
);

-- Seyreltilmiş geçmiş: yalnızca "yolda" siparişi varken, belirli aralıkla yazılır; süre sonunda silinir
create table public.courier_location_history (
  id           bigint generated always as identity primary key,
  courier_id   uuid not null references public.profiles(id) on delete cascade,
  order_id     uuid references public.orders(id) on delete set null,
  lat          numeric(9,6) not null,
  lng          numeric(9,6) not null,
  accuracy     real,
  speed        real,
  recorded_at  timestamptz not null default now()
);
create index courier_loc_hist_courier_idx  on public.courier_location_history(courier_id, recorded_at desc);
create index courier_loc_hist_recorded_idx on public.courier_location_history(recorded_at);

-- Teslimat / performans kaydı (her atama bir satır; yeniden atama yeni satır açar)
create table public.courier_deliveries (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id) on delete cascade,
  courier_id        uuid not null references public.profiles(id) on delete restrict,
  assigned_at       timestamptz not null default now(),
  picked_up_at      timestamptz,
  delivered_at      timestamptz,
  ended_at          timestamptz,
  outcome           text check (outcome in ('delivered', 'reassigned', 'unassigned', 'cancelled')),  -- null = devam ediyor
  total_seconds     int,          -- atama → teslim
  delivery_seconds  int           -- yola çıkış → teslim
);
create unique index courier_deliveries_one_open on public.courier_deliveries(order_id) where outcome is null;
create index courier_deliveries_courier_idx on public.courier_deliveries(courier_id, delivered_at);

-- =====================================================================
-- BİLDİRİMLER
-- =====================================================================
create table public.device_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  token      text not null unique,          -- FCM token
  platform   text not null default 'android' check (platform in ('android', 'ios', 'web')),
  created_at timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);
create index device_tokens_user_idx on public.device_tokens(user_id);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        public.notification_type not null,
  title       text not null,
  body        text,
  data        jsonb not null default '{}'::jsonb,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, is_read, created_at desc);

-- =====================================================================
-- GERİ BİLDİRİM, TOPLU SİPARİŞ, YORUMLAR
-- =====================================================================
create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Anonim' check (char_length(name) <= 120),
  contact     text check (contact is null or char_length(contact) <= 200),
  type        public.feedback_type not null default 'suggestion',
  message     text not null check (char_length(message) between 1 and 2000),
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index feedback_created_idx on public.feedback(created_at desc);

create table public.bulk_order_requests (
  id               uuid primary key default gen_random_uuid(),
  full_name        text not null check (char_length(full_name) between 1 and 120),
  phone            text not null check (char_length(phone) between 7 and 25),
  event_type       text not null default 'Diğer' check (char_length(event_type) <= 60),
  people_count     int  not null check (people_count > 0 and people_count <= 100000),
  delivery_at      timestamptz not null,
  delivery_address text not null check (char_length(delivery_address) between 1 and 500),
  note             text check (note is null or char_length(note) <= 1000),
  status           public.bulk_status not null default 'new',
  handled_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index bulk_order_requests_status_idx on public.bulk_order_requests(status, created_at desc);

create table public.site_reviews (
  id            uuid primary key default gen_random_uuid(),
  author        text not null,
  rating        smallint not null check (rating between 1 and 5),
  body          text not null,
  is_published  boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

-- =====================================================================
-- ENTEGRASYONLAR (2. aşama için altyapı)
-- =====================================================================
create table public.integrations (
  platform      text primary key references public.order_sources(code) on update cascade,
  is_enabled    boolean not null default false,
  status        text not null default 'not_connected'
                  check (status in ('not_connected', 'pending_approval', 'connected', 'error')),
  config        jsonb not null default '{}'::jsonb,   -- GİZLİ ANAHTAR KOYMAYIN; gizliler Edge Function secrets'ta tutulur
  last_sync_at  timestamptz,
  last_error    text,
  updated_at    timestamptz not null default now()
);

create table public.integration_events (
  id            bigint generated always as identity primary key,
  platform      text not null references public.order_sources(code) on update cascade,
  direction     text not null check (direction in ('in', 'out')),
  event_type    text not null,
  external_ref  text,
  payload       jsonb,
  status        text not null default 'ok' check (status in ('ok', 'error')),
  error         text,
  created_at    timestamptz not null default now()
);
create index integration_events_platform_idx on public.integration_events(platform, created_at desc);

-- Ürünü platformlardaki karşılığıyla eşleştirir; "tek tıkla tüm platformlarda kapat" için
create table public.product_platform_mappings (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products(id) on delete cascade,
  variant_id     uuid references public.product_variants(id) on delete cascade,
  platform       text not null references public.order_sources(code) on update cascade,
  external_id    text not null,
  is_available   boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (platform, external_id)
);
create index product_platform_mappings_product_idx on public.product_platform_mappings(product_id);

-- =====================================================================
-- DENETİM KAYDI (kim, neyi, ne zaman değiştirdi) — yalnızca eklenir
-- =====================================================================
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  record_id   text,
  action      text not null,              -- INSERT | UPDATE | DELETE | ITEMS_REPLACED ...
  old_data    jsonb,
  new_data    jsonb,
  reason      text,
  actor_id    uuid,
  actor_role  public.app_role,
  created_at  timestamptz not null default now()
);
create index audit_logs_table_record_idx on public.audit_logs(table_name, record_id, created_at desc);
create index audit_logs_actor_idx        on public.audit_logs(actor_id, created_at desc);
create index audit_logs_created_idx      on public.audit_logs(created_at desc);


-- =====================================================================
-- YAZIR PİLAVCISI · 02 · Fonksiyonlar, tetikleyiciler ve RPC'ler
-- 01_types_and_tables.sql'den SONRA çalıştırın.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Genel yardımcılar
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- İş günü: gece 03:00'te kapanan işletme için gün, sabah 03:00'te değişir (Türkiye saati)
create or replace function public.business_day(ts timestamptz)
returns date language sql stable set search_path = '' as $$
  select ((ts at time zone 'Europe/Istanbul') - interval '3 hours')::date
$$;

create or replace function public.current_business_day_range()
returns table (range_from timestamptz, range_to timestamptz)
language sql stable set search_path = '' as $$
  select ((public.business_day(now()))::timestamp + interval '3 hours') at time zone 'Europe/Istanbul',
         ((public.business_day(now()) + 1)::timestamp + interval '3 hours') at time zone 'Europe/Istanbul'
$$;

-- Şu an açık mıyız? (gece yarısını aşan çalışma saatlerini de doğru hesaplar)
create or replace function public.is_open_now()
returns boolean language sql stable security definer set search_path = '' as $$
  with n as (select (now() at time zone 'Europe/Istanbul') as t)
  select exists (
    select 1 from public.opening_hours h, n
    where not h.is_closed and (
      ( extract(isodow from n.t)::int = h.day_of_week
        and n.t::time >= h.open_time
        and (h.closes_next_day or n.t::time < h.close_time) )
      or
      ( h.closes_next_day
        and extract(isodow from (n.t - interval '1 day'))::int = h.day_of_week
        and n.t::time < h.close_time )
    )
  )
$$;

create or replace function public.order_status_label(s public.order_status)
returns text language sql immutable set search_path = '' as $$
  select case s
    when 'new' then 'Yeni'
    when 'preparing' then 'Hazırlanıyor'
    when 'ready' then 'Hazır'
    when 'assigned' then 'Kuryeye atandı'
    when 'on_the_way' then 'Yolda'
    when 'delivered' then 'Teslim edildi'
    when 'cancelled' then 'İptal edildi'
  end
$$;

create or replace function public.order_transition_allowed(p_from public.order_status, p_to public.order_status)
returns boolean language sql immutable set search_path = '' as $$
  select case p_from
    when 'new'        then p_to in ('preparing', 'cancelled')
    when 'preparing'  then p_to in ('ready', 'assigned', 'cancelled')
    when 'ready'      then p_to in ('preparing', 'assigned', 'delivered', 'cancelled')
    when 'assigned'   then p_to in ('ready', 'on_the_way', 'cancelled')
    when 'on_the_way' then p_to in ('assigned', 'delivered', 'cancelled')
    else false
  end
$$;

-- updated_at otomatik güncelleme
do $$
declare t text;
begin
  foreach t in array array['profiles','business_settings','categories','products','product_variants',
                           'customers','customer_addresses','courier_profiles','bulk_order_requests','integrations']
  loop
    execute format('create trigger set_updated_at_%1$s before update on public.%1$I
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2) Rol ve yetki yardımcıları (RLS politikalarında kullanılır)
-- ---------------------------------------------------------------------
create or replace function public.current_app_role()
returns public.app_role language plpgsql stable security definer set search_path = 'public' as $$
declare
  v_role public.app_role;
begin
  if auth.uid() is null then return null; end if;
  select role into v_role from public.profiles where id = auth.uid() and is_active;
  return v_role;
end $$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = 'public' as $$
  select coalesce(public.current_app_role() in ('owner', 'sub_admin', 'operator'), false);
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = 'public' as $$
  select coalesce(public.current_app_role() = 'owner', false);
$$;

-- Etkin yetki = sahip: hepsi · diğerleri: kişiye özel istisna varsa o, yoksa rolün varsayılanı
create or replace function public.user_has_permission(p_user uuid, p_key text)
returns boolean language plpgsql stable security definer set search_path = 'public' as $$
declare
  v_role public.app_role;
  v_override boolean;
begin
  if p_user is null then return false; end if;

  select role into v_role from public.profiles where id = p_user and is_active;
  if v_role is null then return false; end if;
  if v_role = 'owner' then return true; end if;
  if v_role not in ('sub_admin', 'operator') then return false; end if;

  select granted into v_override from public.staff_permissions
   where user_id = p_user and permission_key = p_key;
  if v_override is not null then return v_override; end if;

  return exists (select 1 from public.role_permissions where role = v_role and permission_key = p_key);
end $$;

create or replace function public.has_permission(p_key text)
returns boolean language sql stable security definer set search_path = 'public' as $$
  select case
    when auth.uid() is null then false
    else public.user_has_permission(auth.uid(), p_key)
  end;
$$;

create or replace function public.my_customer_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select c.id from public.customers c where c.user_id = auth.uid() limit 1
$$;

create or replace function public._require_permission(p_key text)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.user_has_permission(auth.uid(), p_key) then
    raise exception 'Bu işlem için yetkiniz yok (%)', p_key using errcode = '42501';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3) Auth bağlantıları: yeni kullanıcı → profil + müşteri kaydı
--    ROL, kullanıcının gönderdiği metadata'dan ASLA alınmaz; herkes 'customer' başlar.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_name  text := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
                           split_part(coalesce(new.email, ''), '@', 1));
  v_phone text := nullif(trim(new.raw_user_meta_data->>'phone'), '');
begin
  insert into public.profiles (id, full_name, phone, email, role)
  values (new.id, v_name, v_phone, new.email, 'customer')
  on conflict (id) do nothing;

  insert into public.customers (user_id, full_name, phone, email)
  values (new.id, v_name, v_phone, new.email)
  on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.sync_user_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles  set email = new.email where id = new.id;
  update public.customers set email = new.email where user_id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.sync_user_email();

-- ---------------------------------------------------------------------
-- 4) Profil güvenliği: rol/aktiflik yalnızca sahip veya servis tarafından değişir
-- ---------------------------------------------------------------------
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Normal kullanıcı oturumu (auth.uid() dolu) ve sahip değilse hassas alanlar değiştirilemez.
  -- SQL Editor / service_role / sahip-RPC'leri (auth.uid() boş veya bypass bayrağı) serbesttir.
  if auth.uid() is not null
     and coalesce(current_setting('app.bypass_guard', true), '') <> '1'
     and not public.is_owner() then
    if new.id is distinct from old.id
       or new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.created_by is distinct from old.created_by then
      raise exception 'Rol ve aktiflik alanlarını değiştirme yetkiniz yok' using errcode = '42501';
    end if;
  end if;

  -- Sistemde her zaman en az bir aktif sahip kalmalı
  if old.role = 'owner' and old.is_active and (new.role <> 'owner' or not new.is_active) then
    if not exists (select 1 from public.profiles where role = 'owner' and is_active and id <> old.id) then
      raise exception 'Sistemde en az bir aktif sahip kalmalıdır' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create trigger guard_profile_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- Rol 'courier' olunca kurye kaydı otomatik açılır; kuryelikten çıkınca çevrimdışı olur
create or replace function public.sync_courier_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'courier' then
    insert into public.courier_profiles (user_id) values (new.id) on conflict (user_id) do nothing;
  elsif tg_op = 'UPDATE' and old.role = 'courier' then
    update public.courier_profiles set is_online = false where user_id = new.id;
  end if;
  return new;
end $$;

create trigger sync_courier_profile_ins
  after insert on public.profiles
  for each row when (new.role = 'courier') execute function public.sync_courier_profile();
create trigger sync_courier_profile_upd
  after update of role on public.profiles
  for each row when (old.role is distinct from new.role) execute function public.sync_courier_profile();

-- ---------------------------------------------------------------------
-- 5) Denetim kaydı (audit): kim, neyi, ne zaman değiştirdi
-- ---------------------------------------------------------------------
create or replace function public.log_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb; v_new jsonb; v_row jsonb; v_id text; v_role public.app_role;
begin
  if coalesce(current_setting('app.skip_audit', true), '') = '1' then return null; end if;

  if tg_op = 'INSERT' then
    v_new := to_jsonb(new); v_row := v_new;
  elsif tg_op = 'DELETE' then
    v_old := to_jsonb(old); v_row := v_old;
  else
    v_row := to_jsonb(new);
    -- yalnızca değişen alanları sakla
    select jsonb_object_agg(n.key, n.value), jsonb_object_agg(n.key, o.value)
      into v_new, v_old
      from jsonb_each(to_jsonb(new)) n
      left join jsonb_each(to_jsonb(old)) o on o.key = n.key
     where n.key <> 'updated_at' and n.value is distinct from o.value;
    if v_new is null then return null; end if;
  end if;

  v_id := coalesce(
    v_row->>'id',
    case when v_row->>'permission_key' is not null
         then coalesce(v_row->>'user_id', v_row->>'role') || ':' || (v_row->>'permission_key') end,
    v_row->>'user_id', v_row->>'key', v_row->>'platform', v_row->>'code', v_row->>'day_of_week'
  );

  select p.role into v_role from public.profiles p where p.id = auth.uid();

  insert into public.audit_logs (table_name, record_id, action, old_data, new_data, actor_id, actor_role)
  values (tg_table_name, v_id, tg_op, v_old, v_new, auth.uid(), v_role);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['orders','products','product_variants','categories','profiles','staff_permissions',
                           'role_permissions','dining_tables','business_settings','opening_hours','order_sources',
                           'integrations','courier_profiles','product_platform_mappings']
  loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I
                    for each row execute function public.log_audit()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 6) Bildirim yardımcıları
-- ---------------------------------------------------------------------
create or replace function public._notify_staff(
  p_permission text, p_type public.notification_type, p_title text, p_body text, p_data jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, type, title, body, data)
  select p.id, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb)
    from public.profiles p
   where p.is_active
     and p.role in ('owner', 'sub_admin', 'operator')
     and public.user_has_permission(p.id, p_permission);
end $$;

create or replace function public.notify_on_feedback()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public._notify_staff('feedback.view', 'feedback', 'Yeni geri bildirim', left(new.message, 120),
                               jsonb_build_object('feedback_id', new.id));
  return null;
end $$;
create trigger notify_on_feedback after insert on public.feedback
  for each row execute function public.notify_on_feedback();

create or replace function public.notify_on_bulk_request()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public._notify_staff('orders.view', 'bulk_request', 'Yeni toplu sipariş talebi',
                               new.full_name || ' · ' || new.people_count || ' kişi',
                               jsonb_build_object('bulk_request_id', new.id));
  return null;
end $$;
create trigger notify_on_bulk_request after insert on public.bulk_order_requests
  for each row execute function public.notify_on_bulk_request();

-- ---------------------------------------------------------------------
-- 7) Masa tetikleyicileri
-- ---------------------------------------------------------------------
create or replace function public.dining_tables_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  if old.is_active and not new.is_active
     and exists (select 1 from public.table_sessions where table_id = old.id and status = 'open') then
    raise exception 'Açık hesabı olan masa pasifleştirilemez' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger dining_tables_before_update before update on public.dining_tables
  for each row execute function public.dining_tables_before_update();

create or replace function public.dining_tables_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.table_qr_codes (table_id) values (new.id);   -- her yeni masaya otomatik QR
  return null;
end $$;
create trigger dining_tables_after_insert after insert on public.dining_tables
  for each row execute function public.dining_tables_after_insert();

create or replace function public.dining_tables_after_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    insert into public.table_status_history (table_id, from_status, to_status, changed_by, note)
    values (new.id, old.status, new.status, auth.uid(),
            nullif(current_setting('app.status_note', true), ''));
  end if;
  return null;
end $$;
create trigger dining_tables_after_update after update on public.dining_tables
  for each row execute function public.dining_tables_after_update();

-- ---------------------------------------------------------------------
-- 8) Sipariş tetikleyicileri
-- ---------------------------------------------------------------------
create or replace function public.orders_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.order_no is distinct from old.order_no
     or new.created_at is distinct from old.created_at
     or new.source is distinct from old.source
     or new.external_ref is distinct from old.external_ref then
    raise exception 'Sipariş kimliği, numarası ve kaynağı değiştirilemez' using errcode = '42501';
  end if;

  new.updated_at := now();

  if new.status is distinct from old.status then
    if not public.order_transition_allowed(old.status, new.status) then
      raise exception 'Geçersiz durum geçişi: % → %',
        public.order_status_label(old.status), public.order_status_label(new.status) using errcode = 'P0001';
    end if;
    if new.status in ('assigned', 'on_the_way') and (new.courier_id is null or new.order_type <> 'delivery') then
      raise exception 'Bu duruma geçmek için teslimat siparişine kurye atanmış olmalı' using errcode = 'P0001';
    end if;

    if new.status = 'preparing' then
      new.accepted_at := coalesce(new.accepted_at, now());
    elsif new.status = 'ready' then
      new.ready_at := coalesce(new.ready_at, now());
    elsif new.status = 'assigned' then
      new.ready_at    := coalesce(new.ready_at, now());
      new.assigned_at := now();
    elsif new.status = 'on_the_way' then
      new.picked_up_at := coalesce(new.picked_up_at, now());
    elsif new.status = 'delivered' then
      new.delivered_at := now();
      if new.payment_status = 'pending' and new.payment_method in ('cash_on_delivery', 'card_on_delivery') then
        new.payment_status := 'paid';
      end if;
    elsif new.status = 'cancelled' then
      new.cancelled_at := now();
    end if;
  elsif new.courier_id is distinct from old.courier_id and new.status = 'assigned' then
    new.assigned_at := now();
  end if;

  return new;
end $$;
create trigger orders_before_write before insert or update on public.orders
  for each row execute function public.orders_before_write();

create or replace function public.orders_after_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_label    text := '#' || new.order_no;
  v_cust_usr uuid;
  v_src      text;
  v_note     text := nullif(current_setting('app.status_note', true), '');
begin
  -- ===== YENİ SİPARİŞ =====
  if tg_op = 'INSERT' then
    insert into public.order_status_history (order_id, from_status, to_status, changed_by)
    values (new.id, null, new.status, auth.uid());

    select label into v_src from public.order_sources where code = new.source;
    perform public._notify_staff(
      'orders.view', 'new_order', 'Yeni sipariş ' || v_label,
      coalesce(new.customer_name, 'Misafir') || ' · ' || format('%s ₺', new.total) || ' · ' || coalesce(v_src, new.source),
      jsonb_build_object('order_id', new.id, 'order_no', new.order_no, 'source', new.source));

    if new.order_type = 'dine_in' and new.table_id is not null then
      update public.dining_tables set status = 'preparing' where id = new.table_id and status <> 'preparing';
    end if;

    if new.courier_id is not null then
      insert into public.courier_deliveries (order_id, courier_id) values (new.id, new.courier_id);
    end if;
    return null;
  end if;

  -- ===== KURYE ATAMA / DEĞİŞİM =====
  if new.courier_id is distinct from old.courier_id then
    update public.courier_deliveries
       set outcome = case when new.courier_id is null then 'unassigned' else 'reassigned' end,
           ended_at = now()
     where order_id = new.id and outcome is null;

    if new.courier_id is not null then
      insert into public.courier_deliveries (order_id, courier_id) values (new.id, new.courier_id);
      insert into public.notifications (user_id, type, title, body, data)
      values (new.courier_id, 'order_assigned', 'Yeni sipariş atandı ' || v_label,
              coalesce(new.delivery_address, ''),
              jsonb_build_object('order_id', new.id, 'order_no', new.order_no));
    end if;
  end if;

  -- ===== DURUM DEĞİŞİMİ =====
  if new.status is distinct from old.status then
    insert into public.order_status_history (order_id, from_status, to_status, changed_by, note)
    values (new.id, old.status, new.status, auth.uid(),
            case when new.status = 'cancelled' then coalesce(new.cancel_reason, v_note) else v_note end);

    -- müşteriye bildirim (hesabı varsa)
    select c.user_id into v_cust_usr from public.customers c where c.id = new.customer_id;
    if v_cust_usr is not null then
      insert into public.notifications (user_id, type, title, body, data)
      values (v_cust_usr, 'order_status', 'Siparişiniz ' || v_label, public.order_status_label(new.status),
              jsonb_build_object('order_id', new.id, 'order_no', new.order_no, 'status', new.status));
    end if;

    -- kurye performans kaydı
    if new.status = 'assigned' then
      update public.courier_deliveries set assigned_at = now() where order_id = new.id and outcome is null;
    elsif new.status = 'on_the_way' then
      update public.courier_deliveries set picked_up_at = coalesce(picked_up_at, now())
       where order_id = new.id and outcome is null;
    elsif new.status = 'delivered' then
      update public.courier_deliveries
         set delivered_at = now(), ended_at = now(), outcome = 'delivered',
             total_seconds = extract(epoch from (now() - assigned_at))::int,
             delivery_seconds = case when picked_up_at is not null
                                     then extract(epoch from (now() - picked_up_at))::int end
       where order_id = new.id and outcome is null;
    elsif new.status = 'cancelled' then
      update public.courier_deliveries set outcome = 'cancelled', ended_at = now()
       where order_id = new.id and outcome is null;
      if new.courier_id is not null then
        insert into public.notifications (user_id, type, title, body, data)
        values (new.courier_id, 'order_cancelled', 'Sipariş iptal edildi ' || v_label, new.cancel_reason,
                jsonb_build_object('order_id', new.id, 'order_no', new.order_no));
      end if;
    end if;

    -- masa durumu: oturumdaki tüm siparişler servis edildiyse masa "servis edildi" olur
    if new.order_type = 'dine_in' and new.table_id is not null and new.status = 'delivered' then
      if not exists (select 1 from public.orders o
                      where o.table_session_id = new.table_session_id
                        and o.status not in ('delivered', 'cancelled')) then
        update public.dining_tables set status = 'served'
         where id = new.table_id and status in ('awaiting_order', 'preparing', 'empty');
      end if;
    end if;
  end if;
  return null;
end $$;
create trigger orders_after_write after insert or update on public.orders
  for each row execute function public.orders_after_write();

-- ---------------------------------------------------------------------
-- 9) SİPARİŞ RPC'leri
-- ---------------------------------------------------------------------

-- Sepet satırlarını DB'deki GÜNCEL fiyatlarla çözer (istemciden gelen fiyata asla güvenilmez)
create or replace function public._resolve_lines(p_items jsonb, p_strict boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_item  jsonb;
  v_row   record;
  v_qty   int;
  v_vid   uuid;
  v_lines jsonb := '[]'::jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Sepet boş' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Bir siparişte en fazla 50 kalem olabilir' using errcode = 'P0001';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_vid := nullif(v_item->>'variant_id', '')::uuid;
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_vid is null or v_qty < 1 or v_qty > 100 then
      raise exception 'Geçersiz ürün veya adet' using errcode = 'P0001';
    end if;

    select v.id as variant_id, v.name as variant_name, v.price, v.is_active as v_active,
           p.id as product_id, p.name as product_name, p.is_active as p_active, p.is_sold_out,
           c.is_active as c_active
      into v_row
      from public.product_variants v
      join public.products   p on p.id = v.product_id
      join public.categories c on c.id = p.category_id
     where v.id = v_vid;

    if not found then
      raise exception 'Ürün bulunamadı' using errcode = 'P0001';
    end if;
    if p_strict and not (v_row.v_active and v_row.p_active and v_row.c_active) then
      raise exception '% şu an satışta değil', v_row.product_name using errcode = 'P0001';
    end if;
    if p_strict and v_row.is_sold_out then
      raise exception '% tükendi', v_row.product_name using errcode = 'P0001';
    end if;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id',   v_row.product_id,
      'variant_id',   v_row.variant_id,
      'product_name', v_row.product_name,
      'variant_name', v_row.variant_name,
      'unit_price',   v_row.price,
      'quantity',     v_qty,
      'note',         nullif(left(trim(coalesce(v_item->>'note', '')), 200), '')));
  end loop;
  return v_lines;
end $$;

-- Ortak sipariş oluşturucu (müşteri, personel ve masa siparişleri buradan geçer)
create or replace function public._create_order(
  p_source text, p_type public.order_type, p_customer jsonb, p_items jsonb,
  p_table_id uuid, p_payment public.payment_method, p_note text,
  p_actor uuid, p_is_staff boolean, p_save_address boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_s          public.business_settings%rowtype;
  v_is_platform boolean;
  v_lines      jsonb;
  v_subtotal   numeric(10,2);
  v_fee        numeric(10,2) := 0;
  v_total      numeric(10,2);
  v_name       text := nullif(left(trim(coalesce(p_customer->>'name', '')), 120), '');
  v_phone      text := nullif(left(trim(coalesce(p_customer->>'phone', '')), 25), '');
  v_addr       text := nullif(left(trim(coalesce(p_customer->>'address', '')), 500), '');
  v_district   text := nullif(left(trim(coalesce(p_customer->>'district', '')), 80), '');
  v_lat        numeric;
  v_lng        numeric;
  v_table      uuid;
  v_session    uuid;
  v_customer   uuid;
  v_payment    public.payment_method := p_payment;
  v_pay_status public.payment_status := 'pending';
  v_recent     int;
  v_order_id   uuid;
  v_order_no   bigint;
begin
  select * into v_s from public.business_settings where id = 1;

  select is_platform into v_is_platform from public.order_sources where code = p_source and is_active;
  if v_is_platform is null then
    raise exception 'Geçersiz sipariş kaynağı' using errcode = 'P0001';
  end if;

  v_lat := nullif(p_customer->>'lat', '')::numeric;
  v_lng := nullif(p_customer->>'lng', '')::numeric;
  if (v_lat is not null and v_lat not between -90 and 90) or (v_lng is not null and v_lng not between -180 and 180) then
    raise exception 'Konum bilgisi geçersiz' using errcode = 'P0001';
  end if;

  if v_phone is not null and v_phone !~ '^[0-9+ ()-]{10,25}$' then
    raise exception 'Telefon numarası geçersiz' using errcode = 'P0001';
  end if;

  if p_type = 'delivery' and (v_name is null or v_phone is null or v_addr is null) then
    raise exception 'Teslimat için ad, telefon ve adres zorunludur' using errcode = 'P0001';
  end if;
  -- Gel-al: web müşterisi ad+telefon vermeli; personel (restoranda tezgâh/hızlı sipariş) bilgisiz kaydedebilir
  if p_type = 'pickup' and not p_is_staff and (v_name is null or v_phone is null) then
    raise exception 'Gel-al siparişi için ad ve telefon zorunludur' using errcode = 'P0001';
  end if;

  v_lines := public._resolve_lines(p_items, true);
  select coalesce(sum((l->>'unit_price')::numeric * (l->>'quantity')::int), 0)
    into v_subtotal from jsonb_array_elements(v_lines) l;

  -- spam koruması (misafir/müşteri)
  if not p_is_staff and v_phone is not null then
    select count(*) into v_recent from public.orders
     where customer_phone = v_phone and created_at > now() - interval '10 minutes';
    if v_recent >= 5 then
      raise exception 'Çok fazla sipariş denemesi. Lütfen bizi arayın.' using errcode = 'P0001';
    end if;
  end if;

  -- teslimat ücreti ve minimum tutar
  if p_type = 'delivery' then
    if not p_is_staff and v_subtotal < v_s.min_order_amount then
      raise exception 'Minimum sipariş tutarı % ₺', v_s.min_order_amount using errcode = 'P0001';
    end if;
    v_fee := v_s.delivery_fee;
    if v_s.free_delivery_threshold is not null and v_subtotal >= v_s.free_delivery_threshold then
      v_fee := 0;
    end if;
    if p_is_staff and nullif(p_customer->>'delivery_fee', '') is not null then
      v_fee := greatest((p_customer->>'delivery_fee')::numeric, 0);   -- personel ücreti elle belirleyebilir
    end if;
  end if;
  v_total := v_subtotal + v_fee;

  -- ödeme
  if v_is_platform then
    v_payment := 'platform_online'; v_pay_status := 'paid';
  elsif p_type = 'dine_in' then
    v_payment := null;                                   -- masa hesabı kapanırken belirlenir
  else
    if v_payment is null then
      raise exception 'Ödeme yöntemi seçin' using errcode = 'P0001';
    end if;
    if not p_is_staff and v_payment not in ('cash_on_delivery', 'card_on_delivery', 'iban') then
      raise exception 'Geçersiz ödeme yöntemi' using errcode = 'P0001';
    end if;
  end if;

  -- masa + oturum
  if p_type = 'dine_in' then
    perform 1 from public.dining_tables where id = p_table_id and is_active;
    if not found then
      raise exception 'Masa bulunamadı' using errcode = 'P0001';
    end if;
    v_table := p_table_id;
    select id into v_session from public.table_sessions where table_id = v_table and status = 'open';
    if v_session is null then
      insert into public.table_sessions (table_id) values (v_table) returning id into v_session;
    end if;
  end if;

  -- müşteri bağlantısı
  if not p_is_staff then
    v_customer := public.my_customer_id();                -- giriş yapmışsa kendi kaydı, misafirse null
  elsif v_phone is not null then
    select id into v_customer from public.customers where phone = v_phone order by created_at desc limit 1;
    if v_customer is null then
      insert into public.customers (full_name, phone) values (coalesce(v_name, ''), v_phone)
      returning id into v_customer;
    end if;
  end if;

  insert into public.orders (
    source, order_type, status, customer_id, customer_name, customer_phone, delivery_address, district,
    lat, lng, note, payment_method, payment_status, subtotal, delivery_fee, total,
    table_id, table_session_id, created_by)
  values (
    p_source, p_type, 'new', v_customer, v_name, v_phone, v_addr, v_district,
    v_lat, v_lng, nullif(left(trim(coalesce(p_note, '')), 500), ''), v_payment, v_pay_status,
    v_subtotal, v_fee, v_total, v_table, v_session, p_actor)
  returning id, order_no into v_order_id, v_order_no;

  insert into public.order_items (order_id, product_id, variant_id, product_name, variant_name, unit_price, quantity, note)
  select v_order_id, x.product_id, x.variant_id, x.product_name, x.variant_name, x.unit_price, x.quantity, x.note
    from jsonb_to_recordset(v_lines) as x(product_id uuid, variant_id uuid, product_name text,
                                          variant_name text, unit_price numeric, quantity int, note text);

  -- adresi kaydet (üye ise ve istendiyse)
  if p_save_address and v_customer is not null and p_type = 'delivery' and v_addr is not null
     and not exists (select 1 from public.customer_addresses where customer_id = v_customer and full_address = v_addr) then
    insert into public.customer_addresses (customer_id, title, full_address, district, lat, lng, is_default)
    values (v_customer, coalesce(nullif(left(p_customer->>'address_title', 40), ''), 'Adres'), v_addr, v_district,
            v_lat, v_lng, not exists (select 1 from public.customer_addresses where customer_id = v_customer));
  end if;

  return jsonb_build_object('order_id', v_order_id, 'order_no', v_order_no, 'total', v_total, 'status', 'new');
end $$;

-- Web / QR masa siparişi (misafir ve üye)
-- p_customer: {"name","phone","address","district","lat","lng","address_title"}
-- p_items:    [{"variant_id":"<uuid>","quantity":2,"note":"acısız"}]
create or replace function public.place_order(
  p_customer jsonb, p_items jsonb,
  p_payment public.payment_method default null, p_note text default null,
  p_table_token text default null, p_save_address boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_s public.business_settings%rowtype;
  v_table uuid;
begin
  select * into v_s from public.business_settings where id = 1;
  if not v_s.is_accepting_orders then
    raise exception 'Şu an online sipariş alamıyoruz. Lütfen bizi arayın.' using errcode = 'P0001';
  end if;
  if v_s.enforce_opening_hours and not public.is_open_now() then
    raise exception 'Şu an kapalıyız. Çalışma saatlerimizde tekrar deneyin.' using errcode = 'P0001';
  end if;

  if p_table_token is not null then
    select q.table_id into v_table
      from public.table_qr_codes q join public.dining_tables t on t.id = q.table_id
     where q.token = p_table_token and q.is_active and t.is_active;
    if v_table is null then
      raise exception 'Geçersiz veya süresi dolmuş QR kod' using errcode = 'P0001';
    end if;
    return public._create_order('table', 'dine_in', coalesce(p_customer, '{}'::jsonb), p_items,
                                v_table, null, p_note, auth.uid(), false, false);
  end if;

  return public._create_order('web', 'delivery', coalesce(p_customer, '{}'::jsonb), p_items,
                              null, p_payment, p_note, auth.uid(), false, p_save_address);
end $$;

-- Personel: telefon / masa / elle sipariş girişi
create or replace function public.staff_create_order(
  p_source text, p_type public.order_type, p_customer jsonb, p_items jsonb,
  p_table_id uuid default null, p_payment public.payment_method default null,
  p_note text default null, p_save_address boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_permission('orders.create');
  return public._create_order(p_source, p_type, coalesce(p_customer, '{}'::jsonb), p_items,
                              p_table_id, p_payment, p_note, auth.uid(), true, p_save_address);
end $$;

-- Personel: sipariş kalemlerini düzelt (hatalı ürün/miktar). Eski hali denetim kaydında saklanır.
create or replace function public.staff_replace_order_items(p_order_id uuid, p_items jsonb, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_o public.orders%rowtype; v_lines jsonb; v_old jsonb; v_sub numeric(10,2);
begin
  perform public._require_permission('orders.edit');
  select * into v_o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Sipariş bulunamadı' using errcode = 'P0001'; end if;
  if v_o.status in ('delivered', 'cancelled') then
    raise exception 'Tamamlanmış veya iptal edilmiş sipariş düzenlenemez' using errcode = 'P0001';
  end if;

  v_lines := public._resolve_lines(p_items, false);

  select coalesce(jsonb_agg(jsonb_build_object('product_name', product_name, 'variant_name', variant_name,
                                               'unit_price', unit_price, 'quantity', quantity)), '[]'::jsonb)
    into v_old from public.order_items where order_id = p_order_id;

  delete from public.order_items where order_id = p_order_id;
  insert into public.order_items (order_id, product_id, variant_id, product_name, variant_name, unit_price, quantity, note)
  select p_order_id, x.product_id, x.variant_id, x.product_name, x.variant_name, x.unit_price, x.quantity, x.note
    from jsonb_to_recordset(v_lines) as x(product_id uuid, variant_id uuid, product_name text,
                                          variant_name text, unit_price numeric, quantity int, note text);

  select coalesce(sum(line_total), 0) into v_sub from public.order_items where order_id = p_order_id;
  update public.orders
     set subtotal = v_sub, total = greatest(v_sub + delivery_fee - discount, 0)
   where id = p_order_id;

  insert into public.audit_logs (table_name, record_id, action, old_data, new_data, reason, actor_id, actor_role)
  values ('orders', p_order_id::text, 'ITEMS_REPLACED',
          jsonb_build_object('items', v_old, 'subtotal', v_o.subtotal, 'total', v_o.total),
          jsonb_build_object('items', v_lines, 'subtotal', v_sub),
          nullif(trim(p_reason), ''), auth.uid(), public.current_app_role());

  return jsonb_build_object('order_id', p_order_id, 'subtotal', v_sub);
end $$;

-- Durum güncelleme (personel: tüm geçişler · kurye: yalnızca kendi siparişinde yola çık / teslim et)
create or replace function public.update_order_status(p_order_id uuid, p_status public.order_status, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_o    public.orders%rowtype;
  v_role public.app_role := public.current_app_role();
  v_to   public.order_status := p_status;
begin
  if auth.uid() is null or v_role is null then
    raise exception 'Oturum gerekli' using errcode = '42501';
  end if;

  select * into v_o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Sipariş bulunamadı' using errcode = 'P0001'; end if;

  if v_role = 'courier' then
    if v_o.courier_id is distinct from auth.uid() then
      raise exception 'Bu sipariş size atanmamış' using errcode = '42501';
    end if;
    if not ((v_o.status = 'assigned' and p_status = 'on_the_way')
         or (v_o.status = 'on_the_way' and p_status = 'delivered')) then
      raise exception 'Bu durum geçişini yapamazsınız' using errcode = '42501';
    end if;
  elsif v_role in ('owner', 'sub_admin', 'operator') then
    if p_status = 'cancelled' then
      perform public._require_permission('orders.cancel');
      if coalesce(trim(p_note), '') = '' then
        raise exception 'İptal nedenini yazmalısınız' using errcode = 'P0001';
      end if;
    else
      perform public._require_permission('orders.edit');
    end if;
  else
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;

  -- hazır + kurye zaten atanmışsa doğrudan "kuryeye atandı"
  if v_to = 'ready' and v_o.courier_id is not null and v_o.order_type = 'delivery' then
    v_to := 'assigned';
  end if;

  perform set_config('app.status_note', coalesce(trim(p_note), ''), true);
  update public.orders
     set status = v_to,
         cancel_reason = case when v_to = 'cancelled' then trim(p_note) else cancel_reason end
   where id = p_order_id;
  perform set_config('app.status_note', '', true);

  return jsonb_build_object('order_id', p_order_id, 'status', v_to);
end $$;

-- Kurye atama / değiştirme / atamayı kaldırma (p_courier_id = null)
create or replace function public.assign_courier(p_order_id uuid, p_courier_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_o public.orders%rowtype; v_new_status public.order_status;
begin
  perform public._require_permission('orders.assign_courier');
  select * into v_o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Sipariş bulunamadı' using errcode = 'P0001'; end if;
  if v_o.order_type <> 'delivery' then
    raise exception 'Yalnızca teslimat siparişlerine kurye atanır' using errcode = 'P0001';
  end if;
  if v_o.status not in ('preparing', 'ready', 'assigned', 'on_the_way') then
    raise exception 'Bu durumdaki siparişe kurye atanamaz' using errcode = 'P0001';
  end if;
  if v_o.courier_id is not distinct from p_courier_id then
    return jsonb_build_object('order_id', p_order_id, 'status', v_o.status);
  end if;

  if p_courier_id is null then
    if v_o.status = 'on_the_way' then
      raise exception 'Yoldaki siparişin kuryesi kaldırılamaz; başka kuryeye atayın' using errcode = 'P0001';
    end if;
    v_new_status := case when v_o.status = 'assigned' then 'ready' else v_o.status end;
  else
    if not exists (select 1 from public.profiles p
                    where p.id = p_courier_id and p.role = 'courier' and p.is_active) then
      raise exception 'Geçerli ve aktif bir kurye seçin' using errcode = 'P0001';
    end if;
    v_new_status := case when v_o.status = 'preparing' then 'preparing' else 'assigned' end;
  end if;

  update public.orders set courier_id = p_courier_id, status = v_new_status where id = p_order_id;
  return jsonb_build_object('order_id', p_order_id, 'status', v_new_status, 'courier_id', p_courier_id);
end $$;

-- Misafir/üye sipariş takibi: sipariş UUID'si (tahmin edilemez) anahtardır
create or replace function public.track_order(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  select jsonb_build_object(
      'order_no', o.order_no, 'status', o.status, 'status_label', public.order_status_label(o.status),
      'order_type', o.order_type, 'total', o.total, 'payment_method', o.payment_method,
      'created_at', o.created_at, 'accepted_at', o.accepted_at, 'ready_at', o.ready_at,
      'picked_up_at', o.picked_up_at, 'delivered_at', o.delivered_at, 'cancelled_at', o.cancelled_at,
      'estimated_min', s.estimated_delivery_min, 'estimated_max', s.estimated_delivery_max,
      'courier_first_name', case when o.status in ('assigned', 'on_the_way') then split_part(p.full_name, ' ', 1) end,
      'items', (select coalesce(jsonb_agg(jsonb_build_object(
                   'name', i.product_name, 'variant', i.variant_name, 'quantity', i.quantity, 'price', i.unit_price)
                   order by i.created_at), '[]'::jsonb)
                  from public.order_items i where i.order_id = o.id))
    into v
    from public.orders o
    join public.business_settings s on s.id = 1
    left join public.profiles p on p.id = o.courier_id
   where o.id = p_order_id;

  if v is null then raise exception 'Sipariş bulunamadı' using errcode = 'P0001'; end if;
  return v;
end $$;

-- "Tekrar sipariş ver": eski siparişin kalemlerini GÜNCEL fiyat ve stok bilgisiyle döndürür
-- (invoker: müşteri yalnızca kendi siparişini görebilir)
create or replace function public.reorder_items(p_order_id uuid)
returns table (variant_id uuid, product_id uuid, product_name text, variant_name text,
               quantity int, current_price numeric, is_available boolean)
language sql stable set search_path = '' as $$
  select oi.variant_id, oi.product_id, oi.product_name, oi.variant_name, oi.quantity, v.price,
         coalesce(v.is_active and p.is_active and not p.is_sold_out, false)
    from public.order_items oi
    left join public.product_variants v on v.id = oi.variant_id
    left join public.products p on p.id = v.product_id
   where oi.order_id = p_order_id
   order by oi.created_at
$$;

-- ---------------------------------------------------------------------
-- 10) MASA RPC'leri
-- ---------------------------------------------------------------------
create or replace function public.resolve_table_qr(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('table_number', t.number, 'table_name', t.name)
    from public.table_qr_codes q join public.dining_tables t on t.id = q.table_id
   where q.token = p_token and q.is_active and t.is_active
$$;

create or replace function public.set_table_status(p_table_id uuid, p_status public.table_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_permission('tables.operate');
  perform 1 from public.dining_tables where id = p_table_id and is_active for update;
  if not found then raise exception 'Masa bulunamadı' using errcode = 'P0001'; end if;

  if p_status = 'empty' then
    if exists (select 1 from public.table_sessions s join public.orders o on o.table_session_id = s.id
                where s.table_id = p_table_id and s.status = 'open' and o.status <> 'cancelled') then
      raise exception 'Hesap kapatılmadan masa boşaltılamaz' using errcode = 'P0001';
    end if;
    update public.table_sessions set status = 'closed', closed_at = now(), closed_by = auth.uid(), total = 0
     where table_id = p_table_id and status = 'open';
  end if;

  perform set_config('app.status_note', coalesce(trim(p_note), ''), true);
  update public.dining_tables set status = p_status where id = p_table_id;
  perform set_config('app.status_note', '', true);
end $$;

create or replace function public.close_table_bill(p_table_id uuid, p_payment public.payment_method default 'cash_at_table')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session uuid; v_total numeric(10,2);
begin
  perform public._require_permission('tables.operate');
  if p_payment not in ('cash_at_table', 'card_at_table', 'iban') then
    raise exception 'Geçersiz ödeme yöntemi' using errcode = 'P0001';
  end if;

  select id into v_session from public.table_sessions
   where table_id = p_table_id and status = 'open' for update;
  if v_session is null then raise exception 'Bu masada açık hesap yok' using errcode = 'P0001'; end if;

  if exists (select 1 from public.orders where table_session_id = v_session
                and status in ('new', 'preparing', 'ready', 'assigned', 'on_the_way')) then
    raise exception 'Hazırlanan veya servis edilmemiş siparişler var; önce servis edildi olarak işaretleyin' using errcode = 'P0001';
  end if;

  select coalesce(sum(total), 0) into v_total from public.orders
   where table_session_id = v_session and status = 'delivered';

  update public.orders set payment_method = p_payment, payment_status = 'paid'
   where table_session_id = v_session and status = 'delivered';

  update public.table_sessions
     set status = 'closed', closed_at = now(), closed_by = auth.uid(), total = v_total, payment_method = p_payment
   where id = v_session;

  perform set_config('app.status_note', 'Hesap kapatıldı', true);
  update public.dining_tables set status = 'bill_closed' where id = p_table_id;
  perform set_config('app.status_note', '', true);

  return jsonb_build_object('session_id', v_session, 'total', v_total);
end $$;

create or replace function public.regenerate_table_qr(p_table_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  perform public._require_permission('tables.manage');
  perform 1 from public.dining_tables where id = p_table_id;
  if not found then raise exception 'Masa bulunamadı' using errcode = 'P0001'; end if;

  update public.table_qr_codes set is_active = false, revoked_at = now()
   where table_id = p_table_id and is_active;
  insert into public.table_qr_codes (table_id) values (p_table_id) returning token into v_token;
  return v_token;
end $$;

-- ---------------------------------------------------------------------
-- 11) KURYE RPC'leri
-- ---------------------------------------------------------------------
create or replace function public.set_courier_online(p_online boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.current_app_role() is distinct from 'courier' then
    raise exception 'Yalnızca kuryeler kullanabilir' using errcode = '42501';
  end if;
  update public.courier_profiles set is_online = p_online where user_id = auth.uid();
end $$;

-- Canlı konum her çağrıda güncellenir; geçmişe yalnızca "yolda" siparişi varken ve aralıkla yazılır
create or replace function public.update_courier_location(
  p_lat double precision, p_lng double precision,
  p_accuracy real default null, p_speed real default null, p_heading real default null, p_battery integer default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_online boolean; v_interval int; v_last timestamptz; v_order uuid;
begin
  if public.current_app_role() is distinct from 'courier' then
    raise exception 'Yalnızca kuryeler konum gönderebilir' using errcode = '42501';
  end if;
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Geçersiz koordinat' using errcode = 'P0001';
  end if;

  select is_online into v_online from public.courier_profiles where user_id = v_uid;
  if not coalesce(v_online, false) then return; end if;     -- çevrimdışıyken gelen konum yok sayılır

  insert into public.courier_locations (courier_id, lat, lng, accuracy, speed, heading, battery, updated_at)
  values (v_uid, p_lat, p_lng, p_accuracy, p_speed, p_heading, p_battery::smallint, now())
  on conflict (courier_id) do update
    set lat = excluded.lat, lng = excluded.lng, accuracy = excluded.accuracy, speed = excluded.speed,
        heading = excluded.heading, battery = excluded.battery, updated_at = now();

  select o.id into v_order from public.orders o
   where o.courier_id = v_uid and o.status = 'on_the_way'
   order by o.picked_up_at desc nulls last limit 1;

  if v_order is not null then
    select location_history_interval_seconds into v_interval from public.business_settings where id = 1;
    select max(recorded_at) into v_last from public.courier_location_history where courier_id = v_uid;
    if v_last is null or v_last < now() - make_interval(secs => coalesce(v_interval, 60)) then
      insert into public.courier_location_history (courier_id, order_id, lat, lng, accuracy, speed)
      values (v_uid, v_order, p_lat, p_lng, p_accuracy, p_speed);
    end if;
  end if;
end $$;

create or replace function public.cleanup_courier_location_history()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_days int; v_deleted int;
begin
  select location_history_retention_days into v_days from public.business_settings where id = 1;
  delete from public.courier_location_history where recorded_at < now() - make_interval(days => coalesce(v_days, 14));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $$;

-- ---------------------------------------------------------------------
-- 12) Bildirim cihaz kaydı, personel yönetimi
-- ---------------------------------------------------------------------
create or replace function public.register_device_token(p_token text, p_platform text default 'android')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Oturum gerekli' using errcode = '42501'; end if;
  insert into public.device_tokens (user_id, token, platform) values (auth.uid(), p_token, p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, last_seen = now();
end $$;

-- Rol atama: YALNIZCA sahip. ('owner' bu yolla verilemez; bkz. bootstrap_owner)
create or replace function public.set_staff_role(p_user uuid, p_role public.app_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then
    raise exception 'Yalnızca işletme sahibi rol atayabilir' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'Kendi rolünüzü değiştiremezsiniz' using errcode = 'P0001';
  end if;
  if p_role not in ('owner', 'sub_admin', 'operator', 'courier') then
    raise exception 'Geçersiz rol' using errcode = 'P0001';
  end if;
  perform set_config('app.bypass_guard', '1', true);
  update public.profiles set role = p_role, created_by = coalesce(created_by, auth.uid()) where id = p_user;
  if not found then raise exception 'Kullanıcı bulunamadı' using errcode = 'P0001'; end if;
  delete from public.staff_permissions where user_id = p_user;   -- eski özel yetkiler sıfırlanır
end $$;

-- Personeli kadrodan çıkarma (rolünü müşteri yapar, yetkilerini kaldırır)
create or replace function public.remove_staff_member(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then
    raise exception 'Yalnızca işletme sahibi personel çıkarabilir' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'Kendi hesabınızı personelden çıkaramazsınız' using errcode = 'P0001';
  end if;
  perform set_config('app.bypass_guard', '1', true);
  update public.profiles set role = 'customer', is_active = false where id = p_user;
  delete from public.staff_permissions where user_id = p_user;
  update public.courier_profiles set is_online = false where user_id = p_user;
end $$;

-- Personele özel yetki atama / güncelleme
create or replace function public.set_staff_permission(p_user uuid, p_permission text, p_granted boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then
    raise exception 'Yalnızca işletme sahibi özel yetki tanımlayabilir' using errcode = '42501';
  end if;
  insert into public.staff_permissions (user_id, permission_key, granted, granted_by)
  values (p_user, p_permission, p_granted, auth.uid())
  on conflict (user_id, permission_key) do update
    set granted = excluded.granted, granted_by = excluded.granted_by, created_at = now();
end $$;

-- Aktif/pasif: sahip herkesi, 'couriers.manage' yetkisi olan yalnızca kuryeleri yönetebilir
create or replace function public.set_staff_active(p_user uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_target public.app_role;
begin
  select role into v_target from public.profiles where id = p_user;
  if v_target is null then raise exception 'Kullanıcı bulunamadı' using errcode = 'P0001'; end if;
  if p_user = auth.uid() then
    raise exception 'Kendi hesabınızı pasifleştiremezsiniz' using errcode = 'P0001';
  end if;
  if not public.is_owner() then
    if v_target <> 'courier' or not public.has_permission('couriers.manage') then
      raise exception 'Bu kullanıcıyı yönetme yetkiniz yok' using errcode = '42501';
    end if;
  end if;
  perform set_config('app.bypass_guard', '1', true);
  update public.profiles set is_active = p_active where id = p_user;
  if not p_active then
    update public.courier_profiles set is_online = false where user_id = p_user;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 13) İLK SAHİBİ ATAMA — yalnızca SQL Editor'dan (07_bootstrap_owner.sql)
-- ---------------------------------------------------------------------
create or replace function public.bootstrap_owner(p_email text)
returns text language plpgsql security definer set search_path = 'public' as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(p_email);
  if v_id is null then
    raise exception 'Bu e-posta ile auth.users tablosunda kullanıcı bulunamadı: %', p_email using errcode = 'P0001';
  end if;

  perform set_config('app.bypass_guard', '1', true);

  insert into public.profiles (id, full_name, email, role, is_active)
  values (v_id, 'İşletme Sahibi', p_email, 'owner', true)
  on conflict (id) do update
    set role = 'owner',
        is_active = true,
        email = coalesce(excluded.email, public.profiles.email);

  return 'Başarılı: ' || p_email || ' kullanıcısı Sahip (owner) olarak atandı.';
end $$;

-- ---------------------------------------------------------------------
-- 14) Çağırma izinleri
-- Supabase varsayılan olarak yeni fonksiyonları anon/authenticated'a açar; önce hepsini kapatıp
-- yalnızca gerekenleri açıyoruz. (service_role ve postgres etkilenmez.)
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- RLS politikalarında ve herkese açık kullanım için (giriş yapmamış ziyaretçi dahil)
grant execute on function
  public.current_app_role(), public.is_staff(), public.is_owner(), public.has_permission(text),
  public.user_has_permission(uuid, text), public.bootstrap_owner(text),
  public.my_customer_id(), public.is_open_now(), public.business_day(timestamptz),
  public.order_status_label(public.order_status),
  public.order_transition_allowed(public.order_status, public.order_status),
  public.current_business_day_range(),
  public.place_order(jsonb, jsonb, public.payment_method, text, text, boolean),
  public.resolve_table_qr(text),
  public.track_order(uuid)
to anon, authenticated;

-- Yalnızca giriş yapmış kullanıcılar (içeride rol/yetki ayrıca kontrol edilir)
grant execute on function
  public.staff_create_order(text, public.order_type, jsonb, jsonb, uuid, public.payment_method, text, boolean),
  public.staff_replace_order_items(uuid, jsonb, text),
  public.update_order_status(uuid, public.order_status, text),
  public.assign_courier(uuid, uuid),
  public.reorder_items(uuid),
  public.set_table_status(uuid, public.table_status, text),
  public.close_table_bill(uuid, public.payment_method),
  public.regenerate_table_qr(uuid),
  public.set_courier_online(boolean),
  public.update_courier_location(double precision, double precision, real, real, real, integer),
  public.register_device_token(text, text),
  public.set_staff_role(uuid, public.app_role),
  public.set_staff_active(uuid, boolean),
  public.remove_staff_member(uuid),
  public.set_staff_permission(uuid, text, boolean)
to authenticated;


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


-- =====================================================================
-- YAZIR PİLAVCISI · 04 · Raporlar (RPC) ve görünümler
-- 03_rls_policies.sql'den SONRA çalıştırın.
-- Tüm raporlar 'reports.view' yetkisi ister (varsayılan: yalnızca sahip).
-- Parametreler: p_from (dahil), p_to (hariç) → ISO zaman damgası. İptaller cirodan hariçtir.
-- Saat dilimi: Europe/Istanbul · "gün" = iş günü (sabah 03:00'te değişir)
-- =====================================================================

-- Panel için canlı kurye görünümü (RLS çağıranın yetkisiyle işler)
create or replace view public.v_couriers_live with (security_invoker = true) as
select
  p.id            as courier_id,
  p.full_name,
  p.phone,
  p.is_active,
  cp.is_online,
  cp.vehicle_type,
  cp.plate,
  l.lat,
  l.lng,
  l.heading,
  l.speed,
  l.accuracy,
  l.battery,
  l.updated_at    as location_updated_at,
  (select count(*) from public.orders o
    where o.courier_id = p.id and o.status in ('assigned', 'on_the_way')) as active_order_count
from public.profiles p
join public.courier_profiles cp on cp.user_id = p.id
left join public.courier_locations l on l.courier_id = p.id
where p.role = 'courier';

grant select on public.v_couriers_live to authenticated;

-- ---------------------------------------------------------------------
-- Özet: sipariş sayısı, ciro, ortalama sepet, en yoğun saat
-- ---------------------------------------------------------------------
create or replace function public.report_summary(p_from timestamptz, p_to timestamptz)
returns table (order_count bigint, delivered_count bigint, cancelled_count bigint,
               revenue numeric, avg_basket numeric, peak_hour integer)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._require_permission('reports.view');
  return query
  with o as (
    select * from public.orders where created_at >= p_from and created_at < p_to
  ),
  hrs as (
    select extract(hour from created_at at time zone 'Europe/Istanbul')::int as h, count(*) as c
      from o where status <> 'cancelled' group by 1 order by c desc, h limit 1
  )
  select count(*),
         count(*) filter (where status = 'delivered'),
         count(*) filter (where status = 'cancelled'),
         coalesce(sum(total) filter (where status <> 'cancelled'), 0)::numeric,
         coalesce(round(avg(total) filter (where status <> 'cancelled'), 2), 0)::numeric,
         (select h from hrs)
    from o;
end $$;

-- Günlük sipariş ve ciro (boş günler 0 olarak gelir)
create or replace function public.report_daily(p_from timestamptz, p_to timestamptz)
returns table (day date, order_count bigint, revenue numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._require_permission('reports.view');
  return query
  with days as (
    select generate_series(public.business_day(p_from)::timestamp, public.business_day(p_to - interval '1 second')::timestamp, interval '1 day')::date as d
  ),
  x as (
    select public.business_day(o.created_at) as bd, count(*) as c, sum(o.total) as s
      from public.orders o
     where o.created_at >= p_from and o.created_at < p_to and o.status <> 'cancelled'
     group by 1
  )
  select days.d, coalesce(x.c, 0)::bigint, coalesce(x.s, 0)::numeric
    from days left join x on x.bd = days.d
   order by days.d;
end $$;

-- Hangi gün hangi saat yoğun? (dow: 1=Pzt ... 7=Paz, iş gününe göre)
create or replace function public.report_hourly_heatmap(p_from timestamptz, p_to timestamptz)
returns table (dow integer, hour_of_day integer, order_count bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._require_permission('reports.view');
  return query
  select extract(isodow from ((o.created_at at time zone 'Europe/Istanbul') - interval '3 hours'))::int,
         extract(hour from (o.created_at at time zone 'Europe/Istanbul'))::int,
         count(*)
    from public.orders o
   where o.created_at >= p_from and o.created_at < p_to and o.status <> 'cancelled'
   group by 1, 2
   order by 1, 2;
end $$;

-- Ürün bazlı satış
create or replace function public.report_top_products(p_from timestamptz, p_to timestamptz, p_limit integer default 10)
returns table (product_id uuid, product_name text, quantity bigint, revenue numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._require_permission('reports.view');
  return query
  select i.product_id, i.product_name, sum(i.quantity)::bigint, sum(i.line_total)::numeric
    from public.order_items i
    join public.orders o on o.id = i.order_id
   where o.created_at >= p_from and o.created_at < p_to and o.status <> 'cancelled'
   group by i.product_id, i.product_name
   order by sum(i.quantity) desc, i.product_name
   limit greatest(p_limit, 1);
end $$;

-- Kaynağa göre dağılım + tahmini komisyon
create or replace function public.report_by_source(p_from timestamptz, p_to timestamptz)
returns table (source text, label text, color text, is_platform boolean, order_count bigint,
               revenue numeric, commission_rate numeric, est_commission numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._require_permission('reports.view');
  return query
  select o.source, coalesce(s.label, o.source), coalesce(s.color, '#6b6556'), coalesce(s.is_platform, false),
         count(*), coalesce(sum(o.total), 0)::numeric, coalesce(s.commission_rate, 0)::numeric,
         round(coalesce(sum(o.total), 0) * coalesce(s.commission_rate, 0) / 100, 2)::numeric
    from public.orders o
    left join public.order_sources s on s.code = o.source
   where o.created_at >= p_from and o.created_at < p_to and o.status <> 'cancelled'
   group by o.source, s.label, s.color, s.is_platform, s.commission_rate
   order by count(*) desc;
end $$;

create or replace function public.report_payment_breakdown(p_from timestamptz, p_to timestamptz)
returns table (payment_method public.payment_method, order_count bigint, revenue numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._require_permission('reports.view');
  return query
  select o.payment_method, count(*), coalesce(sum(o.total), 0)::numeric
    from public.orders o
   where o.created_at >= p_from and o.created_at < p_to and o.status <> 'cancelled'
   group by o.payment_method
   order by count(*) desc;
end $$;

create or replace function public.report_by_district(p_from timestamptz, p_to timestamptz)
returns table (district text, order_count bigint, revenue numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._require_permission('reports.view');
  return query
  select coalesce(nullif(o.district, ''), 'Belirtilmemiş'), count(*), coalesce(sum(o.total), 0)::numeric
    from public.orders o
   where o.created_at >= p_from and o.created_at < p_to
     and o.status <> 'cancelled' and o.order_type = 'delivery'
   group by 1
   order by count(*) desc;
end $$;

-- Kurye başına paket sayısı, taşıdığı ciro ve ortalama süreler (dakika)
create or replace function public.report_courier_performance(p_from timestamptz, p_to timestamptz)
returns table (courier_id uuid, courier_name text, delivery_count bigint, revenue_carried numeric,
               avg_total_minutes numeric, avg_delivery_minutes numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._require_permission('reports.view');
  return query
  select cd.courier_id, p.full_name, count(*), coalesce(sum(o.total), 0)::numeric,
         round((avg(cd.total_seconds) / 60.0)::numeric, 1),
         round((avg(cd.delivery_seconds) / 60.0)::numeric, 1)
    from public.courier_deliveries cd
    join public.profiles p on p.id = cd.courier_id
    join public.orders o on o.id = cd.order_id
   where cd.outcome = 'delivered' and cd.delivered_at >= p_from and cd.delivered_at < p_to
   group by cd.courier_id, p.full_name
   order by count(*) desc;
end $$;

-- Ortalama süreler (dakika): alınma → hazırlanma → kuryeye verilme → teslim
create or replace function public.report_order_timings(p_from timestamptz, p_to timestamptz)
returns table (delivered_orders bigint, avg_accept_min numeric, avg_prepare_min numeric,
               avg_wait_courier_min numeric, avg_delivery_min numeric, avg_total_min numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._require_permission('reports.view');
  return query
  select count(*),
         round((avg(extract(epoch from (o.accepted_at - o.created_at))) / 60)::numeric, 1),
         round((avg(extract(epoch from (o.ready_at - o.accepted_at))) / 60)::numeric, 1),
         round((avg(extract(epoch from (o.picked_up_at - o.ready_at))) / 60)::numeric, 1),
         round((avg(extract(epoch from (o.delivered_at - o.picked_up_at))) / 60)::numeric, 1),
         round((avg(extract(epoch from (o.delivered_at - o.created_at))) / 60)::numeric, 1)
    from public.orders o
   where o.status = 'delivered' and o.created_at >= p_from and o.created_at < p_to;
end $$;

-- İptal, eksik, fazla, hatalı sipariş kayıtları
create or replace function public.report_issues(p_from timestamptz, p_to timestamptz)
returns table (kind text, label text, item_count bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._require_permission('reports.view');
  return query
  select 'issue'::text, i.issue_type::text, count(*)
    from public.order_issues i
   where i.created_at >= p_from and i.created_at < p_to
   group by i.issue_type
  union all
  select 'cancelled'::text, coalesce(nullif(o.cancel_reason, ''), 'Belirtilmemiş'), count(*)
    from public.orders o
   where o.status = 'cancelled' and o.created_at >= p_from and o.created_at < p_to
   group by 2
  order by 1, 3 desc;
end $$;

-- Masa kullanımı
create or replace function public.report_table_usage(p_from timestamptz, p_to timestamptz)
returns table (table_id uuid, table_number integer, session_count bigint, order_count bigint,
               revenue numeric, avg_session_minutes numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._require_permission('reports.view');
  return query
  with sess as (
    select s.id, s.table_id,
           (extract(epoch from (s.closed_at - s.opened_at)) / 60)::numeric as mins
      from public.table_sessions s
     where s.opened_at >= p_from and s.opened_at < p_to
  ),
  ord as (
    select o.table_session_id as sid, count(*) as c, sum(o.total) as t
      from public.orders o
     where o.status <> 'cancelled' and o.table_session_id is not null
     group by 1
  )
  select t.id, t.number, count(sess.id), coalesce(sum(ord.c), 0)::bigint,
         coalesce(sum(ord.t), 0)::numeric, round(avg(sess.mins), 1)
    from public.dining_tables t
    join sess on sess.table_id = t.id
    left join ord on ord.sid = sess.id
   group by t.id, t.number
   order by t.number;
end $$;

grant execute on function
  public.report_summary(timestamptz, timestamptz),
  public.report_daily(timestamptz, timestamptz),
  public.report_hourly_heatmap(timestamptz, timestamptz),
  public.report_top_products(timestamptz, timestamptz, integer),
  public.report_by_source(timestamptz, timestamptz),
  public.report_payment_breakdown(timestamptz, timestamptz),
  public.report_by_district(timestamptz, timestamptz),
  public.report_courier_performance(timestamptz, timestamptz),
  public.report_order_timings(timestamptz, timestamptz),
  public.report_issues(timestamptz, timestamptz),
  public.report_table_usage(timestamptz, timestamptz)
to authenticated;


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


-- =====================================================================
-- YAZIR PİLAVCISI · 06 · Başlangıç verileri (demodaki menü, 5 masa, ayarlar, yetkiler)
-- 05_storage_realtime_cron.sql'den SONRA çalıştırın.
-- =====================================================================
select set_config('app.skip_audit', '1', false);   -- başlangıç verisi denetim kaydını şişirmesin

-- ---------- Yetki kataloğu ----------
insert into public.permissions (key, label, group_name, sort_order) values
  ('orders.view',            'Siparişleri görüntüle',               'Siparişler', 10),
  ('orders.create',          'Sipariş ekle (telefon / masa)',       'Siparişler', 11),
  ('orders.edit',            'Sipariş düzenle ve durum değiştir',   'Siparişler', 12),
  ('orders.cancel',          'Sipariş iptal et',                    'Siparişler', 13),
  ('orders.assign_courier',  'Kurye ata',                           'Siparişler', 14),
  ('tables.view',            'Masaları görüntüle',                  'Masalar',    20),
  ('tables.operate',         'Masa durumu / hesap kapatma',         'Masalar',    21),
  ('tables.manage',          'Masa ekle, sil, yerleşimi düzenle',   'Masalar',    22),
  ('couriers.view',          'Kuryeleri ve canlı konumu görüntüle', 'Kuryeler',   30),
  ('couriers.manage',        'Kurye ekle, düzenle, pasifleştir',    'Kuryeler',   31),
  ('menu.manage',            'Menü, fiyat ve fotoğraf yönetimi',    'Menü',       40),
  ('reports.view',           'Raporlar ve analiz',                  'Raporlar',   50),
  ('customers.view',         'Müşterileri görüntüle',               'Müşteriler', 60),
  ('customers.manage',       'Müşteri bilgisi düzenle',             'Müşteriler', 61),
  ('feedback.view',          'Geri bildirimleri görüntüle',         'Diğer',      70),
  ('staff.view',             'Personel listesini görüntüle',        'Personel',   80),
  ('settings.manage',        'İşletme ayarları ve yorumlar',        'Ayarlar',    90),
  ('integrations.manage',    'Platform entegrasyonları',            'Ayarlar',    91),
  ('audit.view',             'İşlem kayıtlarını (denetim) görüntüle', 'Ayarlar',  92);

-- Operatör varsayılanı (sahip değiştirebilir). Alt yönetici: varsayılan yetki YOK; sahip tek tek verir.
insert into public.role_permissions (role, permission_key) values
  ('operator', 'orders.view'), ('operator', 'orders.create'), ('operator', 'orders.edit'),
  ('operator', 'orders.assign_courier'),
  ('operator', 'tables.view'), ('operator', 'tables.operate'),
  ('operator', 'couriers.view'),
  ('operator', 'menu.manage'),
  ('operator', 'customers.view'), ('operator', 'customers.manage'),
  ('operator', 'feedback.view');

-- ---------- İşletme ayarları ----------
insert into public.business_settings
  (id, name, slogan, phone, whatsapp, address, iban, iban_holder, delivery_fee, min_order_amount,
   estimated_delivery_min, estimated_delivery_max)
values
  (1, 'Yazır Pilavcısı', 'Tane tane pilav, 15 dakikada kapında.', '0540 331 41 42', '05403314142',
   'Yazır mah. Şehit Erkan Özbalcı sk. 20/b, Selçuklu / Konya (Reyhan İş Merkezi arkası)',
   'TR00 0000 0000 0000 0000 0000 00', 'Yazır Pilavcısı', 0, 0, 15, 25)
on conflict (id) do nothing;

-- Pzt–Cmt 12:00–03:00, Pazar 14:00–03:00 (ertesi gün kapanış)
insert into public.opening_hours (day_of_week, open_time, close_time, closes_next_day, is_closed) values
  (1, '12:00', '03:00', true, false), (2, '12:00', '03:00', true, false), (3, '12:00', '03:00', true, false),
  (4, '12:00', '03:00', true, false), (5, '12:00', '03:00', true, false), (6, '12:00', '03:00', true, false),
  (7, '14:00', '03:00', true, false);

-- ---------- Sipariş kaynakları ----------
insert into public.order_sources (code, label, color, is_platform, commission_rate, sort_order) values
  ('web',         'Web',           '#14110c', false, 0, 1),
  ('phone',       'Telefon',       '#6b6556', false, 0, 2),
  ('table',       'Masa / QR',     '#f2b705', false, 0, 3),
  ('yemeksepeti', 'Yemeksepeti',   '#fa0050', true,  0, 4),
  ('trendyol',    'Trendyol Yemek','#f27a1a', true,  0, 5),
  ('getir',       'Getir Yemek',   '#5d3ebc', true,  0, 6),
  ('migros',      'Migros Yemek',  '#d9480f', true,  0, 7),
  ('counter',     'Restoran / Tezgâh', '#d4af37', false, 0, 8);

insert into public.integrations (platform) values ('yemeksepeti'), ('trendyol'), ('getir'), ('migros');

-- ---------- Menü ----------
insert into public.categories (name, slug, sort_order) values
  ('Pilavlar', 'pilavlar', 1), ('Çorbalar & Yanlar', 'corbalar-yanlar', 2), ('İçecekler', 'icecekler', 3);

insert into public.products (category_id, slug, name, description, emoji, kcal, protein_g, carb_g, is_daily, sort_order)
select c.id, v.slug, v.name, v.descr, v.emoji, v.kcal, v.pro, v.carb, v.daily, v.ord
from (values
  ('sade',     'Pilavlar', 'Sade Pilav',              'Tane tane, tereyağlı şehriyeli klasik pilav.', '🍚', 320, 6, 58, false, 1),
  ('tavuk',    'Pilavlar', 'Tavuk Pilav',             'Özenle haşlanır, el emeğiyle didilir, tane tane pilavın üzerine servis edilir.', '🍗', 480, 28, 60, false, 2),
  ('sporcu',   'Pilavlar', 'Sporcu Pilav',            'Çift tavuk, az yağlı. Sporcuların favorisi.', '💪', 560, 44, 58, false, 3),
  ('kori',     'Pilavlar', 'Körili Tavuk Pilav',      'Hafif acılı köri sosuyla tavuk pilav.', '🍛', 540, 30, 62, false, 4),
  ('barbekul', 'Pilavlar', 'Barbekülü Tavuk Pilav',   'Dumanlı barbekü sosu, didilmiş tavuk.', '🔥', 560, 29, 66, false, 5),
  ('etli',     'Pilavlar', 'Etli Pilav',              'Yavaş pişmiş, lokum gibi et.', '🥩', 690, 38, 58, false, 6),
  ('deniz',    'Pilavlar', 'Denizaltı',               'Etin ve tavuğun bir arada olduğu doyurucu karışık.', '🌊', 780, 52, 60, false, 7),
  ('kuru',     'Pilavlar', 'Kuru Fasulyeli Pilav',    'Odun ateşi tadında kuru fasulye ile.', '🫘', 520, 18, 78, false, 8),
  ('midye',    'Pilavlar', 'Midye Dolma',             'Baharatlı iç pilavlı, limonla.', '🦪', 45, 2, 6, false, 9),
  ('araba',    'Çorbalar & Yanlar', 'Arabaşı',        'Konya’nın geleneksel çorbası. Her gün.', '🥣', 260, 14, 20, true, 1),
  ('mercimek', 'Çorbalar & Yanlar', 'Mercimek Çorbası','Limon ve pul biberle.', '🍲', 190, 9, 28, true, 2),
  ('iskembe',  'Çorbalar & Yanlar', 'İşkembe (Cuma–Cumartesi)', 'Sarımsaklı sirkeli klasik.', '🍜', 240, 16, 12, true, 3),
  ('ayran',    'İçecekler', 'Ayran',                  'Soğuk, köpüklü.', '🥛', 70, 4, 5, false, 1),
  ('cola',     'İçecekler', 'Coca-Cola',              '', '🥤', 140, 0, 35, false, 2),
  ('fuse',     'İçecekler', 'Fuse Tea',               '', '🧊', 90, 0, 22, false, 3),
  ('soda',     'İçecekler', 'Soda',                   '', '🫧', 0, 0, 0, false, 4),
  ('su',       'İçecekler', 'Su',                     '', '💧', 0, 0, 0, false, 5)
) as v(slug, cat, name, descr, emoji, kcal, pro, carb, daily, ord)
join public.categories c on c.name = v.cat;

insert into public.product_variants (product_id, name, price, sort_order)
select p.id, v.vname, v.price, v.ord
from (values
  ('sade','1 porsiyon',100,1),
  ('tavuk','1 porsiyon',120,1), ('tavuk','1,5 porsiyon',160,2),
  ('sporcu','1 porsiyon',170,1), ('sporcu','1,5 porsiyon',190,2),
  ('kori','1 porsiyon',180,1), ('kori','1,5 porsiyon',200,2),
  ('barbekul','1 porsiyon',180,1), ('barbekul','1,5 porsiyon',200,2),
  ('etli','1 porsiyon',350,1), ('etli','1,5 porsiyon',400,2),
  ('deniz','1 porsiyon',400,1), ('deniz','1,5 porsiyon',450,2),
  ('kuru','1 porsiyon',150,1), ('kuru','1,5 porsiyon',180,2),
  ('midye','1 tane',20,1), ('midye','1 kg',800,2),
  ('araba','1 kase',120,1),
  ('mercimek','1 kase',120,1),
  ('iskembe','1 kase',180,1),
  ('ayran','küçük',25,1), ('ayran','büyük',35,2),
  ('cola','şişe',70,1), ('cola','teneke',80,2), ('cola','1 litre',90,3),
  ('fuse','330 ml',70,1),
  ('soda','sade',20,1), ('soda','meyveli',25,2),
  ('su','0,5 l',20,1)
) as v(slug, vname, price, ord)
join public.products p on p.slug = v.slug;

-- ---------- Masalar (QR kodları tetikleyiciyle otomatik oluşur) ----------
insert into public.dining_tables (number, name, capacity, pos_x, pos_y, shape) values
  (1, 'Masa 1', 4,  40,  40, 'square'),
  (2, 'Masa 2', 4, 200,  40, 'square'),
  (3, 'Masa 3', 4, 360,  40, 'round'),
  (4, 'Masa 4', 6,  40, 200, 'rect'),
  (5, 'Masa 5', 6, 240, 200, 'rect');

-- ---------- Yorumlar: GERÇEK Google yorumlarıyla değiştirilene kadar yayında DEĞİL ----------
insert into public.site_reviews (author, rating, body, is_published, sort_order) values
  ('Mehmet K.', 5, 'Pilav tane tane, tavuk taze. Kurye 12 dakikada getirdi.', false, 1),
  ('Ayşe T.',   5, 'Mevlit için 120 kişilik sipariş verdik, zamanında ve sıcak geldi. Teşekkürler.', false, 2),
  ('Burak Y.',  4, 'Sporcu pilav çok iyi, ayran biraz daha soğuk olsa tam olurdu.', false, 3),
  ('Selin A.',  5, 'Gece 2’de açık olan nadir yerlerden. Fiyatlar makul.', false, 4),
  ('Hasan D.',  5, 'Etli pilav lokum gibiydi.', false, 5);

select set_config('app.skip_audit', '', false);


-- ===== 09_hours_overrides.sql (gün­e özel çalışma saati) =====
-- =====================================================================
-- YAZIR PİLAVCISI · 09 — GÜNE ÖZEL ÇALIŞMA SAATİ (ARA DEĞİŞİKLİK)
-- =====================================================================
-- Supabase > SQL Editor'e yapıştırıp RUN edin. Tekrar çalıştırılabilir (idempotent).
--
-- Mantık:
--   * opening_hours            = HAFTALIK STANDART program ("her zaman için" düzenleme buraya yazılır)
--   * opening_hours_overrides  = BELİRLİ BİR TARİHE özel saat ("sadece bugün/bu gün için" düzenleme)
--   Bir gün için geçerli saat = o tarihte override varsa o, yoksa haftalık standart.
--   Geçmiş tarihli override'lar otomatik olarak etkisiz kalır (tarih geçince haftalık programa dönülür).
-- =====================================================================

create table if not exists public.opening_hours_overrides (
  override_date   date primary key,                 -- Çalışma gününün BAŞLADIĞI takvim tarihi (İstanbul)
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
create policy opening_hours_overrides_select on public.opening_hours_overrides
  for select to anon, authenticated using (true);

drop policy if exists opening_hours_overrides_write on public.opening_hours_overrides;
create policy opening_hours_overrides_write on public.opening_hours_overrides
  for all to authenticated
  using ((select public.has_permission('settings.manage')))
  with check ((select public.has_permission('settings.manage')));

grant select on public.opening_hours_overrides to anon, authenticated;
grant insert, update, delete on public.opening_hours_overrides to authenticated;

-- Bir takvim günü için GEÇERLİ saat (override varsa o, yoksa haftalık)
create or replace function public.effective_hours(p_date date)
returns table (open_time time, close_time time, closes_next_day boolean, is_closed boolean)
language sql stable security definer set search_path = '' as $$
  select o.open_time, o.close_time, o.closes_next_day, o.is_closed
    from public.opening_hours_overrides o where o.override_date = p_date
  union all
  select h.open_time, h.close_time, h.closes_next_day, h.is_closed
    from public.opening_hours h
   where h.day_of_week = extract(isodow from p_date)::int
     and not exists (select 1 from public.opening_hours_overrides o2 where o2.override_date = p_date)
  limit 1
$$;

-- Şu an açık mıyız? (override + gece yarısını aşan saatler dahil)
create or replace function public.is_open_now()
returns boolean language sql stable security definer set search_path = '' as $$
  with n as (select (now() at time zone 'Europe/Istanbul') as t)
  select coalesce((
    select true
      from n
     where
       -- bugün başlayan çalışma penceresi
       exists (
         select 1 from public.effective_hours(n.t::date) e
          where not e.is_closed
            and n.t::time >= e.open_time
            and (e.closes_next_day or n.t::time < e.close_time)
       )
       or
       -- dün başlayıp bu sabaha sarkan pencere (örn. 12:00 → 03:00)
       exists (
         select 1 from public.effective_hours((n.t - interval '1 day')::date) e
          where not e.is_closed
            and e.closes_next_day
            and n.t::time < e.close_time
       )
  ), false)
$$;

grant execute on function public.effective_hours(date) to anon, authenticated;
grant execute on function public.is_open_now() to anon, authenticated;



-- ===== 10_courier_live_tracking.sql (kurye canlı takip & istek sistemi) =====
-- =====================================================================
-- YAZIR PİLAVCISI · 10 — KURYE CANLI TAKİP, SİPARİŞ İSTEĞİ & KURYE EKRANI
-- =====================================================================
-- Supabase > SQL Editor'de TEK SEFER çalıştırın (tekrar çalıştırmak güvenlidir).
--
--  1) Restoran koordinatı (Google Haritalar pini) işletme ayarlarına yazılır (boşsa)
--  2) courier_order_requests : kurye "bu paketi ben almak istiyorum" isteği
--  3) courier_list_orders()  : kuryenin göreceği TÜM aktif teslimatlar
--                              (başkasının siparişinde müşteri adı/telefon/açık adres GİZLİ)
--  4) courier_request_order / courier_cancel_request / resolve_courier_request
--  5) set_courier_online(false) → konum satırı silinir (haritadan kaybolur)
--  6) Admin doğrudan atama yapınca bekleyen istekler otomatik kapanır
-- =====================================================================

-- 1) Restoran konumu: Yazır, Şht. Erkan Özbalcı Sk. No:20/b, Selçuklu / Konya
update public.business_settings
   set lat = coalesce(lat, 37.957500),
       lng = coalesce(lng, 32.509867),
       google_maps_url = coalesce(google_maps_url, 'https://maps.app.goo.gl/c1BAhzu2H56kiwQz7')
 where id = 1;

-- 2) İstek tablosu
create table if not exists public.courier_order_requests (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  courier_id  uuid not null references public.profiles(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  uuid references public.profiles(id) on delete set null
);
create unique index if not exists courier_order_requests_one_pending
  on public.courier_order_requests(order_id, courier_id) where status = 'pending';
create index if not exists courier_order_requests_order_idx   on public.courier_order_requests(order_id, status);
create index if not exists courier_order_requests_courier_idx on public.courier_order_requests(courier_id, status);

alter table public.courier_order_requests enable row level security;
drop policy if exists courier_order_requests_select on public.courier_order_requests;
create policy courier_order_requests_select on public.courier_order_requests for select to authenticated
  using (courier_id = (select auth.uid())
         or (select public.has_permission('orders.assign_courier'))
         or (select public.has_permission('couriers.view')));
revoke insert, update, delete on public.courier_order_requests from authenticated, anon;
grant select on public.courier_order_requests to authenticated;

-- Realtime yayınına ekle
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'courier_order_requests') then
    alter publication supabase_realtime add table public.courier_order_requests;
  end if;
end $$;

-- 3) Kurye için tüm aktif teslimatlar (kişisel veri yalnızca kendi siparişinde)
create or replace function public.courier_list_orders()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_res jsonb;
begin
  if public.current_app_role() is distinct from 'courier' then
    raise exception 'Yalnızca kuryeler kullanabilir' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.created_at), '[]'::jsonb) into v_res
  from (
    select
      o.id, o.order_no, o.status, o.created_at, o.total, o.payment_method, o.district,
      (o.courier_id = v_uid) as is_mine,
      (o.courier_id is not null and o.courier_id <> v_uid) as taken_by_other,
      case when o.courier_id is not null then split_part(cp.full_name, ' ', 1) end as courier_first_name,
      case when o.courier_id = v_uid then o.customer_name end    as customer_name,
      case when o.courier_id = v_uid then o.customer_phone end   as customer_phone,
      case when o.courier_id = v_uid then o.delivery_address end as delivery_address,
      case when o.courier_id = v_uid then o.note end             as note,
      o.lat, o.lng,
      (select coalesce(jsonb_agg(jsonb_build_object('name', i.product_name, 'variant', i.variant_name, 'qty', i.quantity)), '[]'::jsonb)
         from public.order_items i where i.order_id = o.id) as items,
      (select r.status from public.courier_order_requests r
        where r.order_id = o.id and r.courier_id = v_uid and r.status = 'pending' limit 1) as my_request,
      (select count(*) from public.courier_order_requests r
        where r.order_id = o.id and r.status = 'pending') as request_count
    from public.orders o
    left join public.profiles cp on cp.id = o.courier_id
    where o.order_type = 'delivery'
      and o.status in ('new', 'preparing', 'ready', 'assigned', 'on_the_way')
  ) t;
  return v_res;
end $$;

-- 4a) "Bu paketi ben götürmek istiyorum"
create or replace function public.courier_request_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_o public.orders%rowtype; v_name text;
begin
  if public.current_app_role() is distinct from 'courier' then
    raise exception 'Yalnızca kuryeler kullanabilir' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and is_active) then
    raise exception 'Hesabınız pasif' using errcode = '42501';
  end if;
  select * into v_o from public.orders where id = p_order_id;
  if not found then raise exception 'Sipariş bulunamadı' using errcode = 'P0001'; end if;
  if v_o.order_type <> 'delivery' then raise exception 'Bu sipariş kurye ile teslim edilmiyor' using errcode = 'P0001'; end if;
  if v_o.courier_id is not null then raise exception 'Bu siparişe zaten bir kurye atanmış' using errcode = 'P0001'; end if;
  if v_o.status not in ('new', 'preparing', 'ready') then raise exception 'Bu sipariş için istek gönderilemez' using errcode = 'P0001'; end if;

  insert into public.courier_order_requests (order_id, courier_id) values (p_order_id, v_uid)
  on conflict do nothing;

  select full_name into v_name from public.profiles where id = v_uid;
  perform public._notify_staff('orders.assign_courier', 'system',
    'Kurye isteği · #' || v_o.order_no, coalesce(v_name, 'Kurye') || ' bu paketi götürmek istiyor',
    jsonb_build_object('kind', 'courier_request', 'order_id', p_order_id, 'courier_id', v_uid));
  return jsonb_build_object('ok', true);
end $$;

-- 4b) İsteği geri çek
create or replace function public.courier_cancel_request(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.current_app_role() is distinct from 'courier' then
    raise exception 'Yalnızca kuryeler kullanabilir' using errcode = '42501';
  end if;
  update public.courier_order_requests
     set status = 'cancelled', decided_at = now()
   where order_id = p_order_id and courier_id = auth.uid() and status = 'pending';
end $$;

-- 4c) Yönetici onayı / reddi
create or replace function public.resolve_courier_request(p_request_id uuid, p_approve boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_r public.courier_order_requests%rowtype; v_o public.orders%rowtype;
begin
  perform public._require_permission('orders.assign_courier');
  select * into v_r from public.courier_order_requests where id = p_request_id for update;
  if not found then raise exception 'İstek bulunamadı' using errcode = 'P0001'; end if;
  if v_r.status <> 'pending' then raise exception 'Bu istek zaten sonuçlanmış' using errcode = 'P0001'; end if;

  select * into v_o from public.orders where id = v_r.order_id for update;

  if p_approve then
    if v_o.courier_id is not null then
      update public.courier_order_requests set status = 'rejected', decided_at = now(), decided_by = auth.uid() where id = p_request_id;
      raise exception 'Siparişe zaten kurye atanmış' using errcode = 'P0001';
    end if;
    if v_o.status = 'new' then
      update public.orders set status = 'preparing' where id = v_o.id;   -- onay = siparişi kabul et
    end if;
    perform public.assign_courier(v_o.id, v_r.courier_id);              -- diğer bekleyen istekleri trigger kapatır
    update public.courier_order_requests
       set status = 'approved', decided_at = now(), decided_by = auth.uid() where id = p_request_id;
    insert into public.notifications (user_id, type, title, body, data)
    values (v_r.courier_id, 'order_assigned', 'İsteğiniz onaylandı · #' || v_o.order_no, 'Paket size atandı',
            jsonb_build_object('order_id', v_o.id, 'order_no', v_o.order_no));
  else
    update public.courier_order_requests
       set status = 'rejected', decided_at = now(), decided_by = auth.uid() where id = p_request_id;
    insert into public.notifications (user_id, type, title, body, data)
    values (v_r.courier_id, 'system', 'İsteğiniz reddedildi · #' || v_o.order_no, 'Bu paket başka kuryeye verilebilir',
            jsonb_build_object('order_id', v_o.id, 'order_no', v_o.order_no));
  end if;
  return jsonb_build_object('ok', true, 'approved', p_approve);
end $$;

-- 5) Çevrimdışı olunca konum satırı silinir: kurye haritada görünmez
create or replace function public.set_courier_online(p_online boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.current_app_role() is distinct from 'courier' then
    raise exception 'Yalnızca kuryeler kullanabilir' using errcode = '42501';
  end if;
  update public.courier_profiles set is_online = p_online where user_id = auth.uid();
  if not p_online then
    delete from public.courier_locations where courier_id = auth.uid();
  end if;
end $$;

-- 6) Atama değişince / sipariş bitince bekleyen istekleri kapat
create or replace function public.close_courier_requests()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('delivered', 'cancelled') then
    update public.courier_order_requests set status = 'cancelled', decided_at = now()
     where order_id = new.id and status = 'pending';
  elsif new.courier_id is not null and new.courier_id is distinct from old.courier_id then
    update public.courier_order_requests
       set status = case when courier_id = new.courier_id then 'approved' else 'rejected' end, decided_at = now()
     where order_id = new.id and status = 'pending';
  end if;
  return null;
end $$;
drop trigger if exists orders_close_courier_requests on public.orders;
create trigger orders_close_courier_requests after update of courier_id, status on public.orders
  for each row execute function public.close_courier_requests();

-- Yetkiler
revoke execute on function public.courier_list_orders(), public.courier_request_order(uuid),
  public.courier_cancel_request(uuid), public.resolve_courier_request(uuid, boolean) from public, anon;
grant execute on function public.courier_list_orders(), public.courier_request_order(uuid),
  public.courier_cancel_request(uuid), public.resolve_courier_request(uuid, boolean) to authenticated;


-- =====================================================================
-- 11 · PLATFORM ENTEGRASYONLARI (Trendyol Go, Yemeksepeti, Migros Yemek, Getir, diğer)
-- Tekrar çalıştırmak güvenlidir (idempotent).
--
-- İLKELER
--  • Her platform kendi satırı (integrations.platform) + kendi olay/hata kaydıyla (integration_events) yaşar.
--    Bir platformdaki hata yalnızca o platformun durumunu 'error' yapar; diğerlerinin siparişleri akmaya devam eder.
--  • GİZLİ ANAHTARLAR (API key/secret) veritabanına YAZILMAZ. Edge Function secrets'ta tutulur.
--    integrations.config yalnızca gizli olmayan bilgileri taşır (supplier_id, store_id, ortam...).
--  • Platform siparişleri tarayıcıdan değil, Edge Function'dan (service_role) platform_ingest_order() ile içeri alınır.
-- =====================================================================

-- ---------- Sipariş kaynakları (etiketler) ----------
insert into public.order_sources (code, label, color, is_platform, commission_rate, sort_order) values
  ('web',         'Online Sipariş',  '#14110c', false, 0, 1),
  ('phone',       'Telefon',         '#6b6556', false, 0, 2),
  ('table',       'Masa Servisi',    '#2e9e45', false, 0, 3),
  ('counter',     'Restoran Paket',  '#d4af37', false, 0, 4),
  ('trendyol',    'Trendyol Go',     '#f27a1a', true,  0, 5),
  ('yemeksepeti', 'Yemeksepeti',     '#fa0050', true,  0, 6),
  ('migros',      'Migros Yemek',    '#2e9e45', true,  0, 7),
  ('getir',       'Getir',           '#5d3ebc', true,  0, 8),
  ('other',       'Diğer Platform',  '#6b6556', true,  0, 9)
on conflict (code) do update
  set label = excluded.label, color = excluded.color, is_platform = excluded.is_platform, sort_order = excluded.sort_order;

insert into public.integrations (platform) values
  ('trendyol'), ('yemeksepeti'), ('migros'), ('getir'), ('other')
on conflict (platform) do nothing;

-- ---------- Entegrasyon durum alanları ----------
alter table public.integrations
  add column if not exists last_order_sync_at timestamptz,
  add column if not exists last_menu_sync_at  timestamptz,
  add column if not exists last_ok_at         timestamptz,
  add column if not exists error_count        int not null default 0;

-- Gizli olmayan varsayılan ayarlar. "000" = işletmeyle netleşince doldurulacak yer tutucu.
update public.integrations set config = '{
  "supplier_id": "000", "store_id": "000", "environment": "stage",
  "auto_accept": false, "poll_seconds": 30, "sync_menu": true, "sync_hours": true
}'::jsonb || config where platform = 'trendyol' and not (config ? 'supplier_id');
update public.integrations set config = '{
  "chain_code": "000", "vendor_id": "000", "environment": "stage",
  "auto_accept": false, "sync_menu": true, "sync_hours": true
}'::jsonb || config where platform = 'yemeksepeti' and not (config ? 'vendor_id');
update public.integrations set config = '{
  "store_id": "000", "environment": "stage", "auto_accept": false, "sync_menu": true, "sync_hours": true
}'::jsonb || config where platform in ('migros', 'getir') and not (config ? 'store_id');
update public.integrations set config = '{ "note": "" }'::jsonb || config where platform = 'other' and not (config ? 'note');

-- ---------- Sipariş: platforma özel alanlar ----------
alter table public.orders
  add column if not exists pin_code          text,   -- IVR PIN (Uber: 8 hane · TGO: 11 haneli sipariş no)
  add column if not exists order_code        text,   -- 5 karakterli alfanümerik sipariş kodu
  add column if not exists call_center_phone text,   -- dinamik çağrı merkezi hattı (0212 XXX YY ZZ gibi)
  add column if not exists platform_app      text,   -- örn. 'UberEats'
  add column if not exists platform_status   text;   -- platformdaki ham durum (Created, Picking, Invoiced...)

-- Müşteri telefonu: platformlardan 0'lı, boşluklu/dinamik hatlar gelebilir (örn. "0212 XXX YY ZZ"). Kontrol gevşek, uzunluk sınırlı.
alter table public.orders drop constraint if exists orders_customer_phone_len;
alter table public.orders add constraint orders_customer_phone_len
  check (customer_phone is null or char_length(customer_phone) between 3 and 40);

-- ---------- Olay / hata kaydı ----------
alter table public.integration_events add column if not exists duration_ms int;
create index if not exists integration_events_err_idx
  on public.integration_events(platform, created_at desc) where status = 'error';

-- ---------- Ürün eşleştirme: alan genişletme ----------
alter table public.product_platform_mappings
  add column if not exists external_name text,
  add column if not exists last_synced_at timestamptz;

-- ---------- Platform siparişi içeri alma (yalnızca service_role / Edge Function) ----------
-- Aynı (source, external_ref) tekrar gelirse yeni sipariş açmaz; platform alanlarını ve geçerliyse durumu günceller.
create or replace function public.platform_ingest_order(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_source  text := p->>'source';
  v_ref     text := nullif(p->>'external_ref', '');
  v_id      uuid;
  v_no      bigint;
  v_old     public.order_status;
  v_new     public.order_status := coalesce(nullif(p->>'status', '')::public.order_status, 'new');
  v_created boolean := false;
begin
  if coalesce(auth.role(), current_setting('request.jwt.claim.role', true), 'service_role') <> 'service_role' then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  if v_ref is null or not exists (select 1 from public.order_sources where code = v_source and is_platform and is_active) then
    raise exception 'Geçersiz platform veya sipariş numarası' using errcode = 'P0001';
  end if;

  select id, status into v_id, v_old from public.orders where source = v_source and external_ref = v_ref;

  if v_id is null then
    insert into public.orders (
      source, order_type, status, customer_name, customer_phone, delivery_address, district, lat, lng, note,
      payment_method, payment_status, subtotal, delivery_fee, discount, total,
      external_ref, external_payload, pin_code, order_code, call_center_phone, platform_app, platform_status)
    values (
      v_source, 'delivery', 'new',
      nullif(left(p->>'customer_name', 120), ''), nullif(left(p->>'customer_phone', 40), ''),
      nullif(left(p->>'delivery_address', 800), ''), nullif(left(p->>'district', 80), ''),
      nullif(p->>'lat', '')::numeric, nullif(p->>'lng', '')::numeric,
      nullif(left(p->>'note', 500), ''),
      'platform_online', 'paid',
      coalesce(nullif(p->>'subtotal', '')::numeric, 0), coalesce(nullif(p->>'delivery_fee', '')::numeric, 0),
      coalesce(nullif(p->>'discount', '')::numeric, 0), coalesce(nullif(p->>'total', '')::numeric, 0),
      v_ref, p->'payload',
      nullif(p->>'pin_code', ''), nullif(p->>'order_code', ''), nullif(p->>'call_center_phone', ''),
      nullif(p->>'platform_app', ''), nullif(p->>'platform_status', ''))
    returning id, order_no into v_id, v_no;

    insert into public.order_items (order_id, product_name, variant_name, unit_price, quantity, note)
    select v_id, left(coalesce(x.name, 'Ürün'), 200), nullif(left(x.variant, 200), ''),
           greatest(coalesce(x.unit_price, 0), 0), least(greatest(coalesce(x.quantity, 1), 1), 100),
           nullif(left(x.note, 300), '')
      from jsonb_to_recordset(coalesce(p->'items', '[]'::jsonb))
           as x(name text, variant text, unit_price numeric, quantity int, note text);
    v_created := true;
  else
    update public.orders
       set platform_status = coalesce(nullif(p->>'platform_status', ''), platform_status),
           call_center_phone = coalesce(nullif(p->>'call_center_phone', ''), call_center_phone),
           pin_code = coalesce(nullif(p->>'pin_code', ''), pin_code),
           external_payload = coalesce(p->'payload', external_payload)
     where id = v_id;
    if v_new is distinct from v_old and public.order_transition_allowed(v_old, v_new) then
      update public.orders
         set status = v_new,
             cancel_reason = case when v_new = 'cancelled' then coalesce(nullif(p->>'cancel_reason', ''), 'Platform iptali') else cancel_reason end
       where id = v_id;
    end if;
    select order_no into v_no from public.orders where id = v_id;
  end if;

  return jsonb_build_object('order_id', v_id, 'order_no', v_no, 'created', v_created);
end $$;

revoke all on function public.platform_ingest_order(jsonb) from public, anon, authenticated;
grant execute on function public.platform_ingest_order(jsonb) to service_role;

-- Yönetici arayüzü için: platform kartlarında sipariş sayıları (RLS'e uyar: orders.view yetkisi gerekir)
create or replace function public.platform_order_stats()
returns table (source text, today_count bigint, open_count bigint, last_order_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select o.source,
         count(*) filter (where o.created_at >= date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul'),
         count(*) filter (where o.status not in ('delivered', 'cancelled')),
         max(o.created_at)
    from public.orders o group by o.source
$$;
grant execute on function public.platform_order_stats() to authenticated;

-- ---------- Realtime ----------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['integrations', 'integration_events']
    loop
      if not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;


-- ===== 15_coupons_loyalty.sql =====
-- =====================================================================
-- YAZIR PİLAVCISI · 15 — KUPON, KAMPANYA, SADAKAT PUANI, MÜŞTERİ YÖNETİMİ
-- =====================================================================
-- Supabase > SQL Editor'e yapıştırıp RUN edin. Tekrar çalıştırılabilir (idempotent).
-- Gereksinim: 01–14 numaralı dosyalar çalıştırılmış olmalı.
-- =====================================================================

-- ---- Ayarlar: sadakat puanı --------------------------------------------------
alter table public.business_settings
  add column if not exists loyalty_enabled      boolean       not null default false,
  add column if not exists loyalty_earn_per_lira numeric(6,3) not null default 0.05,  -- 20 ₺ = 1 puan
  add column if not exists loyalty_point_value  numeric(6,2)  not null default 1,     -- 1 puan = 1 ₺ indirim
  add column if not exists loyalty_min_redeem   int           not null default 20;    -- en az 20 puan kullanılabilir

alter table public.customers
  add column if not exists loyalty_points int not null default 0,
  add column if not exists notes text;

-- ---- Kuponlar ------------------------------------------------------------------
create table if not exists public.coupons (
  id               uuid primary key default gen_random_uuid(),
  code             text not null,
  title            text not null default '',
  description      text not null default '',
  discount_type    text not null default 'percent' check (discount_type in ('percent', 'fixed', 'free_delivery')),
  discount_value   numeric(10,2) not null default 0 check (discount_value >= 0),
  max_discount     numeric(10,2),                       -- yüzde indirimlerde tavan (₺)
  min_order_amount numeric(10,2) not null default 0,
  starts_at        timestamptz,
  ends_at          timestamptz,
  daily_start      time,                                -- saat bazlı geçerlilik (İstanbul saati)
  daily_end        time,
  weekdays         int[],                               -- 1=Pzt … 7=Paz; boş/NULL = her gün
  audience         text not null default 'all' check (audience in ('all', 'members', 'new_customers', 'specific')),
  customer_ids     uuid[] not null default '{}',        -- audience = specific
  usage_limit      int,                                 -- toplam kontenjan (NULL = sınırsız)
  per_customer_limit int default 1,                     -- kişi başı kullanım (NULL = sınırsız)
  used_count       int not null default 0,
  is_public        boolean not null default false,      -- sitedeki "Kampanyalar" sayfasında göster
  is_active        boolean not null default true,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists coupons_code_uq on public.coupons (upper(code));

create table if not exists public.coupon_redemptions (
  id          uuid primary key default gen_random_uuid(),
  coupon_id   uuid not null references public.coupons(id) on delete cascade,
  order_id    uuid not null unique references public.orders(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  phone       text,
  amount      numeric(10,2) not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists coupon_redemptions_coupon_idx on public.coupon_redemptions (coupon_id);

create table if not exists public.loyalty_ledger (
  id          bigint generated always as identity primary key,
  customer_id uuid not null references public.customers(id) on delete cascade,
  points      int not null,                             -- + kazanım, − harcama
  reason      text not null check (reason in ('earn', 'redeem', 'adjust')),
  order_id    uuid references public.orders(id) on delete set null,
  note        text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists loyalty_ledger_customer_idx on public.loyalty_ledger (customer_id, created_at desc);
create unique index if not exists loyalty_earn_once_idx on public.loyalty_ledger (order_id) where reason = 'earn';

-- ---- RLS -----------------------------------------------------------------------
alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.loyalty_ledger enable row level security;

drop policy if exists coupons_staff_select on public.coupons;
create policy coupons_staff_select on public.coupons for select to authenticated
  using ((select public.current_app_role()) in ('owner', 'sub_admin', 'operator'));
drop policy if exists coupons_staff_write on public.coupons;
create policy coupons_staff_write on public.coupons for all to authenticated
  using ((select public.has_permission('settings.manage')))
  with check ((select public.has_permission('settings.manage')));

drop policy if exists coupon_red_select on public.coupon_redemptions;
create policy coupon_red_select on public.coupon_redemptions for select to authenticated
  using ((select public.current_app_role()) in ('owner', 'sub_admin', 'operator'));

drop policy if exists loyalty_select on public.loyalty_ledger;
create policy loyalty_select on public.loyalty_ledger for select to authenticated
  using ((select public.current_app_role()) in ('owner', 'sub_admin', 'operator'));

revoke all on public.coupons, public.coupon_redemptions, public.loyalty_ledger from anon;
revoke insert, update, delete on public.coupon_redemptions, public.loyalty_ledger from authenticated;
grant select on public.coupons, public.coupon_redemptions, public.loyalty_ledger to authenticated;
grant insert, update, delete on public.coupons to authenticated;

-- ---- Puan hareketi → müşteri bakiyesi ----------------------------------------------
create or replace function public._loyalty_apply()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.customers set loyalty_points = loyalty_points + new.points, updated_at = now()
   where id = new.customer_id;
  return new;
end $$;
drop trigger if exists loyalty_ledger_apply on public.loyalty_ledger;
create trigger loyalty_ledger_apply after insert on public.loyalty_ledger
  for each row execute function public._loyalty_apply();

-- Sipariş TESLİM EDİLİNCE puan kazandır
create or replace function public._loyalty_earn()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_s public.business_settings%rowtype; v_pts int;
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' and new.customer_id is not null then
    select * into v_s from public.business_settings where id = 1;
    if v_s.loyalty_enabled then
      v_pts := floor(greatest(new.total - new.delivery_fee, 0) * v_s.loyalty_earn_per_lira);
      if v_pts > 0 then
        insert into public.loyalty_ledger (customer_id, points, reason, order_id, note)
        values (new.customer_id, v_pts, 'earn', new.id, 'Sipariş #' || new.order_no)
        on conflict do nothing;
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists orders_loyalty_earn on public.orders;
create trigger orders_loyalty_earn after update of status on public.orders
  for each row execute function public._loyalty_earn();

-- ---- Kupon doğrulama (iç) ----------------------------------------------------------
create or replace function public._coupon_check(
  p_code text, p_subtotal numeric, p_fee numeric, p_customer uuid, p_phone text,
  p_logged boolean, p_exclude_order uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  c public.coupons%rowtype;
  v_now timestamp := (now() at time zone 'Europe/Istanbul');
  v_t time := (now() at time zone 'Europe/Istanbul')::time;
  v_ok boolean;
  v_n int;
  v_disc numeric(10,2);
begin
  select * into c from public.coupons where upper(code) = upper(trim(coalesce(p_code, ''))) limit 1;
  if not found or not c.is_active then
    return jsonb_build_object('ok', false, 'error', 'Geçersiz kupon kodu');
  end if;
  if c.starts_at is not null and now() < c.starts_at then
    return jsonb_build_object('ok', false, 'error', 'Bu kupon henüz geçerli değil');
  end if;
  if c.ends_at is not null and now() > c.ends_at then
    return jsonb_build_object('ok', false, 'error', 'Bu kuponun süresi dolmuş');
  end if;
  if c.weekdays is not null and cardinality(c.weekdays) > 0 and not (extract(isodow from v_now)::int = any (c.weekdays)) then
    return jsonb_build_object('ok', false, 'error', 'Bu kupon bugün geçerli değil');
  end if;
  if c.daily_start is not null and c.daily_end is not null then
    if c.daily_start <= c.daily_end then v_ok := v_t between c.daily_start and c.daily_end;
    else v_ok := v_t >= c.daily_start or v_t <= c.daily_end; end if;
    if not v_ok then
      return jsonb_build_object('ok', false, 'error',
        'Bu kupon yalnızca ' || to_char(c.daily_start, 'HH24:MI') || ' – ' || to_char(c.daily_end, 'HH24:MI') || ' saatleri arasında geçerli');
    end if;
  end if;
  if p_subtotal < c.min_order_amount then
    return jsonb_build_object('ok', false, 'error', 'Bu kupon için minimum sepet tutarı ' || c.min_order_amount || ' ₺');
  end if;
  if c.usage_limit is not null and c.used_count >= c.usage_limit then
    return jsonb_build_object('ok', false, 'error', 'Bu kuponun kontenjanı doldu');
  end if;

  if c.audience = 'members' and not coalesce(p_logged, false) then
    return jsonb_build_object('ok', false, 'error', 'Bu kupon yalnızca üyeler için — lütfen giriş yapın');
  end if;
  if c.audience = 'specific' and (p_customer is null or not (p_customer = any (c.customer_ids))) then
    return jsonb_build_object('ok', false, 'error', 'Bu kupon size tanımlı değil');
  end if;
  if c.audience = 'new_customers' then
    select count(*) into v_n from public.orders o
     where o.status <> 'cancelled' and (p_exclude_order is null or o.id <> p_exclude_order)
       and ((p_customer is not null and o.customer_id = p_customer) or (p_phone is not null and o.customer_phone = p_phone));
    if v_n > 0 then
      return jsonb_build_object('ok', false, 'error', 'Bu kupon yalnızca ilk siparişte geçerli');
    end if;
  end if;
  if c.per_customer_limit is not null then
    select count(*) into v_n from public.coupon_redemptions r
     where r.coupon_id = c.id and ((p_customer is not null and r.customer_id = p_customer) or (p_phone is not null and r.phone = p_phone));
    if v_n >= c.per_customer_limit then
      return jsonb_build_object('ok', false, 'error', 'Bu kuponu daha önce kullandınız');
    end if;
  end if;

  if c.discount_type = 'percent' then
    v_disc := round(p_subtotal * c.discount_value / 100, 2);
    if c.max_discount is not null then v_disc := least(v_disc, c.max_discount); end if;
  elsif c.discount_type = 'fixed' then
    v_disc := least(c.discount_value, p_subtotal);
  else
    v_disc := coalesce(p_fee, 0);
  end if;
  if v_disc <= 0 then
    return jsonb_build_object('ok', false, 'error', 'Bu sepette kupon indirimi uygulanamıyor');
  end if;
  return jsonb_build_object('ok', true, 'coupon_id', c.id, 'discount', v_disc, 'title', c.title, 'type', c.discount_type);
end $$;

-- ---- Kupon önizleme (müşteri sepet ekranı) ------------------------------------------
create or replace function public.validate_coupon(p_code text, p_subtotal numeric, p_phone text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_s public.business_settings%rowtype; v_fee numeric := 0; v_cust uuid;
begin
  select * into v_s from public.business_settings where id = 1;
  v_fee := v_s.delivery_fee;
  if v_s.free_delivery_threshold is not null and p_subtotal >= v_s.free_delivery_threshold then v_fee := 0; end if;
  if auth.uid() is not null then
    select id into v_cust from public.customers where user_id = auth.uid() limit 1;
  end if;
  if v_cust is null and p_phone is not null then
    select id into v_cust from public.customers where phone = p_phone order by created_at desc limit 1;
  end if;
  return public._coupon_check(p_code, coalesce(p_subtotal, 0), v_fee, v_cust, p_phone, auth.uid() is not null, null);
end $$;

-- ---- Kuponlu / puanlı sipariş (place_order'ı sarar; hata olursa sipariş de geri alınır) -----
create or replace function public.place_order_with_coupon(
  p_customer jsonb, p_items jsonb,
  p_payment public.payment_method default null, p_note text default null,
  p_table_token text default null, p_save_address boolean default false,
  p_coupon text default null, p_use_points int default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_res jsonb; v_o public.orders%rowtype; v_s public.business_settings%rowtype;
  v_chk jsonb; v_disc numeric(10,2) := 0; v_pdisc numeric(10,2) := 0; v_pts int := 0; v_bal int; v_total numeric(10,2);
  v_has_coupon boolean := nullif(trim(coalesce(p_coupon, '')), '') is not null;
begin
  v_res := public.place_order(p_customer, p_items, p_payment, p_note, p_table_token, p_save_address);
  if not v_has_coupon and coalesce(p_use_points, 0) <= 0 then return v_res; end if;

  select * into v_o from public.orders where id = (v_res->>'order_id')::uuid for update;
  if v_o.order_type = 'dine_in' then return v_res; end if;   -- masa siparişlerinde kupon/puan yok
  select * into v_s from public.business_settings where id = 1;

  if v_has_coupon then
    v_chk := public._coupon_check(p_coupon, v_o.subtotal, v_o.delivery_fee, v_o.customer_id, v_o.customer_phone,
                                  auth.uid() is not null, v_o.id);
    if not (v_chk->>'ok')::boolean then
      raise exception '%', v_chk->>'error' using errcode = 'P0001';
    end if;
    v_disc := (v_chk->>'discount')::numeric;
  end if;

  if coalesce(p_use_points, 0) > 0 then
    if not v_s.loyalty_enabled then raise exception 'Puan sistemi şu an kapalı' using errcode = 'P0001'; end if;
    if auth.uid() is null or v_o.customer_id is null then
      raise exception 'Puan kullanmak için giriş yapmalısınız' using errcode = 'P0001';
    end if;
    select loyalty_points into v_bal from public.customers where id = v_o.customer_id for update;
    v_pts := least(p_use_points, coalesce(v_bal, 0));
    if v_pts < v_s.loyalty_min_redeem then
      raise exception 'En az % puan kullanabilirsiniz (bakiyeniz: %)', v_s.loyalty_min_redeem, coalesce(v_bal, 0) using errcode = 'P0001';
    end if;
    v_pdisc := least(v_pts * v_s.loyalty_point_value, greatest(v_o.subtotal + v_o.delivery_fee - v_disc, 0));
    v_pts := ceil(v_pdisc / v_s.loyalty_point_value);          -- gerçekten harcanan puan
  end if;

  v_total := greatest(v_o.subtotal + v_o.delivery_fee - (v_disc + v_pdisc), 0);
  update public.orders set discount = v_disc + v_pdisc, total = v_total where id = v_o.id;

  if v_has_coupon then
    update public.coupons set used_count = used_count + 1, updated_at = now()
     where id = (v_chk->>'coupon_id')::uuid and (usage_limit is null or used_count < usage_limit);
    if not found then raise exception 'Bu kuponun kontenjanı doldu' using errcode = 'P0001'; end if;
    insert into public.coupon_redemptions (coupon_id, order_id, customer_id, phone, amount)
    values ((v_chk->>'coupon_id')::uuid, v_o.id, v_o.customer_id, v_o.customer_phone, v_disc);
  end if;
  if v_pts > 0 then
    insert into public.loyalty_ledger (customer_id, points, reason, order_id, note)
    values (v_o.customer_id, -v_pts, 'redeem', v_o.id, 'Sipariş #' || v_o.order_no || ' indirimi');
  end if;

  return v_res || jsonb_build_object('total', v_total, 'discount', v_disc + v_pdisc,
                                     'coupon_discount', v_disc, 'points_discount', v_pdisc, 'points_used', v_pts);
end $$;

-- ---- Herkese açık kampanya listesi (yalnızca güvenli alanlar) ---------------------------
create or replace function public.public_campaigns()
returns table (id uuid, code text, title text, description text, discount_type text, discount_value numeric,
               max_discount numeric, min_order_amount numeric, starts_at timestamptz, ends_at timestamptz,
               daily_start time, daily_end time, weekdays int[], audience text, remaining int)
language sql stable security definer set search_path = '' as $$
  select c.id, c.code, c.title, c.description, c.discount_type, c.discount_value, c.max_discount,
         c.min_order_amount, c.starts_at, c.ends_at, c.daily_start, c.daily_end, c.weekdays, c.audience,
         case when c.usage_limit is null then null else greatest(c.usage_limit - c.used_count, 0) end
    from public.coupons c
   where c.is_public and c.is_active and c.audience <> 'specific'
     and (c.ends_at is null or c.ends_at > now())
     and (c.starts_at is null or c.starts_at <= now() + interval '7 days')
     and (c.usage_limit is null or c.used_count < c.usage_limit)
   order by c.created_at desc
$$;

-- ---- Müşteri paneli (yönetici) --------------------------------------------------------
create or replace function public.admin_customers()
returns table (id uuid, user_id uuid, full_name text, phone text, email text, notes text, loyalty_points int,
               created_at timestamptz, order_count bigint, total_spent numeric, last_order_at timestamptz, avg_basket numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.current_app_role() is null or public.current_app_role() not in ('owner', 'sub_admin', 'operator') then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  return query
  select c.id, c.user_id, c.full_name, c.phone, c.email, c.notes, c.loyalty_points, c.created_at,
         count(o.id) filter (where o.status <> 'cancelled'),
         coalesce(sum(o.total) filter (where o.status = 'delivered'), 0),
         max(o.created_at),
         coalesce(avg(o.total) filter (where o.status = 'delivered'), 0)
    from public.customers c
    left join public.orders o on o.customer_id = c.id
   group by c.id
   order by max(o.created_at) desc nulls last, c.created_at desc;
end $$;

create or replace function public.admin_update_customer(p_customer uuid, p_name text, p_phone text, p_notes text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.current_app_role() is null or public.current_app_role() not in ('owner', 'sub_admin', 'operator') then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  update public.customers
     set full_name = coalesce(nullif(trim(p_name), ''), full_name), phone = nullif(trim(p_phone), ''),
         notes = nullif(trim(p_notes), ''), updated_at = now()
   where id = p_customer;
end $$;

create or replace function public.admin_adjust_points(p_customer uuid, p_points int, p_note text default null)
returns int language plpgsql security definer set search_path = '' as $$
declare v_bal int;
begin
  if public.current_app_role() is null or public.current_app_role() not in ('owner', 'sub_admin') then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  select loyalty_points into v_bal from public.customers where id = p_customer for update;
  if v_bal is null then raise exception 'Müşteri bulunamadı' using errcode = 'P0001'; end if;
  if v_bal + p_points < 0 then raise exception 'Bakiye eksiye düşemez (bakiye: %)', v_bal using errcode = 'P0001'; end if;
  insert into public.loyalty_ledger (customer_id, points, reason, note, created_by)
  values (p_customer, p_points, 'adjust', nullif(trim(p_note), ''), auth.uid());
  return v_bal + p_points;
end $$;

-- ---- Müşterinin kendi puanı ---------------------------------------------------------------
create or replace function public.my_loyalty()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_s public.business_settings%rowtype; v_c public.customers%rowtype;
begin
  select * into v_s from public.business_settings where id = 1;
  if auth.uid() is null then return jsonb_build_object('enabled', v_s.loyalty_enabled, 'points', 0, 'history', '[]'::jsonb); end if;
  select * into v_c from public.customers where user_id = auth.uid() limit 1;
  return jsonb_build_object(
    'enabled', v_s.loyalty_enabled, 'points', coalesce(v_c.loyalty_points, 0),
    'earn_per_lira', v_s.loyalty_earn_per_lira, 'point_value', v_s.loyalty_point_value, 'min_redeem', v_s.loyalty_min_redeem,
    'history', coalesce((select jsonb_agg(jsonb_build_object('points', l.points, 'reason', l.reason, 'note', l.note, 'at', l.created_at) order by l.created_at desc)
                           from (select * from public.loyalty_ledger where customer_id = v_c.id order by created_at desc limit 30) l), '[]'::jsonb));
end $$;

-- ---- Yetkiler -----------------------------------------------------------------------------------
revoke execute on function public.admin_customers(), public.admin_update_customer(uuid, text, text, text),
  public.admin_adjust_points(uuid, int, text), public.my_loyalty() from public, anon;
grant execute on function public.admin_customers(), public.admin_update_customer(uuid, text, text, text),
  public.admin_adjust_points(uuid, int, text), public.my_loyalty() to authenticated;
revoke execute on function public._coupon_check(text, numeric, numeric, uuid, text, boolean, uuid) from public, anon, authenticated;
grant execute on function public.validate_coupon(text, numeric, text), public.public_campaigns() to anon, authenticated;
grant execute on function public.place_order_with_coupon(jsonb, jsonb, public.payment_method, text, text, boolean, text, int) to anon, authenticated;

-- ---- İşlem geçmişi (audit) tetikleyicileri ----------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['coupons', 'loyalty_ledger']
  loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I
                    for each row execute function public.log_audit()', t);
  end loop;
end $$;


-- ===== 16_menu_extras_backup_audit.sql =====
-- =====================================================================
-- YAZIR PİLAVCISI · 16 — ALERJEN/ROZET/SEÇENEKLER + MENÜ YEDEKLERİ + DENETİM
-- =====================================================================
-- Supabase > SQL Editor'e yapıştırıp RUN edin. Tekrar çalıştırılabilir (idempotent).
-- Gereksinim: 14_menu_gallery_pro.sql çalıştırılmış olmalı.
-- =====================================================================

-- ---- Ürüne alerjen ve rozet alanları ---------------------------------------------
alter table public.products
  add column if not exists allergens text[] not null default '{}',
  add column if not exists badges    text[] not null default '{}';

-- ---- Ürün seçenekleri (ekstra et, soğansız…) -----------------------------------
create table if not exists public.product_option_groups (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  name        text not null,
  is_required boolean not null default false,
  min_select  int not null default 0,
  max_select  int not null default 1,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists product_option_groups_product_idx on public.product_option_groups (product_id, sort_order);

create table if not exists public.product_options (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.product_option_groups(id) on delete cascade,
  name        text not null,
  price_delta numeric(10,2) not null default 0,
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists product_options_group_idx on public.product_options (group_id, sort_order);

alter table public.product_option_groups enable row level security;
alter table public.product_options enable row level security;

drop policy if exists pog_select on public.product_option_groups;
create policy pog_select on public.product_option_groups for select to anon, authenticated
  using (is_active or (select public.has_permission('menu.manage')));
drop policy if exists pog_write on public.product_option_groups;
create policy pog_write on public.product_option_groups for all to authenticated
  using ((select public.has_permission('menu.manage'))) with check ((select public.has_permission('menu.manage')));

drop policy if exists po_select on public.product_options;
create policy po_select on public.product_options for select to anon, authenticated
  using (is_active or (select public.has_permission('menu.manage')));
drop policy if exists po_write on public.product_options;
create policy po_write on public.product_options for all to authenticated
  using ((select public.has_permission('menu.manage'))) with check ((select public.has_permission('menu.manage')));

grant select on public.product_option_groups, public.product_options to anon, authenticated;
grant insert, update, delete on public.product_option_groups, public.product_options to authenticated;

-- ---- Galeri tablosu (14 çalıştırılmadıysa en az bu kadar var olsun) ---------------
create table if not exists public.restaurant_gallery (
  id uuid primary key default gen_random_uuid(),
  title text not null default '', image_path text not null,
  sort_order int not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---- Menü yedekleri ---------------------------------------------------------------------
create table if not exists public.menu_backups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  note       text,
  is_auto    boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  counts     jsonb not null default '{}'::jsonb,
  snapshot   jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists menu_backups_created_idx on public.menu_backups (created_at desc);
alter table public.menu_backups enable row level security;

drop policy if exists menu_backups_select on public.menu_backups;
create policy menu_backups_select on public.menu_backups for select to authenticated
  using ((select public.has_permission('menu.manage')));
drop policy if exists menu_backups_delete on public.menu_backups;
create policy menu_backups_delete on public.menu_backups for delete to authenticated
  using ((select public.has_permission('menu.manage')));

revoke all on public.menu_backups from anon;
revoke insert, update on public.menu_backups from authenticated;
grant select, delete on public.menu_backups to authenticated;

create or replace function public._create_menu_backup_internal(p_name text, p_note text, p_auto boolean, p_uid uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_snap jsonb;
begin
  v_snap := jsonb_build_object(
    'version', 1, 'taken_at', now(),
    'categories',            coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order) from public.categories x), '[]'::jsonb),
    'products',              coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order) from public.products x), '[]'::jsonb),
    'product_variants',      coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order) from public.product_variants x), '[]'::jsonb),
    'product_option_groups', coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order) from public.product_option_groups x), '[]'::jsonb),
    'product_options',       coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order) from public.product_options x), '[]'::jsonb),
    'restaurant_gallery',    coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order) from public.restaurant_gallery x), '[]'::jsonb)
  );
  insert into public.menu_backups (name, note, is_auto, created_by, counts, snapshot)
  values (
    coalesce(nullif(trim(p_name), ''), 'Yedek ' || to_char(now() at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI')),
    nullif(trim(p_note), ''), p_auto, p_uid,
    jsonb_build_object(
      'categories', jsonb_array_length(v_snap->'categories'), 'products', jsonb_array_length(v_snap->'products'),
      'variants', jsonb_array_length(v_snap->'product_variants'), 'options', jsonb_array_length(v_snap->'product_options'),
      'gallery', jsonb_array_length(v_snap->'restaurant_gallery')),
    v_snap)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.create_menu_backup(p_name text default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_permission('menu.manage');
  return public._create_menu_backup_internal(p_name, p_note, false, auth.uid());
end $$;

create or replace function public._restore_table(p_table text, p_rows jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_cols text; v_set text;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then return; end if;
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position),
         string_agg(quote_ident(column_name) || ' = excluded.' || quote_ident(column_name), ', ' order by ordinal_position)
           filter (where column_name <> 'id')
    into v_cols, v_set
    from information_schema.columns
   where table_schema = 'public' and table_name = p_table and is_generated = 'NEVER';
  execute format('insert into public.%1$I (%2$s) select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) on conflict (id) do update set %3$s',
                 p_table, v_cols, v_set) using p_rows;
end $$;

create or replace function public.restore_menu_backup(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_snap jsonb; v_name text; v_safety uuid;
begin
  perform public._require_permission('menu.manage');
  select snapshot, name into v_snap, v_name from public.menu_backups where id = p_id;
  if v_snap is null then raise exception 'Yedek bulunamadı' using errcode = 'P0001'; end if;

  -- Geri alınabilsin diye önce mevcut hali otomatik yedeklenir
  v_safety := public._create_menu_backup_internal('Geri yüklemeden önce (otomatik)', 'Geri yüklenen yedek: ' || v_name, true, auth.uid());

  perform set_config('app.skip_audit', '1', true);
  perform public._restore_table('categories',            v_snap->'categories');
  perform public._restore_table('products',              v_snap->'products');
  perform public._restore_table('product_variants',      v_snap->'product_variants');
  perform public._restore_table('product_option_groups', v_snap->'product_option_groups');
  perform public._restore_table('product_options',       v_snap->'product_options');
  perform public._restore_table('restaurant_gallery',    v_snap->'restaurant_gallery');

  -- Yedekte olmayan kayıtları sil (çocuk tablolardan başla)
  delete from public.product_options where id not in (select (x->>'id')::uuid from jsonb_array_elements(coalesce(v_snap->'product_options', '[]'::jsonb)) x);
  delete from public.product_option_groups where id not in (select (x->>'id')::uuid from jsonb_array_elements(coalesce(v_snap->'product_option_groups', '[]'::jsonb)) x);
  delete from public.product_variants where id not in (select (x->>'id')::uuid from jsonb_array_elements(coalesce(v_snap->'product_variants', '[]'::jsonb)) x);
  delete from public.products where id not in (select (x->>'id')::uuid from jsonb_array_elements(coalesce(v_snap->'products', '[]'::jsonb)) x);
  delete from public.categories where id not in (select (x->>'id')::uuid from jsonb_array_elements(coalesce(v_snap->'categories', '[]'::jsonb)) x);
  delete from public.restaurant_gallery where id not in (select (x->>'id')::uuid from jsonb_array_elements(coalesce(v_snap->'restaurant_gallery', '[]'::jsonb)) x);
  perform set_config('app.skip_audit', '0', true);

  insert into public.audit_logs (table_name, record_id, action, new_data, reason, actor_id, actor_role)
  values ('menu_backups', p_id::text, 'MENU_RESTORE', jsonb_build_object('backup', v_name, 'safety_backup', v_safety),
          'Menü yedekten geri yüklendi', auth.uid(), public.current_app_role());

  return jsonb_build_object('restored', v_name, 'safety_backup', v_safety);
end $$;

revoke execute on function public._create_menu_backup_internal(text, text, boolean, uuid), public._restore_table(text, jsonb) from public, anon, authenticated;
revoke execute on function public.create_menu_backup(text, text), public.restore_menu_backup(uuid) from public, anon;
grant execute on function public.create_menu_backup(text, text), public.restore_menu_backup(uuid) to authenticated;

-- ---- Günlük otomatik yedek (pg_cron varsa): her gün 03:30 İstanbul = 00:30 UTC, son 30 otomatik yedek saklanır ----
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'menu-daily-backup';
    perform cron.schedule('menu-daily-backup', '30 0 * * *', $job$
      select public._create_menu_backup_internal(null, 'Otomatik günlük yedek', true, null);
      delete from public.menu_backups where is_auto and name like 'Yedek %'
        and id not in (select id from public.menu_backups where is_auto and name like 'Yedek %' order by created_at desc limit 30);
    $job$);
  end if;
exception when others then
  raise notice 'pg_cron zamanlaması kurulamadı: %', sqlerrm;
end $$;

-- ---- İşlem geçmişi: yeni tabloları da izle -----------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['restaurant_gallery', 'opening_hours_overrides', 'product_option_groups', 'product_options']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
      execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I
                      for each row execute function public.log_audit()', t);
    end if;
  end loop;
end $$;


-- =====================================================================
-- 20 · KURYE & MÜŞTERİ ANALİZ ALTYAPISI
-- Supabase SQL Editor'de TEK SEFER çalıştırın (tekrar çalıştırmak güvenlidir).
-- 10_courier_live_tracking.sql ve 15_coupons_loyalty.sql'den SONRA çalıştırın.
--
-- İçerik
--  1) courier_online_sessions : kuryenin ne zaman çevrimiçi/çevrimdışı olduğu (çalışma süresi)
--  2) courier_points_ledger   : kurye PRİM / PUAN defteri (ileride otomatik prim kuralları buraya yazar)
--  3) report_courier_overview : tüm kuryelerin karşılaştırmalı performansı
--  4) report_courier_detail   : tek kuryenin tüm detayı (saat/gün dağılımı, süreler, bölgeler, son teslimatlar)
--  5) report_customer_overview: müşteri tabanı analizi (yeni/tekrar eden, segmentler, saatler, ürünler...)
--  6) report_customer_detail  : tek müşterinin davranış profili
--  7) admin_courier_points    : kurye puan / prim ekleme-düşme
--
-- Saat dilimi: Europe/Istanbul. Teslimat verisi mevcut courier_deliveries tablosundan okunur;
-- yani bu dosyadan ÖNCE yapılmış teslimatlar da analizde görünür.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Yardımcı indeksler
-- ---------------------------------------------------------------------
create index if not exists orders_customer_created_idx
  on public.orders (customer_id, created_at desc) where customer_id is not null;
create index if not exists courier_deliveries_delivered_idx
  on public.courier_deliveries (delivered_at) where outcome = 'delivered';

-- ---------------------------------------------------------------------
-- 1) Kurye çevrimiçi oturumları
-- ---------------------------------------------------------------------
create table if not exists public.courier_online_sessions (
  id          bigint generated always as identity primary key,
  courier_id  uuid not null references public.profiles(id) on delete cascade,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz
);
create unique index if not exists courier_online_sessions_one_open
  on public.courier_online_sessions (courier_id) where ended_at is null;
create index if not exists courier_online_sessions_courier_idx
  on public.courier_online_sessions (courier_id, started_at desc);

alter table public.courier_online_sessions enable row level security;
drop policy if exists courier_online_sessions_select on public.courier_online_sessions;
create policy courier_online_sessions_select on public.courier_online_sessions for select to authenticated
  using (courier_id = (select auth.uid())
         or (select public.has_permission('couriers.view'))
         or (select public.has_permission('reports.view')));
grant select on public.courier_online_sessions to authenticated;

-- Şu an çevrimiçi görünen kuryeler için açık oturum aç (geçmişe dönük başlangıç = şimdi)
insert into public.courier_online_sessions (courier_id)
select cp.user_id from public.courier_profiles cp
 where cp.is_online
   and not exists (select 1 from public.courier_online_sessions s where s.courier_id = cp.user_id and s.ended_at is null);

-- set_courier_online: oturum aç/kapat (önceki davranış korunur)
create or replace function public.set_courier_online(p_online boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.current_app_role() is distinct from 'courier' then
    raise exception 'Yalnızca kuryeler kullanabilir' using errcode = '42501';
  end if;
  update public.courier_profiles set is_online = p_online where user_id = auth.uid();

  if p_online then
    insert into public.courier_online_sessions (courier_id)
    select auth.uid()
     where not exists (select 1 from public.courier_online_sessions s
                        where s.courier_id = auth.uid() and s.ended_at is null)
    on conflict do nothing;
  else
    update public.courier_online_sessions set ended_at = now()
     where courier_id = auth.uid() and ended_at is null;
    delete from public.courier_locations where courier_id = auth.uid();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2) Kurye prim / puan defteri
--    points: + kazanım, − düşüm   ·   amount: ₺ prim tutarı (ödenen prim için negatif yazılabilir)
-- ---------------------------------------------------------------------
create table if not exists public.courier_points_ledger (
  id          bigint generated always as identity primary key,
  courier_id  uuid not null references public.profiles(id) on delete cascade,
  kind        text not null default 'adjust' check (kind in ('delivery', 'bonus', 'penalty', 'adjust', 'payout')),
  points      int not null default 0,
  amount      numeric(10,2) not null default 0,
  order_id    uuid references public.orders(id) on delete set null,
  note        text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists courier_points_ledger_courier_idx
  on public.courier_points_ledger (courier_id, created_at desc);

alter table public.courier_points_ledger enable row level security;
drop policy if exists courier_points_ledger_select on public.courier_points_ledger;
create policy courier_points_ledger_select on public.courier_points_ledger for select to authenticated
  using (courier_id = (select auth.uid())
         or (select public.has_permission('couriers.view'))
         or (select public.has_permission('reports.view')));
grant select on public.courier_points_ledger to authenticated;

-- ---------------------------------------------------------------------
-- Yardımcılar
-- ---------------------------------------------------------------------
create or replace function public._require_any_permission(p_keys text[])
returns void language plpgsql stable security definer set search_path = '' as $$
declare k text;
begin
  if auth.uid() is null then
    raise exception 'Oturum gerekli' using errcode = '42501';
  end if;
  foreach k in array p_keys loop
    if public.user_has_permission(auth.uid(), k) then return; end if;
  end loop;
  raise exception 'Bu işlem için yetkiniz yok' using errcode = '42501';
end $$;

-- Kuryenin aralıktaki çevrimiçi süresi (dakika). Açık oturum, son konumdan 5 dk sonrasına kadar sayılır
-- (kurye uygulamayı kapatıp çıkış yapmadıysa süre şişmesin).
create or replace function public._courier_online_minutes(p_courier uuid, p_from timestamptz, p_to timestamptz)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(greatest(0, extract(epoch from (
           least(
             coalesce(s.ended_at, greatest(s.started_at, least(now(), coalesce(l.updated_at + interval '5 minutes', now())))),
             p_to)
           - greatest(s.started_at, p_from)))) / 60.0), 0)::numeric
    from public.courier_online_sessions s
    left join public.courier_locations l on l.courier_id = s.courier_id
   where s.courier_id = p_courier
     and s.started_at < p_to
     and coalesce(s.ended_at, now()) > p_from;
$$;

-- ---------------------------------------------------------------------
-- 3) Tüm kuryelerin karşılaştırmalı performansı
--    p_sla_min: "zamanında teslim" eşiği (yola çıkış → teslim, dakika)
-- ---------------------------------------------------------------------
create or replace function public.report_courier_overview(p_from timestamptz, p_to timestamptz, p_sla_min int default 30)
returns table (
  courier_id uuid, courier_name text, phone text, vehicle_type text, plate text,
  is_active boolean, is_online boolean,
  delivery_count bigint, revenue_carried numeric, cash_collected numeric,
  avg_total_min numeric, avg_delivery_min numeric, avg_pickup_wait_min numeric,
  total_delivery_min numeric, fastest_min numeric, slowest_min numeric, on_time_pct numeric,
  reassigned_count bigint, cancelled_count bigint,
  online_minutes numeric, active_days bigint, peak_hour int,
  points_balance bigint, bonus_amount numeric, last_delivery_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._require_any_permission(array['reports.view', 'couriers.view']);
  return query
  with d as (
    select cd.courier_id as cid, cd.delivered_at, cd.total_seconds, cd.delivery_seconds,
           extract(epoch from (cd.picked_up_at - cd.assigned_at))::numeric as wait_s,
           o.total, o.payment_method,
           extract(hour from cd.delivered_at at time zone 'Europe/Istanbul')::int as h,
           (cd.delivered_at at time zone 'Europe/Istanbul')::date as dday
      from public.courier_deliveries cd
      join public.orders o on o.id = cd.order_id
     where cd.outcome = 'delivered' and cd.delivered_at >= p_from and cd.delivered_at < p_to
  ),
  agg as (
    select d.cid,
           count(*) as cnt,
           sum(d.total) as rev,
           sum(d.total) filter (where d.payment_method in ('cash_on_delivery', 'card_on_delivery')) as cash,
           avg(d.total_seconds) / 60.0 as avg_total,
           avg(d.delivery_seconds) / 60.0 as avg_del,
           avg(d.wait_s) / 60.0 as avg_wait,
           sum(d.delivery_seconds) / 60.0 as tot_del,
           min(d.delivery_seconds) / 60.0 as fast,
           max(d.delivery_seconds) / 60.0 as slow,
           100.0 * count(*) filter (where d.delivery_seconds is not null and d.delivery_seconds <= p_sla_min * 60)
             / nullif(count(*) filter (where d.delivery_seconds is not null), 0) as ontime,
           count(distinct d.dday) as days,
           max(d.delivered_at) as last_at
      from d group by d.cid
  ),
  hr as (select d.cid, d.h, count(*) as c from d group by d.cid, d.h),
  peak as (select distinct on (hr.cid) hr.cid, hr.h from hr order by hr.cid, hr.c desc, hr.h),
  rs as (
    select cd.courier_id as cid,
           count(*) filter (where cd.outcome = 'reassigned') as reassigned,
           count(*) filter (where cd.outcome = 'cancelled') as cancelled
      from public.courier_deliveries cd
     where coalesce(cd.ended_at, cd.assigned_at) >= p_from and coalesce(cd.ended_at, cd.assigned_at) < p_to
     group by cd.courier_id
  ),
  pts as (
    select l.courier_id as cid, sum(l.points) as bal, sum(l.amount) as amt
      from public.courier_points_ledger l group by l.courier_id
  )
  select p.id, p.full_name, p.phone, cp.vehicle_type, cp.plate, p.is_active, cp.is_online,
         coalesce(a.cnt, 0),
         coalesce(a.rev, 0)::numeric,
         coalesce(a.cash, 0)::numeric,
         round(a.avg_total::numeric, 1),
         round(a.avg_del::numeric, 1),
         round(a.avg_wait::numeric, 1),
         round(coalesce(a.tot_del, 0)::numeric, 1),
         round(a.fast::numeric, 1),
         round(a.slow::numeric, 1),
         round(a.ontime::numeric, 1),
         coalesce(r.reassigned, 0),
         coalesce(r.cancelled, 0),
         round(public._courier_online_minutes(p.id, p_from, p_to), 0),
         coalesce(a.days, 0),
         pk.h,
         coalesce(t.bal, 0)::bigint,
         coalesce(t.amt, 0)::numeric,
         a.last_at
    from public.profiles p
    join public.courier_profiles cp on cp.user_id = p.id
    left join agg a on a.cid = p.id
    left join peak pk on pk.cid = p.id
    left join rs r on r.cid = p.id
    left join pts t on t.cid = p.id
   where p.role = 'courier'
   order by coalesce(a.cnt, 0) desc, p.full_name;
end $$;

-- ---------------------------------------------------------------------
-- 4) Tek kuryenin tüm detayı (kurye kendi verisini de görebilir)
-- ---------------------------------------------------------------------
create or replace function public.report_courier_detail(p_courier uuid, p_from timestamptz, p_to timestamptz, p_sla_min int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v jsonb;
  v_online numeric;
  v_sessions bigint;
begin
  if auth.uid() is null then
    raise exception 'Oturum gerekli' using errcode = '42501';
  end if;
  if auth.uid() <> p_courier then
    perform public._require_any_permission(array['reports.view', 'couriers.view']);
  end if;

  v_online := public._courier_online_minutes(p_courier, p_from, p_to);
  select count(*) into v_sessions from public.courier_online_sessions s
   where s.courier_id = p_courier and s.started_at < p_to and coalesce(s.ended_at, now()) > p_from;

  with da as (
    select cd.courier_id as cid, cd.order_id, cd.assigned_at, cd.picked_up_at, cd.delivered_at,
           cd.total_seconds, cd.delivery_seconds,
           extract(epoch from (cd.picked_up_at - cd.assigned_at))::numeric as wait_s,
           o.order_no, o.total, o.payment_method, o.district, o.customer_name, o.delivery_address,
           extract(hour from cd.delivered_at at time zone 'Europe/Istanbul')::int as h,
           extract(isodow from cd.delivered_at at time zone 'Europe/Istanbul')::int as dow,
           (cd.delivered_at at time zone 'Europe/Istanbul')::date as dday
      from public.courier_deliveries cd
      join public.orders o on o.id = cd.order_id
     where cd.outcome = 'delivered' and cd.delivered_at >= p_from and cd.delivered_at < p_to
  ),
  d as (select * from da where da.cid = p_courier)
  select jsonb_build_object(
    'summary', (
      select jsonb_build_object(
        'delivery_count', count(*),
        'revenue', coalesce(sum(d.total), 0),
        'avg_order_value', coalesce(round(avg(d.total)::numeric, 2), 0),
        'cash_collected', coalesce(sum(d.total) filter (where d.payment_method in ('cash_on_delivery', 'card_on_delivery')), 0),
        'cash_only', coalesce(sum(d.total) filter (where d.payment_method = 'cash_on_delivery'), 0),
        'card_only', coalesce(sum(d.total) filter (where d.payment_method = 'card_on_delivery'), 0),
        'avg_total_min', round((avg(d.total_seconds) / 60.0)::numeric, 1),
        'avg_delivery_min', round((avg(d.delivery_seconds) / 60.0)::numeric, 1),
        'avg_pickup_wait_min', round((avg(d.wait_s) / 60.0)::numeric, 1),
        'total_delivery_min', round((coalesce(sum(d.delivery_seconds), 0) / 60.0)::numeric, 1),
        'fastest_min', round((min(d.delivery_seconds) / 60.0)::numeric, 1),
        'slowest_min', round((max(d.delivery_seconds) / 60.0)::numeric, 1),
        'on_time_pct', round((100.0 * count(*) filter (where d.delivery_seconds is not null and d.delivery_seconds <= p_sla_min * 60)
                              / nullif(count(*) filter (where d.delivery_seconds is not null), 0))::numeric, 1),
        'active_days', count(distinct d.dday),
        'first_delivery_at', min(d.delivered_at),
        'last_delivery_at', max(d.delivered_at),
        'online_minutes', round(v_online, 0),
        'session_count', v_sessions,
        'rank', (select count(*) + 1 from (select da.cid from da group by da.cid
                                            having count(*) > (select count(*) from d)) r),
        'ranked_couriers', (select count(distinct da.cid) from da),
        'reassigned_count', (select count(*) from public.courier_deliveries x
                              where x.courier_id = p_courier and x.outcome = 'reassigned'
                                and coalesce(x.ended_at, x.assigned_at) >= p_from and coalesce(x.ended_at, x.assigned_at) < p_to),
        'cancelled_count', (select count(*) from public.courier_deliveries x
                             where x.courier_id = p_courier and x.outcome = 'cancelled'
                               and coalesce(x.ended_at, x.assigned_at) >= p_from and coalesce(x.ended_at, x.assigned_at) < p_to),
        'points_balance', (select coalesce(sum(l.points), 0) from public.courier_points_ledger l where l.courier_id = p_courier),
        'bonus_amount', (select coalesce(sum(l.amount), 0) from public.courier_points_ledger l where l.courier_id = p_courier)
      ) from d),
    'hourly', coalesce((
      select jsonb_agg(jsonb_build_object('hour', g.h, 'count', coalesce(x.c, 0), 'avg_min', x.am) order by g.h)
        from generate_series(0, 23) g(h)
        left join (select d.h, count(*) as c, round((avg(d.delivery_seconds) / 60.0)::numeric, 1) as am from d group by d.h) x on x.h = g.h
    ), '[]'::jsonb),
    'weekday', coalesce((
      select jsonb_agg(jsonb_build_object('dow', g.w, 'count', coalesce(x.c, 0), 'avg_min', x.am) order by g.w)
        from generate_series(1, 7) g(w)
        left join (select d.dow, count(*) as c, round((avg(d.delivery_seconds) / 60.0)::numeric, 1) as am from d group by d.dow) x on x.dow = g.w
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', x.dday, 'count', x.c, 'revenue', x.rev, 'avg_min', x.am) order by x.dday)
        from (select d.dday, count(*) as c, sum(d.total) as rev, round((avg(d.delivery_seconds) / 60.0)::numeric, 1) as am
                from d group by d.dday) x
    ), '[]'::jsonb),
    'districts', coalesce((
      select jsonb_agg(jsonb_build_object('district', x.dn, 'count', x.c, 'avg_min', x.am) order by x.c desc, x.dn)
        from (select coalesce(nullif(d.district, ''), 'Belirtilmemiş') as dn, count(*) as c,
                     round((avg(d.delivery_seconds) / 60.0)::numeric, 1) as am
                from d group by 1 order by count(*) desc limit 8) x
    ), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
               'order_id', x.order_id, 'order_no', x.order_no, 'customer_name', x.customer_name,
               'district', x.district, 'address', x.delivery_address, 'total', x.total,
               'payment_method', x.payment_method, 'assigned_at', x.assigned_at,
               'picked_up_at', x.picked_up_at, 'delivered_at', x.delivered_at,
               'delivery_min', round((x.delivery_seconds / 60.0)::numeric, 1),
               'total_min', round((x.total_seconds / 60.0)::numeric, 1)) order by x.delivered_at desc)
        from (select * from d order by d.delivered_at desc limit 30) x
    ), '[]'::jsonb),
    'points', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'points', x.points, 'amount', x.amount,
                                          'note', x.note, 'created_at', x.created_at) order by x.created_at desc)
        from (select * from public.courier_points_ledger l where l.courier_id = p_courier
               order by l.created_at desc limit 20) x
    ), '[]'::jsonb)
  ) into v;

  return v;
end $$;

-- ---------------------------------------------------------------------
-- 5) Müşteri tabanı analizi (personel)
-- ---------------------------------------------------------------------
create or replace function public.report_customer_overview(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v jsonb;
begin
  if public.current_app_role() is null or public.current_app_role() not in ('owner', 'sub_admin', 'operator') then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;

  with ob as (   -- aralıktaki iptal olmayan siparişler
    select o.id, o.customer_id, o.total, o.status, o.order_type, o.source, o.payment_method, o.district,
           o.created_at, o.delivered_at,
           extract(hour from o.created_at at time zone 'Europe/Istanbul')::int as h,
           extract(isodow from o.created_at at time zone 'Europe/Istanbul')::int as dow,
           (o.created_at at time zone 'Europe/Istanbul')::date as dday
      from public.orders o
     where o.created_at >= p_from and o.created_at < p_to and o.status <> 'cancelled'
  ),
  cs as (        -- müşteri başına tüm zamanlar
    select o.customer_id as cid,
           count(*) filter (where o.status <> 'cancelled') as n,
           coalesce(sum(o.total) filter (where o.status = 'delivered'), 0) as spent,
           min(o.created_at) filter (where o.status <> 'cancelled') as first_at,
           max(o.created_at) filter (where o.status <> 'cancelled') as last_at
      from public.orders o
     where o.customer_id is not null
     group by o.customer_id
  ),
  gaps as (      -- iki sipariş arası gün
    select x.created_at, extract(epoch from (x.created_at - x.prev)) / 86400.0 as gap_days
      from (select o.created_at, lag(o.created_at) over (partition by o.customer_id order by o.created_at) as prev
              from public.orders o where o.customer_id is not null and o.status <> 'cancelled') x
     where x.prev is not null and x.created_at >= p_from and x.created_at < p_to
  ),
  act as (select distinct ob.customer_id as cid from ob where ob.customer_id is not null)
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'total_customers', (select count(*) from public.customers),
      'new_customers', (select count(*) from public.customers c where c.created_at >= p_from and c.created_at < p_to),
      'members', (select count(*) from public.customers c where c.user_id is not null),
      'active_customers', (select count(*) from act),
      'returning_customers', (select count(*) from act a join cs on cs.cid = a.cid where cs.first_at < p_from),
      'first_time_buyers', (select count(*) from act a join cs on cs.cid = a.cid where cs.first_at >= p_from),
      'repeat_rate', (select round((100.0 * count(*) filter (where cs.n >= 2) / nullif(count(*) filter (where cs.n >= 1), 0))::numeric, 1) from cs),
      'order_count', (select count(*) from ob),
      'guest_orders', (select count(*) from ob where ob.customer_id is null),
      'revenue', (select coalesce(sum(ob.total), 0) from ob),
      'member_revenue', (select coalesce(sum(ob.total), 0) from ob where ob.customer_id is not null),
      'avg_basket', (select coalesce(round(avg(ob.total)::numeric, 2), 0) from ob),
      'avg_orders_per_active', (select coalesce(round((count(*)::numeric / nullif((select count(*) from act), 0)), 2), 0)
                                  from ob where ob.customer_id is not null),
      'avg_days_between_orders', (select round(avg(g.gap_days)::numeric, 1) from gaps g),
      'avg_lifetime_value', (select coalesce(round(avg(cs.spent)::numeric, 2), 0) from cs where cs.n >= 1),
      'cancelled_orders', (select count(*) from public.orders o where o.created_at >= p_from and o.created_at < p_to and o.status = 'cancelled'),
      'avg_wait_min', (select round((avg(extract(epoch from (ob.delivered_at - ob.created_at))) / 60.0)::numeric, 1)
                         from ob where ob.status = 'delivered' and ob.delivered_at is not null),
      'points_outstanding', (select coalesce(sum(c.loyalty_points), 0) from public.customers c)
    ),
    'segments', jsonb_build_object(
      'vip', (select count(*) from cs where cs.spent >= 1500 or cs.n >= 10),
      'loyal', (select count(*) from cs where cs.n >= 5 and not (cs.spent >= 1500 or cs.n >= 10)),
      'regular', (select count(*) from cs where cs.n between 2 and 4 and not (cs.spent >= 1500)),
      'one_time', (select count(*) from cs where cs.n = 1 and not (cs.spent >= 1500)),
      'never_ordered', (select count(*) from public.customers c where not exists (select 1 from cs where cs.cid = c.id and cs.n >= 1)),
      'sleeping', (select count(*) from cs where cs.n >= 1 and cs.last_at < now() - interval '45 days'),
      'new_14d', (select count(*) from public.customers c where c.created_at > now() - interval '14 days')
    ),
    'hourly', coalesce((
      select jsonb_agg(jsonb_build_object('hour', g.h, 'count', coalesce(x.c, 0), 'revenue', coalesce(x.rev, 0)) order by g.h)
        from generate_series(0, 23) g(h)
        left join (select ob.h, count(*) as c, sum(ob.total) as rev from ob group by ob.h) x on x.h = g.h
    ), '[]'::jsonb),
    'weekday', coalesce((
      select jsonb_agg(jsonb_build_object('dow', g.w, 'count', coalesce(x.c, 0), 'revenue', coalesce(x.rev, 0)) order by g.w)
        from generate_series(1, 7) g(w)
        left join (select ob.dow, count(*) as c, sum(ob.total) as rev from ob group by ob.dow) x on x.dow = g.w
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', x.dday, 'count', x.c, 'revenue', x.rev, 'customers', x.cu) order by x.dday)
        from (select ob.dday, count(*) as c, sum(ob.total) as rev, count(distinct ob.customer_id) as cu from ob group by ob.dday) x
    ), '[]'::jsonb),
    'districts', coalesce((
      select jsonb_agg(jsonb_build_object('district', x.dn, 'count', x.c, 'revenue', x.rev) order by x.c desc, x.dn)
        from (select coalesce(nullif(ob.district, ''), 'Belirtilmemiş') as dn, count(*) as c, sum(ob.total) as rev
                from ob where ob.order_type = 'delivery' group by 1 order by count(*) desc limit 10) x
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('method', x.pm, 'count', x.c, 'revenue', x.rev) order by x.c desc)
        from (select coalesce(ob.payment_method::text, 'unknown') as pm, count(*) as c, sum(ob.total) as rev from ob group by 1) x
    ), '[]'::jsonb),
    'order_types', coalesce((
      select jsonb_agg(jsonb_build_object('type', x.t, 'count', x.c, 'revenue', x.rev) order by x.c desc)
        from (select ob.order_type::text as t, count(*) as c, sum(ob.total) as rev from ob group by 1) x
    ), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('source', x.s, 'count', x.c, 'revenue', x.rev) order by x.c desc)
        from (select ob.source as s, count(*) as c, sum(ob.total) as rev from ob group by 1) x
    ), '[]'::jsonb),
    'top_products', coalesce((
      select jsonb_agg(jsonb_build_object('name', x.pn, 'qty', x.q, 'revenue', x.rev) order by x.q desc)
        from (select oi.product_name as pn, sum(oi.quantity) as q, sum(oi.line_total) as rev
                from public.order_items oi join ob on ob.id = oi.order_id
               group by oi.product_name order by sum(oi.quantity) desc limit 10) x
    ), '[]'::jsonb),
    'top_customers', coalesce((
      select jsonb_agg(jsonb_build_object('customer_id', x.cid, 'name', x.fn, 'phone', x.ph, 'orders', x.n, 'spent', x.sp) order by x.sp desc)
        from (select c.id as cid, c.full_name as fn, c.phone as ph, count(*) as n, sum(ob.total) as sp
                from ob join public.customers c on c.id = ob.customer_id
               group by c.id, c.full_name, c.phone order by sum(ob.total) desc limit 10) x
    ), '[]'::jsonb)
  ) into v;

  return v;
end $$;

-- ---------------------------------------------------------------------
-- 6) Tek müşterinin davranış profili (personel)
-- ---------------------------------------------------------------------
create or replace function public.report_customer_detail(p_customer uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v jsonb;
begin
  if public.current_app_role() is null or public.current_app_role() not in ('owner', 'sub_admin', 'operator') then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;

  with ao as (   -- müşterinin tüm siparişleri
    select o.id, o.order_no, o.status, o.order_type, o.total, o.payment_method, o.district, o.courier_id,
           o.created_at, o.delivered_at,
           extract(hour from o.created_at at time zone 'Europe/Istanbul')::int as h,
           extract(isodow from o.created_at at time zone 'Europe/Istanbul')::int as dow
      from public.orders o where o.customer_id = p_customer
  ),
  ok as (select * from ao where ao.status <> 'cancelled'),
  gaps as (
    select extract(epoch from (x.created_at - x.prev)) / 86400.0 as gap_days
      from (select ok.created_at, lag(ok.created_at) over (order by ok.created_at) as prev from ok) x
     where x.prev is not null
  )
  select jsonb_build_object(
    'summary', (
      select jsonb_build_object(
        'order_count', count(*),
        'delivered_count', count(*) filter (where ok.status = 'delivered'),
        'cancelled_count', (select count(*) from ao where ao.status = 'cancelled'),
        'total_spent', coalesce(sum(ok.total) filter (where ok.status = 'delivered'), 0),
        'avg_basket', coalesce(round(avg(ok.total)::numeric, 2), 0),
        'max_basket', coalesce(max(ok.total), 0),
        'first_order_at', min(ok.created_at),
        'last_order_at', max(ok.created_at),
        'days_since_last', case when max(ok.created_at) is null then null
                                else floor(extract(epoch from (now() - max(ok.created_at))) / 86400.0) end,
        'avg_interval_days', (select round(avg(g.gap_days)::numeric, 1) from gaps g),
        'avg_wait_min', round((avg(extract(epoch from (ok.delivered_at - ok.created_at))) filter (where ok.status = 'delivered' and ok.delivered_at is not null) / 60.0)::numeric, 1),
        'delivery_orders', count(*) filter (where ok.order_type = 'delivery'),
        'pickup_orders', count(*) filter (where ok.order_type = 'pickup'),
        'dine_in_orders', count(*) filter (where ok.order_type = 'dine_in')
      ) from ok),
    'hourly', coalesce((
      select jsonb_agg(jsonb_build_object('hour', g.h, 'count', coalesce(x.c, 0)) order by g.h)
        from generate_series(0, 23) g(h)
        left join (select ok.h, count(*) as c from ok group by ok.h) x on x.h = g.h
    ), '[]'::jsonb),
    'weekday', coalesce((
      select jsonb_agg(jsonb_build_object('dow', g.w, 'count', coalesce(x.c, 0)) order by g.w)
        from generate_series(1, 7) g(w)
        left join (select ok.dow, count(*) as c from ok group by ok.dow) x on x.dow = g.w
    ), '[]'::jsonb),
    'monthly', coalesce((
      select jsonb_agg(jsonb_build_object('month', to_char(g.m, 'YYYY-MM'), 'count', coalesce(x.c, 0), 'spent', coalesce(x.sp, 0)) order by g.m)
        from generate_series(date_trunc('month', (now() at time zone 'Europe/Istanbul')) - interval '11 months',
                             date_trunc('month', (now() at time zone 'Europe/Istanbul')), interval '1 month') g(m)
        left join (select date_trunc('month', ok.created_at at time zone 'Europe/Istanbul') as m, count(*) as c, sum(ok.total) as sp
                     from ok group by 1) x on x.m = g.m
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('method', x.pm, 'count', x.c) order by x.c desc)
        from (select coalesce(ok.payment_method::text, 'unknown') as pm, count(*) as c from ok group by 1) x
    ), '[]'::jsonb),
    'districts', coalesce((
      select jsonb_agg(jsonb_build_object('district', x.dn, 'count', x.c) order by x.c desc, x.dn)
        from (select coalesce(nullif(ok.district, ''), 'Belirtilmemiş') as dn, count(*) as c
                from ok where ok.order_type = 'delivery' group by 1 order by count(*) desc limit 5) x
    ), '[]'::jsonb),
    'favorite_products', coalesce((
      select jsonb_agg(jsonb_build_object('name', x.pn, 'qty', x.q, 'orders', x.n, 'spent', x.sp) order by x.q desc)
        from (select oi.product_name as pn, sum(oi.quantity) as q, count(distinct oi.order_id) as n, sum(oi.line_total) as sp
                from public.order_items oi join ok on ok.id = oi.order_id
               group by oi.product_name order by sum(oi.quantity) desc limit 8) x
    ), '[]'::jsonb),
    'couriers', coalesce((
      select jsonb_agg(jsonb_build_object('courier_id', x.cid, 'name', x.fn, 'count', x.c) order by x.c desc)
        from (select ok.courier_id as cid, p.full_name as fn, count(*) as c
                from ok join public.profiles p on p.id = ok.courier_id
               where ok.status = 'delivered' group by ok.courier_id, p.full_name order by count(*) desc limit 5) x
    ), '[]'::jsonb)
  ) into v;

  return v;
end $$;

-- ---------------------------------------------------------------------
-- 7) Kurye puan / prim ekle-düş (yalnızca sahip ve yardımcı yönetici)
-- ---------------------------------------------------------------------
create or replace function public.admin_courier_points(
  p_courier uuid, p_points int, p_amount numeric default 0, p_kind text default 'adjust', p_note text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_bal bigint;
begin
  if public.current_app_role() is null or public.current_app_role() not in ('owner', 'sub_admin') then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  if p_kind not in ('bonus', 'penalty', 'adjust', 'payout') then
    raise exception 'Geçersiz tür' using errcode = 'P0001';
  end if;
  if coalesce(p_points, 0) = 0 and coalesce(p_amount, 0) = 0 then
    raise exception 'Puan veya prim tutarı girin' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_courier and role = 'courier') then
    raise exception 'Kurye bulunamadı' using errcode = 'P0001';
  end if;

  insert into public.courier_points_ledger (courier_id, kind, points, amount, note, created_by)
  values (p_courier, p_kind, coalesce(p_points, 0), coalesce(p_amount, 0), nullif(trim(p_note), ''), auth.uid());

  select coalesce(sum(points), 0) into v_bal from public.courier_points_ledger where courier_id = p_courier;
  return v_bal;
end $$;

-- ---------------------------------------------------------------------
-- Yetkiler
-- ---------------------------------------------------------------------
revoke execute on function
  public._require_any_permission(text[]),
  public._courier_online_minutes(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;

revoke execute on function
  public.report_courier_overview(timestamptz, timestamptz, int),
  public.report_courier_detail(uuid, timestamptz, timestamptz, int),
  public.report_customer_overview(timestamptz, timestamptz),
  public.report_customer_detail(uuid),
  public.admin_courier_points(uuid, int, numeric, text, text),
  public.set_courier_online(boolean)
  from public, anon;
grant execute on function
  public.report_courier_overview(timestamptz, timestamptz, int),
  public.report_courier_detail(uuid, timestamptz, timestamptz, int),
  public.report_customer_overview(timestamptz, timestamptz),
  public.report_customer_detail(uuid),
  public.admin_courier_points(uuid, int, numeric, text, text),
  public.set_courier_online(boolean)
  to authenticated;

-- service_role (Edge Function) için
grant all on public.courier_online_sessions, public.courier_points_ledger to service_role;
grant usage, select on all sequences in schema public to service_role;

-- İşlem geçmişi (audit) — puan/prim hareketleri kayıt altına alınır
do $$
begin
  execute 'drop trigger if exists audit_courier_points_ledger on public.courier_points_ledger';
  execute 'create trigger audit_courier_points_ledger after insert or update or delete on public.courier_points_ledger
           for each row execute function public.log_audit()';
exception when undefined_function then
  raise notice 'log_audit bulunamadı, audit tetikleyicisi atlandı';
end $$;


-- ===== 21_order_reviews_coupon_report.sql =====
-- =====================================================================
-- YAZIR PİLAVCISI · 21 — SİPARİŞ DEĞERLENDİRMELERİ + PLATFORM YORUMLARI + KUPON RAPORU
-- =====================================================================
-- Supabase > SQL Editor'e yapıştırıp RUN edin. Tekrar çalıştırılabilir (idempotent).
-- Gereksinim: 01–16 çalıştırılmış olmalı (15: kuponlar, 16: audit).
--
--  * order_reviews    : Web sitesinden SİPARİŞ VEREN, giriş yapmış müşterilerin
--                       lezzet / teslimat(kurye) / servis puanları (yarım yıldız dahil) + yorum
--  * platform_reviews : Yemeksepeti / Trendyol / Migros / Getir yorumları için hazır tablo (şimdilik boş)
--  * public_review_summary(), list_public_reviews() : tüm kaynakları birleştiren herkese açık özet/liste
--  * coupon_report()  : hangi kampanya ne kadar ciro getirdi
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Sipariş değerlendirmeleri
-- ---------------------------------------------------------------------
create table if not exists public.order_reviews (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null unique references public.orders(id) on delete cascade,
  customer_id     uuid references public.customers(id) on delete set null,
  user_id         uuid references auth.users(id) on delete set null,
  author_name     text not null default 'Müşteri',
  taste_rating    numeric(2,1) not null check (taste_rating between 0.5 and 5 and taste_rating * 2 = floor(taste_rating * 2)),
  delivery_rating numeric(2,1)          check (delivery_rating is null or (delivery_rating between 0.5 and 5 and delivery_rating * 2 = floor(delivery_rating * 2))),
  service_rating  numeric(2,1) not null check (service_rating between 0.5 and 5 and service_rating * 2 = floor(service_rating * 2)),
  overall         numeric(3,2) generated always as (
                    round((taste_rating + service_rating + coalesce(delivery_rating, 0))
                          / (2 + case when delivery_rating is null then 0 else 1 end), 2)
                  ) stored,
  comment         text not null default '' check (char_length(comment) <= 1000),
  is_published    boolean not null default true,
  admin_reply     text,
  replied_at      timestamptz,
  replied_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists order_reviews_created_idx on public.order_reviews (created_at desc);
create index if not exists order_reviews_user_idx on public.order_reviews (user_id);

-- ---------------------------------------------------------------------
-- 2) Platform yorumları (entegrasyonlar bağlanınca dolacak)
-- ---------------------------------------------------------------------
create table if not exists public.platform_reviews (
  id          uuid primary key default gen_random_uuid(),
  platform    text not null references public.order_sources(code) on update cascade,
  external_id text not null,
  author      text not null default 'Müşteri',
  rating      numeric(2,1) not null check (rating between 0.5 and 5),
  body        text not null default '',
  review_time timestamptz,
  reply       text,
  is_published boolean not null default true,
  raw         jsonb,
  created_at  timestamptz not null default now(),
  unique (platform, external_id)
);
create index if not exists platform_reviews_platform_idx on public.platform_reviews (platform, review_time desc);

-- ---------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------
alter table public.order_reviews enable row level security;
alter table public.platform_reviews enable row level security;

drop policy if exists order_reviews_public_select on public.order_reviews;
create policy order_reviews_public_select on public.order_reviews for select to anon, authenticated
  using (is_published);
drop policy if exists order_reviews_own_select on public.order_reviews;
create policy order_reviews_own_select on public.order_reviews for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists order_reviews_staff_select on public.order_reviews;
create policy order_reviews_staff_select on public.order_reviews for select to authenticated
  using ((select public.current_app_role()) in ('owner', 'sub_admin', 'operator'));

drop policy if exists platform_reviews_public_select on public.platform_reviews;
create policy platform_reviews_public_select on public.platform_reviews for select to anon, authenticated
  using (is_published);
drop policy if exists platform_reviews_staff_all on public.platform_reviews;
create policy platform_reviews_staff_all on public.platform_reviews for all to authenticated
  using ((select public.has_permission('settings.manage')))
  with check ((select public.has_permission('settings.manage')));

-- Yazma yalnızca aşağıdaki fonksiyonlarla (yetki ve sipariş sahipliği orada denetlenir)
revoke insert, update, delete, truncate on public.order_reviews from anon, authenticated;
revoke insert, update, delete on public.platform_reviews from anon;
grant select on public.order_reviews, public.platform_reviews to anon, authenticated;
grant insert, update, delete on public.platform_reviews to authenticated;

-- ---------------------------------------------------------------------
-- 4) Müşteri: değerlendirilebilir siparişler + yorum gönder / düzenle / sil
-- ---------------------------------------------------------------------
create or replace function public.my_reviewable_orders()
returns table (
  order_id uuid, order_no bigint, order_type text, created_at timestamptz, delivered_at timestamptz,
  total numeric, items text,
  review_id uuid, taste_rating numeric, delivery_rating numeric, service_rating numeric,
  comment text, is_published boolean, admin_reply text, review_updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then return; end if;
  return query
  select o.id, o.order_no, o.order_type::text, o.created_at, o.delivered_at, o.total,
         (select string_agg(i.quantity::text || '× ' || i.product_name, ', ') from public.order_items i where i.order_id = o.id),
         r.id, r.taste_rating, r.delivery_rating, r.service_rating, r.comment, r.is_published, r.admin_reply, r.updated_at
    from public.orders o
    join public.customers c on c.id = o.customer_id
    left join public.order_reviews r on r.order_id = o.id
   where c.user_id = auth.uid() and o.status = 'delivered' and o.source = 'web'
   order by coalesce(o.delivered_at, o.created_at) desc;
end $$;

create or replace function public.submit_order_review(
  p_order_id uuid, p_taste numeric, p_delivery numeric, p_service numeric, p_comment text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_o public.orders%rowtype; v_c public.customers%rowtype; v_name text; v_id uuid; v_delivery numeric;
begin
  if auth.uid() is null then raise exception 'Yorum yapmak için giriş yapmalısınız' using errcode = '42501'; end if;
  select * into v_o from public.orders where id = p_order_id;
  if not found then raise exception 'Sipariş bulunamadı' using errcode = 'P0001'; end if;
  select * into v_c from public.customers where id = v_o.customer_id and user_id = auth.uid();
  if not found then raise exception 'Yalnızca kendi siparişinizi değerlendirebilirsiniz' using errcode = '42501'; end if;
  if v_o.source <> 'web' then raise exception 'Yalnızca web sitesinden verilen siparişler değerlendirilebilir' using errcode = 'P0001'; end if;
  if v_o.status <> 'delivered' then raise exception 'Sipariş teslim edildikten sonra değerlendirebilirsiniz' using errcode = 'P0001'; end if;

  v_delivery := case when v_o.order_type = 'delivery' then p_delivery else null end;
  if v_o.order_type = 'delivery' and v_delivery is null then
    raise exception 'Teslimat (kurye) puanını da verin' using errcode = 'P0001';
  end if;
  if p_taste is null or p_service is null then raise exception 'Lezzet ve servis puanı zorunlu' using errcode = 'P0001'; end if;

  -- "Ahmet Yılmaz" → "Ahmet Y."
  v_name := coalesce(nullif(trim(v_c.full_name), ''), 'Müşteri');
  if position(' ' in v_name) > 0 then
    v_name := split_part(v_name, ' ', 1) || ' ' || upper(left(split_part(v_name, ' ', 2), 1)) || '.';
  end if;

  insert into public.order_reviews (order_id, customer_id, user_id, author_name, taste_rating, delivery_rating, service_rating, comment)
  values (p_order_id, v_o.customer_id, auth.uid(), v_name, p_taste, v_delivery, p_service, left(coalesce(trim(p_comment), ''), 1000))
  on conflict (order_id) do update
     set taste_rating = excluded.taste_rating, delivery_rating = excluded.delivery_rating,
         service_rating = excluded.service_rating, comment = excluded.comment, updated_at = now()
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.delete_order_review(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Giriş yapmalısınız' using errcode = '42501'; end if;
  delete from public.order_reviews where order_id = p_order_id and user_id = auth.uid();
end $$;

-- ---------------------------------------------------------------------
-- 5) Yönetici: yayınla / gizle / cevapla / sil
-- ---------------------------------------------------------------------
create or replace function public.admin_moderate_review(p_id uuid, p_action text, p_reply text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.current_app_role() is null or public.current_app_role() not in ('owner', 'sub_admin') then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  if p_action = 'publish' then
    update public.order_reviews set is_published = true where id = p_id;
  elsif p_action = 'hide' then
    update public.order_reviews set is_published = false where id = p_id;
  elsif p_action = 'reply' then
    update public.order_reviews set admin_reply = nullif(trim(p_reply), ''),
           replied_at = case when nullif(trim(p_reply), '') is null then null else now() end,
           replied_by = auth.uid() where id = p_id;
  elsif p_action = 'delete' then
    delete from public.order_reviews where id = p_id;
  else
    raise exception 'Bilinmeyen işlem' using errcode = 'P0001';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6) Herkese açık özet ve liste (web siparişleri + Google + yönetici seçmeleri + platformlar)
-- ---------------------------------------------------------------------
create or replace function public.public_review_summary()
returns jsonb language sql stable security definer set search_path = '' as $$
  with allr as (
    select 'web'::text as src, overall::numeric as rating, taste_rating::numeric as taste, delivery_rating::numeric as delivery, service_rating::numeric as service
      from public.order_reviews where is_published
    union all
    select s.source, s.rating::numeric, null, null, null from public.site_reviews s where s.is_published
    union all
    select p.platform, p.rating::numeric, null, null, null from public.platform_reviews p where p.is_published
  ),
  per as (
    select src, count(*) as n, round(avg(rating), 2) as avg,
           round(avg(taste), 2) as taste, round(avg(delivery), 2) as delivery, round(avg(service), 2) as service
      from allr group by src
  )
  select jsonb_build_object(
    'total_count', (select count(*) from allr),
    'total_avg', (select round(avg(rating), 2) from allr),
    'distribution', jsonb_build_object(
      '5', (select count(*) from allr where round(rating) >= 5),
      '4', (select count(*) from allr where round(rating) = 4),
      '3', (select count(*) from allr where round(rating) = 3),
      '2', (select count(*) from allr where round(rating) = 2),
      '1', (select count(*) from allr where round(rating) <= 1)),
    'web_categories', (select jsonb_build_object('taste', taste, 'delivery', delivery, 'service', service) from per where src = 'web'),
    'sources', coalesce((select jsonb_object_agg(src, jsonb_build_object('count', n, 'avg', avg)) from per), '{}'::jsonb)
  )
$$;

create or replace function public.list_public_reviews(
  p_source text default null, p_sort text default 'newest', p_min numeric default 0,
  p_limit int default 12, p_offset int default 0)
returns table (
  id text, source text, author text, rating numeric, taste numeric, delivery numeric, service numeric,
  body text, created_at timestamptz, photo text, reply text, replied_at timestamptz, relative_time text, total_count bigint)
language sql stable security definer set search_path = '' as $$
  with allr as (
    select r.id::text as id, 'web'::text as source, r.author_name as author, r.overall::numeric as rating,
           r.taste_rating::numeric as taste, r.delivery_rating::numeric as delivery, r.service_rating::numeric as service,
           r.comment as body, r.created_at, null::text as photo, r.admin_reply as reply, r.replied_at, null::text as relative_time
      from public.order_reviews r where r.is_published
    union all
    select s.id::text, s.source, s.author, s.rating::numeric, null, null, null,
           s.body, coalesce(s.review_time, s.created_at), s.profile_photo_url, null, null, s.relative_time_description
      from public.site_reviews s where s.is_published
    union all
    select p.id::text, p.platform, p.author, p.rating::numeric, null, null, null,
           p.body, coalesce(p.review_time, p.created_at), null, p.reply, null, null
      from public.platform_reviews p where p.is_published
  ), f as (
    select * from allr where (p_source is null or p_source = 'all' or source = p_source) and rating >= coalesce(p_min, 0)
  )
  select f.id, f.source, f.author, f.rating, f.taste, f.delivery, f.service, f.body, f.created_at, f.photo, f.reply,
         f.replied_at, f.relative_time, count(*) over () as total_count
    from f
   order by
     case when p_sort = 'highest' then f.rating end desc nulls last,
     case when p_sort = 'lowest' then f.rating end asc nulls last,
     f.created_at desc
   limit greatest(1, least(coalesce(p_limit, 12), 50)) offset greatest(0, coalesce(p_offset, 0))
$$;

-- ---------------------------------------------------------------------
-- 7) Kupon kullanım raporu
-- ---------------------------------------------------------------------
create or replace function public.coupon_report(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_coupons jsonb; v_daily jsonb; v_tot jsonb; v_point_value numeric;
begin
  if public.current_app_role() is null or public.current_app_role() not in ('owner', 'sub_admin', 'operator') then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  select loyalty_point_value into v_point_value from public.business_settings where id = 1;

  with red as (
    select r.coupon_id, r.amount, r.created_at, r.customer_id, r.phone, o.id as order_id, o.total, o.subtotal,
           (o.customer_id is not null and not exists (
              select 1 from public.orders o2 where o2.customer_id = o.customer_id and o2.created_at < o.created_at and o2.status <> 'cancelled'
           )) as is_new
      from public.coupon_redemptions r
      join public.orders o on o.id = r.order_id and o.status <> 'cancelled'
     where r.created_at >= p_from and r.created_at < p_to
  )
  select coalesce(jsonb_agg(row_to_json(x) order by x.revenue desc), '[]'::jsonb) into v_coupons from (
    select c.id, c.code, c.title, c.discount_type, c.is_active, c.usage_limit, c.used_count,
           count(red.order_id)::int as uses,
           coalesce(sum(red.amount), 0) as discount_total,
           coalesce(sum(red.total), 0) as revenue,
           coalesce(sum(red.subtotal), 0) as gross,
           count(distinct coalesce(red.customer_id::text, red.phone))::int as customers,
           count(*) filter (where red.is_new)::int as new_customers,
           coalesce(round(avg(red.total), 2), 0) as avg_basket,
           max(red.created_at) as last_used
      from public.coupons c
      left join red on red.coupon_id = c.id
     group by c.id
  ) x;

  select coalesce(jsonb_agg(row_to_json(d) order by d.day), '[]'::jsonb) into v_daily from (
    select (r.created_at at time zone 'Europe/Istanbul')::date as day, count(*)::int as uses,
           coalesce(sum(r.amount), 0) as discount, coalesce(sum(o.total), 0) as revenue
      from public.coupon_redemptions r join public.orders o on o.id = r.order_id and o.status <> 'cancelled'
     where r.created_at >= p_from and r.created_at < p_to
     group by 1
  ) d;

  select jsonb_build_object(
    'orders', count(*),
    'coupon_orders', count(*) filter (where exists (select 1 from public.coupon_redemptions r where r.order_id = o.id)),
    'revenue', coalesce(sum(o.total), 0),
    'coupon_revenue', coalesce(sum(o.total) filter (where exists (select 1 from public.coupon_redemptions r where r.order_id = o.id)), 0),
    'avg_basket_coupon', coalesce(round(avg(o.total) filter (where exists (select 1 from public.coupon_redemptions r where r.order_id = o.id)), 2), 0),
    'avg_basket_other', coalesce(round(avg(o.total) filter (where not exists (select 1 from public.coupon_redemptions r where r.order_id = o.id)), 2), 0),
    'discount_total', coalesce((select sum(r.amount) from public.coupon_redemptions r join public.orders o2 on o2.id = r.order_id and o2.status <> 'cancelled' where r.created_at >= p_from and r.created_at < p_to), 0),
    'points_used', coalesce((select -sum(l.points) from public.loyalty_ledger l where l.reason = 'redeem' and l.created_at >= p_from and l.created_at < p_to), 0),
    'points_value', coalesce((select -sum(l.points) from public.loyalty_ledger l where l.reason = 'redeem' and l.created_at >= p_from and l.created_at < p_to), 0) * coalesce(v_point_value, 1)
  ) into v_tot
  from public.orders o where o.status <> 'cancelled' and o.created_at >= p_from and o.created_at < p_to;

  return jsonb_build_object('coupons', v_coupons, 'daily', v_daily, 'totals', v_tot);
end $$;

-- ---------------------------------------------------------------------
-- 8) Yetkiler
-- ---------------------------------------------------------------------
revoke execute on function public.my_reviewable_orders(), public.submit_order_review(uuid, numeric, numeric, numeric, text),
  public.delete_order_review(uuid), public.admin_moderate_review(uuid, text, text), public.coupon_report(timestamptz, timestamptz)
  from public, anon;
grant execute on function public.my_reviewable_orders(), public.submit_order_review(uuid, numeric, numeric, numeric, text),
  public.delete_order_review(uuid), public.admin_moderate_review(uuid, text, text), public.coupon_report(timestamptz, timestamptz)
  to authenticated;
grant execute on function public.public_review_summary(), public.list_public_reviews(text, text, numeric, int, int) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 9) İşlem geçmişi + Realtime
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['order_reviews', 'platform_reviews']
  loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.log_audit()', t);
  end loop;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_reviews') then
    alter publication supabase_realtime add table public.order_reviews;
  end if;
end $$;
