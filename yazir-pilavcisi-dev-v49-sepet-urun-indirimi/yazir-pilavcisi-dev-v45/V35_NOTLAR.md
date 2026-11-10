# v35 — Ödemeler: parça parça ödeme, dönemler

1. Supabase SQL Editor'de `sql/27_payment_installments.sql` çalıştırın (26'dan sonra).
2. Tek seferlik (örn. web sitesi 35.000 ₺): kartta Toplam / Ödenen / Kalan + ilerleme çubuğu. "➕ Ödeme ekle" ile tutar + tarih girin; kalan otomatik düşer, tamamı ödenince kayıt kapanır. Ödemeleri düzenleyip silebilirsiniz.
3. Aylık (reklam, sosyal medya): ✏️ Düzenle → Başlangıç tarihi (örn. 6'sı) ve isteğe bağlı Bitiş tarihi. Dönemler (6 Kas–5 Ara …) otomatik oluşur; her dönem için "Öde" veya ara tarihli ekstra ödeme girilebilir. **Hazır gelen iki aylık kaydın başlangıç tarihini girmeniz gerekir.**
4. Üstteki "Bu ay ödenen" kutusu kalem kalem gösterir (örn. Web sitesi 5.000 / 35.000 ₺). Geciken dönemler ayrıca görünür.
