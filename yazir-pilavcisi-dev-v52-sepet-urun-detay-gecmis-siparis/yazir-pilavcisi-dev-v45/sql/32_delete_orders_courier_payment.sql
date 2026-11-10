-- =====================================================================
-- v41 · (1) Geçmiş siparişleri kalıcı silme  (2) Kuryenin teslimde ödeme yöntemini güncellemesi
-- Supabase > SQL Editor'de bir kez çalıştırın (tekrar çalıştırmak güvenli).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Müşterinin ilk seçtiği ödeme yöntemi (kurye teslimde değiştirirse burada kalır)
-- ---------------------------------------------------------------------
alter table public.orders add column if not exists customer_payment_method public.payment_method;

-- ---------------------------------------------------------------------
-- 2) Geçmiş sipariş silme (yalnızca owner / sub_admin; yalnızca teslim edilmiş veya iptal edilmiş siparişler)
--    Sipariş kalemleri, ayrı ödemeler, durum geçmişi, yorum vb. ilişkili kayıtlar otomatik silinir.
--    Silinen siparişin tam kopyası denetim kaydına (audit_logs) yazılır.
-- ---------------------------------------------------------------------
create or replace function public._past_batches_refresh(p_keys text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_keys is null or array_length(p_keys, 1) is null then return; end if;
  update public.past_order_batches b
     set order_count = s.oc, item_count = s.ic, total_amount = s.amt
    from (select batch_key, count(distinct order_no) oc, count(*) ic, coalesce(sum(line_total), 0) amt
            from public.past_order_items where batch_key = any(p_keys) group by batch_key) s
   where b.batch_key = s.batch_key;
  delete from public.past_order_batches b
   where b.batch_key = any(p_keys)
     and not exists (select 1 from public.past_order_items i where i.batch_key = b.batch_key);
end $$;
revoke execute on function public._past_batches_refresh(text[]) from public, anon, authenticated;

create or replace function public.admin_delete_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_role public.app_role := public.current_app_role();
  o      public.orders%rowtype;
  v_items jsonb;
  v_keys text[];
  v_past int := 0;
begin
  if auth.uid() is null or v_role is null or v_role not in ('owner', 'sub_admin') then
    raise exception 'Sipariş silmek için yönetici yetkisi gerekir' using errcode = '42501';
  end if;

  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Sipariş bulunamadı (zaten silinmiş olabilir)' using errcode = 'P0001'; end if;
  if o.status not in ('delivered', 'cancelled') then
    raise exception 'Yalnızca teslim edilmiş veya iptal edilmiş siparişler silinebilir' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) into v_items from public.order_items i where i.order_id = o.id;

  insert into public.audit_logs (table_name, record_id, action, old_data, reason, actor_id, actor_role)
  values ('orders', o.id::text, 'ORDER_DELETED',
          jsonb_build_object('order', to_jsonb(o), 'items', v_items),
          'Geçmiş siparişlerden kalıcı silindi (#' || o.order_no || ')', auth.uid(), v_role);

  -- Aynı platform siparişinin Excel'den yüklenmiş kopyası da gitsin (yoksa listede yeniden görünürdü)
  if o.source in ('trendyol', 'yemeksepeti', 'migros', 'getir', 'other') then
    with d as (
      delete from public.past_order_items
       where platform = o.source
         and order_no = any (array_remove(array[
               nullif(o.pin_code::text, ''),
               nullif(o.external_payload->>'orderNumber', ''),
               nullif(o.external_ref::text, '')], null))
      returning batch_key
    )
    select coalesce(array_agg(distinct batch_key::text), '{}'::text[]), count(*) into v_keys, v_past from d;
    perform public._past_batches_refresh(v_keys);
  end if;

  delete from public.orders where id = o.id;   -- kalemler / ödemeler / geçmiş: ON DELETE CASCADE

  return jsonb_build_object('deleted', true, 'order_no', o.order_no, 'import_rows_removed', v_past);
end $$;
revoke execute on function public.admin_delete_order(uuid) from public, anon;
grant execute on function public.admin_delete_order(uuid) to authenticated;

