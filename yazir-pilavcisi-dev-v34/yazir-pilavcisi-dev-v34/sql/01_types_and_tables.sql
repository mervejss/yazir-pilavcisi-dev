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
