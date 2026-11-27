-- =====================================================================
-- YAZIR PİLAVCISI · 15 — KUPON, KAMPANYA, SADAKAT PUANI, MÜŞTERİ YÖNETİMİ
-- =====================================================================
-- Supabase > SQL Editor'e yapıştırıp RUN edin. Tekrar çalıştırılabilir (idempotent).
-- Gereksinim: 01–14 numaralı dosyalar çalıştırılmış olmalı.
-- =====================================================================

-- ---- Ayarlar: sadakat puanı --------------------------------------------------
alter table public.business_settings
  add column if not exists loyalty_enabled      boolean       not null default false,
  add column if not exists loyalty_earn_per_lira numeric(6,3) not null default 0.05,  -- 20 ₺ = 1 puan
  add column if not exists loyalty_point_value  numeric(6,2)  not null default 1,     -- 1 puan = 1 ₺ indirim
  add column if not exists loyalty_min_redeem   int           not null default 20;    -- en az 20 puan kullanılabilir

alter table public.customers
  add column if not exists loyalty_points int not null default 0,
  add column if not exists notes text;

-- ---- Kuponlar ------------------------------------------------------------------
create table if not exists public.coupons (
  id               uuid primary key default gen_random_uuid(),
  code             text not null,
  title            text not null default '',
  description      text not null default '',
  discount_type    text not null default 'percent' check (discount_type in ('percent', 'fixed', 'free_delivery')),
  discount_value   numeric(10,2) not null default 0 check (discount_value >= 0),
  max_discount     numeric(10,2),                       -- yüzde indirimlerde tavan (₺)
  min_order_amount numeric(10,2) not null default 0,
  starts_at        timestamptz,
  ends_at          timestamptz,
  daily_start      time,                                -- saat bazlı geçerlilik (İstanbul saati)
  daily_end        time,
  weekdays         int[],                               -- 1=Pzt … 7=Paz; boş/NULL = her gün
  audience         text not null default 'all' check (audience in ('all', 'members', 'new_customers', 'specific')),
  customer_ids     uuid[] not null default '{}',        -- audience = specific
  usage_limit      int,                                 -- toplam kontenjan (NULL = sınırsız)
  per_customer_limit int default 1,                     -- kişi başı kullanım (NULL = sınırsız)
  used_count       int not null default 0,
  is_public        boolean not null default false,      -- sitedeki "Kampanyalar" sayfasında göster
  is_active        boolean not null default true,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists coupons_code_uq on public.coupons (upper(code));

create table if not exists public.coupon_redemptions (
  id          uuid primary key default gen_random_uuid(),
  coupon_id   uuid not null references public.coupons(id) on delete cascade,
  order_id    uuid not null unique references public.orders(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  phone       text,
  amount      numeric(10,2) not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists coupon_redemptions_coupon_idx on public.coupon_redemptions (coupon_id);

create table if not exists public.loyalty_ledger (
  id          bigint generated always as identity primary key,
  customer_id uuid not null references public.customers(id) on delete cascade,
  points      int not null,                             -- + kazanım, − harcama
  reason      text not null check (reason in ('earn', 'redeem', 'adjust')),
  order_id    uuid references public.orders(id) on delete set null,
  note        text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists loyalty_ledger_customer_idx on public.loyalty_ledger (customer_id, created_at desc);
create unique index if not exists loyalty_earn_once_idx on public.loyalty_ledger (order_id) where reason = 'earn';

-- ---- RLS -----------------------------------------------------------------------
alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.loyalty_ledger enable row level security;

drop policy if exists coupons_staff_select on public.coupons;
create policy coupons_staff_select on public.coupons for select to authenticated
  using ((select public.current_app_role()) in ('owner', 'sub_admin', 'operator'));
drop policy if exists coupons_staff_write on public.coupons;
create policy coupons_staff_write on public.coupons for all to authenticated
  using ((select public.has_permission('settings.manage')))
  with check ((select public.has_permission('settings.manage')));

drop policy if exists coupon_red_select on public.coupon_redemptions;
create policy coupon_red_select on public.coupon_redemptions for select to authenticated
  using ((select public.current_app_role()) in ('owner', 'sub_admin', 'operator'));

drop policy if exists loyalty_select on public.loyalty_ledger;
create policy loyalty_select on public.loyalty_ledger for select to authenticated
  using ((select public.current_app_role()) in ('owner', 'sub_admin', 'operator'));

revoke all on public.coupons, public.coupon_redemptions, public.loyalty_ledger from anon;
revoke insert, update, delete on public.coupon_redemptions, public.loyalty_ledger from authenticated;
grant select on public.coupons, public.coupon_redemptions, public.loyalty_ledger to authenticated;
grant insert, update, delete on public.coupons to authenticated;

-- ---- Puan hareketi → müşteri bakiyesi ----------------------------------------------
create or replace function public._loyalty_apply()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.customers set loyalty_points = loyalty_points + new.points, updated_at = now()
   where id = new.customer_id;
  return new;
end $$;
drop trigger if exists loyalty_ledger_apply on public.loyalty_ledger;
create trigger loyalty_ledger_apply after insert on public.loyalty_ledger
  for each row execute function public._loyalty_apply();

-- Sipariş TESLİM EDİLİNCE puan kazandır
create or replace function public._loyalty_earn()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_s public.business_settings%rowtype; v_pts int;
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' and new.customer_id is not null then
    select * into v_s from public.business_settings where id = 1;
    if v_s.loyalty_enabled then
      v_pts := floor(greatest(new.total - new.delivery_fee, 0) * v_s.loyalty_earn_per_lira);
      if v_pts > 0 then
        insert into public.loyalty_ledger (customer_id, points, reason, order_id, note)
        values (new.customer_id, v_pts, 'earn', new.id, 'Sipariş #' || new.order_no)
        on conflict do nothing;
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists orders_loyalty_earn on public.orders;
create trigger orders_loyalty_earn after update of status on public.orders
  for each row execute function public._loyalty_earn();

-- ---- Kupon doğrulama (iç) ----------------------------------------------------------
create or replace function public._coupon_check(
  p_code text, p_subtotal numeric, p_fee numeric, p_customer uuid, p_phone text,
  p_logged boolean, p_exclude_order uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  c public.coupons%rowtype;
  v_now timestamp := (now() at time zone 'Europe/Istanbul');
  v_t time := (now() at time zone 'Europe/Istanbul')::time;
  v_ok boolean;
  v_n int;
  v_disc numeric(10,2);
begin
  select * into c from public.coupons where upper(code) = upper(trim(coalesce(p_code, ''))) limit 1;
  if not found or not c.is_active then
    return jsonb_build_object('ok', false, 'error', 'Geçersiz kupon kodu');
  end if;
  if c.starts_at is not null and now() < c.starts_at then
    return jsonb_build_object('ok', false, 'error', 'Bu kupon henüz geçerli değil');
  end if;
  if c.ends_at is not null and now() > c.ends_at then
    return jsonb_build_object('ok', false, 'error', 'Bu kuponun süresi dolmuş');
  end if;
  if c.weekdays is not null and cardinality(c.weekdays) > 0 and not (extract(isodow from v_now)::int = any (c.weekdays)) then
    return jsonb_build_object('ok', false, 'error', 'Bu kupon bugün geçerli değil');
  end if;
  if c.daily_start is not null and c.daily_end is not null then
    if c.daily_start <= c.daily_end then v_ok := v_t between c.daily_start and c.daily_end;
    else v_ok := v_t >= c.daily_start or v_t <= c.daily_end; end if;
    if not v_ok then
      return jsonb_build_object('ok', false, 'error',
        'Bu kupon yalnızca ' || to_char(c.daily_start, 'HH24:MI') || ' – ' || to_char(c.daily_end, 'HH24:MI') || ' saatleri arasında geçerli');
    end if;
  end if;
  if p_subtotal < c.min_order_amount then
    return jsonb_build_object('ok', false, 'error', 'Bu kupon için minimum sepet tutarı ' || c.min_order_amount || ' ₺');
  end if;
  if c.usage_limit is not null and c.used_count >= c.usage_limit then
    return jsonb_build_object('ok', false, 'error', 'Bu kuponun kontenjanı doldu');
  end if;

  if c.audience = 'members' and not coalesce(p_logged, false) then
    return jsonb_build_object('ok', false, 'error', 'Bu kupon yalnızca üyeler için — lütfen giriş yapın');
  end if;
  if c.audience = 'specific' and (p_customer is null or not (p_customer = any (c.customer_ids))) then
    return jsonb_build_object('ok', false, 'error', 'Bu kupon size tanımlı değil');
  end if;
  if c.audience = 'new_customers' then
    select count(*) into v_n from public.orders o
     where o.status <> 'cancelled' and (p_exclude_order is null or o.id <> p_exclude_order)
       and ((p_customer is not null and o.customer_id = p_customer) or (p_phone is not null and o.customer_phone = p_phone));
    if v_n > 0 then
      return jsonb_build_object('ok', false, 'error', 'Bu kupon yalnızca ilk siparişte geçerli');
    end if;
  end if;
  if c.per_customer_limit is not null then
    select count(*) into v_n from public.coupon_redemptions r
     where r.coupon_id = c.id and ((p_customer is not null and r.customer_id = p_customer) or (p_phone is not null and r.phone = p_phone));
    if v_n >= c.per_customer_limit then
      return jsonb_build_object('ok', false, 'error', 'Bu kuponu daha önce kullandınız');
    end if;
  end if;

  if c.discount_type = 'percent' then
    v_disc := round(p_subtotal * c.discount_value / 100, 2);
    if c.max_discount is not null then v_disc := least(v_disc, c.max_discount); end if;
  elsif c.discount_type = 'fixed' then
    v_disc := least(c.discount_value, p_subtotal);
  else
    v_disc := coalesce(p_fee, 0);
  end if;
  if v_disc <= 0 then
    return jsonb_build_object('ok', false, 'error', 'Bu sepette kupon indirimi uygulanamıyor');
  end if;
  return jsonb_build_object('ok', true, 'coupon_id', c.id, 'discount', v_disc, 'title', c.title, 'type', c.discount_type);
end $$;

-- ---- Kupon önizleme (müşteri sepet ekranı) ------------------------------------------
create or replace function public.validate_coupon(p_code text, p_subtotal numeric, p_phone text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_s public.business_settings%rowtype; v_fee numeric := 0; v_cust uuid;
begin
  select * into v_s from public.business_settings where id = 1;
  v_fee := v_s.delivery_fee;
  if v_s.free_delivery_threshold is not null and p_subtotal >= v_s.free_delivery_threshold then v_fee := 0; end if;
  if auth.uid() is not null then
    select id into v_cust from public.customers where user_id = auth.uid() limit 1;
  end if;
  if v_cust is null and p_phone is not null then
    select id into v_cust from public.customers where phone = p_phone order by created_at desc limit 1;
  end if;
  return public._coupon_check(p_code, coalesce(p_subtotal, 0), v_fee, v_cust, p_phone, auth.uid() is not null, null);
end $$;

-- ---- Kuponlu / puanlı sipariş (place_order'ı sarar; hata olursa sipariş de geri alınır) -----
create or replace function public.place_order_with_coupon(
  p_customer jsonb, p_items jsonb,
  p_payment public.payment_method default null, p_note text default null,
  p_table_token text default null, p_save_address boolean default false,
  p_coupon text default null, p_use_points int default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_res jsonb; v_o public.orders%rowtype; v_s public.business_settings%rowtype;
  v_chk jsonb; v_disc numeric(10,2) := 0; v_pdisc numeric(10,2) := 0; v_pts int := 0; v_bal int; v_total numeric(10,2);
  v_has_coupon boolean := nullif(trim(coalesce(p_coupon, '')), '') is not null;
begin
  v_res := public.place_order(p_customer, p_items, p_payment, p_note, p_table_token, p_save_address);
  if not v_has_coupon and coalesce(p_use_points, 0) <= 0 then return v_res; end if;

  select * into v_o from public.orders where id = (v_res->>'order_id')::uuid for update;
  if v_o.order_type = 'dine_in' then return v_res; end if;   -- masa siparişlerinde kupon/puan yok
  select * into v_s from public.business_settings where id = 1;

  if v_has_coupon then
    v_chk := public._coupon_check(p_coupon, v_o.subtotal, v_o.delivery_fee, v_o.customer_id, v_o.customer_phone,
                                  auth.uid() is not null, v_o.id);
    if not (v_chk->>'ok')::boolean then
      raise exception '%', v_chk->>'error' using errcode = 'P0001';
    end if;
    v_disc := (v_chk->>'discount')::numeric;
  end if;

  if coalesce(p_use_points, 0) > 0 then
    if not v_s.loyalty_enabled then raise exception 'Puan sistemi şu an kapalı' using errcode = 'P0001'; end if;
    if auth.uid() is null or v_o.customer_id is null then
      raise exception 'Puan kullanmak için giriş yapmalısınız' using errcode = 'P0001';
    end if;
    select loyalty_points into v_bal from public.customers where id = v_o.customer_id for update;
    v_pts := least(p_use_points, coalesce(v_bal, 0));
    if v_pts < v_s.loyalty_min_redeem then
      raise exception 'En az % puan kullanabilirsiniz (bakiyeniz: %)', v_s.loyalty_min_redeem, coalesce(v_bal, 0) using errcode = 'P0001';
    end if;
    v_pdisc := least(v_pts * v_s.loyalty_point_value, greatest(v_o.subtotal + v_o.delivery_fee - v_disc, 0));
    v_pts := ceil(v_pdisc / v_s.loyalty_point_value);          -- gerçekten harcanan puan
  end if;

  v_total := greatest(v_o.subtotal + v_o.delivery_fee - (v_disc + v_pdisc), 0);
  update public.orders set discount = v_disc + v_pdisc, total = v_total where id = v_o.id;

  if v_has_coupon then
    update public.coupons set used_count = used_count + 1, updated_at = now()
     where id = (v_chk->>'coupon_id')::uuid and (usage_limit is null or used_count < usage_limit);
    if not found then raise exception 'Bu kuponun kontenjanı doldu' using errcode = 'P0001'; end if;
    insert into public.coupon_redemptions (coupon_id, order_id, customer_id, phone, amount)
    values ((v_chk->>'coupon_id')::uuid, v_o.id, v_o.customer_id, v_o.customer_phone, v_disc);
  end if;
  if v_pts > 0 then
    insert into public.loyalty_ledger (customer_id, points, reason, order_id, note)
    values (v_o.customer_id, -v_pts, 'redeem', v_o.id, 'Sipariş #' || v_o.order_no || ' indirimi');
  end if;

  return v_res || jsonb_build_object('total', v_total, 'discount', v_disc + v_pdisc,
                                     'coupon_discount', v_disc, 'points_discount', v_pdisc, 'points_used', v_pts);
end $$;

-- ---- Herkese açık kampanya listesi (yalnızca güvenli alanlar) ---------------------------
create or replace function public.public_campaigns()
returns table (id uuid, code text, title text, description text, discount_type text, discount_value numeric,
               max_discount numeric, min_order_amount numeric, starts_at timestamptz, ends_at timestamptz,
               daily_start time, daily_end time, weekdays int[], audience text, remaining int)
language sql stable security definer set search_path = '' as $$
  select c.id, c.code, c.title, c.description, c.discount_type, c.discount_value, c.max_discount,
         c.min_order_amount, c.starts_at, c.ends_at, c.daily_start, c.daily_end, c.weekdays, c.audience,
         case when c.usage_limit is null then null else greatest(c.usage_limit - c.used_count, 0) end
    from public.coupons c
   where c.is_public and c.is_active and c.audience <> 'specific'
     and (c.ends_at is null or c.ends_at > now())
     and (c.starts_at is null or c.starts_at <= now() + interval '7 days')
     and (c.usage_limit is null or c.used_count < c.usage_limit)
   order by c.created_at desc
$$;

-- ---- Müşteri paneli (yönetici) --------------------------------------------------------
create or replace function public.admin_customers()
returns table (id uuid, user_id uuid, full_name text, phone text, email text, notes text, loyalty_points int,
               created_at timestamptz, order_count bigint, total_spent numeric, last_order_at timestamptz, avg_basket numeric)
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
         coalesce(avg(o.total) filter (where o.status = 'delivered'), 0)
    from public.customers c
    left join public.orders o on o.customer_id = c.id
   group by c.id
   order by max(o.created_at) desc nulls last, c.created_at desc;
end $$;

create or replace function public.admin_update_customer(p_customer uuid, p_name text, p_phone text, p_notes text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.current_app_role() is null or public.current_app_role() not in ('owner', 'sub_admin', 'operator') then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  update public.customers
     set full_name = coalesce(nullif(trim(p_name), ''), full_name), phone = nullif(trim(p_phone), ''),
         notes = nullif(trim(p_notes), ''), updated_at = now()
   where id = p_customer;
end $$;

create or replace function public.admin_adjust_points(p_customer uuid, p_points int, p_note text default null)
returns int language plpgsql security definer set search_path = '' as $$
declare v_bal int;
begin
  if public.current_app_role() is null or public.current_app_role() not in ('owner', 'sub_admin') then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  select loyalty_points into v_bal from public.customers where id = p_customer for update;
  if v_bal is null then raise exception 'Müşteri bulunamadı' using errcode = 'P0001'; end if;
  if v_bal + p_points < 0 then raise exception 'Bakiye eksiye düşemez (bakiye: %)', v_bal using errcode = 'P0001'; end if;
  insert into public.loyalty_ledger (customer_id, points, reason, note, created_by)
  values (p_customer, p_points, 'adjust', nullif(trim(p_note), ''), auth.uid());
  return v_bal + p_points;
end $$;

-- ---- Müşterinin kendi puanı ---------------------------------------------------------------
create or replace function public.my_loyalty()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_s public.business_settings%rowtype; v_c public.customers%rowtype;
begin
  select * into v_s from public.business_settings where id = 1;
  if auth.uid() is null then return jsonb_build_object('enabled', v_s.loyalty_enabled, 'points', 0, 'history', '[]'::jsonb); end if;
  select * into v_c from public.customers where user_id = auth.uid() limit 1;
  return jsonb_build_object(
    'enabled', v_s.loyalty_enabled, 'points', coalesce(v_c.loyalty_points, 0),
    'earn_per_lira', v_s.loyalty_earn_per_lira, 'point_value', v_s.loyalty_point_value, 'min_redeem', v_s.loyalty_min_redeem,
    'history', coalesce((select jsonb_agg(jsonb_build_object('points', l.points, 'reason', l.reason, 'note', l.note, 'at', l.created_at) order by l.created_at desc)
                           from (select * from public.loyalty_ledger where customer_id = v_c.id order by created_at desc limit 30) l), '[]'::jsonb));
end $$;

-- ---- Yetkiler -----------------------------------------------------------------------------------
revoke execute on function public.admin_customers(), public.admin_update_customer(uuid, text, text, text),
  public.admin_adjust_points(uuid, int, text), public.my_loyalty() from public, anon;
grant execute on function public.admin_customers(), public.admin_update_customer(uuid, text, text, text),
  public.admin_adjust_points(uuid, int, text), public.my_loyalty() to authenticated;
revoke execute on function public._coupon_check(text, numeric, numeric, uuid, text, boolean, uuid) from public, anon, authenticated;
grant execute on function public.validate_coupon(text, numeric, text), public.public_campaigns() to anon, authenticated;
grant execute on function public.place_order_with_coupon(jsonb, jsonb, public.payment_method, text, text, boolean, text, int) to anon, authenticated;

-- ---- İşlem geçmişi (audit) tetikleyicileri ----------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['coupons', 'loyalty_ledger']
  loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I
                    for each row execute function public.log_audit()', t);
  end loop;
end $$;
