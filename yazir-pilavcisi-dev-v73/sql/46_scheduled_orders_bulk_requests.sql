-- =====================================================================
-- 46 · İLERİ TARİHLİ (PLANLI) SİPARİŞ + TOPLU SİPARİŞ TALEPLERİ (v71)
-- Supabase → SQL Editor'de bir kez çalıştırın (sql/45'ten sonra). Tekrar çalıştırmak güvenlidir.
-- 1) orders.scheduled_for: müşteri "akşam şu saatte getir" dediğinde sipariş o saate planlanır;
--    panoda/kuryede/gecikme uyarılarında süre planlanan saatten sayılır ("saatlerce gecikmiş" görünmez).
--    Süre raporları da planlı siparişi planlı saatten ölçer.
-- 2) Toplu sipariş talepleri: yönetici de talep girebilir (kaynak: yönetici); organizasyon türü ve teslim adresi isteğe bağlı;
--    talep durumu/notu/siparişe bağlama için alanlar eklendi; sitedeki formdan gelenler artık yönetimde görülür.
-- =====================================================================

-- ---- 1) Planlı sipariş ----
alter table public.orders add column if not exists scheduled_for timestamptz;
create index if not exists orders_scheduled_idx on public.orders (scheduled_for) where scheduled_for is not null;

drop function if exists public.staff_create_order_ex(text, public.order_type, jsonb, jsonb, uuid, public.payment_method, text, uuid, boolean);
create or replace function public.staff_create_order_ex(
  p_source text, p_type public.order_type, p_customer jsonb, p_items jsonb,
  p_table_id uuid default null, p_payment public.payment_method default null,
  p_note text default null, p_courier_id uuid default null, p_save_address boolean default true,
  p_scheduled_for timestamptz default null)
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

  -- İleri tarihli (planlı) sipariş: yalnızca teslimat/gel-al; geçmiş olamaz; en fazla 120 gün sonrası
  if p_scheduled_for is not null then
    if p_type = 'dine_in' then
      raise exception 'Masa siparişi ileri tarihe planlanamaz' using errcode = 'P0001';
    end if;
    if p_scheduled_for < now() - interval '5 minutes' then
      raise exception 'Planlanan tarih/saat geçmişte olamaz' using errcode = 'P0001';
    end if;
    if p_scheduled_for > now() + interval '120 days' then
      raise exception 'Planlanan tarih çok ileride (en fazla 120 gün)' using errcode = 'P0001';
    end if;
  end if;

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
  if p_scheduled_for is not null then
    update public.orders set scheduled_for = p_scheduled_for where id = v_oid;
  end if;

  return v_res || jsonb_build_object('customer_id', v_cid, 'customer_created', (v_cid is not null and v_ex_id is null),
                                     'courier_id', p_courier_id, 'scheduled_for', p_scheduled_for);
end $$;

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
      o.id, o.order_no, o.status, o.created_at, o.scheduled_for, o.total, o.payment_method, o.customer_payment_method, o.district,
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

