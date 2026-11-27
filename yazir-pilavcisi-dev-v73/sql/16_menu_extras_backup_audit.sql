-- =====================================================================
-- YAZIR PİLAVCISI · 16 — ALERJEN/ROZET/SEÇENEKLER + MENÜ YEDEKLERİ + DENETİM
-- =====================================================================
-- Supabase > SQL Editor'e yapıştırıp RUN edin. Tekrar çalıştırılabilir (idempotent).
-- Gereksinim: 14_menu_gallery_pro.sql çalıştırılmış olmalı.
-- =====================================================================

-- ---- Ürüne alerjen ve rozet alanları ---------------------------------------------
alter table public.products
  add column if not exists allergens text[] not null default '{}',
  add column if not exists badges    text[] not null default '{}';

-- ---- Ürün seçenekleri (ekstra et, soğansız…) -----------------------------------
create table if not exists public.product_option_groups (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  name        text not null,
  is_required boolean not null default false,
  min_select  int not null default 0,
  max_select  int not null default 1,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists product_option_groups_product_idx on public.product_option_groups (product_id, sort_order);

create table if not exists public.product_options (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.product_option_groups(id) on delete cascade,
  name        text not null,
  price_delta numeric(10,2) not null default 0,
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists product_options_group_idx on public.product_options (group_id, sort_order);

alter table public.product_option_groups enable row level security;
alter table public.product_options enable row level security;

drop policy if exists pog_select on public.product_option_groups;
create policy pog_select on public.product_option_groups for select to anon, authenticated
  using (is_active or (select public.has_permission('menu.manage')));
drop policy if exists pog_write on public.product_option_groups;
create policy pog_write on public.product_option_groups for all to authenticated
  using ((select public.has_permission('menu.manage'))) with check ((select public.has_permission('menu.manage')));

drop policy if exists po_select on public.product_options;
create policy po_select on public.product_options for select to anon, authenticated
  using (is_active or (select public.has_permission('menu.manage')));
drop policy if exists po_write on public.product_options;
create policy po_write on public.product_options for all to authenticated
  using ((select public.has_permission('menu.manage'))) with check ((select public.has_permission('menu.manage')));

grant select on public.product_option_groups, public.product_options to anon, authenticated;
grant insert, update, delete on public.product_option_groups, public.product_options to authenticated;

-- ---- Galeri tablosu (14 çalıştırılmadıysa en az bu kadar var olsun) ---------------
create table if not exists public.restaurant_gallery (
  id uuid primary key default gen_random_uuid(),
  title text not null default '', image_path text not null,
  sort_order int not null default 0, is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---- Menü yedekleri ---------------------------------------------------------------------
create table if not exists public.menu_backups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  note       text,
  is_auto    boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  counts     jsonb not null default '{}'::jsonb,
  snapshot   jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists menu_backups_created_idx on public.menu_backups (created_at desc);
alter table public.menu_backups enable row level security;

drop policy if exists menu_backups_select on public.menu_backups;
create policy menu_backups_select on public.menu_backups for select to authenticated
  using ((select public.has_permission('menu.manage')));
drop policy if exists menu_backups_delete on public.menu_backups;
create policy menu_backups_delete on public.menu_backups for delete to authenticated
  using ((select public.has_permission('menu.manage')));

revoke all on public.menu_backups from anon;
revoke insert, update on public.menu_backups from authenticated;
grant select, delete on public.menu_backups to authenticated;

create or replace function public._create_menu_backup_internal(p_name text, p_note text, p_auto boolean, p_uid uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_snap jsonb;
begin
  v_snap := jsonb_build_object(
    'version', 1, 'taken_at', now(),
    'categories',            coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order) from public.categories x), '[]'::jsonb),
    'products',              coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order) from public.products x), '[]'::jsonb),
    'product_variants',      coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order) from public.product_variants x), '[]'::jsonb),
    'product_option_groups', coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order) from public.product_option_groups x), '[]'::jsonb),
    'product_options',       coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order) from public.product_options x), '[]'::jsonb),
    'restaurant_gallery',    coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order) from public.restaurant_gallery x), '[]'::jsonb)
  );
  insert into public.menu_backups (name, note, is_auto, created_by, counts, snapshot)
  values (
    coalesce(nullif(trim(p_name), ''), 'Yedek ' || to_char(now() at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI')),
    nullif(trim(p_note), ''), p_auto, p_uid,
    jsonb_build_object(
      'categories', jsonb_array_length(v_snap->'categories'), 'products', jsonb_array_length(v_snap->'products'),
      'variants', jsonb_array_length(v_snap->'product_variants'), 'options', jsonb_array_length(v_snap->'product_options'),
      'gallery', jsonb_array_length(v_snap->'restaurant_gallery')),
    v_snap)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.create_menu_backup(p_name text default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_permission('menu.manage');
  return public._create_menu_backup_internal(p_name, p_note, false, auth.uid());
end $$;

create or replace function public._restore_table(p_table text, p_rows jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_cols text; v_set text;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then return; end if;
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position),
         string_agg(quote_ident(column_name) || ' = excluded.' || quote_ident(column_name), ', ' order by ordinal_position)
           filter (where column_name <> 'id')
    into v_cols, v_set
    from information_schema.columns
   where table_schema = 'public' and table_name = p_table and is_generated = 'NEVER';
  execute format('insert into public.%1$I (%2$s) select %2$s from jsonb_populate_recordset(null::public.%1$I, $1) on conflict (id) do update set %3$s',
                 p_table, v_cols, v_set) using p_rows;
end $$;

create or replace function public.restore_menu_backup(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_snap jsonb; v_name text; v_safety uuid;
begin
  perform public._require_permission('menu.manage');
  select snapshot, name into v_snap, v_name from public.menu_backups where id = p_id;
  if v_snap is null then raise exception 'Yedek bulunamadı' using errcode = 'P0001'; end if;

  -- Geri alınabilsin diye önce mevcut hali otomatik yedeklenir
  v_safety := public._create_menu_backup_internal('Geri yüklemeden önce (otomatik)', 'Geri yüklenen yedek: ' || v_name, true, auth.uid());

  perform set_config('app.skip_audit', '1', true);
  perform public._restore_table('categories',            v_snap->'categories');
  perform public._restore_table('products',              v_snap->'products');
  perform public._restore_table('product_variants',      v_snap->'product_variants');
  perform public._restore_table('product_option_groups', v_snap->'product_option_groups');
  perform public._restore_table('product_options',       v_snap->'product_options');
  perform public._restore_table('restaurant_gallery',    v_snap->'restaurant_gallery');

  -- Yedekte olmayan kayıtları sil (çocuk tablolardan başla)
  delete from public.product_options where id not in (select (x->>'id')::uuid from jsonb_array_elements(coalesce(v_snap->'product_options', '[]'::jsonb)) x);
  delete from public.product_option_groups where id not in (select (x->>'id')::uuid from jsonb_array_elements(coalesce(v_snap->'product_option_groups', '[]'::jsonb)) x);
  delete from public.product_variants where id not in (select (x->>'id')::uuid from jsonb_array_elements(coalesce(v_snap->'product_variants', '[]'::jsonb)) x);
  delete from public.products where id not in (select (x->>'id')::uuid from jsonb_array_elements(coalesce(v_snap->'products', '[]'::jsonb)) x);
  delete from public.categories where id not in (select (x->>'id')::uuid from jsonb_array_elements(coalesce(v_snap->'categories', '[]'::jsonb)) x);
  delete from public.restaurant_gallery where id not in (select (x->>'id')::uuid from jsonb_array_elements(coalesce(v_snap->'restaurant_gallery', '[]'::jsonb)) x);
  perform set_config('app.skip_audit', '0', true);

  insert into public.audit_logs (table_name, record_id, action, new_data, reason, actor_id, actor_role)
  values ('menu_backups', p_id::text, 'MENU_RESTORE', jsonb_build_object('backup', v_name, 'safety_backup', v_safety),
          'Menü yedekten geri yüklendi', auth.uid(), public.current_app_role());

  return jsonb_build_object('restored', v_name, 'safety_backup', v_safety);
end $$;

revoke execute on function public._create_menu_backup_internal(text, text, boolean, uuid), public._restore_table(text, jsonb) from public, anon, authenticated;
revoke execute on function public.create_menu_backup(text, text), public.restore_menu_backup(uuid) from public, anon;
grant execute on function public.create_menu_backup(text, text), public.restore_menu_backup(uuid) to authenticated;

-- ---- Günlük otomatik yedek (pg_cron varsa): her gün 03:30 İstanbul = 00:30 UTC, son 30 otomatik yedek saklanır ----
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'menu-daily-backup';
    perform cron.schedule('menu-daily-backup', '30 0 * * *', $job$
      select public._create_menu_backup_internal(null, 'Otomatik günlük yedek', true, null);
      delete from public.menu_backups where is_auto and name like 'Yedek %'
        and id not in (select id from public.menu_backups where is_auto and name like 'Yedek %' order by created_at desc limit 30);
    $job$);
  end if;
exception when others then
  raise notice 'pg_cron zamanlaması kurulamadı: %', sqlerrm;
end $$;

-- ---- İşlem geçmişi: yeni tabloları da izle -----------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['restaurant_gallery', 'opening_hours_overrides', 'product_option_groups', 'product_options']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
      execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I
                      for each row execute function public.log_audit()', t);
    end if;
  end loop;
end $$;
