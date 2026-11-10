# v40 — Kurye ayrı ödeme/detay · Fiş · Kalıcı oturum · Zil sistemi (+ v39 tamamı)

Bu sürüm sizin gönderdiğiniz v38 zip'i (sesli sipariş, ads.txt, vercel.json, OKU_BENI.md vb. dahil) ÜZERİNE v39 + v40 eklenerek üretildi. Üç dosyada (OrdersBoard, OrderPage, global.css) sizin ve benim değişikliklerim otomatik birleştirildi, çakışma çıkmadı.

## Kurulum
1. Supabase SQL Editor (sırayla, hepsi tekrar çalıştırılabilir): `sql/29_track_live.sql` → `sql/30_ops_health_heat.sql` → **`sql/31_courier_split_payments.sql`** (yeni: ayrı ödeme tablosu + kurye detay fonksiyonları + kişiye özel zil sesi tablosu).
2. `.env` dosyanız zip'e KONMADI (sırları paylaşmamak için); kendi `.env`'inizi koruyun.

## Kurye
- **Detay · Hesap** (paket kartında): her ürün (aynı üründen 3 adet varsa 3 ayrı satır) tek tek fiyatıyla; teslimat ücreti ve indirim de satır.
- **Kişi bazlı ödeme:** ürünlere dokunarak seç → ödeyen kişi adı (isteğe bağlı) → yöntem (💵 Nakit / 💳 Kart / 🏦 IBAN; **siparişte seçilen yöntem varsayılan gelir**) → **Ödemeyi al**. Ödenen satırlar toplamdan düşer, "KALAN" büyük yazılır. "Kalanı 2/3/4'e böl" ve "elle tutar" seçenekleri var. Her kayıt "Geri al" ile silinebilir. Kayıtlar sunucuya yazılır (sayfa yenilense kaybolmaz), admin siparişte "👥 Ayrı ödemeler" olarak görür.
- **Gün sonu kasası** artık ayrı ödemeleri yönteme göre ayırır (nakit/kart/IBAN).
- **Geri tuşu hiçbir koşulda çıkış yaptırmaz** (önce açık pencere/harita kapanır, sonra ana ekranda kalır). Çıkış yalnızca üstteki çıkış düğmesi + onayla.

## Oturum (kurye + admin)
- Bir kez giriş yapınca **yalnızca çıkış düğmesine basılana kadar** açık kalır; siteyi/telefonu yeniden açınca doğrudan panele girer (profil önbelleklenir, geçici ağ hatası atmaz). Giriş sayfasına gelinirse otomatik panele yönlenir.
- Admin panelinin ana ekranında geri tuşu da paneli kapatmaz.

## Zil
- **Sipariş herhangi bir cihazdan/yerden onaylanınca (hazırlanıyor) ya da iptal edilince, tüm admin ve kurye cihazlarında zil anında susar.** Kurye isteği onaylanınca/reddedilince, paket yola çıkınca da ilgili zil susar. Panelden hazırlanıyor/hazır girilen siparişte hiç zil çalmaz.
- **Zil ikonu:** iki kez dokununca sağ kenara gizlenir ("‹ 🔔" tutamacı); tutamaca dokununca geri gelir. Tek dokunuş ayarları açar. Kurye ekranında alt menünün üstüne taşındı.
- **Kendi zil sesi:** Ayarlar → "Kendi zil sesim" → telefondan ses seç (≤1,5 MB). Ayarlar ve ses **kişiye özeldir**: yalnızca o hesap giriş yapınca çalar, başkasını etkilemez; hesaba da kaydedilir (başka cihazda da gelir).

## Fiş
Her ürün: `adet × ürün`, altında `N adet × birim fiyat = satır tutarı`; sonra ödeme yöntemi (ayrı ödeme varsa kişi kişi), kurye, ürünler toplamı / teslimat / indirim ve **en altta TOPLAM**.

## v39 özellikleri (ilk kez eklenmiş olanlar)
PWA, sipariş sonrası WhatsApp, kurye yaklaşınca bildirim, teslim sonrası yorum isteği, admin günlük özet + gecikme alarmı + yoğunluk haritası + sistem sağlığı, kurye pil/internet/konum uyarıları, önerilen teslimat sırası, kurye notu, gün sonu kasası. (Ayrıntı: V39_NOTLAR.md)
