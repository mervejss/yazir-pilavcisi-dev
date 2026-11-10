-- =====================================================================
-- 17 · service_role TABLO İZİNLERİ (Edge Function'lar için)
-- Belirti: Edge Function "integrations" tablosunu okuyamaz/yazamaz ("permission denied for table ...").
-- Önceki dosyalar yalnızca anon/authenticated'a tablo izni veriyordu; service_role'e yalnızca şema 'usage'.
-- service_role RLS'i atlar ama tablo GRANT'ına yine de ihtiyaç duyar. Tekrar çalıştırmak güvenlidir.
-- =====================================================================
grant usage on schema public to service_role;
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