-- süre raporları: planlı siparişte süre planlanan saatten
create or replace function public.report_order_timings(p_from timestamptz, p_to timestamptz)
returns table (delivered_orders bigint, avg_accept_min numeric, avg_prepare_min numeric,
               avg_wait_courier_min numeric, avg_delivery_min numeric, avg_total_min numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._require_permission('reports.view');
  return query
  select count(*),
         round((avg(greatest(0, extract(epoch from (o.accepted_at - coalesce(o.scheduled_for, o.created_at))))) / 60)::numeric, 1),
         round((avg(extract(epoch from (o.ready_at - o.accepted_at))) / 60)::numeric, 1),
         round((avg(extract(epoch from (o.picked_up_at - o.ready_at))) / 60)::numeric, 1),
         round((avg(extract(epoch from (o.delivered_at - o.picked_up_at))) / 60)::numeric, 1),
         round((avg(greatest(0, extract(epoch from (o.delivered_at - coalesce(o.scheduled_for, o.created_at))))) / 60)::numeric, 1)
    from public.orders o
   where o.status = 'delivered' and o.created_at >= p_from and o.created_at < p_to;
end $$;

create or replace function public.report_customer_overview(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v jsonb;
begin
  if public.current_app_role() is null or public.current_app_role() not in ('owner', 'sub_admin', 'operator') then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;

  with ob as (   -- aralıktaki iptal olmayan siparişler
    select o.id, o.customer_id, o.total, o.status, o.order_type, o.source, o.payment_method, o.district,
           o.created_at, o.delivered_at,
           extract(hour from o.created_at at time zone 'Europe/Istanbul')::int as h,
           extract(isodow from o.created_at at time zone 'Europe/Istanbul')::int as dow,
           (o.created_at at time zone 'Europe/Istanbul')::date as dday
      from public.orders o
     where o.created_at >= p_from and o.created_at < p_to and o.status <> 'cancelled'
  ),
  cs as (        -- müşteri başına tüm zamanlar
    select o.customer_id as cid,
           count(*) filter (where o.status <> 'cancelled') as n,
           coalesce(sum(o.total) filter (where o.status = 'delivered'), 0) as spent,
           min(o.created_at) filter (where o.status <> 'cancelled') as first_at,
           max(o.created_at) filter (where o.status <> 'cancelled') as last_at
      from public.orders o
     where o.customer_id is not null
     group by o.customer_id
  ),
  gaps as (      -- iki sipariş arası gün
    select x.created_at, extract(epoch from (x.created_at - x.prev)) / 86400.0 as gap_days
      from (select o.created_at, lag(o.created_at) over (partition by o.customer_id order by o.created_at) as prev
              from public.orders o where o.customer_id is not null and o.status <> 'cancelled') x
     where x.prev is not null and x.created_at >= p_from and x.created_at < p_to
  ),
  act as (select distinct ob.customer_id as cid from ob where ob.customer_id is not null)
  select jsonb_build_object(
    'summary', jsonb_build_object(
      'total_customers', (select count(*) from public.customers),
      'new_customers', (select count(*) from public.customers c where c.created_at >= p_from and c.created_at < p_to),
      'members', (select count(*) from public.customers c where c.user_id is not null),
      'active_customers', (select count(*) from act),
      'returning_customers', (select count(*) from act a join cs on cs.cid = a.cid where cs.first_at < p_from),
      'first_time_buyers', (select count(*) from act a join cs on cs.cid = a.cid where cs.first_at >= p_from),
      'repeat_rate', (select round((100.0 * count(*) filter (where cs.n >= 2) / nullif(count(*) filter (where cs.n >= 1), 0))::numeric, 1) from cs),
      'order_count', (select count(*) from ob),
      'guest_orders', (select count(*) from ob where ob.customer_id is null),
      'revenue', (select coalesce(sum(ob.total), 0) from ob),
      'member_revenue', (select coalesce(sum(ob.total), 0) from ob where ob.customer_id is not null),
      'avg_basket', (select coalesce(round(avg(ob.total)::numeric, 2), 0) from ob),
      'avg_orders_per_active', (select coalesce(round((count(*)::numeric / nullif((select count(*) from act), 0)), 2), 0)
                                  from ob where ob.customer_id is not null),
      'avg_days_between_orders', (select round(avg(g.gap_days)::numeric, 1) from gaps g),
      'avg_lifetime_value', (select coalesce(round(avg(cs.spent)::numeric, 2), 0) from cs where cs.n >= 1),
      'cancelled_orders', (select count(*) from public.orders o where o.created_at >= p_from and o.created_at < p_to and o.status = 'cancelled'),
      'avg_wait_min', (select round((avg(greatest(0, extract(epoch from (ob.delivered_at - coalesce(ob.scheduled_for, ob.created_at))))) / 60.0)::numeric, 1)
                         from ob where ob.status = 'delivered' and ob.delivered_at is not null),
      'points_outstanding', (select coalesce(sum(c.loyalty_points), 0) from public.customers c)
    ),
    'segments', jsonb_build_object(
      'vip', (select count(*) from cs where cs.spent >= 1500 or cs.n >= 10),
      'loyal', (select count(*) from cs where cs.n >= 5 and not (cs.spent >= 1500 or cs.n >= 10)),
      'regular', (select count(*) from cs where cs.n between 2 and 4 and not (cs.spent >= 1500)),
      'one_time', (select count(*) from cs where cs.n = 1 and not (cs.spent >= 1500)),
      'never_ordered', (select count(*) from public.customers c where not exists (select 1 from cs where cs.cid = c.id and cs.n >= 1)),
      'sleeping', (select count(*) from cs where cs.n >= 1 and cs.last_at < now() - interval '45 days'),
      'new_14d', (select count(*) from public.customers c where c.created_at > now() - interval '14 days')
    ),
    'hourly', coalesce((
      select jsonb_agg(jsonb_build_object('hour', g.h, 'count', coalesce(x.c, 0), 'revenue', coalesce(x.rev, 0)) order by g.h)
        from generate_series(0, 23) g(h)
        left join (select ob.h, count(*) as c, sum(ob.total) as rev from ob group by ob.h) x on x.h = g.h
    ), '[]'::jsonb),
    'weekday', coalesce((
      select jsonb_agg(jsonb_build_object('dow', g.w, 'count', coalesce(x.c, 0), 'revenue', coalesce(x.rev, 0)) order by g.w)
        from generate_series(1, 7) g(w)
        left join (select ob.dow, count(*) as c, sum(ob.total) as rev from ob group by ob.dow) x on x.dow = g.w
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', x.dday, 'count', x.c, 'revenue', x.rev, 'customers', x.cu) order by x.dday)
        from (select ob.dday, count(*) as c, sum(ob.total) as rev, count(distinct ob.customer_id) as cu from ob group by ob.dday) x
    ), '[]'::jsonb),
    'districts', coalesce((
      select jsonb_agg(jsonb_build_object('district', x.dn, 'count', x.c, 'revenue', x.rev) order by x.c desc, x.dn)
        from (select coalesce(nullif(ob.district, ''), 'Belirtilmemiş') as dn, count(*) as c, sum(ob.total) as rev
                from ob where ob.order_type = 'delivery' group by 1 order by count(*) desc limit 10) x
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('method', x.pm, 'count', x.c, 'revenue', x.rev) order by x.c desc)
        from (select coalesce(ob.payment_method::text, 'unknown') as pm, count(*) as c, sum(ob.total) as rev from ob group by 1) x
    ), '[]'::jsonb),
    'order_types', coalesce((
      select jsonb_agg(jsonb_build_object('type', x.t, 'count', x.c, 'revenue', x.rev) order by x.c desc)
        from (select ob.order_type::text as t, count(*) as c, sum(ob.total) as rev from ob group by 1) x
    ), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object('source', x.s, 'count', x.c, 'revenue', x.rev) order by x.c desc)
        from (select ob.source as s, count(*) as c, sum(ob.total) as rev from ob group by 1) x
    ), '[]'::jsonb),
    'top_products', coalesce((
      select jsonb_agg(jsonb_build_object('name', x.pn, 'qty', x.q, 'revenue', x.rev) order by x.q desc)
        from (select oi.product_name as pn, sum(oi.quantity) as q, sum(oi.line_total) as rev
                from public.order_items oi join ob on ob.id = oi.order_id
               group by oi.product_name order by sum(oi.quantity) desc limit 10) x
    ), '[]'::jsonb),
    'top_customers', coalesce((
      select jsonb_agg(jsonb_build_object('customer_id', x.cid, 'name', x.fn, 'phone', x.ph, 'orders', x.n, 'spent', x.sp) order by x.sp desc)
        from (select c.id as cid, c.full_name as fn, c.phone as ph, count(*) as n, sum(ob.total) as sp
                from ob join public.customers c on c.id = ob.customer_id
               group by c.id, c.full_name, c.phone order by sum(ob.total) desc limit 10) x
    ), '[]'::jsonb)
  ) into v;

  return v;
