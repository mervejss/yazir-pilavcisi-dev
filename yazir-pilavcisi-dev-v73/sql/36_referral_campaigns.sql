-- 36 — İşletme referans kampanyaları
-- Supabase SQL Editor'de bir kez çalıştırın.
create table if not exists public.referral_campaigns (
  id uuid primary key default gen_random_uuid(),
  campaign_name text not null default '',
  business_name text not null default '',
  staff_enabled boolean not null default true,
  customers_enabled boolean not null default true,
  staff_discount numeric(5,2) not null default 0 check (staff_discount between 0 and 100),
  customer_discount numeric(5,2) not null default 0 check (customer_discount between 0 and 100),
  staff_scope text not null default 'cart' check (staff_scope in ('cart','product')),
  customer_scope text not null default 'cart' check (customer_scope in ('cart','product')),
  staff_code text not null unique,
  customer_code text not null unique,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists referral_campaigns_active_idx on public.referral_campaigns(is_active);
alter table public.referral_campaigns enable row level security;
drop policy if exists referral_campaigns_admin_all on public.referral_campaigns;
create policy referral_campaigns_admin_all on public.referral_campaigns for all to authenticated
using (public.current_app_role() in ('owner','sub_admin'))
with check (public.current_app_role() in ('owner','sub_admin'));
grant select, insert, update, delete on public.referral_campaigns to authenticated;

create table if not exists public.customer_referrals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.referral_campaigns(id) on delete restrict,
  audience text not null check (audience in ('staff','customer')),
  code text not null,
  applied_at timestamptz not null default now()
);
alter table public.customer_referrals enable row level security;
drop policy if exists customer_referrals_self_select on public.customer_referrals;
create policy customer_referrals_self_select on public.customer_referrals for select to authenticated using (user_id = auth.uid());
grant select on public.customer_referrals to authenticated;

