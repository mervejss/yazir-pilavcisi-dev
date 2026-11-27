-- =====================================================================
-- YAZIR PİLAVCISI · 10 — KURYE CANLI TAKİP, SİPARİŞ İSTEĞİ & KURYE EKRANI
-- =====================================================================
-- Supabase > SQL Editor'de TEK SEFER çalıştırın (tekrar çalıştırmak güvenlidir).
--
--  1) Restoran koordinatı (Google Haritalar pini) işletme ayarlarına yazılır (boşsa)
--  2) courier_order_requests : kurye "bu paketi ben almak istiyorum" isteği
--  3) courier_list_orders()  : kuryenin göreceği TÜM aktif teslimatlar
--                              (başkasının siparişinde müşteri adı/telefon/açık adres GİZLİ)
--  4) courier_request_order / courier_cancel_request / resolve_courier_request
--  5) set_courier_online(false) → konum satırı silinir (haritadan kaybolur)
--  6) Admin doğrudan atama yapınca bekleyen istekler otomatik kapanır
-- =====================================================================

-- 1) Restoran konumu: Yazır, Şht. Erkan Özbalcı Sk. No:20/b, Selçuklu / Konya
update public.business_settings
   set lat = coalesce(lat, 37.957500),
       lng = coalesce(lng, 32.509867),
       google_maps_url = coalesce(google_maps_url, 'https://maps.app.goo.gl/c1BAhzu2H56kiwQz7')
 where id = 1;

-- 2) İstek tablosu
create table if not exists public.courier_order_requests (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  courier_id  uuid not null references public.profiles(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  uuid references public.profiles(id) on delete set null
);
create unique index if not exists courier_order_requests_one_pending
  on public.courier_order_requests(order_id, courier_id) where status = 'pending';
create index if not exists courier_order_requests_order_idx   on public.courier_order_requests(order_id, status);
create index if not exists courier_order_requests_courier_idx on public.courier_order_requests(courier_id, status);

alter table public.courier_order_requests enable row level security;
drop policy if exists courier_order_requests_select on public.courier_order_requests;
create policy courier_order_requests_select on public.courier_order_requests for select to authenticated
  using (courier_id = (select auth.uid())
         or (select public.has_permission('orders.assign_courier'))
         or (select public.has_permission('couriers.view')));
revoke insert, update, delete on public.courier_order_requests from authenticated, anon;
grant select on public.courier_order_requests to authenticated;

-- Realtime yayınına ekle
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'courier_order_requests') then
    alter publication supabase_realtime add table public.courier_order_requests;
  end if;
end $$;

-- 3) Kurye için tüm aktif teslimatlar (kişisel veri yalnızca kendi siparişinde)
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
      o.id, o.order_no, o.status, o.created_at, o.total, o.payment_method, o.district,
      (o.courier_id = v_uid) as is_mine,
      (o.courier_id is not null and o.courier_id <> v_uid) as taken_by_other,
      case when o.courier_id is not null then split_part(cp.full_name, ' ', 1) end as courier_first_name,
      case when o.courier_id = v_uid then o.customer_name end    as customer_name,
      case when o.courier_id = v_uid then o.customer_phone end   as customer_phone,
      case when o.courier_id = v_uid then o.delivery_address end as delivery_address,
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

-- 4a) "Bu paketi ben götürmek istiyorum"
create or replace function public.courier_request_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_o public.orders%rowtype; v_name text;
begin
  if public.current_app_role() is distinct from 'courier' then
    raise exception 'Yalnızca kuryeler kullanabilir' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and is_active) then
    raise exception 'Hesabınız pasif' using errcode = '42501';
  end if;
  select * into v_o from public.orders where id = p_order_id;
  if not found then raise exception 'Sipariş bulunamadı' using errcode = 'P0001'; end if;
  if v_o.order_type <> 'delivery' then raise exception 'Bu sipariş kurye ile teslim edilmiyor' using errcode = 'P0001'; end if;
  if v_o.courier_id is not null then raise exception 'Bu siparişe zaten bir kurye atanmış' using errcode = 'P0001'; end if;
  if v_o.status not in ('new', 'preparing', 'ready') then raise exception 'Bu sipariş için istek gönderilemez' using errcode = 'P0001'; end if;

  insert into public.courier_order_requests (order_id, courier_id) values (p_order_id, v_uid)
  on conflict do nothing;

  select full_name into v_name from public.profiles where id = v_uid;
  perform public._notify_staff('orders.assign_courier', 'system',
    'Kurye isteği · #' || v_o.order_no, coalesce(v_name, 'Kurye') || ' bu paketi götürmek istiyor',
    jsonb_build_object('kind', 'courier_request', 'order_id', p_order_id, 'courier_id', v_uid));
  return jsonb_build_object('ok', true);
