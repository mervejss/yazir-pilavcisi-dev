-- =====================================================================
-- YAZIR PİLAVCISI · 47 · BAKIM MODU (veritabanı kilidi)
-- Supabase SQL Editor'de BİR KEZ çalıştırın. Güvenlidir: hiçbir tablo/veri değişmez,
-- bakım varsayılan olarak KAPALI (enabled = false) kurulur. Tekrar çalıştırılabilir.
--
-- Ne yapar?
--  1) public.maintenance_mode: tek satırlık açma/kapama tablosu (istemciler okuyamaz/yazamaz).
--  2) public.maintenance_guard(): Supabase REST/RPC API'sine (PostgREST) gelen HER isteği
--     bakım açıkken 503 ile reddeder (anon + giriş yapmış kullanıcılar). Böylece tarayıcıda
--     bakım ekranı aşılsa, eski bir sekme açık kalsa veya anon key ile doğrudan API çağrılsa bile
--     sipariş/ödeme/kayıt/personel işlemi YAPILAMAZ. service_role (Edge Function, cron, SQL Editor) etkilenmez.
--  3) Storage'a dosya yükleme/silme de bakımda reddedilir.
--
-- AÇMAK : sql/bakim/maintenance_on.sql    KAPATMAK: sql/bakim/maintenance_off.sql
-- TAMAMEN KALDIRMAK (gerekirse) dosyanın en altındaki "GERİ ALMA" bölümü.
-- =====================================================================

create table if not exists public.maintenance_mode (
  id         boolean primary key default true check (id),   -- tek satır garantisi
  enabled    boolean not null default false,
  note       text,
  updated_at timestamptz not null default now()
);
insert into public.maintenance_mode (id, enabled) values (true, false) on conflict (id) do nothing;

alter table public.maintenance_mode enable row level security;   -- politika yok = istemciler erişemez
revoke all on public.maintenance_mode from anon, authenticated;
grant select, update on public.maintenance_mode to service_role;

-- Bakım açık mı? (SECURITY DEFINER: istemci tabloyu görmeden yalnızca true/false öğrenir)
create or replace function public.is_maintenance()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$ select coalesce((select enabled from public.maintenance_mode where id), false) $$;

revoke all on function public.is_maintenance() from public;
grant execute on function public.is_maintenance() to anon, authenticated, service_role;

-- PostgREST "pre-request" koruması: her API isteğinden önce çalışır.
-- SECURITY INVOKER bilerek: current_user = isteği yapan rol (anon / authenticated / service_role).
create or replace function public.maintenance_guard()
returns void
language plpgsql stable
set search_path = public, pg_temp
as $$
begin
  if current_user in ('anon', 'authenticated') and public.is_maintenance() then
    raise sqlstate 'PT503' using
      message = 'Sistem geçici olarak bakımdadır.',
      detail  = 'maintenance_mode',
      hint    = 'Lütfen daha sonra tekrar deneyiniz.';
  end if;
end;
$$;

grant execute on function public.maintenance_guard() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'public.maintenance_guard';
notify pgrst, 'reload config';
notify pgrst, 'reload schema';

-- Storage: bakımda yükleme / güncelleme / silme yok (okuma açık kalır)
drop policy if exists "yazir_maintenance_no_insert" on storage.objects;
drop policy if exists "yazir_maintenance_no_update" on storage.objects;
drop policy if exists "yazir_maintenance_no_delete" on storage.objects;
create policy "yazir_maintenance_no_insert" on storage.objects as restrictive for insert to anon, authenticated
  with check (not public.is_maintenance());
create policy "yazir_maintenance_no_update" on storage.objects as restrictive for update to anon, authenticated
  using (not public.is_maintenance()) with check (not public.is_maintenance());
create policy "yazir_maintenance_no_delete" on storage.objects as restrictive for delete to anon, authenticated
  using (not public.is_maintenance());

-- Durum kontrolü:  select enabled from public.maintenance_mode;

-- ---------------------------------------------------------------------
-- GERİ ALMA (sistemi bu özellikten tamamen arındırmak isterseniz — normalde GEREKMEZ):
--   alter role authenticator reset pgrst.db_pre_request;  notify pgrst, 'reload config';
--   drop policy if exists "yazir_maintenance_no_insert" on storage.objects;
--   drop policy if exists "yazir_maintenance_no_update" on storage.objects;
--   drop policy if exists "yazir_maintenance_no_delete" on storage.objects;
--   drop function if exists public.maintenance_guard();
--   drop function if exists public.is_maintenance();
--   drop table if exists public.maintenance_mode;
-- ---------------------------------------------------------------------
