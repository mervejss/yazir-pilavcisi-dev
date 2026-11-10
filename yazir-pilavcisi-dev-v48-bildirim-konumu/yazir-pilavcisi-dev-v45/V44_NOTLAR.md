# v44 — Finans (eksik veri + günlük çekim) · Analiz (Restoran İçi / Dışı, Masa Servisi, Kâr & Kanal)

## Kurulum (sırayla)
1. **SQL Editor:** `sql/35_finance_daily_cargo.sql` çalıştırın (tekrar çalıştırılabilir). İçeriği:
   kargo faturası tablosu · `opening_hours_overrides` tablosu (konsoldaki 404'ün sebebi) · günlük finans cron'ları.
   Ön koşul: sql/18 (vault `cron_secret`) ve sql/24 daha önce çalıştırılmış olmalı.
   (Çalışma saati fonksiyonları için `sql/09_hours_overrides.sql` henüz çalıştırılmadıysa onu da bir kez çalıştırın.)
2. `supabase functions deploy platform-trendyol`
3. Siteyi yeniden yayınlayın. Sonra **/admin/finans → ⬇ Trendyol'dan çek** (30 gün) bir kez çalıştırın.

## 1) "Günlük çekimde bazı kayıtlar eksik" — kök neden ve çözüm
**Neden:** `payment-order` servisi Trendyol tarafında HTTP 500 veriyor. Eski kodda bu hata tüm çekimi "başarısız" sayıyordu ve
ön yüz **ilk 14 günlük pencereden sonra durup** diğer dönemleri hiç çekmiyordu → sayfa "sadece bazılarını" gösteriyordu.
Ek olarak geçici hatalar (429/5xx) tek denemede yutuluyordu.

**Çözüm:**
- `finance.ts`: 429/5xx/ağ hatalarında **4 kez üstel beklemeli yeniden deneme**; hız sınırı için eşzamanlılık düşürüldü.
- `payment-order` hata verirse çekim **bozulmaz**: farklı parametreler denenir, olmazsa ödeme emirleri
  `otherfinancials → PaymentOrder` ("Hakediş ödemesi") kayıtlarından **türetilir** (aynı numara, aynı tutar). Mutabakat çalışmaya devam eder.
- Ön yüz: her 14 günlük pencere için **satışlar ve kesintiler ayrı çağrılır**; bir adım hata verirse **diğerleri devam eder**
  (yalnızca 401/403/404 durdurur). Sonunda kaç satış/kesinti kaydı geldiği ve hangi adımın hata verdiği yazılır.
- **Günlük otomatik çekim (cron, 07:05–07:15 İstanbul):** son 14 gün yeniden çekilir (upsert; çoğaltmaz) + son 4 ödeme emrinin
  tüm kayıtları yenilenir (`payment_order_id` ve ödeme tarihi kayıtlara **sonradan** dolduğu için gerekli) + kargo faturaları.
- **Veri bütünlüğü kartı (Özet'in üstünde):** panelde *teslim* görünen Trendyol siparişlerinin kaçı finansta eşleşmiş, kaçı bekliyor
  (liste + CSV). Trendyol finansal kaydı teslimden **sonra** oluşturduğu için son 1–3 günün "bekleyen" görünmesi normaldir.

## 2) Finans sayfasına eklenen veri (dokümanlardaki alanlar)
- Özet: sipariş sayısı, ortalama sepet, iadeli sipariş + iade oranı, sipariş başı komisyon/hakediş/net kâr,
  **ödeme emri oluşan** ve **bekleyen** hakediş.
- Ödemeler: **📅 Vade takvimi** (paymentDate'e göre yaklaşan hakedişler).
- 🍽️ Ürün bazında (barkod/açıklama): satış, iade, indirim, komisyon %, hakediş.
- Kesinti dökümü: **komisyon oranına göre satışlar** ve **🚚 kargo faturası kalemleri** (Kargo Faturası Detayları servisi:
  `DeductionInvoices` içindeki "Kargo Fatura" kaydının id'si = invoiceSerialNumber). Kargo faturası yoksa kart boş kalır.

## 3) Analiz: Restoran İçi / Restoran Dışı
- **Masa servisi düzeltildi:** masaya bağlı / "restoranda" siparişler artık her zaman **🍽️ Masa Servisi** sayılır
  (eski kayıtlar dahil — `order_type=dine_in` veya `table_id` varsa). Hızlı sipariş artık masa siparişini `table` kaynağıyla kaydeder.
  `/admin/analiz?kanal=table` doğru dolar.
- "Restoran Paket" → **🥡 Restoran Gel-Al**. Telefon (**☎️ Telefon Siparişi**), **🌐 Online Sipariş (Web)** ayrı kanallar olarak kalır.
- **İki ana grup:** 🏠 **Restoran İçi** (masa, gel-al, telefon, online) ve 🛵 **Restoran Dışı** (Trendyol, Yemeksepeti, Getir, Migros…).
  Filtre satırında her grup tek tıkla (`?kanal=inside` / `?kanal=outside`) ve altındaki kanallar ayrı ayrı seçilir.
- **Yeni sekme "💼 Kâr & Kanal":** toplam sipariş, ciro, komisyon + platform kesintisi, iade/indirim, maliyet, **net kâr**, marj;
  iki grup kartı, kanal bazında kârlılık tablosu, iç/dış trend grafiği, en çok satanlar.
  Trendyol için komisyon/iade/kesinti oranları **Cari Hesap Ekstresi'nden (gerçek)** alınır (veri yoksa tahmini). Maliyet ayarları Finans › Maliyet & KDV ile ortaktır.
- Konsoldaki `opening_hours_overrides 404`: tablo sql/35 ile oluşur; tablo yoksa tarayıcı artık 30 dk boyunca tekrar sormaz.

## Dürüst notlar
- Trendyol `payment-order` 500'ü Trendyol tarafında; kod bunu aşıyor ama düzelmesi için Trendyol entegrasyon destek talebi açabilirsiniz.
- Yemeksepeti/Getir/Migros için henüz API entegrasyonu yok → komisyonları tahminidir (Analiz › İşletme sekmesinden oran girilir).
- Bu paketi derleyip (`tsc`, `vite build`) ve hesap mantığını örnek veriyle denedim; canlı Trendyol/Supabase'e erişemediğim için
  edge function ve cron'u canlıda ben çalıştıramadım — deploy sonrası "🔌 Bağlantıyı dene" ve bir "Trendyol'dan çek" ile doğrulayın.

## Değişen dosyalar
sql/35_finance_daily_cargo.sql (yeni) · supabase/functions/platform-trendyol/finance.ts · index.ts ·
src/lib/finance.ts · analyticsData.ts · analyticsExport.ts · constants.ts ·
src/hooks/useFinance.ts · useAnalyticsData.ts · useBusinessSettings.ts ·
src/components/finance/FinanceTabs.tsx · src/components/analytics/pro/tabs/ProfitTab.tsx (yeni) · tabs/types.ts ·
src/components/admin/NewOrderModal.tsx · src/pages/admin/FinanceAdmin.tsx · Analytics.tsx · src/styles/analytics-pro.css · V44_NOTLAR.md
