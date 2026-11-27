-- BAKIM MODUNU AÇ (API kilitlenir). Önce sql/47_maintenance_mode.sql bir kez çalıştırılmış olmalı.
update public.maintenance_mode set enabled = true, updated_at = now() where id;
select enabled from public.maintenance_mode;   -- true görmelisiniz
