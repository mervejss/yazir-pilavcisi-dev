# v32 — Trendyol Finans & Net Kâr

Yeni sayfa: **/admin/finans** (menüde "Finans & Net Kâr", yalnızca sahip).

## Kurulum (sırayla)
1. Supabase → SQL Editor → `sql/24_trendyol_finance.sql` çalıştır.
2. `supabase functions deploy platform-trendyol` (yeni dosya: `finance.ts`, `index.ts` güncellendi).
3. Panel → Finans & Net Kâr → **🔌 Bağlantıyı dene**.
   - ✅ çalışıyorsa → **⬇ Trendyol'dan çek**.
   - ❌ ise → Trendyol panelinden Cari Hesap Ekstresi'ni indir → **📥 Dosyadan içe aktar**.
4. **⚙️ Maliyet & KDV** sekmesinde ürün maliyet %'sini, ambalaj ve KDV oranlarını gir.

## Yeni / değişen dosyalar
- sql/24_trendyol_finance.sql                       (YENİ)
- supabase/functions/platform-trendyol/finance.ts   (YENİ)  settlements / otherfinancials / payment-order
- supabase/functions/platform-trendyol/index.ts     (DEĞİŞTİ) finance_probe, finance_sync, finance_payment_orders
- src/lib/finance.ts, src/lib/financeImport.ts      (YENİ)
- src/hooks/useFinance.ts                           (YENİ)
- src/components/finance/FinanceTabs.tsx            (YENİ)
- src/pages/admin/FinanceAdmin.tsx                  (YENİ)
- src/styles/finance.css                            (YENİ)
- src/App.tsx (rota), src/pages/admin/AdminLayout.tsx (menü)  (DEĞİŞTİ)

## Hesap mantığı
Trendyol dokümanındaki işlem türü tablosuna göre (Sale, Return, Discount, Coupon, Provision*, ManualRefund*,
SellerRevenue*/Commission* düzeltmeleri, DeliveryFee, TyDiscount/TyCoupon):
- Hakediş = Σ işaret × sellerRevenue ; Komisyon = Σ işaret × commissionAmount (KDV dahil)
- Hesabıma geçecek = hakediş − (stopaj + platform hizmet bedeli + hizmet faturaları + mutabakat/düzeltme)
- Net kâr = hesabıma geçecek − maliyet (stopaj gider sayılmaz, vergiden mahsup edilir)
- KDV: satış KDV − (komisyon KDV + hizmet faturası KDV [+ maliyet KDV]) = tahmini ödenecek KDV
- Ödemeler sekmesi: hesaplanan net ↔ Trendyol'un ödediği tutar (fark ≈ 0 olmalı)

## Önemli
Finans servisleri Trendyol **Pazaryeri** dokümanında (apigw.trendyol.com) yayınlı. Projedeki entegrasyon Trendyol Go Yemek
(api.tgoapis.com). Aynı API key/secret ile çalışıp çalışmadığını "Bağlantıyı dene" gösterir.
Gerekirse integrations.config içine: finance_base_url, finance_environment (prod|stage), finance_seller_id.
