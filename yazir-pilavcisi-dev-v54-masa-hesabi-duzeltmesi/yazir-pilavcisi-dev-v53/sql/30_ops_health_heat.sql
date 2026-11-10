-- =====================================================================
-- v39 · Sistem sağlığı (ücretsiz limit takibi), sipariş yoğunluk haritası,
--        kurye notu. Supabase SQL Editor'de bir kez çalıştırın (tekrar güvenlidir).
-- =====================================================================

-- 1) Kurye notu ("müşteriye ulaşamadım" vb.)
alter table public.orders add column if not exists courier_note text;

create or replace function public.courier_set_note(p_order uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.orders
     set courier_note = nullif(left(trim(coalesce(p_note, '')), 300), '')
   where id = p_order and courier_id = auth.uid();
  if not found then raise exception 'Bu sipariş size atanmamış' using errcode = 'P0001'; end if;
end $$;
grant execute on function public.courier_set_note(uuid, text) to authenticated;

-- 2) Konum geçmişi saklama süresi: 7 gün yeterli (veritabanını küçük tutar)
update public.business_settings set location_history_retention_days = 7
 where id = 1 and location_history_retention_days > 7;

-- 3) Sistem sağlığı: yalnızca yönetici (owner / sub_admin)
create or replace function public.admin_system_health()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_db bigint; v_storage bigint := 0; v_tables jsonb; v_counts jsonb;
begin
  if not public.is_staff() then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  select pg_database_size(current_database()) into v_db;
  begin
    select coalesce(sum((metadata->>'size')::bigint), 0) into v_storage from storage.objects;
  exception when others then v_storage := 0; end;
  select coalesce(jsonb_agg(t order by t.bytes desc), '[]'::jsonb) into v_tables from (
    select c.relname as name, pg_total_relation_size(c.oid) as bytes, c.reltuples::bigint as rows
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
     order by pg_total_relation_size(c.oid) desc limit 8) t;
  v_counts := jsonb_build_object(
    'orders', (select count(*) from public.orders),
    'location_history', (select count(*) from public.courier_location_history),
    'customers', (select count(*) from public.profiles));
  return jsonb_build_object('db_bytes', v_db, 'storage_bytes', v_storage, 'tables', v_tables, 'counts', v_counts,
                            'retention_days', (select location_history_retention_days from public.business_settings where id = 1));
end $$;
grant execute on function public.admin_system_health() to authenticated;

-- Elle temizlik (konum geçmişi)
create or replace function public.admin_cleanup_now()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_before bigint; v_after bigint;
begin
  if not public.is_owner() then raise exception 'Yalnızca işletme sahibi' using errcode = '42501'; end if;
  select count(*) into v_before from public.courier_location_history;
  perform public.cleanup_courier_location_history();
  select count(*) into v_after from public.courier_location_history;
  return (v_before - v_after)::int;
end $$;
grant execute on function public.admin_cleanup_now() to authenticated;

-- 4) Sipariş yoğunluk haritası (konum ~110 m'ye yuvarlanır; mahalle özeti)
create or replace function public.admin_order_heat(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_from timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)));
begin
  if not public.is_staff() then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  return jsonb_build_object(
    'points', coalesce((select jsonb_agg(p) from (
        select round(lat::numeric, 3) as lat, round(lng::numeric, 3) as lng, count(*) as n
          from public.orders
         where created_at >= v_from and status <> 'cancelled' and order_type = 'delivery' and lat is not null and lng is not null
         group by 1, 2 order by n desc limit 400) p), '[]'::jsonb),
    'districts', coalesce((select jsonb_agg(d) from (
        select coalesce(nullif(trim(district), ''), 'Belirtilmemiş') as district, count(*) as n, sum(total) as revenue
          from public.orders
         where created_at >= v_from and status <> 'cancelled' and order_type = 'delivery'
         group by 1 order by n desc limit 15) d), '[]'::jsonb),
    'days', greatest(1, least(coalesce(p_days, 30), 365)));
end $$;
grant execute on function public.admin_order_heat(int) to authenticated;
