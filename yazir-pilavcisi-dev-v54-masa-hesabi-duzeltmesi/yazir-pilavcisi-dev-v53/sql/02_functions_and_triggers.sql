-- =====================================================================
-- YAZIR PİLAVCISI · 02 · Fonksiyonlar, tetikleyiciler ve RPC'ler
-- 01_types_and_tables.sql'den SONRA çalıştırın.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Genel yardımcılar
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- İş günü: gece 03:00'te kapanan işletme için gün, sabah 03:00'te değişir (Türkiye saati)
create or replace function public.business_day(ts timestamptz)
returns date language sql stable set search_path = '' as $$
  select ((ts at time zone 'Europe/Istanbul') - interval '3 hours')::date
$$;

create or replace function public.current_business_day_range()
returns table (range_from timestamptz, range_to timestamptz)
language sql stable set search_path = '' as $$
  select ((public.business_day(now()))::timestamp + interval '3 hours') at time zone 'Europe/Istanbul',
         ((public.business_day(now()) + 1)::timestamp + interval '3 hours') at time zone 'Europe/Istanbul'
$$;

-- Şu an açık mıyız? (gece yarısını aşan çalışma saatlerini de doğru hesaplar)
create or replace function public.is_open_now()
returns boolean language sql stable security definer set search_path = '' as $$
  with n as (select (now() at time zone 'Europe/Istanbul') as t)
  select exists (
    select 1 from public.opening_hours h, n
    where not h.is_closed and (
      ( extract(isodow from n.t)::int = h.day_of_week
        and n.t::time >= h.open_time
        and (h.closes_next_day or n.t::time < h.close_time) )
      or
      ( h.closes_next_day
        and extract(isodow from (n.t - interval '1 day'))::int = h.day_of_week
        and n.t::time < h.close_time )
    )
  )
$$;

create or replace function public.order_status_label(s public.order_status)
returns text language sql immutable set search_path = '' as $$
  select case s
    when 'new' then 'Yeni'
    when 'preparing' then 'Hazırlanıyor'
    when 'ready' then 'Hazır'
    when 'assigned' then 'Kuryeye atandı'
    when 'on_the_way' then 'Yolda'
    when 'delivered' then 'Teslim edildi'
    when 'cancelled' then 'İptal edildi'
  end
$$;

create or replace function public.order_transition_allowed(p_from public.order_status, p_to public.order_status)
returns boolean language sql immutable set search_path = '' as $$
  select case p_from
    when 'new'        then p_to in ('preparing', 'cancelled')
    when 'preparing'  then p_to in ('ready', 'assigned', 'cancelled')
    when 'ready'      then p_to in ('preparing', 'assigned', 'delivered', 'cancelled')
    when 'assigned'   then p_to in ('ready', 'on_the_way', 'cancelled')
    when 'on_the_way' then p_to in ('assigned', 'delivered', 'cancelled')
    else false
  end
$$;

-- updated_at otomatik güncelleme
do $$
declare t text;
begin
  foreach t in array array['profiles','business_settings','categories','products','product_variants',
                           'customers','customer_addresses','courier_profiles','bulk_order_requests','integrations']
  loop
    execute format('create trigger set_updated_at_%1$s before update on public.%1$I
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2) Rol ve yetki yardımcıları (RLS politikalarında kullanılır)
-- ---------------------------------------------------------------------
create or replace function public.current_app_role()
returns public.app_role language plpgsql stable security definer set search_path = 'public' as $$
declare
  v_role public.app_role;
begin
  if auth.uid() is null then return null; end if;
  select role into v_role from public.profiles where id = auth.uid() and is_active;
  return v_role;
end $$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = 'public' as $$
  select coalesce(public.current_app_role() in ('owner', 'sub_admin', 'operator'), false);
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = 'public' as $$
  select coalesce(public.current_app_role() = 'owner', false);
$$;

-- Etkin yetki = sahip: hepsi · diğerleri: kişiye özel istisna varsa o, yoksa rolün varsayılanı
create or replace function public.user_has_permission(p_user uuid, p_key text)
returns boolean language plpgsql stable security definer set search_path = 'public' as $$
declare
  v_role public.app_role;
  v_override boolean;
begin
  if p_user is null then return false; end if;

  select role into v_role from public.profiles where id = p_user and is_active;
  if v_role is null then return false; end if;
  if v_role = 'owner' then return true; end if;
  if v_role not in ('sub_admin', 'operator') then return false; end if;

  select granted into v_override from public.staff_permissions
   where user_id = p_user and permission_key = p_key;
  if v_override is not null then return v_override; end if;

  return exists (select 1 from public.role_permissions where role = v_role and permission_key = p_key);
end $$;

create or replace function public.has_permission(p_key text)
returns boolean language sql stable security definer set search_path = 'public' as $$
  select case
    when auth.uid() is null then false
    else public.user_has_permission(auth.uid(), p_key)
  end;
$$;

create or replace function public.my_customer_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select c.id from public.customers c where c.user_id = auth.uid() limit 1
$$;

create or replace function public._require_permission(p_key text)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.user_has_permission(auth.uid(), p_key) then
    raise exception 'Bu işlem için yetkiniz yok (%)', p_key using errcode = '42501';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3) Auth bağlantıları: yeni kullanıcı → profil + müşteri kaydı
--    ROL, kullanıcının gönderdiği metadata'dan ASLA alınmaz; herkes 'customer' başlar.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_name  text := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
                           split_part(coalesce(new.email, ''), '@', 1));
  v_phone text := nullif(trim(new.raw_user_meta_data->>'phone'), '');
