-- =====================================================================
-- YAZIR PİLAVCISI · 09 — GÜNE ÖZEL ÇALIŞMA SAATİ (ARA DEĞİŞİKLİK)
-- =====================================================================
-- Supabase > SQL Editor'e yapıştırıp RUN edin. Tekrar çalıştırılabilir (idempotent).
--
-- Mantık:
--   * opening_hours            = HAFTALIK STANDART program ("her zaman için" düzenleme buraya yazılır)
--   * opening_hours_overrides  = BELİRLİ BİR TARİHE özel saat ("sadece bugün/bu gün için" düzenleme)
--   Bir gün için geçerli saat = o tarihte override varsa o, yoksa haftalık standart.
--   Geçmiş tarihli override'lar otomatik olarak etkisiz kalır (tarih geçince haftalık programa dönülür).
-- =====================================================================

create table if not exists public.opening_hours_overrides (
  override_date   date primary key,                 -- Çalışma gününün BAŞLADIĞI takvim tarihi (İstanbul)
  open_time       time not null,
  close_time      time not null,
  closes_next_day boolean not null default false,
  is_closed       boolean not null default false,
  note            text,
  created_at      timestamptz not null default now(),
  updated_by      uuid references auth.users(id) on delete set null
);

alter table public.opening_hours_overrides enable row level security;

drop policy if exists opening_hours_overrides_select on public.opening_hours_overrides;
create policy opening_hours_overrides_select on public.opening_hours_overrides
  for select to anon, authenticated using (true);

drop policy if exists opening_hours_overrides_write on public.opening_hours_overrides;
create policy opening_hours_overrides_write on public.opening_hours_overrides
  for all to authenticated
  using ((select public.has_permission('settings.manage')))
  with check ((select public.has_permission('settings.manage')));

grant select on public.opening_hours_overrides to anon, authenticated;
grant insert, update, delete on public.opening_hours_overrides to authenticated;

-- Bir takvim günü için GEÇERLİ saat (override varsa o, yoksa haftalık)
create or replace function public.effective_hours(p_date date)
returns table (open_time time, close_time time, closes_next_day boolean, is_closed boolean)
language sql stable security definer set search_path = '' as $$
  select o.open_time, o.close_time, o.closes_next_day, o.is_closed
    from public.opening_hours_overrides o where o.override_date = p_date
  union all
  select h.open_time, h.close_time, h.closes_next_day, h.is_closed
    from public.opening_hours h
   where h.day_of_week = extract(isodow from p_date)::int
     and not exists (select 1 from public.opening_hours_overrides o2 where o2.override_date = p_date)
  limit 1
$$;

-- Şu an açık mıyız? (override + gece yarısını aşan saatler dahil)
create or replace function public.is_open_now()
returns boolean language sql stable security definer set search_path = '' as $$
  with n as (select (now() at time zone 'Europe/Istanbul') as t)
  select coalesce((
    select true
      from n
     where
       -- bugün başlayan çalışma penceresi
       exists (
         select 1 from public.effective_hours(n.t::date) e
          where not e.is_closed
            and n.t::time >= e.open_time
            and (e.closes_next_day or n.t::time < e.close_time)
       )
       or
       -- dün başlayıp bu sabaha sarkan pencere (örn. 12:00 → 03:00)
       exists (
         select 1 from public.effective_hours((n.t - interval '1 day')::date) e
          where not e.is_closed
            and e.closes_next_day
            and n.t::time < e.close_time
       )
  ), false)
$$;

grant execute on function public.effective_hours(date) to anon, authenticated;
grant execute on function public.is_open_now() to anon, authenticated;

-- Eski (geçmiş) override'ları temizlemek isterseniz (isteğe bağlı):
-- delete from public.opening_hours_overrides where override_date < (now() at time zone 'Europe/Istanbul')::date - 1;
