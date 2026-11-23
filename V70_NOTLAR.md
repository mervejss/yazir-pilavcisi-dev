# v70 — SQL düzeni, otomatik testler, müşteri numarası + telefon uyarısı

## Yapmanız gerekenler
1. SQL Editor: `sql/45_customer_numbers_phone_check.sql` (önceki 40–44 çalışmış olmalı). Mevcut müşteriler kayıt sırasına göre #1001'den numaralanır.
2. `npm run build` (derleme bu ortamda yapılamadı).
3. (Canlıda dosya adı değişti) `35_address_description.sql` → `35a_…`, `35_finance_daily_cargo.sql` → `35b_…`; içerikleri aynı, çalıştırdıysanız tekrar gerek yok.

## SQL düzeni — bkz. sql/README.md
- Tek sıra listesi `sql/ORDER.txt`; tam şema `yazir_full_schema.sql` bundan üretilir ve doğrulandı (zincirle aynı şema).
- `sql/sql/` (eski CRLF kopya), `08_quick_order_support.sql` (→ arsiv/), `00_quick_fix` ve `99_dev_reset` (→ bakim/), 005/005b/006 (→ veri/) ayrıldı.
- `bakim/00_quick_fix.sql` anon/authenticated'a GENİŞ izin verir: normal kurulumda çalıştırmayın (dosyada uyarı var, geçersiz bir satır düzeltildi).

## Testler
- `npm test` — arayüz mantığı (hesap bölme, çevrimdışı kurye kuyruğu, Trendyol paket eşleme): 20 test.
- `npm run test:sql` (= sql/tools/verify.sh) — boş PostgreSQL'de tüm SQL'i kurar + veritabanı testleri (müşteri/telefon, masa hesabı bölme, Trendyol giriş): PostgreSQL gerekir.
- Testlerin bulduğu: `r2` yuvarlaması "-0" döndürebiliyordu (düzeltildi).

## Müşteri numarası ve telefon
- Her müşteride sabit numara (#1001…): listede "No" sütunu, detay başlığında, sipariş alırken arama sonuçlarında, CSV'de; "#1005" yazıp aranabilir.
- Aynı telefon: yeni müşteri/telefon düzenlerken 0,4 sn içinde "Bu telefon #1005 Ahmet Y. müşterisinde kayıtlı" uyarısı ("Müşteriyi aç" düğmesiyle). Eskiden aynı numara sessizce birleştirilip ADI EZİLİYORDU; artık onay gerekir. Düzenlemede başka müşterinin numarasına geçmek sunucuda da engellenir.
