-- =====================================================================
-- 22 · TRENDYOL DURUM SENKRONU DÜZELTMESİ + KURYE ZORUNLU DEĞİL
-- Supabase → SQL Editor'de BİR KEZ çalıştırın. Tekrar çalıştırmak güvenlidir.
--
-- SORUN: Trendyol'dan gelen "Yolda / Teslim edildi / İptal" durumları sitedeki
-- sipariş tetikleyicisine takılıyordu:
--   • "Yolda"ya geçmek için kurye ŞART koşuluyordu (Trendyol kuryesi taşıyorsa kurye yok)
--   • Hazırlanıyor → Yolda/Teslim gibi "atlayan" geçişler reddediliyordu
-- Hata sessizce loglanıyor, sipariş "Hazırlanıyor"da takılı kalıyordu.
--
-- ÇÖZÜM:
--   1) Kurye artık zorunlu değil (yalnızca "Kuryeye atandı" durumu kurye ister)
--   2) Platform senkronu için güvenli "atlayarak ilerleme" yolu (yalnızca service_role)
--   3) Kurye sonradan da girilebilir (teslim edilmiş siparişe bile)
-- =====================================================================

-- ---------- 1) Geçiş tablosu: kurye olmadan da yola çıkılabilir / teslim edilebilir ----------
create or replace function public.order_transition_allowed(p_from public.order_status, p_to public.order_status)
returns boolean language sql immutable set search_path = '' as $$
  select case p_from
    when 'new'        then p_to in ('preparing', 'cancelled')
    when 'preparing'  then p_to in ('ready', 'assigned', 'on_the_way', 'cancelled')
    when 'ready'      then p_to in ('preparing', 'assigned', 'on_the_way', 'delivered', 'cancelled')
    when 'assigned'   then p_to in ('ready', 'on_the_way', 'delivered', 'cancelled')
    when 'on_the_way' then p_to in ('assigned', 'delivered', 'cancelled')
    else false
  end
$$;

-- ---------- 2) Sipariş yazma tetikleyicisi ----------
create or replace function public.orders_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_sync boolean := coalesce(current_setting('app.platform_sync', true), '') = 'on';
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
    -- Platform senkronu (Trendyol gerçek durumu) kuralları atlar; kullanıcı işlemleri atlayamaz.
    if not v_sync then
      if not public.order_transition_allowed(old.status, new.status) then
        raise exception 'Geçersiz durum geçişi: % → %',
          public.order_status_label(old.status), public.order_status_label(new.status) using errcode = 'P0001';
      end if;
      -- Yalnızca "Kuryeye atandı" kurye ister. "Yolda" ve "Teslim" kuryesiz olabilir.
      if new.status = 'assigned' and (new.courier_id is null or new.order_type <> 'delivery') then
        raise exception 'Kuryeye atandı durumu için teslimat siparişine kurye seçilmeli' using errcode = 'P0001';
      end if;
    end if;

    -- Atlanan ara aşamaların zaman damgaları boş kalmasın (raporlar için)
    if new.status in ('preparing', 'ready', 'assigned', 'on_the_way', 'delivered') then
      new.accepted_at := coalesce(new.accepted_at, now());
    end if;
    if new.status in ('ready', 'assigned', 'on_the_way', 'delivered') then
      new.ready_at := coalesce(new.ready_at, now());
    end if;
    if new.status in ('on_the_way', 'delivered') then
      new.picked_up_at := coalesce(new.picked_up_at, now());
    end if;

    if new.status = 'assigned' then
      new.assigned_at := now();
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

