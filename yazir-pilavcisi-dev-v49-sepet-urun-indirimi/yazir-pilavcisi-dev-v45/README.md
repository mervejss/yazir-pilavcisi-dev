# Geçmiş Siparişler – veri paketi (Trendyol)

Dönem: 2026-10-12 → 2026-11-04 | 392 kalem | 195 sipariş | 97,495 TL

Kurulum sırası (PostgreSQL/Supabase; 005 daha önce çalıştıysa önce 005b_fix_id_identity.sql): sql/005_past_orders.sql (şema) → sql/006_past_orders_seed_trendyol.sql (veri).
Seed dosyası Trendyol kayıtlarını silip yeniden yazar, tekrar çalıştırmak güvenlidir.

Notlar:
- 26.10.2026 iki dosyada da vardı; birleştirirken tekrarlar çıkarıldı.
- order_code günlük sayaçtır, benzersiz değildir; anahtar order_no.
- Kaynak dosyalarda puan/yorum verisi YOK. Mevcut platform_reviews tablosuna dokunulmadı.
- Yeni 15 günlük dönem: batch_key = trendyol-YYYY-MM-DD_YYYY-MM-DD biçiminde eklenecek.
