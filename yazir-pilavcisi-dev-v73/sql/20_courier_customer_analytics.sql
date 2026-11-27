-- =====================================================================
-- 20 · KURYE & MÜŞTERİ ANALİZ ALTYAPISI
-- Supabase SQL Editor'de TEK SEFER çalıştırın (tekrar çalıştırmak güvenlidir).
-- 10_courier_live_tracking.sql ve 15_coupons_loyalty.sql'den SONRA çalıştırın.
--
-- İçerik
--  1) courier_online_sessions : kuryenin ne zaman çevrimiçi/çevrimdışı olduğu (çalışma süresi)
--  2) courier_points_ledger   : kurye PRİM / PUAN defteri (ileride otomatik prim kuralları buraya yazar)
--  3) report_courier_overview : tüm kuryelerin karşılaştırmalı performansı
--  4) report_courier_detail   : tek kuryenin tüm detayı (saat/gün dağılımı, süreler, bölgeler, son teslimatlar)
--  5) report_customer_overview: müşteri tabanı analizi (yeni/tekrar eden, segmentler, saatler, ürünler...)
--  6) report_customer_detail  : tek müşterinin davranış profili
--  7) admin_courier_points    : kurye puan / prim ekleme-düşme
--
-- Saat dilimi: Europe/Istanbul. Teslimat verisi mevcut courier_deliveries tablosundan okunur;
-- yani bu dosyadan ÖNCE yapılmış teslimatlar da analizde görünür.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Yardımcı indeksler
-- ---------------------------------------------------------------------
create index if not exists orders_customer_created_idx
  on public.orders (customer_id, created_at desc) where customer_id is not null;
create index if not exists courier_deliveries_delivered_idx
  on public.courier_deliveries (delivered_at) where outcome = 'delivered';

-- ---------------------------------------------------------------------
-- 1) Kurye çevrimiçi oturumları
-- ---------------------------------------------------------------------
create table if not exists public.courier_online_sessions (
  id          bigint generated always as identity primary key,
  courier_id  uuid not null references public.profiles(id) on delete cascade,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz
);
create unique index if not exists courier_online_sessions_one_open
  on public.courier_online_sessions (courier_id) where ended_at is null;
create index if not exists courier_online_sessions_courier_idx
  on public.courier_online_sessions (courier_id, started_at desc);

alter table public.courier_online_sessions enable row level security;
drop policy if exists courier_online_sessions_select on public.courier_online_sessions;
create policy courier_online_sessions_select on public.courier_online_sessions for select to authenticated
  using (courier_id = (select auth.uid())
         or (select public.has_permission('couriers.view'))
         or (select public.has_permission('reports.view')));
grant select on public.courier_online_sessions to authenticated;

-- Şu an çevrimiçi görünen kuryeler için açık oturum aç (geçmişe dönük başlangıç = şimdi)
insert into public.courier_online_sessions (courier_id)
select cp.user_id from public.courier_profiles cp
 where cp.is_online
   and not exists (select 1 from public.courier_online_sessions s where s.courier_id = cp.user_id and s.ended_at is null);

-- set_courier_online: oturum aç/kapat (önceki davranış korunur)
create or replace function public.set_courier_online(p_online boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.current_app_role() is distinct from 'courier' then
    raise exception 'Yalnızca kuryeler kullanabilir' using errcode = '42501';
  end if;
  update public.courier_profiles set is_online = p_online where user_id = auth.uid();

  if p_online then
    insert into public.courier_online_sessions (courier_id)
    select auth.uid()
     where not exists (select 1 from public.courier_online_sessions s
                        where s.courier_id = auth.uid() and s.ended_at is null)
    on conflict do nothing;
  else
    update public.courier_online_sessions set ended_at = now()
     where courier_id = auth.uid() and ended_at is null;
    delete from public.courier_locations where courier_id = auth.uid();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2) Kurye prim / puan defteri
