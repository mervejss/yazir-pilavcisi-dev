# Geçmiş Siparişler – veri paketi (Trendyol)

Dönem: 2026-10-12 → 2026-11-04 | 392 kalem | 195 sipariş | 97,495 TL

SQL kurulumu: sql/README.md (tek sıra: sql/ORDER.txt). Geçmiş siparişler: sql/veri/ (005 → 005b → 006).
Seed dosyası Trendyol kayıtlarını silip yeniden yazar, tekrar çalıştırmak güvenlidir.

Notlar:
- 26.10.2026 iki dosyada da vardı; birleştirirken tekrarlar çıkarıldı.
- order_code günlük sayaçtır, benzersiz değildir; anahtar order_no.
- Kaynak dosyalarda puan/yorum verisi YOK. Mevcut platform_reviews tablosuna dokunulmadı.
- Yeni 15 günlük dönem: batch_key = trendyol-YYYY-MM-DD_YYYY-MM-DD biçiminde eklenecek.
