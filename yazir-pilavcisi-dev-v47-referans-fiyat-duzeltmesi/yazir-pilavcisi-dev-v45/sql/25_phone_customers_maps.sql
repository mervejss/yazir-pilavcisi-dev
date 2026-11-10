-- =====================================================================
-- YAZIR PİLAVCISI · 25 · Telefon müşterileri, siparişi tekrarla, kurye ön ataması
-- Supabase > SQL Editor'e yapıştırıp bir kez çalıştırın. Tekrar çalıştırmak güvenlidir.
-- Önkoşul: 01–24 numaralı dosyalar (özellikle 08_quick_order_support.sql ve 15_coupons_loyalty.sql).
--
--  1) Telefon numarası karşılaştırması biçimden bağımsız olur (0555 123 45 67 = 5551234567 = +90 555 ...).
--  2) Personel müşteri arayabilir, müşterinin adreslerini ve geçmiş siparişlerini görebilir.
--  3) Telefonla arayan, hesabı olmayan müşteri tek adımda kaydedilir (yalnızca personel görür).
--  4) Paket servis siparişi oluşturulurken kurye de atanabilir (staff_create_order_ex).
--  5) assign_courier artık "Yeni" durumundaki siparişe de kurye atar (durum değişmez).
-- =====================================================================

-- ---- 1) Telefon anahtarı: yalnızca rakamlar, son 10 hane -----------------------------------------
create or replace function public._phone_key(p text)
returns text language sql immutable set search_path = '' as $$
  select nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10), '')
$$;

alter table public.customers add column if not exists notes text;
alter table public.customers add column if not exists created_via text;   -- 'phone' = personelin kaydettiği, hesabı olmayan müşteri
create index if not exists customers_phone_key_idx on public.customers (public._phone_key(phone)) where phone is not null;

-- ---- 2) Müşteri arama (ad veya telefon) ----------------------------------------------------------
create or replace function public.staff_find_customers(p_q text, p_limit int default 8)
returns table (id uuid, full_name text, phone text, notes text, has_account boolean,
               order_count bigint, last_order_at timestamptz, last_address jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q      text := trim(coalesce(p_q, ''));
  v_digits text := regexp_replace(coalesce(p_q, ''), '\D', '', 'g');
begin
  perform public._require_permission('orders.create');
  if length(v_q) < 2 then return; end if;

  return query
  select c.id, c.full_name, c.phone, c.notes, (c.user_id is not null),
         coalesce(s.n, 0), s.last_at,
         coalesce(
           (select jsonb_build_object('title', a.title, 'address', a.full_address, 'district', a.district,
                                      'lat', a.lat, 'lng', a.lng)
              from public.customer_addresses a
             where a.customer_id = c.id
             order by a.is_default desc, a.updated_at desc limit 1),
           (select jsonb_build_object('title', 'Son sipariş', 'address', o2.delivery_address, 'district', o2.district,
                                      'lat', o2.lat, 'lng', o2.lng)
              from public.orders o2
             where o2.customer_id = c.id and o2.delivery_address is not null
             order by o2.created_at desc limit 1))
    from public.customers c
    left join lateral (
      select count(*) filter (where o.status <> 'cancelled') as n, max(o.created_at) as last_at
        from public.orders o where o.customer_id = c.id
    ) s on true
   where c.full_name ilike '%' || v_q || '%'
      or (length(v_digits) >= 3 and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') like '%' || v_digits || '%')
   order by s.last_at desc nulls last, c.created_at desc
   limit greatest(1, least(coalesce(p_limit, 8), 20));
end $$;

-- ---- 3) Müşteri kartı: adresler + geçmiş siparişler (tekrarlamak için kalemler dahil) --------------
create or replace function public.staff_customer_history(p_customer uuid, p_limit int default 12)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_res jsonb;
begin
  perform public._require_permission('orders.create');

  select jsonb_build_object(
    'customer', (select jsonb_build_object('id', c.id, 'full_name', c.full_name, 'phone', c.phone,
                                           'notes', c.notes, 'has_account', c.user_id is not null)
                   from public.customers c where c.id = p_customer),
    'addresses', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'title', a.title, 'address', a.full_address,
                                          'district', a.district, 'lat', a.lat, 'lng', a.lng,
                                          'is_default', a.is_default)
                       order by a.is_default desc, a.updated_at desc)
        from public.customer_addresses a where a.customer_id = p_customer), '[]'::jsonb),
    'orders', coalesce((
      select jsonb_agg(t.x order by t.created_at desc)
        from (
          select o.created_at,
                 jsonb_build_object(
                   'id', o.id, 'order_no', o.order_no, 'created_at', o.created_at, 'status', o.status,
                   'order_type', o.order_type, 'source', o.source, 'total', o.total,
                   'payment_method', o.payment_method, 'address', o.delivery_address, 'district', o.district,
                   'lat', o.lat, 'lng', o.lng, 'note', o.note,
                   'items', coalesce((
                     select jsonb_agg(jsonb_build_object(
                              'variant_id', oi.variant_id, 'product_name', oi.product_name,
                              'variant_name', oi.variant_name, 'quantity', oi.quantity,
                              'unit_price', oi.unit_price, 'current_price', pv.price,
                              'is_available', coalesce(pv.is_active and pp.is_active and not pp.is_sold_out, false))
                            order by oi.created_at)
                       from public.order_items oi
                       left join public.product_variants pv on pv.id = oi.variant_id
                       left join public.products pp on pp.id = pv.product_id
                      where oi.order_id = o.id), '[]'::jsonb)) as x
            from public.orders o
           where o.customer_id = p_customer
             and o.status <> 'cancelled'
             and o.order_type in ('delivery', 'pickup')
           order by o.created_at desc
           limit greatest(1, least(coalesce(p_limit, 12), 50))
        ) t), '[]'::jsonb)
  ) into v_res;

  return v_res;
