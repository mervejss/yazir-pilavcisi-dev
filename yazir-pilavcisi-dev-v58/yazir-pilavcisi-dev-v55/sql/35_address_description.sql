-- 35 — Adres açıklaması (Trendyol "addressDescription")
-- Tekrar çalıştırılabilir. Supabase SQL Editor'da çalıştırın.

alter table public.orders add column if not exists address_description text;

-- Mevcut Trendyol siparişlerini ham veriden doldur
update public.orders
   set address_description = nullif(left(btrim(external_payload->'address'->>'addressDescription'), 300), '')
 where address_description is null
   and external_payload->'address'->>'addressDescription' is not null;

-- Platform siparişi içeri alma: yeni alanı yazar (ve sonraki senkronlarda günceller)
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

  select id into v_id from public.orders where source = v_source and external_ref = v_ref;

  if v_id is null then
    insert into public.orders (
      source, order_type, status, customer_name, customer_phone, delivery_address, address_description, district, lat, lng, note,
      payment_method, payment_status, subtotal, delivery_fee, discount, total,
      external_ref, external_payload, pin_code, order_code, call_center_phone, platform_app, platform_status)
    values (
      v_source, 'delivery', 'new',
      nullif(left(p->>'customer_name', 120), ''), nullif(left(p->>'customer_phone', 40), ''),
      nullif(left(p->>'delivery_address', 800), ''), nullif(left(p->>'address_description', 300), ''), nullif(left(p->>'district', 80), ''),
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
    select order_no into v_no from public.orders where id = v_id;
    update public.orders
       set platform_status   = coalesce(nullif(p->>'platform_status', ''), platform_status),
           call_center_phone = coalesce(nullif(p->>'call_center_phone', ''), call_center_phone),
           pin_code          = coalesce(nullif(p->>'pin_code', ''), pin_code),
           address_description = coalesce(nullif(left(p->>'address_description', 300), ''), address_description),
           external_payload  = coalesce(p->'payload', external_payload)
     where id = v_id;
  end if;

  -- Trendyol'daki gerçek durum "yeni"den ilerideyse (ör. tabletten kabul edilmiş) siteye de yansıt
  if v_new <> 'new' then
    perform public._platform_move_status(v_id, v_new, null, nullif(p->>'cancel_reason', ''));
  end if;

  return jsonb_build_object('order_id', v_id, 'order_no', v_no, 'created', v_created);
end $$;
revoke all on function public.platform_ingest_order(jsonb) from public, anon, authenticated;
grant execute on function public.platform_ingest_order(jsonb) to service_role;

-- Kurye listesi: kendi üstlendiği siparişte adres açıklamasını da görsün
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
      o.id, o.order_no, o.status, o.created_at, o.total, o.payment_method, o.customer_payment_method, o.district,
      (o.courier_id = v_uid) as is_mine,
      (o.courier_id is not null and o.courier_id <> v_uid) as taken_by_other,
      case when o.courier_id is not null then split_part(cp.full_name, ' ', 1) end as courier_first_name,
      case when o.courier_id = v_uid then o.customer_name end    as customer_name,
      case when o.courier_id = v_uid then o.customer_phone end   as customer_phone,
      case when o.courier_id = v_uid then o.delivery_address end as delivery_address,
      case when o.courier_id = v_uid then o.address_description end as address_description,
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
