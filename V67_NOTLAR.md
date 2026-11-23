# v67 — Webhook tamamen kaldırıldı (Trendyol Yemek/TGO için gerekmiyor)
Silinenler: supabase/functions/order-webhook, TrendyolWebhookSection (panel 5b), normalizeIncoming.
## Supabase'te temizlik (terminal)
supabase functions delete order-webhook
supabase secrets unset TRENDYOL_MP_API_KEY TRENDYOL_MP_API_SECRET WEBHOOK_API_KEY WEBHOOK_USER WEBHOOK_PASS
(Dashboard → Edge Functions → Secrets'tan da silebilirsiniz.)
Sonra: platform-trendyol'u yeniden deploy edin, SQL Editor'de sql/43 çalıştırın.
## Yük
TGO'da push/webhook yok; sipariş almanın tek yolu çekme. Zamanlayıcı 2 dk'da bir; kapalıysa/çalışma saati dışındaysa istek atılmaz (sql/43).
Asıl yük (gereksiz UPDATE + Realtime + ham JSON) v60-v63'te giderildi: değişmeyen pakette DB yazımı yok.