--    points: + kazanım, − düşüm   ·   amount: ₺ prim tutarı (ödenen prim için negatif yazılabilir)
-- ---------------------------------------------------------------------
create table if not exists public.courier_points_ledger (
  id          bigint generated always as identity primary key,
  courier_id  uuid not null references public.profiles(id) on delete cascade,
  kind        text not null default 'adjust' check (kind in ('delivery', 'bonus', 'penalty', 'adjust', 'payout')),
  points      int not null default 0,
  amount      numeric(10,2) not null default 0,
  order_id    uuid references public.orders(id) on delete set null,
  note        text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists courier_points_ledger_courier_idx
  on public.courier_points_ledger (courier_id, created_at desc);

alter table public.courier_points_ledger enable row level security;
drop policy if exists courier_points_ledger_select on public.courier_points_ledger;
create policy courier_points_ledger_select on public.courier_points_ledger for select to authenticated
  using (courier_id = (select auth.uid())
         or (select public.has_permission('couriers.view'))
         or (select public.has_permission('reports.view')));
grant select on public.courier_points_ledger to authenticated;

-- ---------------------------------------------------------------------
-- Yardımcılar
-- ---------------------------------------------------------------------
create or replace function public._require_any_permission(p_keys text[])
returns void language plpgsql stable security definer set search_path = '' as $$
declare k text;
begin
  if auth.uid() is null then
    raise exception 'Oturum gerekli' using errcode = '42501';
  end if;
  foreach k in array p_keys loop
    if public.user_has_permission(auth.uid(), k) then return; end if;
  end loop;
  raise exception 'Bu işlem için yetkiniz yok' using errcode = '42501';
end $$;

-- Kuryenin aralıktaki çevrimiçi süresi (dakika). Açık oturum, son konumdan 5 dk sonrasına kadar sayılır
-- (kurye uygulamayı kapatıp çıkış yapmadıysa süre şişmesin).
create or replace function public._courier_online_minutes(p_courier uuid, p_from timestamptz, p_to timestamptz)
returns numeric language sql stable security definer set search_path = '' as $$
  select coalesce(sum(greatest(0, extract(epoch from (
           least(
             coalesce(s.ended_at, greatest(s.started_at, least(now(), coalesce(l.updated_at + interval '5 minutes', now())))),
             p_to)
           - greatest(s.started_at, p_from)))) / 60.0), 0)::numeric
    from public.courier_online_sessions s
    left join public.courier_locations l on l.courier_id = s.courier_id
   where s.courier_id = p_courier
     and s.started_at < p_to
     and coalesce(s.ended_at, now()) > p_from;
$$;

-- ---------------------------------------------------------------------
-- 3) Tüm kuryelerin karşılaştırmalı performansı
--    p_sla_min: "zamanında teslim" eşiği (yola çıkış → teslim, dakika)
-- ---------------------------------------------------------------------
create or replace function public.report_courier_overview(p_from timestamptz, p_to timestamptz, p_sla_min int default 30)
returns table (
  courier_id uuid, courier_name text, phone text, vehicle_type text, plate text,
  is_active boolean, is_online boolean,
  delivery_count bigint, revenue_carried numeric, cash_collected numeric,
  avg_total_min numeric, avg_delivery_min numeric, avg_pickup_wait_min numeric,
  total_delivery_min numeric, fastest_min numeric, slowest_min numeric, on_time_pct numeric,
  reassigned_count bigint, cancelled_count bigint,
  online_minutes numeric, active_days bigint, peak_hour int,
  points_balance bigint, bonus_amount numeric, last_delivery_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform public._require_any_permission(array['reports.view', 'couriers.view']);
  return query
  with d as (
    select cd.courier_id as cid, cd.delivered_at, cd.total_seconds, cd.delivery_seconds,
           extract(epoch from (cd.picked_up_at - cd.assigned_at))::numeric as wait_s,
           o.total, o.payment_method,
           extract(hour from cd.delivered_at at time zone 'Europe/Istanbul')::int as h,
           (cd.delivered_at at time zone 'Europe/Istanbul')::date as dday
      from public.courier_deliveries cd
      join public.orders o on o.id = cd.order_id
     where cd.outcome = 'delivered' and cd.delivered_at >= p_from and cd.delivered_at < p_to
  ),
  agg as (
    select d.cid,
           count(*) as cnt,
           sum(d.total) as rev,
           sum(d.total) filter (where d.payment_method in ('cash_on_delivery', 'card_on_delivery')) as cash,
           avg(d.total_seconds) / 60.0 as avg_total,
           avg(d.delivery_seconds) / 60.0 as avg_del,
           avg(d.wait_s) / 60.0 as avg_wait,
           sum(d.delivery_seconds) / 60.0 as tot_del,
           min(d.delivery_seconds) / 60.0 as fast,
           max(d.delivery_seconds) / 60.0 as slow,
           100.0 * count(*) filter (where d.delivery_seconds is not null and d.delivery_seconds <= p_sla_min * 60)
             / nullif(count(*) filter (where d.delivery_seconds is not null), 0) as ontime,
           count(distinct d.dday) as days,
           max(d.delivered_at) as last_at
      from d group by d.cid
  ),
  hr as (select d.cid, d.h, count(*) as c from d group by d.cid, d.h),
  peak as (select distinct on (hr.cid) hr.cid, hr.h from hr order by hr.cid, hr.c desc, hr.h),
  rs as (
    select cd.courier_id as cid,
           count(*) filter (where cd.outcome = 'reassigned') as reassigned,
           count(*) filter (where cd.outcome = 'cancelled') as cancelled
      from public.courier_deliveries cd
     where coalesce(cd.ended_at, cd.assigned_at) >= p_from and coalesce(cd.ended_at, cd.assigned_at) < p_to
     group by cd.courier_id
  ),
  pts as (
    select l.courier_id as cid, sum(l.points) as bal, sum(l.amount) as amt
      from public.courier_points_ledger l group by l.courier_id
  )
  select p.id, p.full_name, p.phone, cp.vehicle_type, cp.plate, p.is_active, cp.is_online,
         coalesce(a.cnt, 0),
         coalesce(a.rev, 0)::numeric,
         coalesce(a.cash, 0)::numeric,
         round(a.avg_total::numeric, 1),
         round(a.avg_del::numeric, 1),
         round(a.avg_wait::numeric, 1),
         round(coalesce(a.tot_del, 0)::numeric, 1),
         round(a.fast::numeric, 1),
         round(a.slow::numeric, 1),
         round(a.ontime::numeric, 1),
         coalesce(r.reassigned, 0),
         coalesce(r.cancelled, 0),
         round(public._courier_online_minutes(p.id, p_from, p_to), 0),
         coalesce(a.days, 0),
         pk.h,
         coalesce(t.bal, 0)::bigint,
         coalesce(t.amt, 0)::numeric,
         a.last_at
    from public.profiles p
    join public.courier_profiles cp on cp.user_id = p.id
    left join agg a on a.cid = p.id
    left join peak pk on pk.cid = p.id
    left join rs r on r.cid = p.id
    left join pts t on t.cid = p.id
   where p.role = 'courier'
   order by coalesce(a.cnt, 0) desc, p.full_name;
end $$;

-- ---------------------------------------------------------------------
-- 4) Tek kuryenin tüm detayı (kurye kendi verisini de görebilir)
-- ---------------------------------------------------------------------
create or replace function public.report_courier_detail(p_courier uuid, p_from timestamptz, p_to timestamptz, p_sla_min int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v jsonb;
  v_online numeric;
  v_sessions bigint;
begin
  if auth.uid() is null then
    raise exception 'Oturum gerekli' using errcode = '42501';
  end if;
  if auth.uid() <> p_courier then
    perform public._require_any_permission(array['reports.view', 'couriers.view']);
  end if;

  v_online := public._courier_online_minutes(p_courier, p_from, p_to);
  select count(*) into v_sessions from public.courier_online_sessions s
   where s.courier_id = p_courier and s.started_at < p_to and coalesce(s.ended_at, now()) > p_from;

  with da as (
    select cd.courier_id as cid, cd.order_id, cd.assigned_at, cd.picked_up_at, cd.delivered_at,
           cd.total_seconds, cd.delivery_seconds,
           extract(epoch from (cd.picked_up_at - cd.assigned_at))::numeric as wait_s,
           o.order_no, o.total, o.payment_method, o.district, o.customer_name, o.delivery_address,
           extract(hour from cd.delivered_at at time zone 'Europe/Istanbul')::int as h,
           extract(isodow from cd.delivered_at at time zone 'Europe/Istanbul')::int as dow,
           (cd.delivered_at at time zone 'Europe/Istanbul')::date as dday
      from public.courier_deliveries cd
      join public.orders o on o.id = cd.order_id
     where cd.outcome = 'delivered' and cd.delivered_at >= p_from and cd.delivered_at < p_to
  ),
  d as (select * from da where da.cid = p_courier)
  select jsonb_build_object(
    'summary', (
      select jsonb_build_object(
        'delivery_count', count(*),
        'revenue', coalesce(sum(d.total), 0),
        'avg_order_value', coalesce(round(avg(d.total)::numeric, 2), 0),
        'cash_collected', coalesce(sum(d.total) filter (where d.payment_method in ('cash_on_delivery', 'card_on_delivery')), 0),
        'cash_only', coalesce(sum(d.total) filter (where d.payment_method = 'cash_on_delivery'), 0),
        'card_only', coalesce(sum(d.total) filter (where d.payment_method = 'card_on_delivery'), 0),
        'avg_total_min', round((avg(d.total_seconds) / 60.0)::numeric, 1),
        'avg_delivery_min', round((avg(d.delivery_seconds) / 60.0)::numeric, 1),
        'avg_pickup_wait_min', round((avg(d.wait_s) / 60.0)::numeric, 1),
        'total_delivery_min', round((coalesce(sum(d.delivery_seconds), 0) / 60.0)::numeric, 1),
        'fastest_min', round((min(d.delivery_seconds) / 60.0)::numeric, 1),
        'slowest_min', round((max(d.delivery_seconds) / 60.0)::numeric, 1),
        'on_time_pct', round((100.0 * count(*) filter (where d.delivery_seconds is not null and d.delivery_seconds <= p_sla_min * 60)
                              / nullif(count(*) filter (where d.delivery_seconds is not null), 0))::numeric, 1),
        'active_days', count(distinct d.dday),
        'first_delivery_at', min(d.delivered_at),
        'last_delivery_at', max(d.delivered_at),
        'online_minutes', round(v_online, 0),
        'session_count', v_sessions,
        'rank', (select count(*) + 1 from (select da.cid from da group by da.cid
                                            having count(*) > (select count(*) from d)) r),
        'ranked_couriers', (select count(distinct da.cid) from da),
        'reassigned_count', (select count(*) from public.courier_deliveries x
                              where x.courier_id = p_courier and x.outcome = 'reassigned'
                                and coalesce(x.ended_at, x.assigned_at) >= p_from and coalesce(x.ended_at, x.assigned_at) < p_to),
        'cancelled_count', (select count(*) from public.courier_deliveries x
                             where x.courier_id = p_courier and x.outcome = 'cancelled'
                               and coalesce(x.ended_at, x.assigned_at) >= p_from and coalesce(x.ended_at, x.assigned_at) < p_to),
        'points_balance', (select coalesce(sum(l.points), 0) from public.courier_points_ledger l where l.courier_id = p_courier),
        'bonus_amount', (select coalesce(sum(l.amount), 0) from public.courier_points_ledger l where l.courier_id = p_courier)
      ) from d),
    'hourly', coalesce((
      select jsonb_agg(jsonb_build_object('hour', g.h, 'count', coalesce(x.c, 0), 'avg_min', x.am) order by g.h)
        from generate_series(0, 23) g(h)
        left join (select d.h, count(*) as c, round((avg(d.delivery_seconds) / 60.0)::numeric, 1) as am from d group by d.h) x on x.h = g.h
    ), '[]'::jsonb),
    'weekday', coalesce((
      select jsonb_agg(jsonb_build_object('dow', g.w, 'count', coalesce(x.c, 0), 'avg_min', x.am) order by g.w)
        from generate_series(1, 7) g(w)
        left join (select d.dow, count(*) as c, round((avg(d.delivery_seconds) / 60.0)::numeric, 1) as am from d group by d.dow) x on x.dow = g.w
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', x.dday, 'count', x.c, 'revenue', x.rev, 'avg_min', x.am) order by x.dday)
        from (select d.dday, count(*) as c, sum(d.total) as rev, round((avg(d.delivery_seconds) / 60.0)::numeric, 1) as am
                from d group by d.dday) x
    ), '[]'::jsonb),
    'districts', coalesce((
      select jsonb_agg(jsonb_build_object('district', x.dn, 'count', x.c, 'avg_min', x.am) order by x.c desc, x.dn)
        from (select coalesce(nullif(d.district, ''), 'Belirtilmemiş') as dn, count(*) as c,
                     round((avg(d.delivery_seconds) / 60.0)::numeric, 1) as am
                from d group by 1 order by count(*) desc limit 8) x
    ), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
               'order_id', x.order_id, 'order_no', x.order_no, 'customer_name', x.customer_name,
               'district', x.district, 'address', x.delivery_address, 'total', x.total,
               'payment_method', x.payment_method, 'assigned_at', x.assigned_at,
               'picked_up_at', x.picked_up_at, 'delivered_at', x.delivered_at,
               'delivery_min', round((x.delivery_seconds / 60.0)::numeric, 1),
               'total_min', round((x.total_seconds / 60.0)::numeric, 1)) order by x.delivered_at desc)
        from (select * from d order by d.delivered_at desc limit 30) x
    ), '[]'::jsonb),
    'points', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'points', x.points, 'amount', x.amount,
                                          'note', x.note, 'created_at', x.created_at) order by x.created_at desc)
        from (select * from public.courier_points_ledger l where l.courier_id = p_courier
               order by l.created_at desc limit 20) x
    ), '[]'::jsonb)
  ) into v;

  return v;
