-- Kişiye özel bildirim ayarları ve kanal başına özel zil sesleri.
-- Supabase SQL Editor'de bir kez çalıştırın.

create table if not exists public.user_notification_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_notification_settings enable row level security;
drop policy if exists user_notification_settings_own on public.user_notification_settings;
create policy user_notification_settings_own on public.user_notification_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table if not exists public.user_alert_ringtones (
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null,
  name text not null,
  mime text not null default 'audio/mpeg',
  data text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, channel)
);
alter table public.user_alert_ringtones enable row level security;
drop policy if exists user_alert_ringtones_own on public.user_alert_ringtones;
create policy user_alert_ringtones_own on public.user_alert_ringtones for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
