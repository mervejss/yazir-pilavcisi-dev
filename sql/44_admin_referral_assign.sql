-- =====================================================================
-- 44 · YÖNETİCİ, ÜYE MÜŞTERİYE REFERANS KODU TANIMLAYABİLSİN (v68)
-- Supabase → SQL Editor'de bir kez çalıştırın (sql/36'dan sonra). Tekrar çalıştırmak güvenlidir.
-- * Yönetici tanımladığı referans KALICIDIR: müşteri kendi hesabından başka kod giriremez / kaldıramaz;
--   yalnızca yönetici değiştirir veya kaldırır. Müşteri siparişte indirimi otomatik alır (mevcut sistem).
-- * Yalnızca web sitesinden kayıtlı (hesabı olan) müşteriler için; telefon müşterisinin hesabı olmadığından uygulanmaz.
-- =====================================================================
alter table public.customer_referrals add column if not exists assigned_by_admin boolean not null default false;
alter table public.customer_referrals add column if not exists assigned_by uuid;

-- Müşteri kendi kodunu girerken: yönetici tanımlıysa üzerine yazılmaz
create or replace function public.apply_referral_code(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.referral_campaigns%rowtype; v_code text; v_audience text;
begin
  if auth.uid() is null then raise exception 'Referans kodu eklemek için giriş yapmalısınız'; end if;
  if public.current_app_role() is not null and public.current_app_role() <> 'customer' then raise exception 'Bu özellik müşteri hesapları içindir'; end if;
  if exists (select 1 from public.customer_referrals where user_id = auth.uid() and assigned_by_admin) then
    return jsonb_build_object('ok', false, 'error', 'Hesabınıza referans yönetici tarafından tanımlanmış; değiştirmek için işletmeyle iletişime geçin');
  end if;
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

create or replace function public.remove_my_referral()
returns void language sql security definer set search_path = '' as $$
  delete from public.customer_referrals where user_id = auth.uid() and not assigned_by_admin
$$;
grant execute on function public.remove_my_referral() to authenticated;

-- Müşterinin kendi ekranında "yönetici tanımladı" bilgisi için
create or replace function public.my_referral()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('code',r.code,'audience',r.audience,'applied_at',r.applied_at,
    'campaign_name',c.campaign_name,'business_name',c.business_name,
    'discount',case when r.audience='staff' then c.staff_discount else c.customer_discount end,
    'scope',case when r.audience='staff' then c.staff_scope else c.customer_scope end,
    'is_active',c.is_active,'locked',r.assigned_by_admin)
  from public.customer_referrals r join public.referral_campaigns c on c.id=r.campaign_id
  where r.user_id=auth.uid()
$$;
grant execute on function public.my_referral() to authenticated;

-- Yönetici: müşteriye kod tanımla (kod boşsa kaldırır)
create or replace function public.admin_set_customer_referral(p_customer uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; c public.referral_campaigns%rowtype; v_code text; v_aud text;
begin
  if public.current_app_role() is null or public.current_app_role() not in ('owner','sub_admin') then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  select user_id into v_uid from public.customers where id = p_customer;
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'Bu müşterinin web sitesi hesabı yok; referans yalnızca üye hesaplara tanımlanır'); end if;
  v_code := upper(regexp_replace(trim(coalesce(p_code,'')), '\s+', '', 'g'));
  if v_code = '' then
    delete from public.customer_referrals where user_id = v_uid;
    return jsonb_build_object('ok', true, 'removed', true);
  end if;
  select * into c from public.referral_campaigns where upper(staff_code) = v_code or upper(customer_code) = v_code limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'Bu kod hiçbir kampanyada bulunamadı'); end if;
  v_aud := case when upper(c.staff_code) = v_code then 'staff' else 'customer' end;
  insert into public.customer_referrals(user_id, campaign_id, audience, code, assigned_by_admin, assigned_by)
  values (v_uid, c.id, v_aud, v_code, true, auth.uid())
  on conflict (user_id) do update set campaign_id = excluded.campaign_id, audience = excluded.audience, code = excluded.code,
        assigned_by_admin = true, assigned_by = auth.uid(), applied_at = now();
  return jsonb_build_object('ok', true, 'business_name', c.business_name, 'campaign_name', c.campaign_name, 'audience', v_aud,
    'active', c.is_active);
end $$;
revoke all on function public.admin_set_customer_referral(uuid, text) from public, anon;
grant execute on function public.admin_set_customer_referral(uuid, text) to authenticated;

-- Yönetici: tüm müşterilerin referansları (liste rozeti ve detay için; hafif)
create or replace function public.admin_customer_referrals()
returns table(customer_id uuid, code text, audience text, business_name text, campaign_name text, is_active boolean, assigned_by_admin boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.current_app_role() is null or public.current_app_role() not in ('owner','sub_admin','operator') then
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;
  return query
  select cu.id, r.code, r.audience, c.business_name, c.campaign_name, c.is_active, r.assigned_by_admin
    from public.customer_referrals r
    join public.referral_campaigns c on c.id = r.campaign_id
    join public.customers cu on cu.user_id = r.user_id;
end $$;
revoke all on function public.admin_customer_referrals() from public, anon;
grant execute on function public.admin_customer_referrals() to authenticated;