end $$;

-- ---------------------------------------------------------------------
-- 5) Müşteri tabanı analizi (personel)
-- ---------------------------------------------------------------------
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
      'avg_wait_min', (select round((avg(extract(epoch from (ob.delivered_at - ob.created_at))) / 60.0)::numeric, 1)
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

-- ---------------------------------------------------------------------
-- 6) Tek müşterinin davranış profili (personel)
-- ---------------------------------------------------------------------
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
        'avg_wait_min', round((avg(extract(epoch from (ok.delivered_at - ok.created_at))) filter (where ok.status = 'delivered' and ok.delivered_at is not null) / 60.0)::numeric, 1),
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

-- ---------------------------------------------------------------------
-- 7) Kurye puan / prim ekle-düş (yalnızca sahip ve yardımcı yönetici)
-- ---------------------------------------------------------------------
create or replace function public.admin_courier_points(
  p_courier uuid, p_points int, p_amount numeric default 0, p_kind text default 'adjust', p_note text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_bal bigint;
begin
  if public.current_app_role() is null or public.current_app_role() not in ('owner', 'sub_admin') then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  if p_kind not in ('bonus', 'penalty', 'adjust', 'payout') then
    raise exception 'Geçersiz tür' using errcode = 'P0001';
  end if;
  if coalesce(p_points, 0) = 0 and coalesce(p_amount, 0) = 0 then
    raise exception 'Puan veya prim tutarı girin' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_courier and role = 'courier') then
    raise exception 'Kurye bulunamadı' using errcode = 'P0001';
  end if;

  insert into public.courier_points_ledger (courier_id, kind, points, amount, note, created_by)
  values (p_courier, p_kind, coalesce(p_points, 0), coalesce(p_amount, 0), nullif(trim(p_note), ''), auth.uid());

  select coalesce(sum(points), 0) into v_bal from public.courier_points_ledger where courier_id = p_courier;
  return v_bal;
