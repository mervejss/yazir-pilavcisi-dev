# v43 — Masa siparişinde "HESABI KAPAT" · Supabase egress / log optimizasyonu
(Bu zip v42 dosyalarını da içerir: Personel ekleme/düzenleme/yetki düzeltmeleri. V42_NOTLAR.md'ye bakın.)

## Kurulum
1. **SQL Editor:** `sql/33_staff_management.sql` (daha önce çalıştırmadıysanız), sonra **`sql/34_close_bill_and_cron_optimize.sql`** — ikisi de tekrar çalıştırılabilir.
2. Edge Function'lar: `supabase functions deploy platform-trendyol` ve `supabase functions deploy staff-admin --no-verify-jwt`
3. Siteyi yeniden yayınlayın.

## 1) Masa siparişinde HESABI KAPAT
- Restoranda servis (masa) siparişi **Hazır** olunca kartta "Servis edildi" yerine **💳 HESABI KAPAT** çıkar. Tıklayınca masanın toplam tutarı, sipariş kalemleri ve ödeme şekli (nakit / POS / IBAN) seçilir; onaylanınca masadaki hazır siparişler servis edilmiş olur ve hesap tek işlemde kapanır.
- Masada mutfakta hâlâ **yeni/hazırlanıyor** sipariş varsa hesap kapanmaz, nedeni yazılı uyarı verilir.
- Kartı "Teslim Edildi" sütununa sürüklemek de aynı pencereyi açar (hesap açık kalmasın diye).
- Masaya bağlı olmayan tezgâh/restoran siparişlerinde eski "Servis edildi" düğmesi aynen durur.
- Sunucu tarafı: `close_table_from_order` (sql/34). Yetki: `tables.operate` + `orders.edit`.

## 2) Supabase kullanım aşımı — ne yapıldı
**Önemli uyarı (cron):** Denediğiniz `cron.schedule(... net.http_get(...))` komutu işi **gizli anahtar (x-cron-secret) olmadan ve GET ile** yeniden yazar. Edge Function bunu 401 ile reddeder ve Trendyol senkronu **sessizce durur**. `sql/34` işi doğru biçimiyle (POST + vault'taki gizli anahtar) **3 dakikada bir** olarak yeniden kurar. Mutlaka çalıştırın.

Tarayıcı tarafı (egress'in asıl kaynağı):
| Yer | Eski | Yeni |
|---|---|---|
| Platform senkron (`usePlatformPolling`) | 15–30 sn + açılışta anında, her sekme ayrı | en az 60 sn (varsayılan 120), açılışta anında yok, **tek sekme** çeker, gizli sekmede yok |
| Siparişler (`useOrders`) | her olayda 2 büyük sorgu (300+300 sipariş + kalemleri), 3 yerde | olaylar 1,5 sn'de **tek sorguda birleşir**, gizli sekmede ertelenir, 90 sn yedek |
| Yan menü "yeni sipariş" rozeti | tüm sipariş + kalemler | yalnızca 4 sütun (`light`) |
| Kuryeler (`useCouriers`) | 10 sn + her konum güncellemesinde sorgu | olaylar 5 sn'de birleşir, 45 sn yedek, gizli sekmede yok |
| Kurye istekleri | 20 sn | olaylar birleşir, 60 sn yedek, gizli sekmede yok |
| Kurye uygulaması | 15 sn + her olay | olaylar birleşir, 45 sn yedek, gizli ekranda yok |
| Kurye GPS gönderimi | 5 sn / 12 m / 20 sn | 8 sn / 20 m / 30 sn |
| Masalar (`useTables`) | her sipariş olayında 3 sorgu | olaylar 1,5 sn'de birleşir |
| Müşteri sipariş takibi | 10 sn + 5/15 sn | 20 sn + 8/30 sn, gizli sekmede yok |
| İşletme ayarları (**her ziyaretçide**) | 60 sn'de 3 sorgu + her sekme değişiminde | 5 dk, görünürken; sekme dönüşünde en fazla 2 dkda bir |

Sunucu / log tarafı:
- `platform-trendyol`: değişiklik yoksa (yeni sipariş/durum/hata yok) olay günlüğüne **kayıt yazılmaz** (panelden tetiklenenler dahil).
- `sql/34`: `integration_events` (14 gün), `cron.job_run_details` (3 gün), `net._http_response` (1 gün) kayıtları her gün 04:17'de otomatik temizlenir; ilk temizlik hemen yapılır. Bu iki tablo sınırsız büyür ve log/depolama şişmesinin sık sebebidir.

## Beklenti ve kontrol (dürüst not)
Rakamları ben ölçemem; bu bir tahmindir: sürekli açık admin sekmelerinde ve müşteri takip sayfalarında istek sayısı kabaca **%70–90** azalmalı. **Log Ingestion** istek sayısıyla birlikte düşer, ancak Supabase'in kullanım grafiği gecikmeli ve dönem sıfırlanana kadar kümülatiftir; etkiyi 24–48 saat sonra **Reports → API** (en çok istek alan uçlar) ve **Usage** sayfasında görün.
Egress'in başka bir kaynağı **Storage** olabilir (ürün/galeri fotoğrafları her görüntülemede Supabase'ten iner). Usage'da "Storage egress" yüksek çıkarsa görselleri Cloudflare önbelleği arkasına almak veya daha küçük boyutta yüklemek gerekir; bu pakette değiştirilmedi.
Sonuç yetmezse: 10 Aralık'tan önce Supabase Pro plana geçmek kısıtlamayı kesin önler.

## Değişen dosyalar
src/lib/polling.ts (yeni) · src/hooks/usePlatformPolling.ts · useOrders.ts · useCouriers.ts · useCourierRequests.ts · useBusinessSettings.ts · useTables.ts · useCourierTracking.ts · src/pages/admin/OrdersBoard.tsx · AdminLayout.tsx · UsersAdmin.tsx · src/pages/public/TrackPage.tsx · src/pages/courier/CourierApp.tsx · src/lib/staffPermissions.ts · supabase/functions/platform-trendyol/index.ts · supabase/functions/staff-admin/index.ts · sql/33_staff_management.sql · sql/34_close_bill_and_cron_optimize.sql · V42_NOTLAR.md · V43_NOTLAR.md
