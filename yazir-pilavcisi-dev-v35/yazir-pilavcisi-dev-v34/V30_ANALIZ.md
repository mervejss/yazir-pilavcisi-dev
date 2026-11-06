# v30 — Komple Analiz Revizyonu

Yeni SQL gerekmez. Yeni npm paketi gerekmez (xlsx zaten kurulu).

## Yeni dosyalar
- src/lib/analyticsData.ts            — veri katmanı: İstanbul saati + 03:00 iş günü, birleştirme, analiz, içgörüler
- src/lib/analyticsExport.ts          — CSV / çok sayfalı Excel dışa aktarma
- src/hooks/useAnalyticsData.ts       — veri çekme, platform sayaçları, analiz hook'ları
- src/styles/analytics-pro.css        — stiller (açık/koyu tema + yazdırma)
- src/components/analytics/pro/Kit.tsx — grafik kiti (trend, sütun, ısı haritası, halka, tablo…)
- src/components/analytics/pro/tabs/{types.ts, OverviewTab, TimeTab, PlatformTab, ProductTab, CourierTab, CustomerTab, BusinessTab}.tsx

## Değişen
- src/pages/admin/Analytics.tsx (yeniden yazıldı)

## Silinen
- src/components/admin/AnalyticsCharts.tsx (yerini yeni sekmeler aldı)

## Dokunulmayanlar
CouriersAdmin, CustomersAdmin, CourierApp ve src/components/analytics/{Charts,RangePicker,...} aynen çalışır.
