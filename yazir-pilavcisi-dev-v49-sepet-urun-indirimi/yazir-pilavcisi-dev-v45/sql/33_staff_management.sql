-- =====================================================================
-- 33 · PERSONEL YÖNETİMİ DÜZELTMELERİ
--  • permissions.description sütunu (her yetkinin küçük açıklaması veritabanında tutulur)
--  • staff_update_profile  : sahip, personelin ad / telefon bilgisini güncelleyebilir
--  • set_staff_permissions_bulk : "Tümünü ver / sıfırla" tek işlemde
--  • Eksik kalmış (müşteri olarak takılı) personel hesaplarını görmek için sorgu (en altta, yorum)
-- Tekrar çalıştırmak güvenlidir.
-- =====================================================================

alter table public.permissions add column if not exists description text;

update public.permissions p set description = v.d
from (values
  ('orders.view',           'Canlı ve geçmiş siparişleri, sipariş içeriğini ve durumunu görür.'),
  ('orders.create',         'Telefon, masa veya tezgâh için yeni sipariş girer.'),
  ('orders.edit',           'Sipariş kalemlerini değiştirir; hazırlanıyor, yolda, teslim edildi gibi durumları günceller.'),
  ('orders.cancel',         'Siparişi iptal eder (iptal nedeni kayda geçer).'),
  ('orders.assign_courier', 'Siparişe kurye atar veya kuryeyi değiştirir.'),
  ('tables.view',           'Masa düzenini ve masaların doluluk durumunu görür.'),
  ('tables.operate',        'Masayı dolu/boş yapar, hesabı kapatır ve ödemeyi alır.'),
  ('tables.manage',         'Masa ekler, siler, adını ve yerleşimini değiştirir; QR kodu yeniler.'),
  ('couriers.view',         'Kurye listesini, çevrimiçi durumunu ve canlı konumunu görür.'),
  ('couriers.manage',       'Kurye bilgilerini düzenler, kuryeyi aktif/pasif yapar.'),
  ('menu.manage',           'Ürün, kategori, fiyat, fotoğraf ve galeriyi ekler/düzenler/siler.'),
  ('reports.view',          'Ciro, ürün ve müşteri raporlarını görür.'),
  ('customers.view',        'Müşteri listesini, adreslerini ve sipariş geçmişini görür.'),
  ('customers.manage',      'Müşteri adı, telefonu ve notlarını düzenler.'),
  ('feedback.view',         'Müşteri geri bildirimlerini okur ve yanıtlar.'),
  ('staff.view',            'Personel listesini görür (yetki değiştiremez).'),
  ('settings.manage',       'Çalışma saatleri, teslimat ücreti, iletişim bilgisi ve yorum ayarlarını değiştirir.'),
  ('integrations.manage',   'Trendyol, Yemeksepeti, Migros gibi platform bağlantılarını yönetir.'),
  ('audit.view',            'Kim, ne zaman, neyi değiştirdi kayıtlarını (işlem geçmişi) görür.')
) as v(k, d)
where p.key = v.k;

-- Personelin ad / telefon bilgisini güncelle (YALNIZCA sahip)
create or replace function public.staff_update_profile(p_user uuid, p_name text, p_phone text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_name  text := nullif(trim(coalesce(p_name, '')), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
begin
  if not public.is_owner() then
    raise exception 'Yalnızca işletme sahibi personel bilgisi güncelleyebilir' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'Ad soyad boş olamaz' using errcode = 'P0001';
  end if;
  perform set_config('app.bypass_guard', '1', true);
  update public.profiles set full_name = v_name, phone = v_phone where id = p_user;
  if not found then raise exception 'Kullanıcı bulunamadı' using errcode = 'P0001'; end if;
  update public.customers set full_name = v_name, phone = v_phone where user_id = p_user;
end $$;

-- Toplu yetki: p_granted = true → listedeki yetkileri ver · false → listedeki özel ayarları sil (rol varsayılanına döner)
create or replace function public.set_staff_permissions_bulk(p_user uuid, p_keys text[], p_granted boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner() then
    raise exception 'Yalnızca işletme sahibi yetki tanımlayabilir' using errcode = '42501';
  end if;
  if p_granted then
    insert into public.staff_permissions (user_id, permission_key, granted, granted_by)
    select p_user, k, true, auth.uid() from unnest(p_keys) as k
    on conflict (user_id, permission_key) do update
      set granted = true, granted_by = auth.uid(), created_at = now();
  else
    delete from public.staff_permissions where user_id = p_user and permission_key = any(p_keys);
  end if;
end $$;

revoke execute on function public.staff_update_profile(uuid, text, text) from public, anon;
revoke execute on function public.set_staff_permissions_bulk(uuid, text[], boolean) from public, anon;
grant  execute on function public.staff_update_profile(uuid, text, text) to authenticated, service_role;
grant  execute on function public.set_staff_permissions_bulk(uuid, text[], boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- (İSTEĞE BAĞLI) Daha önce eklenip listede görünmeyen kişiler müşteri olarak takılı kalmıştır.
-- Görmek için çalıştırın; sonra yeni ekranda "Yeni Personel Ekle" ile AYNI e-postayı tekrar girin:
-- hesap bulunur, personele çevrilir ve şifresi sizin girdiğiniz şifre olur.
--
--   select id, full_name, email, phone, role, created_at from public.profiles
--   where role = 'customer' order by created_at desc limit 20;
-- ---------------------------------------------------------------------
