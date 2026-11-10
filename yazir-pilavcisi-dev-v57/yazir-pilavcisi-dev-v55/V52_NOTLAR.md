# v52 – Sepet Yönetimi, Ürün Detay URL'leri ve Sipariş Geçmişi

Bu sürüm v51 global sepet/profil menüsü taban alınarak hazırlanmıştır.

## Değişiklikler
- Sepet satırlarının başına seçim kutusu eklendi.
- Seçilen sepet satırlarını topluca kaldırma eklendi.
- Her satıra tek tıkla tamamen kaldırma (çöp kutusu) eklendi.
- Sepetin üstüne tüm sepeti temizleme eklendi (onay sorar).
- Menü ürün detayları `/menu/:slug` adresiyle açılır hale getirildi.
- Sepetten ürün adına/görseline tıklanınca ilgili ürün detayına gidilir.
- Geçmiş sipariş kalemlerinden ilgili ürün detayına gidilebilir; productId parametresi ürün eşleşmesini kesinleştirir.
- Sepete geçmiş siparişten eklenen ürünlerde ürün slug bilgisi korunur.
- Geçmiş siparişlerde ürün kalemleri ve kayıtlı sipariş finans özeti (ara toplam, teslimat, toplam indirim, net tutar) gösterilir.
- Profil açılır menüsünün mouse ayrıldıktan sonra kapanması 1 saniye geciktirildi.

## Kurulum
- Mevcut `.env` dosyanızı koruyun.
- Proje dosyalarını güncelleyin.
- `npm ci` ve `npm run build` çalıştırın.
- Supabase SQL migration gerekmiyor.

## Kontrol
Değiştirilen TypeScript/TSX dosyalarının TypeScript parser sözdizimi kontrolü başarılıdır. Bu çalışma ortamında `npm ci` zaman aşımına uğradığı için tam `npm run build` doğrulaması tamamlanamamıştır.