-- ---------- 3) İç yardımcı: durumu YALNIZCA İLERİ taşır (service_role kullanır) ----------
create or replace function public._platform_move_status(
  p_order_id uuid, p_to public.order_status, p_note text default null, p_reason text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_o   public.orders%rowtype;
  v_rk  jsonb := '{"new":0,"preparing":1,"ready":2,"assigned":3,"on_the_way":4,"delivered":5,"cancelled":6}';
begin
  select * into v_o from public.orders where id = p_order_id for update;
  if not found then return false; end if;
  if v_o.status = p_to then return false; end if;
  if v_o.status in ('delivered', 'cancelled') then return false; end if;           -- bitmiş sipariş geri açılmaz
  if (v_rk->>(p_to::text))::int <= (v_rk->>(v_o.status::text))::int then return false; end if;   -- geri gitme

  perform set_config('app.platform_sync', 'on', true);
  perform set_config('app.status_note', coalesce(p_note, 'Trendyol senkronu'), true);
  update public.orders
     set status = p_to,
         cancel_reason = case when p_to = 'cancelled'
                              then coalesce(nullif(p_reason, ''), cancel_reason, 'Platform iptali')
                              else cancel_reason end
   where id = p_order_id;
  perform set_config('app.platform_sync', '', true);
  perform set_config('app.status_note', '', true);
  return true;
end $$;
revoke all on function public._platform_move_status(uuid, public.order_status, text, text) from public, anon, authenticated;
grant execute on function public._platform_move_status(uuid, public.order_status, text, text) to service_role;

-- ---------- 4) Platform: mevcut siparişin durumunu uygula ----------
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
  update public.orders
     set platform_status   = coalesce(nullif(p_platform_status, ''), platform_status),
         call_center_phone = coalesce(nullif(p_call_center_phone, ''), call_center_phone),
         pin_code          = coalesce(nullif(p_pin_code, ''), pin_code),
         external_payload  = coalesce(p_payload, external_payload)
   where id = p_order_id;
  v_changed := public._platform_move_status(p_order_id, p_status, null, p_cancel_reason);
  select status into v_to from public.orders where id = p_order_id;
  return jsonb_build_object('order_id', p_order_id, 'changed', v_changed, 'status', v_to);
end $$;
revoke all on function public.platform_apply_status(uuid, public.order_status, text, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.platform_apply_status(uuid, public.order_status, text, text, jsonb, text, text) to service_role;

-- ---------- 5) Platform siparişi içeri alma (durum atlayabilir) ----------
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
    select order_no into v_no from public.orders where id = v_id;
    update public.orders
       set platform_status   = coalesce(nullif(p->>'platform_status', ''), platform_status),
           call_center_phone = coalesce(nullif(p->>'call_center_phone', ''), call_center_phone),
           pin_code          = coalesce(nullif(p->>'pin_code', ''), pin_code),
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

-- ---------- 6) Kurye sonradan da girilebilir (her durumda; durum GERİ GİTMEZ) ----------
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
  if v_o.status in ('new', 'cancelled') then
    raise exception 'Bu durumdaki siparişe kurye atanamaz' using errcode = 'P0001';
  end if;
  if v_o.courier_id is not distinct from p_courier_id then
    return jsonb_build_object('order_id', p_order_id, 'status', v_o.status);
  end if;

  if p_courier_id is not null and not exists (
       select 1 from public.profiles p where p.id = p_courier_id and p.role = 'courier' and p.is_active) then
    raise exception 'Geçerli ve aktif bir kurye seçin' using errcode = 'P0001';
  end if;

  -- Durum kuralı: hazırlanıyor → aynı kalır · hazır → kuryeye atandı · atandı + kurye kalkarsa → hazır
  -- yolda / teslim edildi → durum AYNI kalır (kurye yalnızca kayıt için eklenir/değişir)
  v_new_status := case
    when v_o.status in ('on_the_way', 'delivered') then v_o.status
    when p_courier_id is null and v_o.status = 'assigned' then 'ready'
    when p_courier_id is not null and v_o.status in ('ready', 'assigned') then 'assigned'
    else v_o.status end;

  update public.orders set courier_id = p_courier_id, status = v_new_status where id = p_order_id;

  -- Teslim edilmiş siparişe sonradan kurye girildiyse performans kaydını kapat
  if v_new_status = 'delivered' and p_courier_id is not null then
    update public.courier_deliveries
       set outcome = 'delivered', delivered_at = coalesce(v_o.delivered_at, now()), ended_at = now(),
           picked_up_at = coalesce(picked_up_at, v_o.picked_up_at)
     where order_id = p_order_id and outcome is null;
  end if;
  return jsonb_build_object('order_id', p_order_id, 'status', v_new_status, 'courier_id', p_courier_id);
end $$;
grant execute on function public.assign_courier(uuid, uuid) to authenticated;

-- ---------- 7) Hızlı sorgular ----------
create index if not exists orders_source_status_idx on public.orders (source, status);
create index if not exists orders_delivered_at_idx  on public.orders (delivered_at) where delivered_at is not null;
create index if not exists orders_cancelled_at_idx  on public.orders (cancelled_at) where cancelled_at is not null;