end $$;

create or replace function public.report_customer_detail(p_customer uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v jsonb;
begin
  if public.current_app_role() is null or public.current_app_role() not in ('owner', 'sub_admin', 'operator') then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;

  with ao as (   -- müşterinin tüm siparişleri
    select o.id, o.order_no, o.status, o.order_type, o.total, o.payment_method, o.district, o.courier_id,
           o.created_at, o.delivered_at,
           extract(hour from o.created_at at time zone 'Europe/Istanbul')::int as h,
           extract(isodow from o.created_at at time zone 'Europe/Istanbul')::int as dow
      from public.orders o where o.customer_id = p_customer
  ),
  ok as (select * from ao where ao.status <> 'cancelled'),
  gaps as (
    select extract(epoch from (x.created_at - x.prev)) / 86400.0 as gap_days
      from (select ok.created_at, lag(ok.created_at) over (order by ok.created_at) as prev from ok) x
     where x.prev is not null
  )
  select jsonb_build_object(
    'summary', (
      select jsonb_build_object(
        'order_count', count(*),
        'delivered_count', count(*) filter (where ok.status = 'delivered'),
        'cancelled_count', (select count(*) from ao where ao.status = 'cancelled'),
        'total_spent', coalesce(sum(ok.total) filter (where ok.status = 'delivered'), 0),
        'avg_basket', coalesce(round(avg(ok.total)::numeric, 2), 0),
        'max_basket', coalesce(max(ok.total), 0),
        'first_order_at', min(ok.created_at),
        'last_order_at', max(ok.created_at),
        'days_since_last', case when max(ok.created_at) is null then null
                                else floor(extract(epoch from (now() - max(ok.created_at))) / 86400.0) end,
        'avg_interval_days', (select round(avg(g.gap_days)::numeric, 1) from gaps g),
        'avg_wait_min', round((avg(greatest(0, extract(epoch from (ok.delivered_at - coalesce(ok.scheduled_for, ok.created_at))))) filter (where ok.status = 'delivered' and ok.delivered_at is not null) / 60.0)::numeric, 1),
        'delivery_orders', count(*) filter (where ok.order_type = 'delivery'),
        'pickup_orders', count(*) filter (where ok.order_type = 'pickup'),
        'dine_in_orders', count(*) filter (where ok.order_type = 'dine_in')
      ) from ok),
    'hourly', coalesce((
      select jsonb_agg(jsonb_build_object('hour', g.h, 'count', coalesce(x.c, 0)) order by g.h)
        from generate_series(0, 23) g(h)
        left join (select ok.h, count(*) as c from ok group by ok.h) x on x.h = g.h
    ), '[]'::jsonb),
    'weekday', coalesce((
      select jsonb_agg(jsonb_build_object('dow', g.w, 'count', coalesce(x.c, 0)) order by g.w)
        from generate_series(1, 7) g(w)
        left join (select ok.dow, count(*) as c from ok group by ok.dow) x on x.dow = g.w
    ), '[]'::jsonb),
    'monthly', coalesce((
      select jsonb_agg(jsonb_build_object('month', to_char(g.m, 'YYYY-MM'), 'count', coalesce(x.c, 0), 'spent', coalesce(x.sp, 0)) order by g.m)
        from generate_series(date_trunc('month', (now() at time zone 'Europe/Istanbul')) - interval '11 months',
                             date_trunc('month', (now() at time zone 'Europe/Istanbul')), interval '1 month') g(m)
        left join (select date_trunc('month', ok.created_at at time zone 'Europe/Istanbul') as m, count(*) as c, sum(ok.total) as sp
                     from ok group by 1) x on x.m = g.m
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('method', x.pm, 'count', x.c) order by x.c desc)
        from (select coalesce(ok.payment_method::text, 'unknown') as pm, count(*) as c from ok group by 1) x
    ), '[]'::jsonb),
    'districts', coalesce((
      select jsonb_agg(jsonb_build_object('district', x.dn, 'count', x.c) order by x.c desc, x.dn)
        from (select coalesce(nullif(ok.district, ''), 'Belirtilmemiş') as dn, count(*) as c
                from ok where ok.order_type = 'delivery' group by 1 order by count(*) desc limit 5) x
    ), '[]'::jsonb),
    'favorite_products', coalesce((
      select jsonb_agg(jsonb_build_object('name', x.pn, 'qty', x.q, 'orders', x.n, 'spent', x.sp) order by x.q desc)
        from (select oi.product_name as pn, sum(oi.quantity) as q, count(distinct oi.order_id) as n, sum(oi.line_total) as sp
                from public.order_items oi join ok on ok.id = oi.order_id
               group by oi.product_name order by sum(oi.quantity) desc limit 8) x
    ), '[]'::jsonb),
    'couriers', coalesce((
      select jsonb_agg(jsonb_build_object('courier_id', x.cid, 'name', x.fn, 'count', x.c) order by x.c desc)
        from (select ok.courier_id as cid, p.full_name as fn, count(*) as c
                from ok join public.profiles p on p.id = ok.courier_id
               where ok.status = 'delivered' group by ok.courier_id, p.full_name order by count(*) desc limit 5) x
    ), '[]'::jsonb)
  ) into v;

  return v;
