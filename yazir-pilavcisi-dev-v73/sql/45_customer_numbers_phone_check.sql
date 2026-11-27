-- =====================================================================
-- 45 · MÜŞTERİ NUMARASI + AYNI TELEFON KONTROLÜ (v70)
-- Supabase → SQL Editor'de bir kez çalıştırın (sql/44'ten sonra). Tekrar çalıştırmak güvenlidir.
-- 1) Her müşteriye değişmez bir NUMARA (1001'den başlar): veritabanında customers.customer_no, ekranda "#1001".
--    Mevcut müşteriler kayıt tarihine göre sırayla numaralanır; yenilere otomatik verilir.
-- 2) Telefon kontrolü: aynı numara başka müşteride varsa "#1005 Ahmet Y." diye söyler.
--    * Yeni müşteri eklerken: sessizce birleştirmek (ve adı ezmek) yerine ÖNCE uyarır; kullanıcı onaylarsa birleştirir.
--    * Müşteri telefonunu değiştirirken: başka müşteride kayıtlı bir numaraya değiştirilemez.
-- =====================================================================

-- ---- 1) Numara ----
create sequence if not exists public.customer_no_seq start 1001;
alter table public.customers add column if not exists customer_no bigint;
with ord as (select id, 1000 + row_number() over (order by created_at, id) as n from public.customers where customer_no is null)
update public.customers c set customer_no = ord.n from ord where c.id = ord.id and c.customer_no is null;
select setval('public.customer_no_seq', greatest(1000, coalesce((select max(customer_no) from public.customers), 1000)));
alter table public.customers alter column customer_no set default nextval('public.customer_no_seq');
alter table public.customers alter column customer_no set not null;
create unique index if not exists customers_customer_no_uq on public.customers (customer_no);
-- numara bir kez verilir, sonradan değiştirilemez
create or replace function public._customer_no_immutable() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.customer_no is distinct from old.customer_no then
    raise exception 'Müşteri numarası değiştirilemez' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists customers_no_immutable on public.customers;
create trigger customers_no_immutable before update on public.customers for each row execute function public._customer_no_immutable();

-- ---- 2) Aynı telefon kontrolü (personel, yazarken anında) ----
create or replace function public.staff_check_phone(p_phone text, p_exclude uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_key text := public._phone_key(p_phone);
begin
  if auth.uid() is null
     or not (public.user_has_permission(auth.uid(), 'orders.create') or public.user_has_permission(auth.uid(), 'customers.manage')) then
    raise exception 'Bu işlem için yetkiniz yok' using errcode = '42501';
  end if;
  if v_key is null or length(v_key) < 10 then return jsonb_build_object('matches', '[]'::jsonb); end if;
  return jsonb_build_object('matches', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', c.id, 'customer_no', c.customer_no, 'full_name', c.full_name, 'phone', c.phone,
             'has_account', c.user_id is not null,
             'order_count', (select count(*) from public.orders o where o.customer_id = c.id and o.status <> 'cancelled'))
           order by c.created_at)
      from public.customers c
     where public._phone_key(c.phone) = v_key and (p_exclude is null or c.id <> p_exclude)), '[]'::jsonb));
end $$;