create or replace function public.apply_referral_code(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.referral_campaigns%rowtype; v_code text; v_audience text;
begin
  if auth.uid() is null then raise exception 'Referans kodu eklemek için giriş yapmalısınız'; end if;
  if public.current_app_role() is not null and public.current_app_role() <> 'customer' then raise exception 'Bu özellik müşteri hesapları içindir'; end if;
  v_code := upper(regexp_replace(trim(coalesce(p_code,'')), '\s+', '', 'g'));
  if length(v_code) < 8 then return jsonb_build_object('ok',false,'error','Referans kodu geçersiz'); end if;
  select * into c from public.referral_campaigns
   where is_active and (upper(staff_code)=v_code or upper(customer_code)=v_code) limit 1;
  if not found then return jsonb_build_object('ok',false,'error','Bu referans kodu bulunamadı veya kampanya pasif'); end if;
  if upper(c.staff_code)=v_code and c.staff_enabled then v_audience := 'staff';
  elsif upper(c.customer_code)=v_code and c.customers_enabled then v_audience := 'customer';
  else return jsonb_build_object('ok',false,'error','Bu kod şu anda kullanılamıyor'); end if;
  insert into public.customer_referrals(user_id,campaign_id,audience,code)
  values(auth.uid(),c.id,v_audience,v_code)
  on conflict(user_id) do update set campaign_id=excluded.campaign_id,audience=excluded.audience,code=excluded.code,applied_at=now();
  return jsonb_build_object('ok',true,'business_name',c.business_name,'campaign_name',c.campaign_name,
    'discount',case when v_audience='staff' then c.staff_discount else c.customer_discount end,
    'scope',case when v_audience='staff' then c.staff_scope else c.customer_scope end,
    'audience',v_audience);
end $$;
grant execute on function public.apply_referral_code(text) to authenticated;

create or replace function public.my_referral()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('code',r.code,'audience',r.audience,'applied_at',r.applied_at,
    'campaign_name',c.campaign_name,'business_name',c.business_name,
    'discount',case when r.audience='staff' then c.staff_discount else c.customer_discount end,
    'scope',case when r.audience='staff' then c.staff_scope else c.customer_scope end,
    'is_active',c.is_active)
  from public.customer_referrals r join public.referral_campaigns c on c.id=r.campaign_id
  where r.user_id=auth.uid()
$$;
grant execute on function public.my_referral() to authenticated;

create or replace function public.remove_my_referral()
returns void language sql security definer set search_path = '' as $$
  delete from public.customer_referrals where user_id=auth.uid()
$$;
grant execute on function public.remove_my_referral() to authenticated;

-- Kampanyalar ve anlaşmalı işletmeler için yalnızca açık/aktif kayıtları döndürür.
create or replace function public.public_referral_campaigns()
returns table(campaign_name text,business_name text,staff_discount numeric,customer_discount numeric)
language sql stable security definer set search_path = '' as $$
 select campaign_name,business_name,staff_discount,customer_discount
 from public.referral_campaigns where is_active and (staff_enabled or customers_enabled)
 order by business_name
$$;
grant execute on function public.public_referral_campaigns() to anon, authenticated;

-- Sipariş sırasında kayıtlı referans kampanyasını güvenli şekilde uygula.
create or replace function public.place_order_with_referral(
  p_customer jsonb, p_items jsonb,
  p_payment public.payment_method default null, p_note text default null,
  p_table_token text default null, p_save_address boolean default false,
  p_coupon text default null, p_use_points int default 0,
  p_referral_code text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_res jsonb; v_o public.orders%rowtype; r public.customer_referrals%rowtype; c public.referral_campaigns%rowtype;
  v_pct numeric(5,2); v_scope text; v_before numeric(10,2); v_after numeric(10,2);
  v_extra numeric(10,2); v_disc numeric(10,2); v_total numeric(10,2);
begin
  if nullif(trim(coalesce(p_coupon,'')),'') is not null or coalesce(p_use_points,0)>0 then
    v_res := public.place_order_with_coupon(p_customer,p_items,p_payment,p_note,p_table_token,p_save_address,p_coupon,p_use_points);
  else
    v_res := public.place_order(p_customer,p_items,p_payment,p_note,p_table_token,p_save_address);
  end if;
  if nullif(trim(coalesce(p_referral_code,'')),'') is null or p_table_token is not null then return v_res; end if;
  if auth.uid() is null then raise exception 'Referans indirimi için giriş yapmalısınız'; end if;
  select * into v_o from public.orders where id=(v_res->>'order_id')::uuid for update;
  select * into r from public.customer_referrals where user_id=auth.uid() and upper(code)=upper(trim(p_referral_code));
  if not found then raise exception 'Hesabınızda bu referans kodu kayıtlı değil'; end if;
  select * into c from public.referral_campaigns where id=r.campaign_id and is_active;
  if not found then raise exception 'Referans kampanyası artık aktif değil'; end if;
  if r.audience='staff' then v_pct:=c.staff_discount; v_scope:=c.staff_scope;
  else v_pct:=c.customer_discount; v_scope:=c.customer_scope; end if;
  if v_pct<=0 then raise exception 'Bu kampanyada geçerli indirim bulunmuyor'; end if;
  v_before:=v_o.subtotal;
  if v_scope='product' then
    update public.order_items
       set unit_price=round(unit_price*(1-v_pct/100),2)
     where order_id=v_o.id;
    select coalesce(sum(line_total),0) into v_after from public.order_items where order_id=v_o.id;
    v_extra:=greatest(v_before-v_after,0);
    v_disc:=v_o.discount+v_extra;
    v_total:=greatest(v_before+v_o.delivery_fee-v_disc,0);
    -- Satır fiyatları indirimli kaydedilir; siparişin orijinal ara toplamı ve indirim toplamı korunur.
    update public.orders set discount=v_disc,total=v_total where id=v_o.id;
  else
    v_extra:=round(v_before*v_pct/100,2);
    v_disc:=v_o.discount+v_extra;
    v_total:=greatest(v_before+v_o.delivery_fee-v_disc,0);
    update public.orders set discount=v_disc,total=v_total where id=v_o.id;
  end if;
  return v_res || jsonb_build_object('total',v_total,'referral_discount',v_extra);
end $$;
grant execute on function public.place_order_with_referral(jsonb,jsonb,public.payment_method,text,text,boolean,text,int,text) to authenticated, anon;

-- Kodlar oluşturulduktan sonra değiştirilemez; böylece basılı/paylaşılmış kodlar bozulmaz.
create or replace function public.prevent_referral_code_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.staff_code is distinct from new.staff_code or old.customer_code is distinct from new.customer_code then
    raise exception 'Referans kodları oluşturulduktan sonra değiştirilemez';
  end if;
  return new;
end $$;
drop trigger if exists referral_codes_immutable on public.referral_campaigns;
create trigger referral_codes_immutable before update on public.referral_campaigns
for each row execute function public.prevent_referral_code_change();