end $$;

-- ---- 2) Toplu sipariş talepleri ----
alter table public.bulk_order_requests
  add column if not exists source       text not null default 'web' check (source in ('web', 'admin')),
  add column if not exists created_by   uuid references public.profiles(id) on delete set null,
  add column if not exists admin_note   text check (admin_note is null or char_length(admin_note) <= 2000),
  add column if not exists contacted_at timestamptz,
  add column if not exists order_id     uuid references public.orders(id) on delete set null;
alter table public.bulk_order_requests alter column event_type drop not null;      -- organizasyon türü zorunlu değil
alter table public.bulk_order_requests alter column event_type drop default;
alter table public.bulk_order_requests alter column delivery_address drop not null; -- gel-al / sonra netleşecek talepler için

-- Sitedeki anonim form yalnızca kendi alanlarını yazabilsin (kaynak/yönetici alanları taklit edilemesin)
drop policy if exists bulk_insert on public.bulk_order_requests;
create policy bulk_insert on public.bulk_order_requests for insert to anon, authenticated
  with check (status = 'new' and handled_by is null and source = 'web' and created_by is null
              and admin_note is null and contacted_at is null and order_id is null);

-- Durum değişince "kim ilgilendi / ne zaman arandı" otomatik işlensin
create or replace function public._bulk_request_touch() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    if new.handled_by is null and auth.uid() is not null then new.handled_by := auth.uid(); end if;
    if new.status = 'contacted' and new.contacted_at is null then new.contacted_at := now(); end if;
  end if;
  return new;
