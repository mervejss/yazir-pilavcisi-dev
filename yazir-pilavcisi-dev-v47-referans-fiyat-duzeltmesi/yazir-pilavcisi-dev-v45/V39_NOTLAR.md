# v39 — Müşteri · Admin · Kurye geliştirmeleri (ücretsiz, Supabase limit dostu)

## Kurulum
1. Supabase SQL Editor: `sql/29_track_live.sql` (v38'de çalıştırmadıysanız) ve **`sql/30_ops_health_heat.sql`** (yeni). İkisi de tekrar çalıştırılabilir.
2. Cloudflare'e normal şekilde yükleyin (wrangler.jsonc projede).

## Müşteri
- **Ana ekrana ekle (PWA):** alt bilgide "Uygulamayı ana ekrana ekle" (Android tek dokunuş, iPhone için yönerge). `site.webmanifest` + hafif `sw.js` (JS/API önbelleklemez; yalnızca çevrimdışı bilgi sayfası → eski sürüm sorunu çıkarmaz).
- **Sipariş sonrası:** "WhatsApp'tan bildir" (sipariş no + takip linki hazır yazılı) ve "Takip linkini kopyala".
- **Takip sayfası:** kurye ≈3 dk / 300 m yaklaşınca titreşim + bildirim ("🔔 Kurye yaklaşınca haber ver" düğmesi), "Kurye çok yakında" bandı; teslimden sonra "Siteden puanla" ve (Google Place ID girilmişse) "Google'da yorum yaz".

## Admin (Bugün sayfası)
- **Gecikme alarmı:** hazırlıkta/hazır/atandı siparişler tahmini azami süre + 5 dk'yı, yoldakiler + 15 dk'yı aşınca kırmızı bant + sesli uyarı.
- Teslim/iptal/çevrimiçi kurye, **en çok satanlar, ödeme dağılımı, kaynak dağılımı, mahalle, saat saat grafik**, **kurye performansı** (teslimat sayısı, ort. süre).
- **🔥 Sipariş yoğunluğu:** 7/30/90 gün, haritada kırmızı=yoğun noktalar + mahalle tablosu (konum ~110 m yuvarlanır).
- **🩺 Sistem durumu:** veritabanı ve dosya depolama kullanımı (500 MB / 1 GB ücretsiz limite göre, %65 üstü sarı, %85 üstü kırmızı), en büyük tablolar, "eski konum geçmişini şimdi temizle". SQL 30 konum geçmişi saklamayı 7 güne indirir (otomatik temizlik zaten cron ile çalışır).
- Siparişler panosunda kurye notu görünür.

## Kurye
- **Geri/çıkış onayı** (v38) + **uyarılar:** internet yok, pil ≤%15, konum izni kapalı.
- **Önerilen teslimat sırası:** birden fazla paket varsa en yakından başlayan sıra numaraları kartlarda.
- **Yöneticiye hızlı not:** "Müşteriye ulaşamadım / Adres bulunamadı / Kapıda bekliyorum / Zil çalışmıyor" (siparişler panosunda görünür).
- **Gün sonu kasası:** kasaya teslim edilecek nakit, kapıda kart, önceden ödenmiş, teslimat sayısı (Geçmiş sekmesi).

## Zaten var olan (tekrar yapmadık)
Siparişi tekrarla (profil + admin), kupon/sadakat, müşteri analizi, kurye detay analizi ve prim, görsel yükleme (kırpıp WebP'ye çevirir → depolama dolmaz), yorumlar.

## Dürüst notlar
- Stok sayacı projede yok (yalnızca "tükendi/aktif" anahtarı); sayaç istenirse ayrı bir iş.
- Limit değerleri (500 MB / 1 GB) Supabase planına göre değişebilir; güncel değerleri supabase.com/pricing'den kontrol edin.
- Çevrimdışı kurye kuyruğu (internet yokken yazılan işlemleri sonra gönderme) yapılmadı; yalnızca uyarı var — yanlış teslim durumu göndermemek için bilinçli.
