# v63 — Trendyol: eksiksiz, hafif, yarışsız

## Kurulum sırası
1. SQL Editor: `sql/40` → `sql/41` → `sql/42` (hepsi tekrar çalıştırılabilir).
2. Deploy: `supabase functions deploy platform-trendyol` ve `supabase functions deploy order-webhook --no-verify-jwt`.
3. `npm run build` ile derleyin (bu ortamda derleme/çalıştırma testi yapılamadı).

## Ne değişti
- Ham Trendyol paketi `orders` yerine `order_payloads` tablosunda (Realtime'da yok, istemciye gitmez). `orders.external_payload` küçük özet (orderNumber vb. — raporlar aynen çalışır).
- `orders` replica identity = default → Realtime olayları çok küçük (egress düşer). Mevcut siparişler tek seferlik taşınır.
- Çekim: sayfalar 4'lü paralel, 90 sn bütçe, değişmeyen paket atlanır, heartbeat 10 dk'da bir.
- Eksiksizlik: son 36 saatte görülmeden "Teslim edildi" olmuş paketler yakalanır; "Created" kalan paketlerde otomatik kabul yeniden denenir; kısmi iptal/tutar değişimi `platform_update_items` ile eşitlenir.
- Çift kayıt koruması: çekim + webhook aynı anda gelirse advisory kilit ile tek sipariş.
- Durum push'unda tüm paket sayfaları çekilmez; saklı paket kullanılır. Cron zaman aşımı 55 sn, indeks eklendi.

## Dürüst notlar
- Trendyol Go için belgelenmiş webhook doğrulanmadı; webhook alıcısı Marketplace şemasına göre. Asıl güvence 2 dk'lık sunucu çekimidir.
- "Geç yakalama" için TGO paketinde tarih alanı olmalı; `peek_packages` eylemiyle alan adlarını kontrol edin.
- Bölünmüş ödemeler raporlarda sipariş başına baskın yöntemle görünür; tutar bazlı kırılım (`table_split_payments`) raporlara henüz eklenmedi.
