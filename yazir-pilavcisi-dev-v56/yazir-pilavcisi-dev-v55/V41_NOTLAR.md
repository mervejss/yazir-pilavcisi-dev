# v41 — Rol yönlendirme düzeltmesi · Mikrofon · Geçmiş sipariş silme · Kurye ödeme yöntemi

Bu zip yalnızca **değişen dosyaları** içerir. İçindekileri proje klasörünüzün (v40) üzerine, aynı yollarla kopyalayın (üzerine yazın).

## Kurulum
1. Zip'i proje klasörüne açın (dosyalar kendi yerlerine oturur).
2. Supabase → SQL Editor: **`sql/32_delete_orders_courier_payment.sql`** dosyasını bir kez çalıştırın (tekrar çalıştırmak güvenli).
3. Siteyi yeniden yayınlayın (deploy). **Mikrofon düzeltmesi `public/_headers` dosyasındadır; yayınlanmadan etkili olmaz.**

## 1) Admin/kurye müşteri profiline atılıyordu
Neden: (a) çıkış yapınca ve oturum/profil geçici okunamayınca panel **müşteri giriş sayfasına** (/giris) yönlendiriyordu; orada giriş yapan personel de **/profil**'e gidiyordu. (b) Üst menüdeki "Profilim" bağlantısı personeli müşteri profiline götürüyordu.
Çözüm:
- Panel sayfaları (admin/kurye) giriş gerekirse **Personel Girişi**'ne yönlendirir ve girişten sonra geldiği sayfaya döner.
- Oturum var ama profil henüz okunamadıysa müşteri girişine atmaz; sessizce tekrar dener (yavaş internet), olmazsa "Tekrar dene" gösterir.
- Müşteri girişinden (/giris) bile girseler admin/operatör/kurye hesapları **kendi paneline** gider.
- **Personel ve kurye hesapları müşteri profilini (/profil) kullanamaz**: otomatik kendi paneline döner (bilgi mesajıyla). Üst menüde "Profilim" yerine "Yönetim Paneli / Kurye Paneli" görünür.
- Personel portalına müşteri hesabıyla girilirse oturum kapatılır ve uyarı verilir.
- Müşteri olarak sipariş vermek isteyen personel **ayrı bir e-postayla** müşteri hesabı açar.

## 2) Sesle yazma: "Mikrofon izni verilmedi"
Neden: `public/_headers` içinde `Permissions-Policy: ... microphone=() ...` vardı; bu, tarayıcıya **mikrofonu tamamen yasakla** der. Tarayıcı izin sormaz ve her cihazda aynı hatayı verir. Şimdi `microphone=(self)`.
Ek: Hata mesajı artık gerçek nedeni söyler (sunucu engeli / tarayıcı engeli / mikrofon yok / internet yok / ses tanıma servisi kapalı).
Yayından sonra telefonda sayfayı bir kez tam yenileyin (gerekirse tarayıcıyı kapatıp açın).

## 3) Geçmiş siparişlerde "🗑 Sil"
- Her satırda ve satır açılınca "Sil" düğmesi (owner ve sub_admin görür). Onay sorar, siparişi **veritabanından kalıcı siler**: kalemler, ayrı ödemeler, durum geçmişi, yorum vb. birlikte gider.
- Hem sitedeki (web/telefon/masa/platform canlı) hem Excel'den yüklenen siparişler silinir. Trendyol siparişinin Excel kopyası da birlikte silinir; yüklü parti özetleri güncellenir.
- Yalnızca **teslim edilmiş / iptal edilmiş** siparişler silinebilir (aktif sipariş silinemez).
- Silinen siparişin tam kopyası **İşlem Geçmişi (audit_logs)**'ne yazılır.

## 4) Kurye: ödeme yöntemi (nakit / kart-POS / IBAN)
Önceden yoktu; şimdi var.
- Kartta müşterinin seçtiği yöntem **varsayılan** görünür ("Kapıda NAKİT / KART tahsil et").
- **"Müşteriye teslim ettim"** düğmesine basınca "Ödeme nasıl alındı?" penceresi açılır: 💵 Nakit · 💳 Kart (POS) · 🏦 IBAN, müşterinin seçtiği hazır işaretli. Kurye değiştirip "✓ Teslim ettim" der.
- Teslimden önce de karttaki **"Ödeme yöntemini değiştir"** ile güncellenebilir.
- Değişiklik admin panosuna, gün sonu kasasına ve raporlara anında yansır; müşterinin ilk seçimi `orders.customer_payment_method` alanında saklanır ve kurye kartında "Müşteri talebi: Kart → şimdi: Nakit" diye görünür.
- Online ödenmiş (platform) siparişlerde yöntem değiştirilemez. Kişi bazlı ayrı ödemeler (Detay · Hesap) aynen çalışır.

## Değişen dosyalar
src/App.tsx · src/lib/roleHome.ts (yeni) · src/lib/voiceMic.ts (yeni) · src/pages/auth/LoginPage.tsx · src/pages/auth/StaffLoginPage.tsx · src/pages/admin/AdminLayout.tsx · src/pages/public/ProfilePage.tsx · src/pages/public/PublicLayout.tsx · src/components/ui/VoiceDictateButton.tsx · src/components/admin/NewOrderModal.tsx · src/pages/admin/PastOrders.tsx · src/styles/past-orders.css · src/pages/courier/CourierApp.tsx · public/_headers · sql/32_delete_orders_courier_payment.sql (yeni) · V41_NOTLAR.md
