-- =====================================================================
-- YAZIR PİLAVCISI · 21 — SİPARİŞ DEĞERLENDİRMELERİ + PLATFORM YORUMLARI + KUPON RAPORU
-- =====================================================================
-- Supabase > SQL Editor'e yapıştırıp RUN edin. Tekrar çalıştırılabilir (idempotent).
-- Gereksinim: 01–16 çalıştırılmış olmalı (15: kuponlar, 16: audit).
--
--  * order_reviews    : Web sitesinden SİPARİŞ VEREN, giriş yapmış müşterilerin
--                       lezzet / teslimat(kurye) / servis puanları (yarım yıldız dahil) + yorum
--  * platform_reviews : Yemeksepeti / Trendyol / Migros / Getir yorumları için hazır tablo (şimdilik boş)
--  * public_review_summary(), list_public_reviews() : tüm kaynakları birleştiren herkese açık özet/liste
--  * coupon_report()  : hangi kampanya ne kadar ciro getirdi
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Sipariş değerlendirmeleri
-- ---------------------------------------------------------------------
create table if not exists public.order_reviews (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null unique references public.orders(id) on delete cascade,
  customer_id     uuid references public.customers(id) on delete set null,
  user_id         uuid references auth.users(id) on delete set null,
  author_name     text not null default 'Müşteri',
  taste_rating    numeric(2,1) not null check (taste_rating between 0.5 and 5 and taste_rating * 2 = floor(taste_rating * 2)),
  delivery_rating numeric(2,1)          check (delivery_rating is null or (delivery_rating between 0.5 and 5 and delivery_rating * 2 = floor(delivery_rating * 2))),
  service_rating  numeric(2,1) not null check (service_rating between 0.5 and 5 and service_rating * 2 = floor(service_rating * 2)),
  overall         numeric(3,2) generated always as (
                    round((taste_rating + service_rating + coalesce(delivery_rating, 0))
                          / (2 + case when delivery_rating is null then 0 else 1 end), 2)
                  ) stored,
  comment         text not null default '' check (char_length(comment) <= 1000),
  is_published    boolean not null default true,
  admin_reply     text,
  replied_at      timestamptz,
  replied_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists order_reviews_created_idx on public.order_reviews (created_at desc);
create index if not exists order_reviews_user_idx on public.order_reviews (user_id);

-- ---------------------------------------------------------------------
-- 2) Platform yorumları (entegrasyonlar bağlanınca dolacak)
-- ---------------------------------------------------------------------
create table if not exists public.platform_reviews (
  id          uuid primary key default gen_random_uuid(),
  platform    text not null references public.order_sources(code) on update cascade,
  external_id text not null,
  author      text not null default 'Müşteri',
  rating      numeric(2,1) not null check (rating between 0.5 and 5),
  body        text not null default '',
  review_time timestamptz,
  reply       text,
  is_published boolean not null default true,
  raw         jsonb,
  created_at  timestamptz not null default now(),
  unique (platform, external_id)
);
create index if not exists platform_reviews_platform_idx on public.platform_reviews (platform, review_time desc);

-- ---------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------
alter table public.order_reviews enable row level security;
alter table public.platform_reviews enable row level security;

drop policy if exists order_reviews_public_select on public.order_reviews;
create policy order_reviews_public_select on public.order_reviews for select to anon, authenticated
  using (is_published);
drop policy if exists order_reviews_own_select on public.order_reviews;
create policy order_reviews_own_select on public.order_reviews for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists order_reviews_staff_select on public.order_reviews;
create policy order_reviews_staff_select on public.order_reviews for select to authenticated
  using ((select public.current_app_role()) in ('owner', 'sub_admin', 'operator'));

drop policy if exists platform_reviews_public_select on public.platform_reviews;
create policy platform_reviews_public_select on public.platform_reviews for select to anon, authenticated
  using (is_published);
drop policy if exists platform_reviews_staff_all on public.platform_reviews;
create policy platform_reviews_staff_all on public.platform_reviews for all to authenticated
  using ((select public.has_permission('settings.manage')))
  with check ((select public.has_permission('settings.manage')));

-- Yazma yalnızca aşağıdaki fonksiyonlarla (yetki ve sipariş sahipliği orada denetlenir)
revoke insert, update, delete, truncate on public.order_reviews from anon, authenticated;
revoke insert, update, delete on public.platform_reviews from anon;
grant select on public.order_reviews, public.platform_reviews to anon, authenticated;
grant insert, update, delete on public.platform_reviews to authenticated;

