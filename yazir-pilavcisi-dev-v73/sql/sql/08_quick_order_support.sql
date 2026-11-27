-- =====================================================================
-- YAZIR PİLAVCISI · 08 · Hızlı Sipariş Desteği (Restoran Gel-Al & Masada Hızlı Sipariş)
-- Bu dosyayı Supabase SQL Editor üzerinden bir kez çalıştırarak
-- personelin telefon ve adres girmeden hızlıca sipariş almasını sağlayabilirsiniz.
-- =====================================================================

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

  -- Telefon kontrolü: personel siparişinde veya boş girilmişse esnek davran
  if not p_is_staff and v_phone is not null and v_phone !~ '^[0-9+ ()-]{10,25}$' then
    raise exception 'Telefon numarası geçersiz' using errcode = 'P0001';
  end if;

  -- Teslimat için ad, telefon ve adres zorunludur
  if p_type = 'delivery' and (v_name is null or v_phone is null or v_addr is null) then
    raise exception 'Teslimat için ad, telefon ve adres zorunludur' using errcode = 'P0001';
  end if;

  -- Gel-al siparişinde yalnızca normal web müşterisi için ad/tel istenir; personel hızlıca alabilir
  if not p_is_staff and p_type = 'pickup' and (v_name is null or v_phone is null) then
    raise exception 'Gel-al siparişi için ad ve telefon zorunludur' using errcode = 'P0001';
  end if;

  -- İsimsiz hızlı siparişlerde varsayılan isim ata
  if v_name is null then
    if p_type = 'pickup' then
      v_name := 'Gel-Al Müşteri';
    elsif p_type = 'dine_in' then
      v_name := 'Masa Misafiri';
    end if;
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
      v_fee := greatest((p_customer->>'delivery_fee')::numeric, 0);
    end if;
  end if;
  v_total := v_subtotal + v_fee;

  -- ödeme
  if v_is_platform then
    v_payment := 'platform_online'; v_pay_status := 'paid';
  elsif p_type = 'dine_in' then
    v_payment := null; -- masa hesabı kapanırken belirlenir
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
    v_customer := public.my_customer_id();
  elsif v_phone is not null and v_phone !~ '^0500' then
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