end $$;
drop trigger if exists bulk_request_touch on public.bulk_order_requests;
create trigger bulk_request_touch before update on public.bulk_order_requests for each row execute function public._bulk_request_touch();

-- Yönetici kendi girdiği talep için kendine bildirim düşmesin
create or replace function public.notify_on_bulk_request()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.source = 'admin' then return null; end if;
  perform public._notify_staff('orders.view', 'bulk_request', 'Yeni toplu sipariş talebi',
                               new.full_name || ' · ' || new.people_count || ' kişi/ürün',
                               jsonb_build_object('bulk_request_id', new.id));
  return null;
end $$;

-- Yönetici: toplu sipariş talebi gir
create or replace function public.admin_create_bulk_request(
  p_name text, p_phone text, p_event_type text, p_count int, p_delivery_at timestamptz, p_address text, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_name text := left(trim(coalesce(p_name, '')), 120); v_phone text := left(trim(coalesce(p_phone, '')), 25);
begin
  perform public._require_permission('orders.create');
  if v_name = '' then raise exception 'Ad soyad yazın' using errcode = 'P0001'; end if;
  if char_length(v_phone) < 7 then raise exception 'Geçerli bir telefon yazın' using errcode = 'P0001'; end if;
  if p_count is null or p_count < 1 or p_count > 100000 then raise exception 'Kişi / ürün sayısı geçersiz' using errcode = 'P0001'; end if;
  if p_delivery_at is null then raise exception 'Teslim tarihi ve saati seçin' using errcode = 'P0001'; end if;
  insert into public.bulk_order_requests (full_name, phone, event_type, people_count, delivery_at, delivery_address, note, source, created_by)
  values (v_name, v_phone, nullif(left(trim(coalesce(p_event_type, '')), 60), ''), p_count, p_delivery_at,
          nullif(left(trim(coalesce(p_address, '')), 500), ''), nullif(left(trim(coalesce(p_note, '')), 1000), ''), 'admin', auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

-- ---- Yetkiler ----
revoke execute on function public.staff_create_order_ex(text, public.order_type, jsonb, jsonb, uuid, public.payment_method, text, uuid, boolean, timestamptz),
  public.admin_create_bulk_request(text, text, text, int, timestamptz, text, text) from public, anon;
grant execute on function public.staff_create_order_ex(text, public.order_type, jsonb, jsonb, uuid, public.payment_method, text, uuid, boolean, timestamptz),
  public.admin_create_bulk_request(text, text, text, int, timestamptz, text, text) to authenticated;
