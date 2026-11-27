# v55 – Hesap ve sipariş türüne özel bildirim sistemi

## Kurulum
1. Proje dosyalarını mevcut projenin üzerine alın.
2. Supabase Dashboard → SQL Editor bölümünde `sql/38_user_notification_settings.sql` dosyasını bir kez çalıştırın.
3. Uygulamayı yeniden başlatıp her yönetici/kurye hesabında zil ayarlarını ayrı ayrı yapılandırın.

## Neler değişti?
- Yönetici ve kurye hesaplarının ayarları kullanıcı kimliğiyle ayrılır.
- Telefon, genel paket servis, Trendyol Yemek, web, Gel-Al, masa, Yemeksepeti, Migros, Getir ve diğer platformlar için ayrı ayar kanalları eklendi.
- Kurye için yeni atanan paket, hazır paket ve atanabilir sipariş; yönetici için kurye isteği ayrı kanallardır.
- Her kanalda ses aç/kapat, ses seviyesi, zil tipi, tek sefer/süreli/susturana kadar çalma, tarayıcı bildirimi, titreşim ve Türkçe sesli anons ayarlanabilir.
- Her kanal için ayrı ses dosyası yüklenebilir ve görünen adı değiştirilebilir.
- Susturma seçenekleri 1 saat, 8 saat, 1 gün, 1 hafta ve süresizdir. Tercih kullanıcı ve panel bazında yerelde saklanır, ayrıca Supabase tablosuna yedeklenir.
- Eski sürümdeki tek zil dosyası varsayılan web kanalına aktarılabilir.

## Önemli not
Tarayıcı ses politikaları nedeniyle ilk sesin çalabilmesi için kullanıcı cihazda en az bir kez ekrana dokunmalı ve ses kilidini açmalıdır. Sekme/tarayıcı tamamen kapalıyken web uygulaması tek başına alarm çalamaz.
