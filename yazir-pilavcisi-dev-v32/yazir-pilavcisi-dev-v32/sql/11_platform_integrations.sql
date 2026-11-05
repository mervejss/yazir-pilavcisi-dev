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
