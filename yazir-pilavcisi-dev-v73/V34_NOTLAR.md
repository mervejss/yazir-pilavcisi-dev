# v34 — Admin menü, Ödemeler (not defteri), mobil uyum, üst menü düzeltmesi

## Kurulum
1. Supabase SQL Editor'de `sql/26_payment_notebook.sql` dosyasını çalıştırın (v33'teki `sql/25_phone_customers_maps.sql` daha önce çalıştırılmadıysa onu da).
2. `npm install && npm run build` (Vercel otomatik yapar). Başka ayar gerekmez.

## Teyit edilenler
- **Alt harita (müşteri sitesi, "Bizi Bulun" ve İletişim sayfası):** Google'ın gömülü haritası; +/− düğmeleri, sürükleme ve parmakla yakınlaştırma çalışır. Pin, İşletme Ayarları'ndaki koordinatta (yoksa adreste) durur. Ek API anahtarı gerekmez.
- **Üyesiz sipariş:** `place_order` ve `place_order_with_coupon` fonksiyonları anonim kullanıcıya açık. Ad, telefon ve adresle sipariş verilebilir; kupon da kullanılabilir (puan kullanımı yalnız üyelere).
- **Admin harita/kurye (v33):** önceki teslimdeki gibi.

## Yenilikler
- **Üst menü:** Giriş / Kayıt ol / Çıkış mobilde menünün içine alındı (üst çubukta üst üste binmiyor), menü açılınca arkası karartılır, dışına dokununca veya Esc ile kapanır, uzun menü kaydırılır.
- **Admin yan menü:** Özet üstte; altında ana başlıklar (Siparişler, Restoran Yönetimi, Kurye & Teslimat, Müşteriler & Pazarlama, Finans & Raporlar, Entegrasyonlar, Yönetim) ve her birinin girintili alt başlıkları. Başlığa tıklayınca açılır/kapanır, "Hepsini daralt/genişlet" var, seçimler hatırlanır. Aktif sayfanın grubu otomatik açılır. Rol yetkisi olmayan başlıklar görünmez.
- **Daralt / genişlet / boyutlandır:** Menünün üstündeki « » düğmesiyle yalnız ikon görünümüne geçer. Sağ kenarlığı sürükleyerek genişlik ayarlanır (çok daraltırsanız ikon görünümüne geçer); çift tıklayınca varsayılana döner. Ayarlar tarayıcıda saklanır.
- **Ödemeler (Not Defteri)** — yalnızca işletme sahibi: `/admin/odemeler`
  - Ödenecek (borç) veya alınacak (alacak) kayıtlar; tek seferlik ya da her ay.
  - Başlangıç kayıtları: Web sitesi 35.000 ₺ (tek seferlik), Reklam yönetimi 10.000 ₺/ay, Sosyal medya yönetimi ve içerik üretimi 10.000 ₺/ay. "Kime" alanına H&M Software Studio yazıldı; sayfadan değiştirebilirsiniz.
  - Kime/kimden: ad, telefon, adres hepsi isteğe bağlı. Kategori, vade, not.
  - **Ödendi:** tutar/tarih/not girilir; geçmişe yazılır. Tek seferlikte kısmi ödeme desteklenir, kalan açık kalır. Aylık kayıtta vade bir ay ilerler.
  - Düzenle, sil, "Geri al" (yanlış işaretlenen ödeme), Kapananlar, Geçmiş ödemeler sekmesi.
- **Mobil uyum:** admin menüsü çekmece olarak açılır (üst çubuk + hızlı sipariş kısayolu); pencereler alttan tam genişlik; tablolar yatay kaydırılır; formlar tek sütun; girişler iOS'ta yakınlaşmaz; düğmeler dokunma boyutunda; yeni sipariş ekranında "Mutfağa gönder" altta sabit.

## Değişen / yeni dosyalar
Yeni: `sql/26_payment_notebook.sql`, `src/pages/admin/PaymentsAdmin.tsx`
Değişen: `src/pages/admin/AdminLayout.tsx`, `src/pages/public/PublicLayout.tsx`, `src/App.tsx`, `src/styles/global.css` (sonuna v34 bloğu)
