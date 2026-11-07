-- =====================================================================
-- v38 · Müşteri sipariş takibi: canlı kurye konumu, hareket izi, hedef
-- Supabase > SQL Editor'de bir kez çalıştırın (tekrar çalıştırmak güvenli).
-- Sipariş UUID'si (tahmin edilemez) anahtardır; kurye konumu YALNIZCA
-- sipariş "atandı / yolda" iken ve paket serviste döner.
-- =====================================================================
create or replace function public.track_order_live(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  o public.orders;
  s public.business_settings;
  loc public.courier_locations;
  v_name text;
  v_live boolean;
  v_trail jsonb := '[]'::jsonb;
  v_courier jsonb := null;
begin
  select * into o from public.orders where id = p_order_id;
  if not found then raise exception 'Sipariş bulunamadı' using errcode = 'P0001'; end if;
  select * into s from public.business_settings where id = 1;

  v_live := o.order_type = 'delivery' and o.courier_id is not null and o.status in ('assigned', 'on_the_way');

  if v_live then
    select * into loc from public.courier_locations where courier_id = o.courier_id;
    select split_part(full_name, ' ', 1) into v_name from public.profiles where id = o.courier_id;
    if loc.courier_id is not null then
      v_courier := jsonb_build_object(
        'name', v_name,
        'lat', loc.lat, 'lng', loc.lng, 'heading', loc.heading, 'speed', loc.speed,
        'updated_at', loc.updated_at);
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('lat', h.lat, 'lng', h.lng, 't', h.recorded_at) order by h.recorded_at), '[]'::jsonb)
      into v_trail
      from (select lat, lng, recorded_at from public.courier_location_history
             where order_id = p_order_id order by recorded_at desc limit 300) h;
  end if;

  return jsonb_build_object(
    'status', o.status,
    'order_type', o.order_type,
    'live', v_live,
    'picked_up_at', o.picked_up_at,
    'courier', case when loc.courier_id is null then null else v_courier end,
    'trail', v_trail,
    'dest', jsonb_build_object('lat', o.lat, 'lng', o.lng, 'address', o.delivery_address, 'district', o.district),
    'restaurant', jsonb_build_object('lat', s.lat, 'lng', s.lng, 'address', s.address)
  );
end $$;

grant execute on function public.track_order_live(uuid) to anon, authenticated;

-- İsteğe bağlı: izin yoğunluğu için "yolda iken" konum geçmişi aralığını 20 sn yapar
update public.business_settings set location_history_interval_seconds = 20
 where id = 1 and location_history_interval_seconds > 20;
