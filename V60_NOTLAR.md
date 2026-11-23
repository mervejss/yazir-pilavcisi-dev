# V60 – Hesap kapatırken bölerek ödeme (admin + kurye ortak)

## Admin: Masa → "Hesabı Kapat" ve Siparişler panosu → masa kartı "Hesabı Kapat"
- Açılışta **💰 Toplu öde** seçili gelir (nakit / kart / IBAN, eskisi gibi tek tıkla kapanır).
- **👥 Böl / ayrı ayrı öde** seçilirse:
  - Her kalemin solunda **kare**: dokununca kalemin kalan tüm adedi seçilir; çok adetli üründe (ör. 12 midye) yanındaki sayıdan kaçının ödendiği ayarlanır (kısmi adet).
  - **Eşit böl**: 2–6 hızlı düğme veya **yazılan kişi sayısı**. Her ödemede kalan ÷ kalan kişi otomatik gelir, son kişi tam kalanı öder.
  - **Elle tutar** da girilebilir. Öncelik: elle tutar > seçilen kalemler > eşit bölüm.
  - Kişi adı/notu, kişi başına nakit/kart/IBAN, "Geri al", anlık **Alınan / Kalan** toplamı, "Kalanın tamamını tek kişi öder".
  - Kalan 0 olunca (tüm tutar dağıtılınca) **Hesabı Kapat** açılır; ödemeler hesapla birlikte tek işlemde kaydedilir.
- Veritabanı: `sql/41_split_bill_payments.sql` (yeni tablo `table_split_payments` + `close_table_bill_split`). Bölünmüş ödeme için bir kez çalıştırın; toplu ödeme bu dosya olmadan da çalışır.
- Siparişlerdeki tek `payment_method` alanına en çok tutarı alan yöntem yazılır; yöntem bazlı tam döküm `table_split_payments` tablosundadır.

## Kurye (sipariş detayı)
Aynı bileşene geçti (BillSplitter): çok adetli ürün artık tek satır + kısmi adet, **yazılabilir kişi sayısıyla eşit böl**, "kalanın tamamı tek kişi". Eski kayıtlar (kalem başına `id#n`) otomatik uyumlu okunur.

## Kurulum
1. SQL Editor: `sql/41_split_bill_payments.sql`
2. Siteyi derleyip yayınlayın. (V59 notlarındaki adımlar ayrıca geçerli.)
