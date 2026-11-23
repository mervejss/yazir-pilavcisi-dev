-- =====================================================================
-- 42 · TRENDYOL: EKSİKSİZ SİPARİŞ + HAFİF REALTIME + YARIŞ KORUMASI (v63)
-- Supabase → SQL Editor'de TAMAMINI bir kez çalıştırın (sql/40'tan SONRA). Tekrar çalıştırmak güvenlidir.
--
-- 1) HAM TRENDYOL PAKETİ ARTIK 'orders' TABLOSUNDA DEĞİL: ayrı 'order_payloads' tablosunda (Realtime'a dahil değil, istemciye gitmez).
--    'orders.external_payload' yalnızca raporların kullandığı küçük özet (orderNumber, id, shipmentPackageId, adres tarifi) tutar.
--    + orders 'replica identity' varsayılana alınır → her sipariş güncellemesinde Realtime olayı onlarca KB değil birkaç yüz bayt olur.
-- 2) platform_ingest_order: aynı paket aynı anda iki yerden gelirse (çekim + webhook) çift sipariş / hata OLMAZ (advisory kilit).
-- 3) platform_update_items: Trendyol'da sipariş içeriği/tutarı değişirse (kısmi iptal) sitedeki sipariş eşitlenir.
-- 4) Zamanlayıcı isteği zaman aşımı 20 → 55 sn; sorgu indeksi.
-- =====================================================================

begin;