end $$;

-- 4b) İsteği geri çek
create or replace function public.courier_cancel_request(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.current_app_role() is distinct from 'courier' then
    raise exception 'Yalnızca kuryeler kullanabilir' using errcode = '42501';
  end if;
  update public.courier_order_requests
     set status = 'cancelled', decided_at = now()
   where order_id = p_order_id and courier_id = auth.uid() and status = 'pending';
end $$;

-- 4c) Yönetici onayı / reddi
create or replace function public.resolve_courier_request(p_request_id uuid, p_approve boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_r public.courier_order_requests%rowtype; v_o public.orders%rowtype;
begin
  perform public._require_permission('orders.assign_courier');
  select * into v_r from public.courier_order_requests where id = p_request_id for update;
  if not found then raise exception 'İstek bulunamadı' using errcode = 'P0001'; end if;
  if v_r.status <> 'pending' then raise exception 'Bu istek zaten sonuçlanmış' using errcode = 'P0001'; end if;

  select * into v_o from public.orders where id = v_r.order_id for update;

  if p_approve then
    if v_o.courier_id is not null then
      update public.courier_order_requests set status = 'rejected', decided_at = now(), decided_by = auth.uid() where id = p_request_id;
      raise exception 'Siparişe zaten kurye atanmış' using errcode = 'P0001';
    end if;
    if v_o.status = 'new' then
      update public.orders set status = 'preparing' where id = v_o.id;   -- onay = siparişi kabul et
    end if;
    perform public.assign_courier(v_o.id, v_r.courier_id);              -- diğer bekleyen istekleri trigger kapatır
    update public.courier_order_requests
       set status = 'approved', decided_at = now(), decided_by = auth.uid() where id = p_request_id;
    insert into public.notifications (user_id, type, title, body, data)
    values (v_r.courier_id, 'order_assigned', 'İsteğiniz onaylandı · #' || v_o.order_no, 'Paket size atandı',
            jsonb_build_object('order_id', v_o.id, 'order_no', v_o.order_no));
  else
    update public.courier_order_requests
       set status = 'rejected', decided_at = now(), decided_by = auth.uid() where id = p_request_id;
    insert into public.notifications (user_id, type, title, body, data)
    values (v_r.courier_id, 'system', 'İsteğiniz reddedildi · #' || v_o.order_no, 'Bu paket başka kuryeye verilebilir',
            jsonb_build_object('order_id', v_o.id, 'order_no', v_o.order_no));
  end if;
  return jsonb_build_object('ok', true, 'approved', p_approve);
end $$;

-- 5) Çevrimdışı olunca konum satırı silinir: kurye haritada görünmez
create or replace function public.set_courier_online(p_online boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.current_app_role() is distinct from 'courier' then
    raise exception 'Yalnızca kuryeler kullanabilir' using errcode = '42501';
  end if;
  update public.courier_profiles set is_online = p_online where user_id = auth.uid();
  if not p_online then
    delete from public.courier_locations where courier_id = auth.uid();
  end if;
end $$;

-- 6) Atama değişince / sipariş bitince bekleyen istekleri kapat
create or replace function public.close_courier_requests()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('delivered', 'cancelled') then
    update public.courier_order_requests set status = 'cancelled', decided_at = now()
     where order_id = new.id and status = 'pending';
  elsif new.courier_id is not null and new.courier_id is distinct from old.courier_id then
    update public.courier_order_requests
       set status = case when courier_id = new.courier_id then 'approved' else 'rejected' end, decided_at = now()
     where order_id = new.id and status = 'pending';
  end if;
  return null;
end $$;
drop trigger if exists orders_close_courier_requests on public.orders;
create trigger orders_close_courier_requests after update of courier_id, status on public.orders
  for each row execute function public.close_courier_requests();

-- Yetkiler
revoke execute on function public.courier_list_orders(), public.courier_request_order(uuid),
  public.courier_cancel_request(uuid), public.resolve_courier_request(uuid, boolean) from public, anon;
grant execute on function public.courier_list_orders(), public.courier_request_order(uuid),
  public.courier_cancel_request(uuid), public.resolve_courier_request(uuid, boolean) to authenticated;
