-- =====================================================================
-- YAZIR PİLAVCISI · 14 — MENÜ & GALERİ YÖNETİMİ (PRO)
-- =====================================================================
-- Supabase > SQL Editor'e yapıştırıp RUN edin. Tekrar çalıştırılabilir (idempotent).
--
--  * restaurant_gallery tablosu (daha önce hiçbir SQL dosyasında yoktu) oluşturulur / tamamlanır
--  * Galeriye yeni alanlar: description, category, is_featured, updated_at
--  * Yazma yetkisi 'menu.manage' izni olanlarla sınırlıdır (RLS)
-- =====================================================================

create table if not exists public.restaurant_gallery (
  id          uuid primary key default gen_random_uuid(),
  title       text not null default '',
  image_path  text not null,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.restaurant_gallery
  add column if not exists description text not null default '',
  add column if not exists category    text,
  add column if not exists is_featured boolean not null default false,
  add column if not exists updated_at  timestamptz not null default now();

create index if not exists restaurant_gallery_sort_idx on public.restaurant_gallery (sort_order);
create index if not exists restaurant_gallery_cat_idx  on public.restaurant_gallery (category) where category is not null;

alter table public.restaurant_gallery enable row level security;

drop policy if exists gallery_pro_select on public.restaurant_gallery;
create policy gallery_pro_select on public.restaurant_gallery
  for select to anon, authenticated
  using (is_active or (select public.has_permission('menu.manage')));

drop policy if exists gallery_pro_write on public.restaurant_gallery;
create policy gallery_pro_write on public.restaurant_gallery
  for all to authenticated
  using ((select public.has_permission('menu.manage')))
  with check ((select public.has_permission('menu.manage')));

grant select on public.restaurant_gallery to anon, authenticated;
grant insert, update, delete on public.restaurant_gallery to authenticated;

-- Realtime (yönetici ekranı anlık güncellensin)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public'
                        and tablename = 'restaurant_gallery') then
    alter publication supabase_realtime add table public.restaurant_gallery;
  end if;
end $$;