end $$;

-- ---- 4) Telefon müşterisini kaydet / güncelle (+ isteğe bağlı adres) ------------------------------
-- p_address: {"title","address","district","lat","lng","make_default"}
create or replace function public.staff_save_customer(
  p_customer uuid, p_name text, p_phone text, p_notes text, p_address jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_id      uuid := p_customer;
  v_created boolean := false;
  v_phone   text := nullif(left(trim(coalesce(p_phone, '')), 25), '');
  v_name    text := left(trim(coalesce(p_name, '')), 120);
  v_notes   text := nullif(left(trim(coalesce(p_notes, '')), 1000), '');
  v_key     text;
  v_addr    text;
  v_lat     numeric;
  v_lng     numeric;
  v_aid     uuid;
begin
  if auth.uid() is null
     or not (public.user_has_permission(auth.uid(), 'orders.create') or public.user_has_permission(auth.uid(), 'customers.manage')) then
    raise exception 'Bu işlem için yetkiniz yok' using errcode = '42501';
  end if;

  if v_phone is not null and v_phone !~ '^[0-9+ ()-]{10,25}$' then
    raise exception 'Telefon numarası geçersiz' using errcode = 'P0001';
  end if;
  v_key := public._phone_key(v_phone);

  if v_id is null and v_key is not null then
    select c.id into v_id from public.customers c
     where public._phone_key(c.phone) = v_key order by c.created_at limit 1;
  end if;

  if v_id is null then
    if v_name = '' and v_phone is null then
      raise exception 'En az ad veya telefon girin' using errcode = 'P0001';
    end if;
    insert into public.customers (full_name, phone, notes, created_via)
    values (v_name, v_phone, v_notes, 'phone') returning id into v_id;
    v_created := true;
  else
    update public.customers
       set full_name = coalesce(nullif(v_name, ''), full_name),
           phone = coalesce(v_phone, phone),
           notes = coalesce(v_notes, notes),
           updated_at = now()
     where id = v_id;
    if not found then raise exception 'Müşteri bulunamadı' using errcode = 'P0001'; end if;
  end if;

  -- adres
  v_addr := nullif(left(trim(coalesce(p_address->>'address', '')), 500), '');
  if v_addr is not null then
    v_lat := nullif(p_address->>'lat', '')::numeric;
    v_lng := nullif(p_address->>'lng', '')::numeric;
    if (v_lat is not null and v_lat not between -90 and 90) or (v_lng is not null and v_lng not between -180 and 180) then
      raise exception 'Konum bilgisi geçersiz' using errcode = 'P0001';
    end if;

    select a.id into v_aid from public.customer_addresses a
     where a.customer_id = v_id and lower(trim(a.full_address)) = lower(v_addr) limit 1;

    if v_aid is null then
      insert into public.customer_addresses (customer_id, title, full_address, district, lat, lng, is_default)
      values (v_id, coalesce(nullif(left(trim(coalesce(p_address->>'title', '')), 40), ''), 'Adres'), v_addr,
              nullif(left(trim(coalesce(p_address->>'district', '')), 80), ''), v_lat, v_lng,
              not exists (select 1 from public.customer_addresses where customer_id = v_id))
      returning id into v_aid;
    else
      update public.customer_addresses
         set lat = coalesce(v_lat, lat), lng = coalesce(v_lng, lng),
             district = coalesce(nullif(left(trim(coalesce(p_address->>'district', '')), 80), ''), district),
             updated_at = now()
       where id = v_aid;
    end if;

    if coalesce((p_address->>'make_default')::boolean, false) then
      update public.customer_addresses set is_default = false where customer_id = v_id and id <> v_aid and is_default;
      update public.customer_addresses set is_default = true where id = v_aid;
    end if;
  end if;

  return jsonb_build_object('customer_id', v_id, 'created', v_created, 'address_id', v_aid);
end $$;

-- ---- 5) Personel siparişi: müşteri eşleme + adres + kurye ön ataması ------------------------------
create or replace function public.staff_create_order_ex(
  p_source text, p_type public.order_type, p_customer jsonb, p_items jsonb,
  p_table_id uuid default null, p_payment public.payment_method default null,
  p_note text default null, p_courier_id uuid default null, p_save_address boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_c        jsonb := coalesce(p_customer, '{}'::jsonb);
  v_phone    text := nullif(trim(coalesce(v_c->>'phone', '')), '');
  v_key      text;
  v_ex_id    uuid;
  v_ex_phone text;
  v_ex_name  text;
  v_res      jsonb;
  v_oid      uuid;
  v_cid      uuid;
  v_addr     text := nullif(trim(coalesce(v_c->>'address', '')), '');
  v_lat      numeric := nullif(v_c->>'lat', '')::numeric;
  v_lng      numeric := nullif(v_c->>'lng', '')::numeric;
begin
  perform public._require_permission('orders.create');

  if p_courier_id is not null then
    perform public._require_permission('orders.assign_courier');
    if p_type <> 'delivery' then
      raise exception 'Kurye yalnızca paket servis siparişlerine atanır' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.profiles p where p.id = p_courier_id and p.role = 'courier' and p.is_active) then
      raise exception 'Geçerli ve aktif bir kurye seçin' using errcode = 'P0001';
    end if;
  end if;

  -- Aynı telefon farklı yazılmış olsa bile mevcut müşteriyle eşleştir (çift kayıt oluşmasın)
  v_key := public._phone_key(v_phone);
  if v_key is not null then
    select c.id, c.phone, c.full_name into v_ex_id, v_ex_phone, v_ex_name
      from public.customers c where public._phone_key(c.phone) = v_key
     order by c.created_at desc limit 1;
    if v_ex_id is not null and v_ex_phone is not null then
      v_c := jsonb_set(v_c, '{phone}', to_jsonb(v_ex_phone));
    end if;
    if v_ex_id is not null and coalesce(trim(v_c->>'name'), '') = '' and coalesce(trim(v_ex_name), '') <> '' then
      v_c := jsonb_set(v_c, '{name}', to_jsonb(v_ex_name));
    end if;
  end if;

  v_res := public._create_order(p_source, p_type, v_c, p_items, p_table_id, p_payment, p_note,
                                auth.uid(), true, p_save_address);
  v_oid := (v_res->>'order_id')::uuid;

  select o.customer_id into v_cid from public.orders o where o.id = v_oid;

  if v_cid is not null then
    -- yeni açılan müşteri: telefonla kaydedildi (hesabı yok, yalnızca personel görür)
    if v_ex_id is null then
      update public.customers set created_via = coalesce(created_via, 'phone') where id = v_cid;
    end if;
    -- aynı adres daha önce konumsuz kaydedildiyse konumu tamamla
    if v_addr is not null and v_lat is not null and v_lng is not null then
      update public.customer_addresses
         set lat = v_lat, lng = v_lng, updated_at = now()
       where customer_id = v_cid and lower(trim(full_address)) = lower(v_addr) and (lat is null or lng is null);
    end if;
  end if;

  if p_courier_id is not null then
    update public.orders set courier_id = p_courier_id where id = v_oid;
  end if;

  return v_res || jsonb_build_object('customer_id', v_cid, 'customer_created', (v_cid is not null and v_ex_id is null),
                                     'courier_id', p_courier_id);