begin
  insert into public.profiles (id, full_name, phone, email, role)
  values (new.id, v_name, v_phone, new.email, 'customer')
  on conflict (id) do nothing;

  insert into public.customers (user_id, full_name, phone, email)
  values (new.id, v_name, v_phone, new.email)
  on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.sync_user_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles  set email = new.email where id = new.id;
  update public.customers set email = new.email where user_id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.sync_user_email();

-- ---------------------------------------------------------------------
-- 4) Profil güvenliği: rol/aktiflik yalnızca sahip veya servis tarafından değişir
-- ---------------------------------------------------------------------
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Normal kullanıcı oturumu (auth.uid() dolu) ve sahip değilse hassas alanlar değiştirilemez.
  -- SQL Editor / service_role / sahip-RPC'leri (auth.uid() boş veya bypass bayrağı) serbesttir.
  if auth.uid() is not null
     and coalesce(current_setting('app.bypass_guard', true), '') <> '1'
     and not public.is_owner() then
    if new.id is distinct from old.id
       or new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.created_by is distinct from old.created_by then
      raise exception 'Rol ve aktiflik alanlarını değiştirme yetkiniz yok' using errcode = '42501';
    end if;
  end if;

  -- Sistemde her zaman en az bir aktif sahip kalmalı
  if old.role = 'owner' and old.is_active and (new.role <> 'owner' or not new.is_active) then
    if not exists (select 1 from public.profiles where role = 'owner' and is_active and id <> old.id) then
      raise exception 'Sistemde en az bir aktif sahip kalmalıdır' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create trigger guard_profile_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- Rol 'courier' olunca kurye kaydı otomatik açılır; kuryelikten çıkınca çevrimdışı olur
create or replace function public.sync_courier_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.role = 'courier' then
    insert into public.courier_profiles (user_id) values (new.id) on conflict (user_id) do nothing;
  elsif tg_op = 'UPDATE' and old.role = 'courier' then
    update public.courier_profiles set is_online = false where user_id = new.id;
  end if;
  return new;
end $$;

create trigger sync_courier_profile_ins
  after insert on public.profiles
  for each row when (new.role = 'courier') execute function public.sync_courier_profile();
create trigger sync_courier_profile_upd
  after update of role on public.profiles
  for each row when (old.role is distinct from new.role) execute function public.sync_courier_profile();

-- ---------------------------------------------------------------------
-- 5) Denetim kaydı (audit): kim, neyi, ne zaman değiştirdi
-- ---------------------------------------------------------------------
create or replace function public.log_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb; v_new jsonb; v_row jsonb; v_id text; v_role public.app_role;
begin
  if coalesce(current_setting('app.skip_audit', true), '') = '1' then return null; end if;

  if tg_op = 'INSERT' then
    v_new := to_jsonb(new); v_row := v_new;
  elsif tg_op = 'DELETE' then
    v_old := to_jsonb(old); v_row := v_old;
  else
    v_row := to_jsonb(new);
    -- yalnızca değişen alanları sakla
    select jsonb_object_agg(n.key, n.value), jsonb_object_agg(n.key, o.value)
      into v_new, v_old
      from jsonb_each(to_jsonb(new)) n
      left join jsonb_each(to_jsonb(old)) o on o.key = n.key
     where n.key <> 'updated_at' and n.value is distinct from o.value;
    if v_new is null then return null; end if;
  end if;

  v_id := coalesce(
    v_row->>'id',
    case when v_row->>'permission_key' is not null
         then coalesce(v_row->>'user_id', v_row->>'role') || ':' || (v_row->>'permission_key') end,
    v_row->>'user_id', v_row->>'key', v_row->>'platform', v_row->>'code', v_row->>'day_of_week'
  );

  select p.role into v_role from public.profiles p where p.id = auth.uid();

  insert into public.audit_logs (table_name, record_id, action, old_data, new_data, actor_id, actor_role)
  values (tg_table_name, v_id, tg_op, v_old, v_new, auth.uid(), v_role);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['orders','products','product_variants','categories','profiles','staff_permissions',
                           'role_permissions','dining_tables','business_settings','opening_hours','order_sources',
                           'integrations','courier_profiles','product_platform_mappings']
  loop
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I
                    for each row execute function public.log_audit()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 6) Bildirim yardımcıları
-- ---------------------------------------------------------------------
create or replace function public._notify_staff(
  p_permission text, p_type public.notification_type, p_title text, p_body text, p_data jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, type, title, body, data)
  select p.id, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb)
    from public.profiles p
   where p.is_active
     and p.role in ('owner', 'sub_admin', 'operator')
     and public.user_has_permission(p.id, p_permission);
end $$;

create or replace function public.notify_on_feedback()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public._notify_staff('feedback.view', 'feedback', 'Yeni geri bildirim', left(new.message, 120),
                               jsonb_build_object('feedback_id', new.id));
  return null;
end $$;
create trigger notify_on_feedback after insert on public.feedback
  for each row execute function public.notify_on_feedback();

create or replace function public.notify_on_bulk_request()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public._notify_staff('orders.view', 'bulk_request', 'Yeni toplu sipariş talebi',
                               new.full_name || ' · ' || new.people_count || ' kişi',
                               jsonb_build_object('bulk_request_id', new.id));
  return null;
end $$;
create trigger notify_on_bulk_request after insert on public.bulk_order_requests
  for each row execute function public.notify_on_bulk_request();

