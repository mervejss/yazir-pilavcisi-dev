# v38 — Canlı kurye takibi · Kurye geri tuşu · Komple SEO · Mobil · Güvenlik

## 1) Kurulum (sırayla)
1. Supabase → SQL Editor → `sql/28_whatsapp_widget.sql` (v36'dan çalıştırmadıysanız) ve **`sql/29_track_live.sql`** (yeni).
2. `.env` / Cloudflare ortam değişkeni: `VITE_GOOGLE_MAPS_API_KEY` (Maps JavaScript, Geocoding, Places (New), **Directions API** etkin olmalı — Directions kapalıysa yaklaşık mesafe/süre gösterilir).
3. `wrangler.jsonc` projede kalmalı. Cloudflare'de deploy: `npx wrangler deploy`.
4. Ayarlar → WhatsApp penceresi alanlarını doldurun (katalog bağlantısı sonra eklenebilir).

## 2) Müşteri sipariş takibi (`/takip/<id>`)
- Paket serviste canlı harita: restoran, kurye (hareket ederken yumuşakça kayar), teslimat adresi.
- Kalan yol (Google Directions, trafikli), **kalan km**, **tahmini süre** ve **tahmini varış saati**, kat edilen mesafe, kurye hızı.
- Gidilen yol mavi çizgiyle gösterilir (sunucu geçmişi + tarayıcıda biriken canlı iz).
- 5 sn'de bir yenilenir; sekme öne gelince anında yenilenir. Kurye konumu 2 dk'dan eskiyse uyarı çıkar.
- Gizlilik: kurye konumu yalnızca sipariş **atandı / yolda** iken ve yalnızca o siparişin (tahmin edilemez) linkine sahip kişiye döner. Kurye telefonu paylaşılmaz.
- Maps anahtarı yoksa gömülü Google haritası + kuş uçuşu tahmin gösterilir.
- `sql/29` konum geçmişi aralığını 20 sn yapar (daha düzgün iz). Kurye uygulamasında "Çevrimiçi" olmalı ve konum izni açık olmalı.

## 3) Kurye uygulaması (telefon)
- **Geri tuşu artık hesaptan çıkarmaz:** önce açık harita/sekmeyi kapatır; ana ekrandaysa "Hesaptan çıkış yapılsın mı?" diye sorar. Üstteki çıkış simgesi de aynı onayı ister.
- Ana ekrana eklenebilir (PWA manifest), güvenli alan (çentik/alt çubuk) uyumlu.

## 4) SEO — denetim raporundaki maddeler
| Bulgu | Yapılan |
|---|---|
| Title'da "Pilav Restoranı" yok | Tüm sayfa başlıkları/açıklamaları "Pilav Restoranı · Yazır · Konya" + adresle yeniden yazıldı |
| Meta description yok | Her sayfa için benzersiz açıklama (index.html + dinamik) |
| Başlıklarda konum yok | H1: "Yazır'da tane tane pilav…", H2: "Yazır Pilavcısı: Konya Yazır'ın Pilav Restoranı" |
| H hiyerarşisi bozuk (H4 atlıyor) | Alt bilgi başlıkları H2/H3 yapıldı |
| 191 kelime (ince içerik) | Ana sayfaya ~450+ kelime içerik + 7 soruluk SSS |
| Kategori sayfası yok | `/pilav-restorani` iniş sayfası (menü, saat, adres, SSS) |
| Adres uyumu | Varsayılan adres GBP biçimine çekildi; şemada posta kodu 42310 |
| Çalışma saati uyumsuz | **Sizin yapmanız gerekir:** Google Business Profile'da saatleri girin (Pzt–Cmt 12:00–03:00, Pazar 14:00–03:00). Site zaten aynı saatleri yayınlıyor |
Ek: Restaurant + FAQPage + OrderAction şeması, canonical, Open Graph, noindex (giriş/profil/takip/admin), sitemap, robots, `feed.xml` (Atom), `llms.txt`, `security.txt`, JS çalıştırmayan botlar için ilk HTML içeriği (index.html), tüm bağlantılar gerçek `<a href>`.

**Ayarlar → Adres** alanını da `Yazır, Şht. Erkan Özbalcı Sk. No:20/b, 42310 Selçuklu/Konya` yapın (veritabanındaki değer varsayılanı ezer).

## 5) Performans / mobil
- Tüm sayfalar rota bazlı yüklenir (lazy) → ilk açılış JS'i ciddi küçülür; React/Supabase ayrı önbellekli parçalar.
- `public/_headers`: güvenlik başlıkları + `/assets/*` için 1 yıllık önbellek.
- iOS yakınlaşma engeli (16px input), 44px dokunma hedefleri, güvenli alan, yatay taşma koruması.

## 6) Güvenlik / WAF (Cloudflare) — bkz. `CLOUDFLARE_WAF_REHBERI.md`
## 7) Backlink — bkz. `SEO_BACKLINK_YOL_HARITASI.md` (özel "backlink ağı/PBN" kurmadık: Google spam politikası, siteyi cezalandırır).
