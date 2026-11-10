-- =====================================================================
-- YAZIR PİLAVCISI · 04 · Raporlar (RPC) ve görünümler
-- 03_rls_policies.sql'den SONRA çalıştırın.
-- Tüm raporlar 'reports.view' yetkisi ister (varsayılan: yalnızca sahip).
-- Parametreler: p_from (dahil), p_to (hariç) → ISO zaman damgası. İptaller cirodan hariçtir.
-- Saat dilimi: Europe/Istanbul · "gün" = iş günü (sabah 03:00'te değişir)
-- =====================================================================

-- Panel için canlı kurye görünümü (RLS çağıranın yetkisiyle işler)
create or replace view public.v_couriers_live with (security_invoker = true) as
select
  p.id            as courier_id,
  p.full_name,
  p.phone,
  p.is_active,
  cp.is_online,
  cp.vehicle_type,
  cp.plate,
  l.lat,
  l.lng,
  l.heading,
  l.speed,
  l.accuracy,
  l.battery,
  l.updated_at    as location_updated_at,
  (select count(*) from public.orders o
    where o.courier_id = p.id and o.status in ('assigned', 'on_the_way')) as active_order_count
from public.profiles p
join public.courier_profiles cp on cp.user_id = p.id
left join public.courier_locations l on l.courier_id = p.id
where p.role = 'courier';

grant select on public.v_couriers_live to authenticated;

-- ---------------------------------------------------------------------
-- Özet: sipariş sayısı, ciro, ortalama sepet, en yoğun saat
-- ---------------------------------------------------------------------
create or replace function public.report_summary(p_from timestamptz, p_to timestamptz)
returns table (order_count bigint, delivered_count bigint, cancelled_count bigint,
               revenue numeric, avg_basket numeric, peak_hour integer)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._require_permission('reports.view');
  return query
  with o as (
    select * from public.orders where created_at >= p_from and created_at < p_to
  ),
  hrs as (
    select extract(hour from created_at at time zone 'Europe/Istanbul')::int as h, count(*) as c
      from o where status <> 'cancelled' group by 1 order by c desc, h limit 1
  )
  select count(*),
         count(*) filter (where status = 'delivered'),
         count(*) filter (where status = 'cancelled'),
         coalesce(sum(total) filter (where status <> 'cancelled'), 0)::numeric,
         coalesce(round(avg(total) filter (where status <> 'cancelled'), 2), 0)::numeric,
         (select h from hrs)
    from o;
end $$;

-- Günlük sipariş ve ciro (boş günler 0 olarak gelir)
create or replace function public.report_daily(p_from timestamptz, p_to timestamptz)
returns table (day date, order_count bigint, revenue numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._require_permission('reports.view');
  return query
  with days as (
    select generate_series(public.business_day(p_from)::timestamp, public.business_day(p_to - interval '1 second')::timestamp, interval '1 day')::date as d
  ),
  x as (
    select public.business_day(o.created_at) as bd, count(*) as c, sum(o.total) as s
      from public.orders o
     where o.created_at >= p_from and o.created_at < p_to and o.status <> 'cancelled'
     group by 1
  )
  select days.d, coalesce(x.c, 0)::bigint, coalesce(x.s, 0)::numeric
    from days left join x on x.bd = days.d
   order by days.d;
end $$;

-- Hangi gün hangi saat yoğun? (dow: 1=Pzt ... 7=Paz, iş gününe göre)
create or replace function public.report_hourly_heatmap(p_from timestamptz, p_to timestamptz)
returns table (dow integer, hour_of_day integer, order_count bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._require_permission('reports.view');
  return query
  select extract(isodow from ((o.created_at at time zone 'Europe/Istanbul') - interval '3 hours'))::int,
         extract(hour from (o.created_at at time zone 'Europe/Istanbul'))::int,
         count(*)
    from public.orders o
   where o.created_at >= p_from and o.created_at < p_to and o.status <> 'cancelled'
   group by 1, 2
   order by 1, 2;
end $$;

-- Ürün bazlı satış
create or replace function public.report_top_products(p_from timestamptz, p_to timestamptz, p_limit integer default 10)
returns table (product_id uuid, product_name text, quantity bigint, revenue numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._require_permission('reports.view');
  return query
  select i.product_id, i.product_name, sum(i.quantity)::bigint, sum(i.line_total)::numeric
    from public.order_items i
    join public.orders o on o.id = i.order_id
   where o.created_at >= p_from and o.created_at < p_to and o.status <> 'cancelled'
   group by i.product_id, i.product_name
   order by sum(i.quantity) desc, i.product_name
   limit greatest(p_limit, 1);
end $$;

-- Kaynağa göre dağılım + tahmini komisyon
create or replace function public.report_by_source(p_from timestamptz, p_to timestamptz)
returns table (source text, label text, color text, is_platform boolean, order_count bigint,
               revenue numeric, commission_rate numeric, est_commission numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._require_permission('reports.view');
  return query
  select o.source, coalesce(s.label, o.source), coalesce(s.color, '#6b6556'), coalesce(s.is_platform, false),
         count(*), coalesce(sum(o.total), 0)::numeric, coalesce(s.commission_rate, 0)::numeric,
         round(coalesce(sum(o.total), 0) * coalesce(s.commission_rate, 0) / 100, 2)::numeric
    from public.orders o
    left join public.order_sources s on s.code = o.source
   where o.created_at >= p_from and o.created_at < p_to and o.status <> 'cancelled'
   group by o.source, s.label, s.color, s.is_platform, s.commission_rate
   order by count(*) desc;
end $$;

create or replace function public.report_payment_breakdown(p_from timestamptz, p_to timestamptz)
returns table (payment_method public.payment_method, order_count bigint, revenue numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._require_permission('reports.view');
  return query
  select o.payment_method, count(*), coalesce(sum(o.total), 0)::numeric
    from public.orders o
   where o.created_at >= p_from and o.created_at < p_to and o.status <> 'cancelled'
   group by o.payment_method
   order by count(*) desc;
end $$;

create or replace function public.report_by_district(p_from timestamptz, p_to timestamptz)
returns table (district text, order_count bigint, revenue numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._require_permission('reports.view');
  return query
  select coalesce(nullif(o.district, ''), 'Belirtilmemiş'), count(*), coalesce(sum(o.total), 0)::numeric
    from public.orders o
   where o.created_at >= p_from and o.created_at < p_to
     and o.status <> 'cancelled' and o.order_type = 'delivery'
   group by 1
   order by count(*) desc;
end $$;

-- Kurye başına paket sayısı, taşıdığı ciro ve ortalama süreler (dakika)
create or replace function public.report_courier_performance(p_from timestamptz, p_to timestamptz)
returns table (courier_id uuid, courier_name text, delivery_count bigint, revenue_carried numeric,
               avg_total_minutes numeric, avg_delivery_minutes numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._require_permission('reports.view');
  return query
  select cd.courier_id, p.full_name, count(*), coalesce(sum(o.total), 0)::numeric,
         round((avg(cd.total_seconds) / 60.0)::numeric, 1),
         round((avg(cd.delivery_seconds) / 60.0)::numeric, 1)
    from public.courier_deliveries cd
    join public.profiles p on p.id = cd.courier_id
    join public.orders o on o.id = cd.order_id
   where cd.outcome = 'delivered' and cd.delivered_at >= p_from and cd.delivered_at < p_to
   group by cd.courier_id, p.full_name
   order by count(*) desc;
end $$;

-- Ortalama süreler (dakika): alınma → hazırlanma → kuryeye verilme → teslim
create or replace function public.report_order_timings(p_from timestamptz, p_to timestamptz)
returns table (delivered_orders bigint, avg_accept_min numeric, avg_prepare_min numeric,
               avg_wait_courier_min numeric, avg_delivery_min numeric, avg_total_min numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._require_permission('reports.view');
  return query
  select count(*),
         round((avg(extract(epoch from (o.accepted_at - o.created_at))) / 60)::numeric, 1),
         round((avg(extract(epoch from (o.ready_at - o.accepted_at))) / 60)::numeric, 1),
         round((avg(extract(epoch from (o.picked_up_at - o.ready_at))) / 60)::numeric, 1),
         round((avg(extract(epoch from (o.delivered_at - o.picked_up_at))) / 60)::numeric, 1),
         round((avg(extract(epoch from (o.delivered_at - o.created_at))) / 60)::numeric, 1)
    from public.orders o
   where o.status = 'delivered' and o.created_at >= p_from and o.created_at < p_to;
end $$;

-- İptal, eksik, fazla, hatalı sipariş kayıtları
create or replace function public.report_issues(p_from timestamptz, p_to timestamptz)
returns table (kind text, label text, item_count bigint)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._require_permission('reports.view');
  return query
  select 'issue'::text, i.issue_type::text, count(*)
    from public.order_issues i
   where i.created_at >= p_from and i.created_at < p_to
   group by i.issue_type
  union all
  select 'cancelled'::text, coalesce(nullif(o.cancel_reason, ''), 'Belirtilmemiş'), count(*)
    from public.orders o
   where o.status = 'cancelled' and o.created_at >= p_from and o.created_at < p_to
   group by 2
  order by 1, 3 desc;
end $$;

-- Masa kullanımı
create or replace function public.report_table_usage(p_from timestamptz, p_to timestamptz)
returns table (table_id uuid, table_number integer, session_count bigint, order_count bigint,
               revenue numeric, avg_session_minutes numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._require_permission('reports.view');
  return query
  with sess as (
    select s.id, s.table_id,
           (extract(epoch from (s.closed_at - s.opened_at)) / 60)::numeric as mins
      from public.table_sessions s
     where s.opened_at >= p_from and s.opened_at < p_to
  ),
  ord as (
    select o.table_session_id as sid, count(*) as c, sum(o.total) as t
      from public.orders o
     where o.status <> 'cancelled' and o.table_session_id is not null
     group by 1
  )
  select t.id, t.number, count(sess.id), coalesce(sum(ord.c), 0)::bigint,
         coalesce(sum(ord.t), 0)::numeric, round(avg(sess.mins), 1)
    from public.dining_tables t
    join sess on sess.table_id = t.id
    left join ord on ord.sid = sess.id
   group by t.id, t.number
   order by t.number;
end $$;

grant execute on function
  public.report_summary(timestamptz, timestamptz),
  public.report_daily(timestamptz, timestamptz),
  public.report_hourly_heatmap(timestamptz, timestamptz),
  public.report_top_products(timestamptz, timestamptz, integer),
  public.report_by_source(timestamptz, timestamptz),
  public.report_payment_breakdown(timestamptz, timestamptz),
  public.report_by_district(timestamptz, timestamptz),
  public.report_courier_performance(timestamptz, timestamptz),
  public.report_order_timings(timestamptz, timestamptz),
  public.report_issues(timestamptz, timestamptz),
  public.report_table_usage(timestamptz, timestamptz)
to authenticated;