-- ---------------------------------------------------------------------
-- 7) Masa tetikleyicileri
-- ---------------------------------------------------------------------
create or replace function public.dining_tables_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  if old.is_active and not new.is_active
     and exists (select 1 from public.table_sessions where table_id = old.id and status = 'open') then
    raise exception 'Açık hesabı olan masa pasifleştirilemez' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger dining_tables_before_update before update on public.dining_tables
  for each row execute function public.dining_tables_before_update();

create or replace function public.dining_tables_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.table_qr_codes (table_id) values (new.id);   -- her yeni masaya otomatik QR
  return null;
end $$;
create trigger dining_tables_after_insert after insert on public.dining_tables
  for each row execute function public.dining_tables_after_insert();

create or replace function public.dining_tables_after_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    insert into public.table_status_history (table_id, from_status, to_status, changed_by, note)
    values (new.id, old.status, new.status, auth.uid(),
            nullif(current_setting('app.status_note', true), ''));
  end if;
  return null;
end $$;
create trigger dining_tables_after_update after update on public.dining_tables
  for each row execute function public.dining_tables_after_update();

-- ---------------------------------------------------------------------
-- 8) Sipariş tetikleyicileri
-- ---------------------------------------------------------------------
create or replace function public.orders_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.order_no is distinct from old.order_no
     or new.created_at is distinct from old.created_at
     or new.source is distinct from old.source
     or new.external_ref is distinct from old.external_ref then
    raise exception 'Sipariş kimliği, numarası ve kaynağı değiştirilemez' using errcode = '42501';
  end if;

  new.updated_at := now();

  if new.status is distinct from old.status then
    if not public.order_transition_allowed(old.status, new.status) then
      raise exception 'Geçersiz durum geçişi: % → %',
        public.order_status_label(old.status), public.order_status_label(new.status) using errcode = 'P0001';
    end if;
    if new.status in ('assigned', 'on_the_way') and (new.courier_id is null or new.order_type <> 'delivery') then
      raise exception 'Bu duruma geçmek için teslimat siparişine kurye atanmış olmalı' using errcode = 'P0001';
    end if;

    if new.status = 'preparing' then
      new.accepted_at := coalesce(new.accepted_at, now());
    elsif new.status = 'ready' then
      new.ready_at := coalesce(new.ready_at, now());
    elsif new.status = 'assigned' then
      new.ready_at    := coalesce(new.ready_at, now());
      new.assigned_at := now();
    elsif new.status = 'on_the_way' then
      new.picked_up_at := coalesce(new.picked_up_at, now());
    elsif new.status = 'delivered' then
      new.delivered_at := now();
      if new.payment_status = 'pending' and new.payment_method in ('cash_on_delivery', 'card_on_delivery') then
        new.payment_status := 'paid';
      end if;
    elsif new.status = 'cancelled' then
      new.cancelled_at := now();
    end if;
  elsif new.courier_id is distinct from old.courier_id and new.status = 'assigned' then
    new.assigned_at := now();
  end if;

  return new;
end $$;
create trigger orders_before_write before insert or update on public.orders
  for each row execute function public.orders_before_write();

create or replace function public.orders_after_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_label    text := '#' || new.order_no;
  v_cust_usr uuid;
  v_src      text;
  v_note     text := nullif(current_setting('app.status_note', true), '');
begin
  -- ===== YENİ SİPARİŞ =====
  if tg_op = 'INSERT' then
    insert into public.order_status_history (order_id, from_status, to_status, changed_by)
    values (new.id, null, new.status, auth.uid());

    select label into v_src from public.order_sources where code = new.source;
    perform public._notify_staff(
      'orders.view', 'new_order', 'Yeni sipariş ' || v_label,
      coalesce(new.customer_name, 'Misafir') || ' · ' || format('%s ₺', new.total) || ' · ' || coalesce(v_src, new.source),
      jsonb_build_object('order_id', new.id, 'order_no', new.order_no, 'source', new.source));

    if new.order_type = 'dine_in' and new.table_id is not null then
      update public.dining_tables set status = 'preparing' where id = new.table_id and status <> 'preparing';
    end if;

    if new.courier_id is not null then
      insert into public.courier_deliveries (order_id, courier_id) values (new.id, new.courier_id);
    end if;
    return null;
  end if;

  -- ===== KURYE ATAMA / DEĞİŞİM =====
  if new.courier_id is distinct from old.courier_id then
    update public.courier_deliveries
       set outcome = case when new.courier_id is null then 'unassigned' else 'reassigned' end,
           ended_at = now()
     where order_id = new.id and outcome is null;

    if new.courier_id is not null then
      insert into public.courier_deliveries (order_id, courier_id) values (new.id, new.courier_id);
      insert into public.notifications (user_id, type, title, body, data)
      values (new.courier_id, 'order_assigned', 'Yeni sipariş atandı ' || v_label,
              coalesce(new.delivery_address, ''),
              jsonb_build_object('order_id', new.id, 'order_no', new.order_no));
    end if;
  end if;

  -- ===== DURUM DEĞİŞİMİ =====
  if new.status is distinct from old.status then
    insert into public.order_status_history (order_id, from_status, to_status, changed_by, note)
    values (new.id, old.status, new.status, auth.uid(),
            case when new.status = 'cancelled' then coalesce(new.cancel_reason, v_note) else v_note end);

    -- müşteriye bildirim (hesabı varsa)
    select c.user_id into v_cust_usr from public.customers c where c.id = new.customer_id;
    if v_cust_usr is not null then
      insert into public.notifications (user_id, type, title, body, data)
      values (v_cust_usr, 'order_status', 'Siparişiniz ' || v_label, public.order_status_label(new.status),
              jsonb_build_object('order_id', new.id, 'order_no', new.order_no, 'status', new.status));
    end if;

    -- kurye performans kaydı
    if new.status = 'assigned' then
      update public.courier_deliveries set assigned_at = now() where order_id = new.id and outcome is null;
    elsif new.status = 'on_the_way' then
      update public.courier_deliveries set picked_up_at = coalesce(picked_up_at, now())
       where order_id = new.id and outcome is null;
    elsif new.status = 'delivered' then
      update public.courier_deliveries
         set delivered_at = now(), ended_at = now(), outcome = 'delivered',
             total_seconds = extract(epoch from (now() - assigned_at))::int,
             delivery_seconds = case when picked_up_at is not null
                                     then extract(epoch from (now() - picked_up_at))::int end
       where order_id = new.id and outcome is null;
    elsif new.status = 'cancelled' then
      update public.courier_deliveries set outcome = 'cancelled', ended_at = now()
       where order_id = new.id and outcome is null;
      if new.courier_id is not null then
        insert into public.notifications (user_id, type, title, body, data)
        values (new.courier_id, 'order_cancelled', 'Sipariş iptal edildi ' || v_label, new.cancel_reason,
                jsonb_build_object('order_id', new.id, 'order_no', new.order_no));
      end if;
    end if;

    -- masa durumu: oturumdaki tüm siparişler servis edildiyse masa "servis edildi" olur
    if new.order_type = 'dine_in' and new.table_id is not null and new.status = 'delivered' then
      if not exists (select 1 from public.orders o
                      where o.table_session_id = new.table_session_id
                        and o.status not in ('delivered', 'cancelled')) then
        update public.dining_tables set status = 'served'
         where id = new.table_id and status in ('awaiting_order', 'preparing', 'empty');
      end if;
    end if;
  end if;
  return null;