-- Excel'den yüklenmiş (içe aktarılmış) geçmiş siparişi komple sil
create or replace function public.admin_delete_past_import_order(p_platform text, p_order_no text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_role public.app_role := public.current_app_role();
  v_keys text[];
  v_n    int;
begin
  if auth.uid() is null or v_role is null or v_role not in ('owner', 'sub_admin') then
    raise exception 'Sipariş silmek için yönetici yetkisi gerekir' using errcode = '42501';
  end if;

  with d as (
    delete from public.past_order_items where platform = p_platform and order_no = p_order_no
    returning batch_key
  )
  select coalesce(array_agg(distinct batch_key::text), '{}'::text[]), count(*) into v_keys, v_n from d;

  if v_n = 0 then raise exception 'Sipariş bulunamadı (zaten silinmiş olabilir)' using errcode = 'P0001'; end if;
  perform public._past_batches_refresh(v_keys);

  insert into public.audit_logs (table_name, record_id, action, old_data, reason, actor_id, actor_role)
  values ('past_order_items', p_platform || ':' || p_order_no, 'PAST_ORDER_DELETED',
          jsonb_build_object('platform', p_platform, 'order_no', p_order_no, 'rows', v_n),
          'İçe aktarılan geçmiş sipariş silindi', auth.uid(), v_role);
  return v_n;
end $$;
revoke execute on function public.admin_delete_past_import_order(text, text) from public, anon;
grant execute on function public.admin_delete_past_import_order(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3) Kurye: ödeme yöntemini teslim anında güncelle (nakit / kart-POS / IBAN)
--    Varsayılan her zaman müşterinin siparişte seçtiğidir; kurye kapıda değişirse güncellenir.
--    Yalnızca kendi siparişi, yalnızca "kuryeye atandı / yolda" iken, online ödenmiş siparişlerde değil.
-- ---------------------------------------------------------------------
create or replace function public.courier_set_payment(p_order uuid, p_method text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o     public.orders%rowtype;
  v_new public.payment_method;
begin
  if public.current_app_role() is distinct from 'courier' then
    raise exception 'Yalnızca kuryeler kullanabilir' using errcode = '42501';
  end if;
  if p_method is null or p_method not in ('cash_on_delivery', 'card_on_delivery', 'iban') then
    raise exception 'Geçersiz ödeme yöntemi' using errcode = 'P0001';
  end if;

  select * into o from public.orders where id = p_order and courier_id = auth.uid() for update;
  if not found then raise exception 'Bu sipariş size atanmamış' using errcode = 'P0001'; end if;
  if o.status not in ('assigned', 'on_the_way') then
    raise exception 'Ödeme yöntemi yalnızca teslimat sırasında değiştirilebilir' using errcode = 'P0001';
  end if;
  if o.payment_method is not null and o.payment_method not in ('cash_on_delivery', 'card_on_delivery', 'iban') then
    raise exception 'Online ödenmiş siparişin ödeme yöntemi değiştirilemez' using errcode = 'P0001';
  end if;

  v_new := p_method::public.payment_method;
  if o.payment_method is not distinct from v_new then
    return jsonb_build_object('changed', false, 'payment_method', o.payment_method);
  end if;

  update public.orders
     set customer_payment_method = coalesce(customer_payment_method, o.payment_method),
         payment_method = v_new
   where id = o.id;

  insert into public.audit_logs (table_name, record_id, action, old_data, new_data, reason, actor_id, actor_role)
  values ('orders', o.id::text, 'PAYMENT_METHOD_CHANGED',
          jsonb_build_object('payment_method', o.payment_method),
          jsonb_build_object('payment_method', v_new),
          'Kurye teslimde ödeme yöntemini güncelledi (#' || o.order_no || ')', auth.uid(), 'courier');

  return jsonb_build_object('changed', true, 'payment_method', v_new);
end $$;
revoke execute on function public.courier_set_payment(uuid, text) from public, anon;
grant execute on function public.courier_set_payment(uuid, text) to authenticated;

-- Kurye listesine müşterinin ilk seçtiği yöntem de gelsin (kartta "müşteri talebi" göstermek için)
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
