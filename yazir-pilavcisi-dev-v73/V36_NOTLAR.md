# v36 — WhatsApp penceresi + SEO paketi

## Kurulum
1. Supabase → SQL Editor → `sql/28_whatsapp_widget.sql` (bir kez; tekrar çalıştırmak güvenli). Çalıştırmadan da site çalışır, yalnızca ayarlar bölümü uyarı gösterir.
2. Admin → Ayarlar → "💬 WhatsApp penceresi": düğmeyi aç/kapat, katalog bağlantısı (şimdilik boş kalabilir), hazır mesajlar (her satır bir seçenek).
3. WhatsApp numarası Ayarlar'daki "WhatsApp Hattı" alanından gelir (boşsa 0540 331 41 42 kullanılır).

## WhatsApp penceresi
- Sağ altta yeşil düğme + ana sayfada "WhatsApp ile hızlı sipariş" bölümü aynı pencereyi açar.
- Açık/kapalı durumu çalışma saatlerinden gelir. Hazır mesaja dokununca WhatsApp mesaj yazılı açılır.
- "📍 Konumumu gönder" Google Haritalar bağlantısını mesaja ekler.
- Sepet doluysa "Sepetimi WhatsApp'tan gönder" (ürünler + toplam) çıkar.
- Katalog bağlantısı girilince "🛍️ WhatsApp kataloğunu aç" düğmesi görünür. Katalog oluşturulunca: WhatsApp Business → Ayarlar → Katalog → bağlantıyı paylaş → Ayarlar'a yapıştır.

## SEO
- Her sayfa için ayrı başlık/açıklama/canonical/Open Graph (paylaşım önizlemesi); giriş, profil, takip sayfaları noindex.
- Restaurant (schema.org) yapılandırılmış verisi: adres, telefon, çalışma saatleri, menü.
- `public/robots.txt` ve `public/sitemap.xml` (alan adı: yazirpilavcisi.com.tr). Yeni sayfa eklerseniz sitemap'e ekleyin.
- Sizin yapmanız gerekenler: Google Business Profile kaydı/doğrulama, Search Console'a site ekleyip sitemap göndermek.
- Not: wrangler.jsonc dosyası projede kalmalı (Cloudflare deploy için).