end $$;
create trigger orders_after_write after insert or update on public.orders
  for each row execute function public.orders_after_write();

-- ---------------------------------------------------------------------
-- 9) SİPARİŞ RPC'leri
-- ---------------------------------------------------------------------

-- Sepet satırlarını DB'deki GÜNCEL fiyatlarla çözer (istemciden gelen fiyata asla güvenilmez)
create or replace function public._resolve_lines(p_items jsonb, p_strict boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_item  jsonb;
  v_row   record;
  v_qty   int;
  v_vid   uuid;
  v_lines jsonb := '[]'::jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Sepet boş' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Bir siparişte en fazla 50 kalem olabilir' using errcode = 'P0001';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_vid := nullif(v_item->>'variant_id', '')::uuid;
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_vid is null or v_qty < 1 or v_qty > 100 then
      raise exception 'Geçersiz ürün veya adet' using errcode = 'P0001';
    end if;

    select v.id as variant_id, v.name as variant_name, v.price, v.is_active as v_active,
           p.id as product_id, p.name as product_name, p.is_active as p_active, p.is_sold_out,
           c.is_active as c_active
      into v_row
      from public.product_variants v
      join public.products   p on p.id = v.product_id
      join public.categories c on c.id = p.category_id
     where v.id = v_vid;

    if not found then
      raise exception 'Ürün bulunamadı' using errcode = 'P0001';
    end if;
    if p_strict and not (v_row.v_active and v_row.p_active and v_row.c_active) then
      raise exception '% şu an satışta değil', v_row.product_name using errcode = 'P0001';
    end if;
    if p_strict and v_row.is_sold_out then
      raise exception '% tükendi', v_row.product_name using errcode = 'P0001';
    end if;

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id',   v_row.product_id,
      'variant_id',   v_row.variant_id,
      'product_name', v_row.product_name,
      'variant_name', v_row.variant_name,
      'unit_price',   v_row.price,
      'quantity',     v_qty,
      'note',         nullif(left(trim(coalesce(v_item->>'note', '')), 200), '')));
  end loop;
  return v_lines;
end $$;

-- Ortak sipariş oluşturucu (müşteri, personel ve masa siparişleri buradan geçer)
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

  if v_phone is not null and v_phone !~ '^[0-9+ ()-]{10,25}$' then
    raise exception 'Telefon numarası geçersiz' using errcode = 'P0001';
  end if;

  if p_type = 'delivery' and (v_name is null or v_phone is null or v_addr is null) then
    raise exception 'Teslimat için ad, telefon ve adres zorunludur' using errcode = 'P0001';
  end if;
  -- Gel-al: web müşterisi ad+telefon vermeli; personel (restoranda tezgâh/hızlı sipariş) bilgisiz kaydedebilir
  if p_type = 'pickup' and not p_is_staff and (v_name is null or v_phone is null) then
    raise exception 'Gel-al siparişi için ad ve telefon zorunludur' using errcode = 'P0001';
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
      v_fee := greatest((p_customer->>'delivery_fee')::numeric, 0);   -- personel ücreti elle belirleyebilir
    end if;
  end if;
  v_total := v_subtotal + v_fee;

  -- ödeme
  if v_is_platform then
    v_payment := 'platform_online'; v_pay_status := 'paid';
  elsif p_type = 'dine_in' then
    v_payment := null;                                   -- masa hesabı kapanırken belirlenir
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
    v_customer := public.my_customer_id();                -- giriş yapmışsa kendi kaydı, misafirse null
  elsif v_phone is not null then
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