-- ---------- 1) Ham paket deposu ----------
create table if not exists public.order_payloads (
  order_id   uuid primary key references public.orders(id) on delete cascade,
  payload    jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.order_payloads enable row level security;  -- politika yok: yalnızca service_role (Edge Function) erişir

create or replace function public._slim_payload(p jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select case when p is null then null else jsonb_strip_nulls(jsonb_build_object(
    'id', p->'id', 'orderNumber', p->'orderNumber', 'shipmentPackageId', p->'shipmentPackageId',
    'packageStatus', coalesce(p->'packageStatus', p->'status'),
    'address', jsonb_build_object('addressDescription', p#>'{address,addressDescription}'))) end
$$;

create or replace function public._store_payload(p_order uuid, p jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.order_payloads (order_id, payload) select p_order, p where p is not null
  on conflict (order_id) do update set payload = excluded.payload, updated_at = now()
    where public.order_payloads.payload is distinct from excluded.payload;
$$;
revoke all on function public._store_payload(uuid, jsonb) from public, anon, authenticated;
revoke all on function public._slim_payload(jsonb) from public, anon, authenticated;
grant execute on function public._store_payload(uuid, jsonb) to service_role;
grant execute on function public._slim_payload(jsonb) to service_role;

-- ---------- Mevcut siparişleri taşı (tek seferlik; tetikleyiciler ve Realtime bu işlem için kapatılır) ----------
insert into public.order_payloads (order_id, payload)
select id, external_payload from public.orders
 where external_payload is not null and jsonb_typeof(external_payload) = 'object' and length(external_payload::text) > 600
on conflict (order_id) do nothing;

do $$ begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
    alter publication supabase_realtime drop table public.orders;
  end if;
end $$;
alter table public.orders disable trigger user;
update public.orders
   set external_payload = public._slim_payload(external_payload)
 where external_payload is not null and length(external_payload::text) > 600;
alter table public.orders enable trigger user;
alter table public.orders replica identity default;
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

-- ---------- 2) platform_apply_status: yalnızca gerçekten değişen şey varsa UPDATE; ham paket ayrı tabloya ----------
create or replace function public.platform_apply_status(
  p_order_id uuid, p_status public.order_status, p_platform_status text default null,
  p_cancel_reason text default null, p_payload jsonb default null,
  p_call_center_phone text default null, p_pin_code text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_changed boolean; v_to public.order_status;
begin
  if coalesce(auth.role(), current_setting('request.jwt.claim.role', true), 'service_role') <> 'service_role' then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  update public.orders o
     set platform_status   = coalesce(nullif(p_platform_status, ''), o.platform_status),
         call_center_phone = coalesce(nullif(p_call_center_phone, ''), o.call_center_phone),
         pin_code          = coalesce(nullif(p_pin_code, ''), o.pin_code),
         external_payload  = coalesce(public._slim_payload(p_payload), o.external_payload)
   where o.id = p_order_id
     and (   (nullif(p_platform_status, '')    is not null and o.platform_status   is distinct from p_platform_status)
          or (nullif(p_call_center_phone, '')  is not null and o.call_center_phone is distinct from p_call_center_phone)
          or (nullif(p_pin_code, '')           is not null and o.pin_code          is distinct from p_pin_code));
  perform public._store_payload(p_order_id, p_payload);
  v_changed := public._platform_move_status(p_order_id, p_status, null, p_cancel_reason);
  select status into v_to from public.orders where id = p_order_id;
  return jsonb_build_object('order_id', p_order_id, 'changed', v_changed, 'status', v_to);
end $$;
revoke all on function public.platform_apply_status(uuid, public.order_status, text, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.platform_apply_status(uuid, public.order_status, text, text, jsonb, text, text) to service_role;

create or replace function public.platform_ingest_order(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_source  text := p->>'source';
  v_ref     text := nullif(p->>'external_ref', '');
  v_id      uuid;
  v_no      bigint;
  v_new     public.order_status := coalesce(nullif(p->>'status', '')::public.order_status, 'new');
  v_created boolean := false;
begin
  if coalesce(auth.role(), current_setting('request.jwt.claim.role', true), 'service_role') <> 'service_role' then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  if v_ref is null or not exists (select 1 from public.order_sources where code = v_source and is_platform and is_active) then
    raise exception 'Geçersiz platform veya sipariş numarası' using errcode = 'P0001';
  end if;

  -- v63: aynı paketi aynı anda iki işlem (zamanlayıcı + webhook / üst üste binen çekim) eklemeye kalkarsa sıraya girer; ikincisi mevcut siparişi görür
  perform pg_advisory_xact_lock(hashtext(v_source || ':' || v_ref));
  select id into v_id from public.orders where source = v_source and external_ref = v_ref;

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
      v_ref, public._slim_payload(p->'payload'),
      nullif(p->>'pin_code', ''), nullif(p->>'order_code', ''), nullif(p->>'call_center_phone', ''),
      nullif(p->>'platform_app', ''), nullif(p->>'platform_status', ''))
    returning id, order_no into v_id, v_no;
    perform public._store_payload(v_id, p->'payload');

    insert into public.order_items (order_id, product_name, variant_name, unit_price, quantity, note)
    select v_id, left(coalesce(x.name, 'Ürün'), 200), nullif(left(x.variant, 200), ''),
           greatest(coalesce(x.unit_price, 0), 0), least(greatest(coalesce(x.quantity, 1), 1), 100),
           nullif(left(x.note, 300), '')
      from jsonb_to_recordset(coalesce(p->'items', '[]'::jsonb))
           as x(name text, variant text, unit_price numeric, quantity int, note text);
    v_created := true;
  else
    select order_no into v_no from public.orders where id = v_id;
    update public.orders o
       set platform_status   = coalesce(nullif(p->>'platform_status', ''), o.platform_status),
           call_center_phone = coalesce(nullif(p->>'call_center_phone', ''), o.call_center_phone),
           pin_code          = coalesce(nullif(p->>'pin_code', ''), o.pin_code),
           external_payload  = coalesce(public._slim_payload(p->'payload'), o.external_payload)
     where o.id = v_id
       and (   (nullif(p->>'platform_status', '')   is not null and o.platform_status   is distinct from p->>'platform_status')
            or (nullif(p->>'call_center_phone', '') is not null and o.call_center_phone is distinct from p->>'call_center_phone')
            or (nullif(p->>'pin_code', '')          is not null and o.pin_code          is distinct from p->>'pin_code')
            or (p->'payload' is not null and o.external_payload is distinct from public._slim_payload(p->'payload')));
    perform public._store_payload(v_id, p->'payload');
  end if;

  -- Trendyol'daki gerçek durum "yeni"den ilerideyse (ör. tabletten kabul edilmiş) siteye de yansıt
  if v_new <> 'new' then
    perform public._platform_move_status(v_id, v_new, null, nullif(p->>'cancel_reason', ''));
  end if;

  return jsonb_build_object('order_id', v_id, 'order_no', v_no, 'created', v_created);
end $$;
revoke all on function public.platform_ingest_order(jsonb) from public, anon, authenticated;
grant execute on function public.platform_ingest_order(jsonb) to service_role;

-- ---------- 3) Sipariş içeriği / tutarı değişti → eşitle (yalnızca bitmemiş siparişte, yalnızca service_role) ----------
create or replace function public.platform_update_items(p_order_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_o public.orders%rowtype; v_sub numeric(10,2); v_n int;
begin
  if coalesce(auth.role(), current_setting('request.jwt.claim.role', true), 'service_role') <> 'service_role' then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  select * into v_o from public.orders where id = p_order_id for update;
  if not found or v_o.status in ('delivered', 'cancelled') or v_o.source is null then
    return jsonb_build_object('updated', false);
  end if;
  select count(*) into v_n from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb));
  if v_n = 0 then return jsonb_build_object('updated', false, 'reason', 'kalem yok'); end if;

  delete from public.order_items where order_id = p_order_id;
  insert into public.order_items (order_id, product_name, variant_name, unit_price, quantity, note)
  select p_order_id, left(coalesce(x.name, 'Ürün'), 200), nullif(left(x.variant, 200), ''),
         greatest(coalesce(x.unit_price, 0), 0), least(greatest(coalesce(x.quantity, 1), 1), 100), nullif(left(x.note, 300), '')
    from jsonb_to_recordset(p->'items') as x(name text, variant text, unit_price numeric, quantity int, note text);

  select coalesce(sum(line_total), 0) into v_sub from public.order_items where order_id = p_order_id;
  update public.orders
     set subtotal = coalesce(nullif(p->>'subtotal', '')::numeric, v_sub),
         delivery_fee = coalesce(nullif(p->>'delivery_fee', '')::numeric, delivery_fee),
         discount = coalesce(nullif(p->>'discount', '')::numeric, discount),
         total = coalesce(nullif(p->>'total', '')::numeric, v_o.total),
         external_payload = coalesce(public._slim_payload(p->'payload'), external_payload)
   where id = p_order_id;
  perform public._store_payload(p_order_id, p->'payload');
  return jsonb_build_object('updated', true, 'total', (select total from public.orders where id = p_order_id));
end $$;
revoke all on function public.platform_update_items(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.platform_update_items(uuid, jsonb) to service_role;

commit;

-- ---------- 3) Zamanlayıcı: 55 sn zaman aşımı ----------
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule(jobid) from cron.job where jobname = 'trendyol-sync-orders';
select cron.schedule(
  'trendyol-sync-orders',
  '*/2 * * * *',
  $$
  select net.http_post(
    url     := 'https://pgapkexzykydecedgzti.supabase.co/functions/v1/platform-trendyol',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body    := '{"action":"sync_orders"}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- ---------- 4) İndeks ----------
create index if not exists orders_source_open_idx on public.orders(source, status) where external_ref is not null;