end $$;

-- ---------------------------------------------------------------------
-- Yetkiler
-- ---------------------------------------------------------------------
revoke execute on function
  public._require_any_permission(text[]),
  public._courier_online_minutes(uuid, timestamptz, timestamptz)
  from public, anon, authenticated;

revoke execute on function
  public.report_courier_overview(timestamptz, timestamptz, int),
  public.report_courier_detail(uuid, timestamptz, timestamptz, int),
  public.report_customer_overview(timestamptz, timestamptz),
  public.report_customer_detail(uuid),
  public.admin_courier_points(uuid, int, numeric, text, text),
  public.set_courier_online(boolean)
  from public, anon;
grant execute on function
  public.report_courier_overview(timestamptz, timestamptz, int),
  public.report_courier_detail(uuid, timestamptz, timestamptz, int),
  public.report_customer_overview(timestamptz, timestamptz),
  public.report_customer_detail(uuid),
  public.admin_courier_points(uuid, int, numeric, text, text),
  public.set_courier_online(boolean)
  to authenticated;

-- service_role (Edge Function) için
grant all on public.courier_online_sessions, public.courier_points_ledger to service_role;
grant usage, select on all sequences in schema public to service_role;

-- İşlem geçmişi (audit) — puan/prim hareketleri kayıt altına alınır
do $$
begin
  execute 'drop trigger if exists audit_courier_points_ledger on public.courier_points_ledger';
  execute 'create trigger audit_courier_points_ledger after insert or update or delete on public.courier_points_ledger
           for each row execute function public.log_audit()';
exception when undefined_function then
  raise notice 'log_audit bulunamadı, audit tetikleyicisi atlandı';
end $$;
