-- V56: Masa oturumu tekilliği + toplu bildirim ayarları
-- Supabase SQL Editor'de çalıştırın. Tekrar çalıştırmak güvenlidir.

-- 1) Gelecekte aynı masa için birden fazla AÇIK oturum oluşmasını kesin olarak engelle.
-- Önce olası eski çift açık oturumları güvenli biçimde kapat: siparişi olanlar yeni açık oturumda kalır.
with ranked as (
  select id, table_id, row_number() over (partition by table_id order by opened_at desc, id desc) rn
  from public.table_sessions where status = 'open'
)
update public.table_sessions s
set status = 'closed', closed_at = coalesce(closed_at, now()), total = coalesce((select sum(o.total) from public.orders o where o.table_session_id=s.id and o.status <> 'cancelled'), 0)
from ranked r where s.id=r.id and r.rn > 1;

create unique index if not exists table_sessions_one_open_per_table
  on public.table_sessions(table_id) where status = 'open';

-- 2) Toplu bildirim: sadece işletme sahibi tüm personelin ayarını değiştirebilir.
create or replace function public.set_all_staff_notification_settings(p_channels text[], p_patch jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if public.current_app_role() <> 'owner' then raise exception 'Yalnızca işletme sahibi tüm kullanıcıların bildirim ayarını değiştirebilir' using errcode='42501'; end if;
  if coalesce(array_length(p_channels,1),0)=0 then raise exception 'En az bir kanal seçin'; end if;
  insert into public.user_notification_settings(user_id, settings, updated_at)
  select p.id, (select coalesce(jsonb_object_agg(ch, coalesce(uns.settings->ch, '{}'::jsonb) || coalesce(p_patch,'{}'::jsonb)), '{}'::jsonb) from unnest(p_channels) ch), now()
  from public.profiles p
  left join public.user_notification_settings uns on uns.user_id=p.id
  where p.role in ('owner','sub_admin','operator','courier') and p.is_active
  on conflict (user_id) do update set settings = public.user_notification_settings.settings || excluded.settings, updated_at=now();
end $$;
revoke all on function public.set_all_staff_notification_settings(text[], jsonb) from public, anon;
grant execute on function public.set_all_staff_notification_settings(text[], jsonb) to authenticated;

-- 3) Kaynak SQL dosyasındaki masa oturum seçimi en yeni açık oturumu kullanacak şekilde güncellendi.