-- ---- 3) Müşteri arama: numara da döner ve numarayla aranabilir ----
drop function if exists public.staff_find_customers(text, int);
create or replace function public.staff_find_customers(p_q text, p_limit int default 8)
returns table (id uuid, full_name text, phone text, notes text, has_account boolean,
               order_count bigint, last_order_at timestamptz, last_address jsonb, customer_no bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q      text := trim(coalesce(p_q, ''));
  v_digits text := regexp_replace(coalesce(p_q, ''), '\D', '', 'g');
  v_no     bigint := case when trim(coalesce(p_q, '')) ~ '^#\s*[0-9]{3,12}$' then regexp_replace(p_q, '\D', '', 'g')::bigint end;
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
             order by o2.created_at desc limit 1)),
         c.customer_no
    from public.customers c
    left join lateral (
      select count(*) filter (where o.status <> 'cancelled') as n, max(o.created_at) as last_at
        from public.orders o where o.customer_id = c.id
    ) s on true
   where (v_no is not null and c.customer_no = v_no)
      or (v_no is null and (c.full_name ilike '%' || v_q || '%'
          or (length(v_digits) >= 3 and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') like '%' || v_digits || '%')))
   order by s.last_at desc nulls last, c.created_at desc
   limit greatest(1, least(coalesce(p_limit, 8), 20));
end $$;

-- ---- 4) Telefon müşterisi kaydet: mevcut numarayı sessizce ezmez ----
-- p_merge=false (varsayılan): numara başka müşteride kayıtlıysa HİÇBİR ŞEY yazmaz, {"duplicate":true,"existing":{...}} döner.
-- p_merge=true: kullanıcı onayladı → mevcut müşterinin bilgileri güncellenir (eski davranış).
drop function if exists public.staff_save_customer(uuid, text, text, text, jsonb);
create or replace function public.staff_save_customer(
  p_customer uuid, p_name text, p_phone text, p_notes text, p_address jsonb default null, p_merge boolean default false)
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
  v_dup     public.customers%rowtype;
begin
  if auth.uid() is null
     or not (public.user_has_permission(auth.uid(), 'orders.create') or public.user_has_permission(auth.uid(), 'customers.manage')) then
    raise exception 'Bu işlem için yetkiniz yok' using errcode = '42501';
  end if;

  if v_phone is not null and v_phone !~ '^[0-9+ ()-]{10,25}$' then
    raise exception 'Telefon numarası geçersiz' using errcode = 'P0001';
  end if;
  v_key := public._phone_key(v_phone);

  -- Aynı numara başka bir müşteride var mı?
  if v_key is not null then
    select c.* into v_dup from public.customers c
     where public._phone_key(c.phone) = v_key and (v_id is null or c.id <> v_id)
     order by c.created_at limit 1;
    if found then
      if not p_merge then
        return jsonb_build_object('duplicate', true, 'existing', jsonb_build_object(
          'id', v_dup.id, 'customer_no', v_dup.customer_no, 'full_name', v_dup.full_name, 'phone', v_dup.phone,
          'has_account', v_dup.user_id is not null,
          'order_count', (select count(*) from public.orders o where o.customer_id = v_dup.id and o.status <> 'cancelled')));
      end if;
      if v_id is null then v_id := v_dup.id; end if;   -- yeni kayıt istenmişti: onayla → mevcut müşteriye işle
    end if;
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

  return jsonb_build_object('customer_id', v_id, 'created', v_created, 'address_id', v_aid,
    'customer_no', (select customer_no from public.customers where id = v_id));
end $$;

-- ---- 5) Yönetici: müşteri listesi numara ile; telefon değişiminde çakışma engeli ----
drop function if exists public.admin_customers();
create or replace function public.admin_customers()
returns table (id uuid, user_id uuid, full_name text, phone text, email text, notes text, loyalty_points int,
               created_at timestamptz, order_count bigint, total_spent numeric, last_order_at timestamptz,
               avg_basket numeric, created_via text, customer_no bigint)
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
         c.created_via, c.customer_no
    from public.customers c
    left join public.orders o on o.customer_id = c.id
   group by c.id
   order by max(o.created_at) desc nulls last, c.created_at desc;
end $$;

create or replace function public.admin_update_customer(p_customer uuid, p_name text, p_phone text, p_notes text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_new text := nullif(trim(p_phone), ''); v_old text; v_dup public.customers%rowtype;
begin
  if public.current_app_role() is null or public.current_app_role() not in ('owner', 'sub_admin', 'operator') then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  select phone into v_old from public.customers where id = p_customer;
  -- yalnızca numara DEĞİŞİYORSA ve başka müşteride kayıtlıysa engelle (eski çift kayıtlar başka düzenlemeyi bozmasın)
  if v_new is not null and public._phone_key(v_new) is distinct from public._phone_key(v_old) then
    select c.* into v_dup from public.customers c
     where public._phone_key(c.phone) = public._phone_key(v_new) and c.id <> p_customer order by c.created_at limit 1;
    if found then
      raise exception 'Bu telefon zaten #% numaralı müşteride kayıtlı: %', v_dup.customer_no, coalesce(nullif(v_dup.full_name, ''), 'İsimsiz') using errcode = 'P0001';
    end if;
  end if;
  update public.customers
     set full_name = coalesce(nullif(trim(p_name), ''), full_name), phone = v_new,
         notes = nullif(trim(p_notes), ''), updated_at = now()
   where id = p_customer;
end $$;

-- ---- Yetkiler ----
revoke execute on function public.staff_check_phone(text, uuid), public.staff_find_customers(text, int),
  public.staff_save_customer(uuid, text, text, text, jsonb, boolean), public.admin_customers(),
  public.admin_update_customer(uuid, text, text, text) from public, anon;
grant execute on function public.staff_check_phone(text, uuid), public.staff_find_customers(text, int),
  public.staff_save_customer(uuid, text, text, text, jsonb, boolean), public.admin_customers(),
  public.admin_update_customer(uuid, text, text, text) to authenticated;
