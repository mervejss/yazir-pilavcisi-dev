# v54 – Masa hesabı denetimi ve güvenli kapatma

## Neler değişti?
- Masa detayındaki sipariş sorgusu artık `table_id` + son 20 sipariş yerine doğrudan seçili `table_session_id` üzerinden tüm açık oturum siparişlerini getirir.
- Böylece eski/başka oturum siparişleri detay listesine karışmaz; 20 kayıt sınırı nedeniyle aynı oturumun bazı siparişleri kaybolmaz.
- Hesabı kapatmadan hemen önce veritabanından ilgili oturumun siparişleri tekrar okunur.
- Otomatik servis durumuna alınan her siparişin RPC hatası kontrol edilir; hata varsa hesap kapatma devam etmez.
- Hızlı Sipariş ve Masa Düzeni aynı `close_table_bill` RPC'sine dayanır. Sipariş panosundaki `close_table_from_order` da bu fonksiyonu çağırır.
- 12 saatten uzun açık kalan oturumlarda, eski siparişlerin hesaba dahil olabileceğini belirten uyarı gösterilir.
- `sql/37_table_session_audit.sql` tüm masaların açık oturumlarını ve sipariş dökümlerini sadece okur. Hiçbir veriyi değiştirmez.

## Çok önemli: Masa 3'ün gerçek verisini doğrulama
Uygulama ZIP'i tek başına canlı Supabase kayıtlarını okuyamaz. Bu nedenle Masa 3'ün sabahki oturumunun hâlâ açık olup olmadığını kesinleştirmek için Supabase SQL Editor'de `sql/37_table_session_audit.sql` dosyasını çalıştırın.

Özellikle ilk sorguda Masa 3 satırındaki `acik_oturum_id`, `oturum_baslangici`, `acik_saat`, `siparis_sayisi` ve `siparis_toplami` alanlarına; ikinci sorguda sipariş saatleri ve kaynaklarına bakın. Eski siparişler aynı açık oturuma bağlıysa sorun doğrulanmış olur.

**Bu migration hiçbir oturumu otomatik kapatmaz ve hiçbir siparişi silmez.** Ödeme alındığı doğrulanmadan geçmiş hesabı kapatmak veya siparişleri taşımak muhasebe kaydı açısından risklidir.

## Kurulum
1. Proje dosyalarını güncelleyin; `.env` dosyasını koruyun.
2. `npm ci` ve `npm run build` çalıştırın.
3. Cloudflare Pages'e deploy edin.
4. Supabase SQL Editor'de yalnızca denetim için `sql/37_table_session_audit.sql` dosyasını çalıştırın.