end $$;

-- ---- 6) Kurye atama: "Yeni" siparişe de atanabilsin (durum değişmez) --------------------------------
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
  if v_o.status not in ('new', 'preparing', 'ready', 'assigned', 'on_the_way') then
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
    v_new_status := case when v_o.status in ('new', 'preparing') then v_o.status else 'assigned' end;
  end if;

  update public.orders set courier_id = p_courier_id, status = v_new_status where id = p_order_id;
  return jsonb_build_object('order_id', p_order_id, 'status', v_new_status, 'courier_id', p_courier_id);
end $$;

-- ---- 7) Yönetici müşteri listesi: "telefonla kaydedildi" bilgisi eklendi ----------------------------
drop function if exists public.admin_customers();
create or replace function public.admin_customers()
returns table (id uuid, user_id uuid, full_name text, phone text, email text, notes text, loyalty_points int,
               created_at timestamptz, order_count bigint, total_spent numeric, last_order_at timestamptz,
               avg_basket numeric, created_via text)
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
         coalesce(avg(o.total) filter (where o.status = 'delivered'), 0),
         c.created_via
    from public.customers c
    left join public.orders o on o.customer_id = c.id
   group by c.id
   order by max(o.created_at) desc nulls last, c.created_at desc;
end $$;

-- ---- Yetkiler ------------------------------------------------------------------------------------
revoke execute on function
  public.staff_find_customers(text, int),
  public.staff_customer_history(uuid, int),
  public.staff_save_customer(uuid, text, text, text, jsonb),
  public.staff_create_order_ex(text, public.order_type, jsonb, jsonb, uuid, public.payment_method, text, uuid, boolean),
  public.admin_customers()
from public, anon;
grant execute on function
  public.staff_find_customers(text, int),
  public.staff_customer_history(uuid, int),
  public.staff_save_customer(uuid, text, text, text, jsonb),
  public.staff_create_order_ex(text, public.order_type, jsonb, jsonb, uuid, public.payment_method, text, uuid, boolean),
  public.admin_customers()
to authenticated;
