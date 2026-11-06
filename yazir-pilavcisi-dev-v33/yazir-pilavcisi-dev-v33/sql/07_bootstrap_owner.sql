-- =====================================================================
-- YAZIR PİLAVCISI · 07 · İlk işletme sahibini atama
-- =====================================================================
-- 1) Supabase Dashboard > Authentication > Users > "Add user" > "Create new user"
--    ile sahibin e-posta + şifresini oluşturun ("Auto Confirm User" işaretli olsun).
-- 2) Aşağıdaki e-postayı kendi e-postanızla değiştirip SQL Editor'da çalıştırın.
--    (Bu fonksiyon yalnızca SQL Editor'dan ve sistemde HİÇ sahip yokken çalışır.)

select public.bootstrap_owner('SAHIP_E_POSTASI@ornek.com');

-- Kontrol:
-- select id, email, full_name, role, is_active from public.profiles order by created_at;
