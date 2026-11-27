# v28 güncellemesi — Trendyol durum senkronu · Kurye opsiyonel · Geçmiş Siparişler

Bu zip yalnızca DEĞİŞEN / YENİ dosyaları içerir (klasör yapısı projenizle aynı). Üzerine kopyalayın.

## Kurulum sırası
1. Dosyaları proje klasörüne kopyalayıp üzerine yazın.
2. Terminal: `npm install`   (yeni paket: `xlsx` — Excel okumak için)
3. Supabase → SQL Editor, sırayla:
   - `sql/22_trendyol_status_sync.sql`
   - `sql/23_past_orders_v2.sql`   (005, 005b ve 006 daha önce çalışmış olmalı)
4. Edge Function'ı yeniden dağıtın: `supabase functions deploy platform-trendyol`
5. 7/24 otomatik eşitleme için `sql/18_trendyol_cron.sql` çalışmış olmalı (30 sn'de bir). Kontrol:
   `select * from cron.job_run_details order by start_time desc limit 5;`
6. `npm run dev` → /admin/siparisler ve /admin/gecmis-siparisler

## Durum neden takılıyordu (kök neden)
Trendyol'dan gelen "Yolda / Teslim / İptal" bilgisi siteye yazılırken veritabanı tetikleyicisi
(a) "Yolda" için kurye şartı arıyor, (b) "Hazırlanıyor → Yolda/Teslim" gibi atlayan geçişleri reddediyordu.
Hata her 30 sn'de sessizce `integration_events` tablosuna "ingest" hatası olarak yazılıyordu.
Ayrıca paket listesinin yalnızca ilk ve son sayfası okunuyordu.

## Değişenler
- **Durum eşitleme:** Trendyol'daki durum artık kurye şartı olmadan, ara adımları atlayarak (yalnızca İLERİ) siteye yansır;
  iptal/UnSupplied/UnDelivered/Returned → "İptal edildi". Tüm paket sayfaları çekilir.
- **Kurye zorunlu değil:** "Yola çıktı" ve "Teslim edildi" kuryesiz yapılabilir. Kurye, sipariş yoldayken veya teslim edildikten
  SONRA da seçilebilir (durum geri gitmez).
- **"Kuryeye atandı" artık Trendyol'a "yola çıktı" göndermez** (eskiden yanlışlıkla `manual-shipped` gidiyordu).
- **Pano temizliği:** Pano = açık siparişler + BUGÜN (03:00'ten itibaren) biten siparişler. Önceki günlerin teslim/iptalleri
  otomatik "Geçmiş Siparişler"de. Önceki günden kalan AÇIK sipariş "Dünden kalan" rozetiyle panoda kalır.
- **İptal sütunu** eklendi; Trendyol kartında platformdaki ham durum görünür; panoda "🟠 Trendyol ile eşitle" düğmesi
  (Trendyol listesinde bulunamayan açık siparişleri de bildirir).
- **Geçmiş Siparişler sayfası:** Web / Telefon / Masa / Restoran Paket / Trendyol / Yemeksepeti / Migros / Getir / Diğer ayrı sekmeler,
  tarih aralığı, arama, ciro özeti, CSV indirme. Siteden biten siparişler + Excel'den yüklenenler birlikte (aynı Trendyol siparişi iki kez sayılmaz).
- **Excel yükleme (yalnızca owner):** Trendyol "Siparişleriniz" dosyasını sayfadan yükleyin; sütunlar otomatik eşlenir, yanlışsa elle düzeltilir,
  önizleme gösterilir, parti silinebilir. Her 15 günlük yeni dosyayı aynı yoldan yükleyebilirsiniz.
- **Ek Trendyol özellikleri:** ürün açık/kapalı (stokta yok) durumunu toplu gönderme, kategori açık/kapalı, tek siparişin Trendyol'daki
  anlık durumunu sorgulama, varsayılan hazırlık süresi ve executor e-posta ayarları.

## Doğrulanmamış / dikkat
- Trendyol Go belgelerine bu ortamdan tam erişemedim; paket listesi için yalnızca zaten çalışan `size` ve `page` parametreleri kullanıldı.
  Ürün/kategori durum uç noktaları kodda "doğrulanmadı" olarak işaretliydi; öyle kalıyor (hata alırsanız Entegrasyon → Tanılama).
- Excel dosyalarınız zip'te yoktu; 006 seed verisi (195 sipariş, 392 kalem, 97.495 TL, hepsi "Teslim Edildi") kendi içinde tutarlı.
  Dosyaları yüklerken önizleme sayılarını Excel'inizle karşılaştırın.
- Bu değişiklikleri çalışan bir Supabase/Trendyol hesabına karşı test edemedim.
