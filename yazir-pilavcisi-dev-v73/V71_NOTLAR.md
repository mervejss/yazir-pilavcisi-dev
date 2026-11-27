# v71 — İleri tarihli sipariş + Toplu sipariş (yönetici)

## Önce yapılacak
1. Supabase SQL Editor'de `sql/46_scheduled_orders_bulk_requests.sql` dosyasını çalıştırın (45'ten sonra). Sıfırdan kurulumda `sql/yazir_full_schema.sql` zaten içerir.
2. `npm install && npm run build`

## İleri tarihli / saatli sipariş
- Yeni Sipariş → sağ panelde "İleri tarihli / saatli sipariş" kutusu (isteğe bağlı; Paket Servis ve Gel-Al). Hızlı seçimler: +1 sa, bugün 19:00/20:00, yarın 12:00.
- Sipariş hemen kaydedilir ama `scheduled_for` taşır. Canlı panoda "⏰ Bugün 19:30" etiketi ve "3 sa 20 dk sonra" görünür; saati gelmeden "geciken" sayılmaz. Gecikme/"Dünden kalan" hesabı planlanan saatten yapılır. Kurye ekranında planlı saat görünür.
- Raporlardaki süre ölçümleri (hazırlık/teslim) planlanan saatten sayılır.
- Kurallar: masa siparişi planlanamaz; geçmiş saat olmaz; en fazla 120 gün.

## Toplu sipariş
- Yeni Sipariş penceresinin üstünde "🎉 Toplu sipariş" sekmesi: Ad soyad, Telefon, Organizasyon türü (isteğe bağlı), Kişi / ürün sayısı, Teslim tarihi-saati, Adres, Not.
- Yeni sayfa: Siparişler → "Toplu Sipariş Talepleri" (`/admin/toplu-siparis`): web + yönetici talepleri, durum, yönetici notu, "Siparişe çevir" (planlı sipariş formunu doldurur, kaydedince talep "Onaylandı" olur).
- Web formunda da organizasyon türü artık isteğe bağlı, etiket "Kişi / ürün sayısı".

## Test
`npm test`, `npm run test:sql` (yeni: sql/tests/40_scheduled_bulk.test.sql).
Not: Bu ortamda vite/tsc derlemesi çalıştırılamadı; yalnızca sözdizimi ve SQL testleri doğrulandı.
