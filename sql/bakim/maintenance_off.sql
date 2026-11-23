-- BAKIM MODUNU KAPAT (API tekrar açılır). Hiçbir veri değişmez.
update public.maintenance_mode set enabled = false, updated_at = now() where id;
select enabled from public.maintenance_mode;   -- false görmelisiniz
