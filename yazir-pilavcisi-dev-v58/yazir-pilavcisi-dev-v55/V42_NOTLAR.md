# v42 — Personel ekleme / düzenleme / yetki ekranı düzeltmeleri

Bu zip yalnızca **değişen dosyaları** içerir. İçindekileri proje klasörünüzün (v41) üzerine, aynı yollarla kopyalayın.

## Kurulum (sırayla, 3 adım)
1. **Supabase → SQL Editor:** `sql/33_staff_management.sql` dosyasını bir kez çalıştırın (tekrar çalıştırmak güvenli).
2. **Edge Function'ı dağıtın** (yeni): `supabase functions deploy staff-admin --no-verify-jwt`
3. Siteyi yeniden yayınlayın (deploy).

> Konsoldaki `override_date.asc` 404 hatası bu değişiklikten bağımsızdır: `opening_hours_overrides` tablosu veritabanınızda yok. `sql/09_hours_overrides.sql` dosyasını bir kez çalıştırırsanız kaybolur.

## 1) "Eklendi" diyor ama listede görünmüyor / "User already registered"
Neden: Tarayıcıdan `auth.signUp` ile hesap açılıyordu. Hesap açılıyor ama hemen sonra sahibin başka birinin profilini (rolünü) değiştirmesi veritabanı güvenliği tarafından **403** ile reddediliyordu (konsoldaki 403). Hata da yutulduğu için "eklendi" yazıyordu. Kişi **müşteri** olarak kalıyor, listede (müşteri olmayanlar gösterilir) görünmüyordu; aynı e-postayla tekrar denemek de "User already registered" veriyordu.

Çözüm: Yeni `staff-admin` Edge Function hesabı sunucuda açar (e-posta onaylı), adı/telefonu/rolü aynı adımda yazar.
- **Daha önce yarım kalmış kişiler:** "Yeni Personel Ekle"de **aynı e-postayı** tekrar girin → hesap bulunur, personele çevrilir, şifre sizin girdiğiniz olur. (Örn. Hatice Fulya Esgen.)
- Zaten aktif personel olan e-posta girilirse açık bir uyarı verilir.

## 2) Mevcut personelin bilgilerini düzenleme
Her satırda **✏️ Düzenle**: ad soyad, e-posta, telefon ve (isteğe bağlı) yeni şifre. Ad/telefon için Edge Function gerekmez; e-posta/şifre değişimi için gerekir.

## 3) Yetki Yönetimi ekranı
- Her yetkinin altında **küçük açıklama** var; `orders.view` gibi teknik anahtarlar artık gösterilmiyor. Açıklamalar veritabanında (`permissions.description`) tutulur.
- Gösterilen durum, veritabanının gerçekte uyguladığıyla aynı hesaptır: sahip → hepsi; yönetici/operatör → kişiye özel ayar varsa o, yoksa rolün varsayılanı. Rolün varsayılanından farklı ayarlar **Özel** etiketi taşır.
- **Kurye:** Yönetim yetkisi (siparişleri görüntüle vb.) kurye rolüne ait değildir; kurye yalnızca kendi paneliyle ve **kendisine atanan** siparişlerle çalışır. Ekran artık kuryenin gerçek yetkilerini salt okunur listeler (eskiden hepsi "kapalı" görünüyordu).
- Anahtara dokunulunca ekran anında güncellenir ve veritabanına hemen yazılır; yetkiler her sorguda veritabanından okunduğu için personelin **bir sonraki işleminde** geçerli olur. Hata olursa değişiklik geri alınır.
- Kadrodan çıkarma artık tek bir güvenli işlemle yapılır (`remove_staff_member`).

## Değişen dosyalar
src/pages/admin/UsersAdmin.tsx · src/lib/staffPermissions.ts (yeni) · supabase/functions/staff-admin/index.ts (yeni) · sql/33_staff_management.sql (yeni) · V42_NOTLAR.md