-- ---------------------------------------------------------------------
-- 4) Müşteri: değerlendirilebilir siparişler + yorum gönder / düzenle / sil
-- ---------------------------------------------------------------------
create or replace function public.my_reviewable_orders()
returns table (
  order_id uuid, order_no bigint, order_type text, created_at timestamptz, delivered_at timestamptz,
  total numeric, items text,
  review_id uuid, taste_rating numeric, delivery_rating numeric, service_rating numeric,
  comment text, is_published boolean, admin_reply text, review_updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then return; end if;
  return query
  select o.id, o.order_no, o.order_type::text, o.created_at, o.delivered_at, o.total,
         (select string_agg(i.quantity::text || '× ' || i.product_name, ', ') from public.order_items i where i.order_id = o.id),
         r.id, r.taste_rating, r.delivery_rating, r.service_rating, r.comment, r.is_published, r.admin_reply, r.updated_at
    from public.orders o
    join public.customers c on c.id = o.customer_id
    left join public.order_reviews r on r.order_id = o.id
   where c.user_id = auth.uid() and o.status = 'delivered' and o.source = 'web'
   order by coalesce(o.delivered_at, o.created_at) desc;
end $$;

create or replace function public.submit_order_review(
  p_order_id uuid, p_taste numeric, p_delivery numeric, p_service numeric, p_comment text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_o public.orders%rowtype; v_c public.customers%rowtype; v_name text; v_id uuid; v_delivery numeric;
begin
  if auth.uid() is null then raise exception 'Yorum yapmak için giriş yapmalısınız' using errcode = '42501'; end if;
  select * into v_o from public.orders where id = p_order_id;
  if not found then raise exception 'Sipariş bulunamadı' using errcode = 'P0001'; end if;
  select * into v_c from public.customers where id = v_o.customer_id and user_id = auth.uid();
  if not found then raise exception 'Yalnızca kendi siparişinizi değerlendirebilirsiniz' using errcode = '42501'; end if;
  if v_o.source <> 'web' then raise exception 'Yalnızca web sitesinden verilen siparişler değerlendirilebilir' using errcode = 'P0001'; end if;
  if v_o.status <> 'delivered' then raise exception 'Sipariş teslim edildikten sonra değerlendirebilirsiniz' using errcode = 'P0001'; end if;

  v_delivery := case when v_o.order_type = 'delivery' then p_delivery else null end;
  if v_o.order_type = 'delivery' and v_delivery is null then
    raise exception 'Teslimat (kurye) puanını da verin' using errcode = 'P0001';
  end if;
  if p_taste is null or p_service is null then raise exception 'Lezzet ve servis puanı zorunlu' using errcode = 'P0001'; end if;

  -- "Ahmet Yılmaz" → "Ahmet Y."
  v_name := coalesce(nullif(trim(v_c.full_name), ''), 'Müşteri');
  if position(' ' in v_name) > 0 then
    v_name := split_part(v_name, ' ', 1) || ' ' || upper(left(split_part(v_name, ' ', 2), 1)) || '.';
  end if;

  insert into public.order_reviews (order_id, customer_id, user_id, author_name, taste_rating, delivery_rating, service_rating, comment)
  values (p_order_id, v_o.customer_id, auth.uid(), v_name, p_taste, v_delivery, p_service, left(coalesce(trim(p_comment), ''), 1000))
  on conflict (order_id) do update
     set taste_rating = excluded.taste_rating, delivery_rating = excluded.delivery_rating,
         service_rating = excluded.service_rating, comment = excluded.comment, updated_at = now()
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.delete_order_review(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Giriş yapmalısınız' using errcode = '42501'; end if;
  delete from public.order_reviews where order_id = p_order_id and user_id = auth.uid();
end $$;

-- ---------------------------------------------------------------------
-- 5) Yönetici: yayınla / gizle / cevapla / sil
-- ---------------------------------------------------------------------
create or replace function public.admin_moderate_review(p_id uuid, p_action text, p_reply text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.current_app_role() is null or public.current_app_role() not in ('owner', 'sub_admin') then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  if p_action = 'publish' then
    update public.order_reviews set is_published = true where id = p_id;
  elsif p_action = 'hide' then
    update public.order_reviews set is_published = false where id = p_id;
  elsif p_action = 'reply' then
    update public.order_reviews set admin_reply = nullif(trim(p_reply), ''),
           replied_at = case when nullif(trim(p_reply), '') is null then null else now() end,
           replied_by = auth.uid() where id = p_id;
  elsif p_action = 'delete' then
    delete from public.order_reviews where id = p_id;
  else
    raise exception 'Bilinmeyen işlem' using errcode = 'P0001';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6) Herkese açık özet ve liste (web siparişleri + Google + yönetici seçmeleri + platformlar)
-- ---------------------------------------------------------------------
create or replace function public.public_review_summary()
returns jsonb language sql stable security definer set search_path = '' as $$
  with allr as (
    select 'web'::text as src, overall::numeric as rating, taste_rating::numeric as taste, delivery_rating::numeric as delivery, service_rating::numeric as service
      from public.order_reviews where is_published
    union all
    select s.source, s.rating::numeric, null, null, null from public.site_reviews s where s.is_published
    union all
    select p.platform, p.rating::numeric, null, null, null from public.platform_reviews p where p.is_published
  ),
  per as (
    select src, count(*) as n, round(avg(rating), 2) as avg,
           round(avg(taste), 2) as taste, round(avg(delivery), 2) as delivery, round(avg(service), 2) as service
      from allr group by src
  )
  select jsonb_build_object(
    'total_count', (select count(*) from allr),
    'total_avg', (select round(avg(rating), 2) from allr),
    'distribution', jsonb_build_object(
      '5', (select count(*) from allr where round(rating) >= 5),
      '4', (select count(*) from allr where round(rating) = 4),
      '3', (select count(*) from allr where round(rating) = 3),
      '2', (select count(*) from allr where round(rating) = 2),
      '1', (select count(*) from allr where round(rating) <= 1)),
    'web_categories', (select jsonb_build_object('taste', taste, 'delivery', delivery, 'service', service) from per where src = 'web'),
    'sources', coalesce((select jsonb_object_agg(src, jsonb_build_object('count', n, 'avg', avg)) from per), '{}'::jsonb)
  )
$$;

create or replace function public.list_public_reviews(
  p_source text default null, p_sort text default 'newest', p_min numeric default 0,
  p_limit int default 12, p_offset int default 0)
returns table (
  id text, source text, author text, rating numeric, taste numeric, delivery numeric, service numeric,
  body text, created_at timestamptz, photo text, reply text, replied_at timestamptz, relative_time text, total_count bigint)
language sql stable security definer set search_path = '' as $$
  with allr as (
    select r.id::text as id, 'web'::text as source, r.author_name as author, r.overall::numeric as rating,
           r.taste_rating::numeric as taste, r.delivery_rating::numeric as delivery, r.service_rating::numeric as service,
           r.comment as body, r.created_at, null::text as photo, r.admin_reply as reply, r.replied_at, null::text as relative_time
      from public.order_reviews r where r.is_published
    union all
    select s.id::text, s.source, s.author, s.rating::numeric, null, null, null,
           s.body, coalesce(s.review_time, s.created_at), s.profile_photo_url, null, null, s.relative_time_description
      from public.site_reviews s where s.is_published
    union all
    select p.id::text, p.platform, p.author, p.rating::numeric, null, null, null,
           p.body, coalesce(p.review_time, p.created_at), null, p.reply, null, null
      from public.platform_reviews p where p.is_published
  ), f as (
    select * from allr where (p_source is null or p_source = 'all' or source = p_source) and rating >= coalesce(p_min, 0)
  )
  select f.id, f.source, f.author, f.rating, f.taste, f.delivery, f.service, f.body, f.created_at, f.photo, f.reply,
         f.replied_at, f.relative_time, count(*) over () as total_count
    from f
   order by
     case when p_sort = 'highest' then f.rating end desc nulls last,
     case when p_sort = 'lowest' then f.rating end asc nulls last,
     f.created_at desc
   limit greatest(1, least(coalesce(p_limit, 12), 50)) offset greatest(0, coalesce(p_offset, 0))
$$;

-- ---------------------------------------------------------------------
-- 7) Kupon kullanım raporu
-- ---------------------------------------------------------------------
create or replace function public.coupon_report(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_coupons jsonb; v_daily jsonb; v_tot jsonb; v_point_value numeric;
begin
  if public.current_app_role() is null or public.current_app_role() not in ('owner', 'sub_admin', 'operator') then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  select loyalty_point_value into v_point_value from public.business_settings where id = 1;

  with red as (
    select r.coupon_id, r.amount, r.created_at, r.customer_id, r.phone, o.id as order_id, o.total, o.subtotal,
           (o.customer_id is not null and not exists (
              select 1 from public.orders o2 where o2.customer_id = o.customer_id and o2.created_at < o.created_at and o2.status <> 'cancelled'
           )) as is_new
      from public.coupon_redemptions r
      join public.orders o on o.id = r.order_id and o.status <> 'cancelled'
     where r.created_at >= p_from and r.created_at < p_to
  )
  select coalesce(jsonb_agg(row_to_json(x) order by x.revenue desc), '[]'::jsonb) into v_coupons from (
    select c.id, c.code, c.title, c.discount_type, c.is_active, c.usage_limit, c.used_count,
           count(red.order_id)::int as uses,
           coalesce(sum(red.amount), 0) as discount_total,
           coalesce(sum(red.total), 0) as revenue,
           coalesce(sum(red.subtotal), 0) as gross,
           count(distinct coalesce(red.customer_id::text, red.phone))::int as customers,
           count(*) filter (where red.is_new)::int as new_customers,
           coalesce(round(avg(red.total), 2), 0) as avg_basket,
           max(red.created_at) as last_used
      from public.coupons c
      left join red on red.coupon_id = c.id
     group by c.id
  ) x;

  select coalesce(jsonb_agg(row_to_json(d) order by d.day), '[]'::jsonb) into v_daily from (
    select (r.created_at at time zone 'Europe/Istanbul')::date as day, count(*)::int as uses,
           coalesce(sum(r.amount), 0) as discount, coalesce(sum(o.total), 0) as revenue
      from public.coupon_redemptions r join public.orders o on o.id = r.order_id and o.status <> 'cancelled'
     where r.created_at >= p_from and r.created_at < p_to
     group by 1
  ) d;

  select jsonb_build_object(
    'orders', count(*),
    'coupon_orders', count(*) filter (where exists (select 1 from public.coupon_redemptions r where r.order_id = o.id)),
    'revenue', coalesce(sum(o.total), 0),
    'coupon_revenue', coalesce(sum(o.total) filter (where exists (select 1 from public.coupon_redemptions r where r.order_id = o.id)), 0),
    'avg_basket_coupon', coalesce(round(avg(o.total) filter (where exists (select 1 from public.coupon_redemptions r where r.order_id = o.id)), 2), 0),
    'avg_basket_other', coalesce(round(avg(o.total) filter (where not exists (select 1 from public.coupon_redemptions r where r.order_id = o.id)), 2), 0),
    'discount_total', coalesce((select sum(r.amount) from public.coupon_redemptions r join public.orders o2 on o2.id = r.order_id and o2.status <> 'cancelled' where r.created_at >= p_from and r.created_at < p_to), 0),
    'points_used', coalesce((select -sum(l.points) from public.loyalty_ledger l where l.reason = 'redeem' and l.created_at >= p_from and l.created_at < p_to), 0),
    'points_value', coalesce((select -sum(l.points) from public.loyalty_ledger l where l.reason = 'redeem' and l.created_at >= p_from and l.created_at < p_to), 0) * coalesce(v_point_value, 1)
  ) into v_tot
  from public.orders o where o.status <> 'cancelled' and o.created_at >= p_from and o.created_at < p_to;

  return jsonb_build_object('coupons', v_coupons, 'daily', v_daily, 'totals', v_tot);
end $$;

-- ---------------------------------------------------------------------
-- 8) Yetkiler
-- ---------------------------------------------------------------------
revoke execute on function public.my_reviewable_orders(), public.submit_order_review(uuid, numeric, numeric, numeric, text),
  public.delete_order_review(uuid), public.admin_moderate_review(uuid, text, text), public.coupon_report(timestamptz, timestamptz)
  from public, anon;
grant execute on function public.my_reviewable_orders(), public.submit_order_review(uuid, numeric, numeric, numeric, text),
  public.delete_order_review(uuid), public.admin_moderate_review(uuid, text, text), public.coupon_report(timestamptz, timestamptz)
  to authenticated;
grant execute on function public.public_review_summary(), public.list_public_reviews(text, text, numeric, int, int) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 9) İşlem geçmişi + Realtime
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['order_reviews', 'platform_reviews']
  loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.log_audit()', t);
  end loop;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_reviews') then
    alter publication supabase_realtime add table public.order_reviews;
  end if;
end $$;