-- Web / QR masa siparişi (misafir ve üye)
-- p_customer: {"name","phone","address","district","lat","lng","address_title"}
-- p_items:    [{"variant_id":"<uuid>","quantity":2,"note":"acısız"}]
create or replace function public.place_order(
  p_customer jsonb, p_items jsonb,
  p_payment public.payment_method default null, p_note text default null,
  p_table_token text default null, p_save_address boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_s public.business_settings%rowtype;
  v_table uuid;
begin
  select * into v_s from public.business_settings where id = 1;
  if not v_s.is_accepting_orders then
    raise exception 'Şu an online sipariş alamıyoruz. Lütfen bizi arayın.' using errcode = 'P0001';
  end if;
  if v_s.enforce_opening_hours and not public.is_open_now() then
    raise exception 'Şu an kapalıyız. Çalışma saatlerimizde tekrar deneyin.' using errcode = 'P0001';
  end if;

  if p_table_token is not null then
    select q.table_id into v_table
      from public.table_qr_codes q join public.dining_tables t on t.id = q.table_id
     where q.token = p_table_token and q.is_active and t.is_active;
    if v_table is null then
      raise exception 'Geçersiz veya süresi dolmuş QR kod' using errcode = 'P0001';
    end if;
    return public._create_order('table', 'dine_in', coalesce(p_customer, '{}'::jsonb), p_items,
                                v_table, null, p_note, auth.uid(), false, false);
  end if;

  return public._create_order('web', 'delivery', coalesce(p_customer, '{}'::jsonb), p_items,
                              null, p_payment, p_note, auth.uid(), false, p_save_address);
end $$;

-- Personel: telefon / masa / elle sipariş girişi
create or replace function public.staff_create_order(
  p_source text, p_type public.order_type, p_customer jsonb, p_items jsonb,
  p_table_id uuid default null, p_payment public.payment_method default null,
  p_note text default null, p_save_address boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_permission('orders.create');
  return public._create_order(p_source, p_type, coalesce(p_customer, '{}'::jsonb), p_items,
                              p_table_id, p_payment, p_note, auth.uid(), true, p_save_address);
end $$;

-- Personel: sipariş kalemlerini düzelt (hatalı ürün/miktar). Eski hali denetim kaydında saklanır.
create or replace function public.staff_replace_order_items(p_order_id uuid, p_items jsonb, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_o public.orders%rowtype; v_lines jsonb; v_old jsonb; v_sub numeric(10,2);
begin
  perform public._require_permission('orders.edit');
  select * into v_o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Sipariş bulunamadı' using errcode = 'P0001'; end if;
  if v_o.status in ('delivered', 'cancelled') then
    raise exception 'Tamamlanmış veya iptal edilmiş sipariş düzenlenemez' using errcode = 'P0001';
  end if;

  v_lines := public._resolve_lines(p_items, false);

  select coalesce(jsonb_agg(jsonb_build_object('product_name', product_name, 'variant_name', variant_name,
                                               'unit_price', unit_price, 'quantity', quantity)), '[]'::jsonb)
    into v_old from public.order_items where order_id = p_order_id;

  delete from public.order_items where order_id = p_order_id;
  insert into public.order_items (order_id, product_id, variant_id, product_name, variant_name, unit_price, quantity, note)
  select p_order_id, x.product_id, x.variant_id, x.product_name, x.variant_name, x.unit_price, x.quantity, x.note
    from jsonb_to_recordset(v_lines) as x(product_id uuid, variant_id uuid, product_name text,
                                          variant_name text, unit_price numeric, quantity int, note text);

  select coalesce(sum(line_total), 0) into v_sub from public.order_items where order_id = p_order_id;
  update public.orders
     set subtotal = v_sub, total = greatest(v_sub + delivery_fee - discount, 0)
   where id = p_order_id;

  insert into public.audit_logs (table_name, record_id, action, old_data, new_data, reason, actor_id, actor_role)
  values ('orders', p_order_id::text, 'ITEMS_REPLACED',
          jsonb_build_object('items', v_old, 'subtotal', v_o.subtotal, 'total', v_o.total),
          jsonb_build_object('items', v_lines, 'subtotal', v_sub),
          nullif(trim(p_reason), ''), auth.uid(), public.current_app_role());

  return jsonb_build_object('order_id', p_order_id, 'subtotal', v_sub);
end $$;

-- Durum güncelleme (personel: tüm geçişler · kurye: yalnızca kendi siparişinde yola çık / teslim et)
create or replace function public.update_order_status(p_order_id uuid, p_status public.order_status, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_o    public.orders%rowtype;
  v_role public.app_role := public.current_app_role();
  v_to   public.order_status := p_status;
begin
  if auth.uid() is null or v_role is null then
    raise exception 'Oturum gerekli' using errcode = '42501';
  end if;

  select * into v_o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Sipariş bulunamadı' using errcode = 'P0001'; end if;

  if v_role = 'courier' then
    if v_o.courier_id is distinct from auth.uid() then
      raise exception 'Bu sipariş size atanmamış' using errcode = '42501';
    end if;
    if not ((v_o.status = 'assigned' and p_status = 'on_the_way')
         or (v_o.status = 'on_the_way' and p_status = 'delivered')) then
      raise exception 'Bu durum geçişini yapamazsınız' using errcode = '42501';
    end if;
  elsif v_role in ('owner', 'sub_admin', 'operator') then
    if p_status = 'cancelled' then
      perform public._require_permission('orders.cancel');
      if coalesce(trim(p_note), '') = '' then
        raise exception 'İptal nedenini yazmalısınız' using errcode = 'P0001';
      end if;
    else
      perform public._require_permission('orders.edit');
    end if;
  else
    raise exception 'Yetkisiz' using errcode = '42501';
  end if;

  -- hazır + kurye zaten atanmışsa doğrudan "kuryeye atandı"
  if v_to = 'ready' and v_o.courier_id is not null and v_o.order_type = 'delivery' then
    v_to := 'assigned';
  end if;

  perform set_config('app.status_note', coalesce(trim(p_note), ''), true);
  update public.orders
     set status = v_to,
         cancel_reason = case when v_to = 'cancelled' then trim(p_note) else cancel_reason end
   where id = p_order_id;
  perform set_config('app.status_note', '', true);

  return jsonb_build_object('order_id', p_order_id, 'status', v_to);
end $$;

-- Kurye atama / değiştirme / atamayı kaldırma (p_courier_id = null)
create or replace function public.assign_courier(p_order_id uuid, p_courier_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_o public.orders%rowtype; v_new_status public.order_status;
begin
  perform public._require_permission('orders.assign_courier');
  select * into v_o from public.orders where id = p_order_id for update;
  if not found then raise exception 'Sipariş bulunamadı' using errcode = 'P0001'; end if;
  if v_o.order_type <> 'delivery' then
    raise exception 'Yalnızca teslimat siparişlerine kurye atanır' using errcode = 'P0001';
  end if;
  if v_o.status not in ('preparing', 'ready', 'assigned', 'on_the_way') then
    raise exception 'Bu durumdaki siparişe kurye atanamaz' using errcode = 'P0001';
  end if;
  if v_o.courier_id is not distinct from p_courier_id then
    return jsonb_build_object('order_id', p_order_id, 'status', v_o.status);
  end if;

  if p_courier_id is null then
    if v_o.status = 'on_the_way' then
      raise exception 'Yoldaki siparişin kuryesi kaldırılamaz; başka kuryeye atayın' using errcode = 'P0001';
    end if;
    v_new_status := case when v_o.status = 'assigned' then 'ready' else v_o.status end;
  else
    if not exists (select 1 from public.profiles p
                    where p.id = p_courier_id and p.role = 'courier' and p.is_active) then
      raise exception 'Geçerli ve aktif bir kurye seçin' using errcode = 'P0001';
    end if;
    v_new_status := case when v_o.status = 'preparing' then 'preparing' else 'assigned' end;
  end if;

  update public.orders set courier_id = p_courier_id, status = v_new_status where id = p_order_id;
  return jsonb_build_object('order_id', p_order_id, 'status', v_new_status, 'courier_id', p_courier_id);
end $$;

-- Misafir/üye sipariş takibi: sipariş UUID'si (tahmin edilemez) anahtardır
create or replace function public.track_order(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  select jsonb_build_object(
      'order_no', o.order_no, 'status', o.status, 'status_label', public.order_status_label(o.status),
      'order_type', o.order_type, 'total', o.total, 'payment_method', o.payment_method,
      'created_at', o.created_at, 'accepted_at', o.accepted_at, 'ready_at', o.ready_at,
      'picked_up_at', o.picked_up_at, 'delivered_at', o.delivered_at, 'cancelled_at', o.cancelled_at,
      'estimated_min', s.estimated_delivery_min, 'estimated_max', s.estimated_delivery_max,
      'courier_first_name', case when o.status in ('assigned', 'on_the_way') then split_part(p.full_name, ' ', 1) end,
      'items', (select coalesce(jsonb_agg(jsonb_build_object(
                   'name', i.product_name, 'variant', i.variant_name, 'quantity', i.quantity, 'price', i.unit_price)
                   order by i.created_at), '[]'::jsonb)
                  from public.order_items i where i.order_id = o.id))
    into v
    from public.orders o
    join public.business_settings s on s.id = 1
    left join public.profiles p on p.id = o.courier_id
   where o.id = p_order_id;

  if v is null then raise exception 'Sipariş bulunamadı' using errcode = 'P0001'; end if;
  return v;
end $$;

-- "Tekrar sipariş ver": eski siparişin kalemlerini GÜNCEL fiyat ve stok bilgisiyle döndürür
-- (invoker: müşteri yalnızca kendi siparişini görebilir)
create or replace function public.reorder_items(p_order_id uuid)
returns table (variant_id uuid, product_id uuid, product_name text, variant_name text,
               quantity int, current_price numeric, is_available boolean)
language sql stable set search_path = '' as $$
  select oi.variant_id, oi.product_id, oi.product_name, oi.variant_name, oi.quantity, v.price,
         coalesce(v.is_active and p.is_active and not p.is_sold_out, false)
    from public.order_items oi
    left join public.product_variants v on v.id = oi.variant_id
    left join public.products p on p.id = v.product_id
   where oi.order_id = p_order_id
   order by oi.created_at
$$;

-- ---------------------------------------------------------------------
-- 10) MASA RPC'leri
-- ---------------------------------------------------------------------
create or replace function public.resolve_table_qr(p_token text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('table_number', t.number, 'table_name', t.name)
    from public.table_qr_codes q join public.dining_tables t on t.id = q.table_id
   where q.token = p_token and q.is_active and t.is_active
$$;

create or replace function public.set_table_status(p_table_id uuid, p_status public.table_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_permission('tables.operate');
  perform 1 from public.dining_tables where id = p_table_id and is_active for update;
  if not found then raise exception 'Masa bulunamadı' using errcode = 'P0001'; end if;

  if p_status = 'empty' then
    if exists (select 1 from public.table_sessions s join public.orders o on o.table_session_id = s.id
                where s.table_id = p_table_id and s.status = 'open' and o.status <> 'cancelled') then
      raise exception 'Hesap kapatılmadan masa boşaltılamaz' using errcode = 'P0001';
    end if;
    update public.table_sessions set status = 'closed', closed_at = now(), closed_by = auth.uid(), total = 0
     where table_id = p_table_id and status = 'open';
  end if;

  perform set_config('app.status_note', coalesce(trim(p_note), ''), true);
  update public.dining_tables set status = p_status where id = p_table_id;
  perform set_config('app.status_note', '', true);
end $$;

create or replace function public.close_table_bill(p_table_id uuid, p_payment public.payment_method default 'cash_at_table')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session uuid; v_total numeric(10,2);
begin
  perform public._require_permission('tables.operate');
  if p_payment not in ('cash_at_table', 'card_at_table', 'iban') then
    raise exception 'Geçersiz ödeme yöntemi' using errcode = 'P0001';
  end if;

  select id into v_session from public.table_sessions
   where table_id = p_table_id and status = 'open' for update;
  if v_session is null then raise exception 'Bu masada açık hesap yok' using errcode = 'P0001'; end if;

  if exists (select 1 from public.orders where table_session_id = v_session
                and status in ('new', 'preparing', 'ready', 'assigned', 'on_the_way')) then
    raise exception 'Hazırlanan veya servis edilmemiş siparişler var; önce servis edildi olarak işaretleyin' using errcode = 'P0001';
  end if;

  select coalesce(sum(total), 0) into v_total from public.orders
   where table_session_id = v_session and status = 'delivered';

  update public.orders set payment_method = p_payment, payment_status = 'paid'
   where table_session_id = v_session and status = 'delivered';

  update public.table_sessions
     set status = 'closed', closed_at = now(), closed_by = auth.uid(), total = v_total, payment_method = p_payment
   where id = v_session;

  perform set_config('app.status_note', 'Hesap kapatıldı', true);
  update public.dining_tables set status = 'bill_closed' where id = p_table_id;
  perform set_config('app.status_note', '', true);

  return jsonb_build_object('session_id', v_session, 'total', v_total);
end $$;

create or replace function public.regenerate_table_qr(p_table_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_token text;
begin
  perform public._require_permission('tables.manage');
  perform 1 from public.dining_tables where id = p_table_id;
  if not found then raise exception 'Masa bulunamadı' using errcode = 'P0001'; end if;

  update public.table_qr_codes set is_active = false, revoked_at = now()
   where table_id = p_table_id and is_active;
  insert into public.table_qr_codes (table_id) values (p_table_id) returning token into v_token;
  return v_token;
end $$;

-- ---------------------------------------------------------------------
-- 11) KURYE RPC'leri
-- ---------------------------------------------------------------------
create or replace function public.set_courier_online(p_online boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.current_app_role() is distinct from 'courier' then
    raise exception 'Yalnızca kuryeler kullanabilir' using errcode = '42501';
  end if;
  update public.courier_profiles set is_online = p_online where user_id = auth.uid();
end $$;

-- Canlı konum her çağrıda güncellenir; geçmişe yalnızca "yolda" siparişi varken ve aralıkla yazılır
create or replace function public.update_courier_location(
  p_lat double precision, p_lng double precision,
  p_accuracy real default null, p_speed real default null, p_heading real default null, p_battery integer default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid(); v_online boolean; v_interval int; v_last timestamptz; v_order uuid;
begin
  if public.current_app_role() is distinct from 'courier' then
    raise exception 'Yalnızca kuryeler konum gönderebilir' using errcode = '42501';
  end if;
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Geçersiz koordinat' using errcode = 'P0001';
  end if;

  select is_online into v_online from public.courier_profiles where user_id = v_uid;
  if not coalesce(v_online, false) then return; end if;     -- çevrimdışıyken gelen konum yok sayılır

  insert into public.courier_locations (courier_id, lat, lng, accuracy, speed, heading, battery, updated_at)
  values (v_uid, p_lat, p_lng, p_accuracy, p_speed, p_heading, p_battery::smallint, now())
  on conflict (courier_id) do update
    set lat = excluded.lat, lng = excluded.lng, accuracy = excluded.accuracy, speed = excluded.speed,
        heading = excluded.heading, battery = excluded.battery, updated_at = now();

  select o.id into v_order from public.orders o
   where o.courier_id = v_uid and o.status = 'on_the_way'
   order by o.picked_up_at desc nulls last limit 1;

  if v_order is not null then
    select location_history_interval_seconds into v_interval from public.business_settings where id = 1;
    select max(recorded_at) into v_last from public.courier_location_history where courier_id = v_uid;
    if v_last is null or v_last < now() - make_interval(secs => coalesce(v_interval, 60)) then
      insert into public.courier_location_history (courier_id, order_id, lat, lng, accuracy, speed)
      values (v_uid, v_order, p_lat, p_lng, p_accuracy, p_speed);
    end if;
  end if;
end $$;

create or replace function public.cleanup_courier_location_history()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_days int; v_deleted int;
begin
  select location_history_retention_days into v_days from public.business_settings where id = 1;
  delete from public.courier_location_history where recorded_at < now() - make_interval(days => coalesce(v_days, 14));
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $$;

-- ---------------------------------------------------------------------
-- 12) Bildirim cihaz kaydı, personel yönetimi
-- ---------------------------------------------------------------------
create or replace function public.register_device_token(p_token text, p_platform text default 'android')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Oturum gerekli' using errcode = '42501'; end if;
  insert into public.device_tokens (user_id, token, platform) values (auth.uid(), p_token, p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, last_seen = now();
end $$;

-- Rol atama: YALNIZCA sahip. ('owner' bu yolla verilemez; bkz. bootstrap_owner)
create or replace function public.set_staff_role(p_user uuid, p_role public.app_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then
    raise exception 'Yalnızca işletme sahibi rol atayabilir' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'Kendi rolünüzü değiştiremezsiniz' using errcode = 'P0001';
  end if;
  if p_role not in ('owner', 'sub_admin', 'operator', 'courier') then
    raise exception 'Geçersiz rol' using errcode = 'P0001';
  end if;
  perform set_config('app.bypass_guard', '1', true);
  update public.profiles set role = p_role, created_by = coalesce(created_by, auth.uid()) where id = p_user;
  if not found then raise exception 'Kullanıcı bulunamadı' using errcode = 'P0001'; end if;
  delete from public.staff_permissions where user_id = p_user;   -- eski özel yetkiler sıfırlanır
end $$;

-- Personeli kadrodan çıkarma (rolünü müşteri yapar, yetkilerini kaldırır)
create or replace function public.remove_staff_member(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then
    raise exception 'Yalnızca işletme sahibi personel çıkarabilir' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'Kendi hesabınızı personelden çıkaramazsınız' using errcode = 'P0001';
  end if;
  perform set_config('app.bypass_guard', '1', true);
  update public.profiles set role = 'customer', is_active = false where id = p_user;
  delete from public.staff_permissions where user_id = p_user;
  update public.courier_profiles set is_online = false where user_id = p_user;
end $$;

-- Personele özel yetki atama / güncelleme
create or replace function public.set_staff_permission(p_user uuid, p_permission text, p_granted boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then
    raise exception 'Yalnızca işletme sahibi özel yetki tanımlayabilir' using errcode = '42501';
  end if;
  insert into public.staff_permissions (user_id, permission_key, granted, granted_by)
  values (p_user, p_permission, p_granted, auth.uid())
  on conflict (user_id, permission_key) do update
    set granted = excluded.granted, granted_by = excluded.granted_by, created_at = now();
end $$;

-- Aktif/pasif: sahip herkesi, 'couriers.manage' yetkisi olan yalnızca kuryeleri yönetebilir
create or replace function public.set_staff_active(p_user uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_target public.app_role;
begin
  select role into v_target from public.profiles where id = p_user;
  if v_target is null then raise exception 'Kullanıcı bulunamadı' using errcode = 'P0001'; end if;
  if p_user = auth.uid() then
    raise exception 'Kendi hesabınızı pasifleştiremezsiniz' using errcode = 'P0001';
  end if;
  if not public.is_owner() then
    if v_target <> 'courier' or not public.has_permission('couriers.manage') then
      raise exception 'Bu kullanıcıyı yönetme yetkiniz yok' using errcode = '42501';
    end if;
  end if;
  perform set_config('app.bypass_guard', '1', true);
  update public.profiles set is_active = p_active where id = p_user;
  if not p_active then
    update public.courier_profiles set is_online = false where user_id = p_user;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 13) İLK SAHİBİ ATAMA — yalnızca SQL Editor'dan (07_bootstrap_owner.sql)
-- ---------------------------------------------------------------------
create or replace function public.bootstrap_owner(p_email text)
returns text language plpgsql security definer set search_path = 'public' as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(p_email);
  if v_id is null then
    raise exception 'Bu e-posta ile auth.users tablosunda kullanıcı bulunamadı: %', p_email using errcode = 'P0001';
  end if;

  perform set_config('app.bypass_guard', '1', true);

  insert into public.profiles (id, full_name, email, role, is_active)
  values (v_id, 'İşletme Sahibi', p_email, 'owner', true)
  on conflict (id) do update
    set role = 'owner',
        is_active = true,
        email = coalesce(excluded.email, public.profiles.email);

  return 'Başarılı: ' || p_email || ' kullanıcısı Sahip (owner) olarak atandı.';
end $$;

-- ---------------------------------------------------------------------
-- 14) Çağırma izinleri
-- Supabase varsayılan olarak yeni fonksiyonları anon/authenticated'a açar; önce hepsini kapatıp
-- yalnızca gerekenleri açıyoruz. (service_role ve postgres etkilenmez.)
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- RLS politikalarında ve herkese açık kullanım için (giriş yapmamış ziyaretçi dahil)
grant execute on function
  public.current_app_role(), public.is_staff(), public.is_owner(), public.has_permission(text),
  public.user_has_permission(uuid, text), public.bootstrap_owner(text),
  public.my_customer_id(), public.is_open_now(), public.business_day(timestamptz),
  public.order_status_label(public.order_status),
  public.order_transition_allowed(public.order_status, public.order_status),
  public.current_business_day_range(),
  public.place_order(jsonb, jsonb, public.payment_method, text, text, boolean),
  public.resolve_table_qr(text),
  public.track_order(uuid)
to anon, authenticated;

-- Yalnızca giriş yapmış kullanıcılar (içeride rol/yetki ayrıca kontrol edilir)
grant execute on function
  public.staff_create_order(text, public.order_type, jsonb, jsonb, uuid, public.payment_method, text, boolean),
  public.staff_replace_order_items(uuid, jsonb, text),
  public.update_order_status(uuid, public.order_status, text),
  public.assign_courier(uuid, uuid),
  public.reorder_items(uuid),
  public.set_table_status(uuid, public.table_status, text),
  public.close_table_bill(uuid, public.payment_method),
  public.regenerate_table_qr(uuid),
  public.set_courier_online(boolean),
  public.update_courier_location(double precision, double precision, real, real, real, integer),
  public.register_device_token(text, text),
  public.set_staff_role(uuid, public.app_role),
  public.set_staff_active(uuid, boolean),
  public.remove_staff_member(uuid),
  public.set_staff_permission(uuid, text, boolean)
to authenticated;
