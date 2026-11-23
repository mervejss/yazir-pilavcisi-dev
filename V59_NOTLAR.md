# V59 – Trendyol yükü, Supabase kotası ve menüde adet girişi

## 1) Sorunun gerçek nedeni (3 sn'lik çekimden de büyük)
Her Trendyol çekiminde listedeki **her paket** için `platform_apply_status()` çalışıyor ve değer aynı olsa bile
`orders` satırına **UPDATE** atıyordu. Her UPDATE bir Realtime olayı üretir; açık her yönetim paneli de olay başına
sipariş listesini (ham Trendyol JSON'u `external_payload` dahil) baştan indiriyordu. Çekim sıklaştıkça
**egress (17,9 / 5 GB)** ve **log (2,89 / 1 GB)** kotası bu yüzden doldu.

### Yapılan düzeltmeler
| Katman | Değişiklik |
|---|---|
| `sql/40_trendyol_load_fix.sql` | `platform_apply_status` / `platform_ingest_order` değişiklik yoksa **hiç yazmaz**; eski/hızlı Trendyol cron işleri silinir, tek iş **2 dakikada bir**; kayıt temizliği sıklaştı |
| `platform-trendyol` | Durumu değişmeyen paket için veritabanına dokunmaz; "son senkron" / bağlantı durumu satırı sağlıklıyken en çok 10 dk'da bir yazılır; servis istemcisi önbelleğe alınır |
| `useOrders` | Panoda `external_payload` artık indirilmez (sütun listesi; hata olursa otomatik `*`'a döner) |
| Tarayıcı yedek çekimi | en az 120 sn, varsayılan **300 sn** (eskiden 60/120) |
| Ziyaretçi sayfaları | referans sorgusu 30 sn → 180 sn ve yalnızca sekme görünürken |

## 2) Webhook çözer mi?
**Evet, mümkünse en iyi çözümdür** (Trendyol olay olunca size POST eder, sormaya gerek kalmaz) – ama:
- Paylaştığınız doküman **Trendyol Marketplace** (`apigw.trendyol.com`) içindir. Projeniz **Trendyol Go / Yemek**
  (`api.tgoapis.com`) kullanıyor ve Go dokümanlarında webhook servisi **bulunamadı**. Hesabınızda Trendyol açmadıysa
  webhook oluşturma çağrısı hata verir.
- Doküman da webhook'u tek başına yeterli saymıyor ("periyodik çekim önerilir").
Bu yüzden **ikisi birlikte** kuruldu: asıl yük düşürücü yukarıdaki düzeltmelerdir; webhook hazır alıcıdır.

### Webhook kurulumu (isteğe bağlı)
1. `supabase functions deploy order-webhook --no-verify-jwt`
   (adı bilerek "trendyol" içermez – Trendyol kuralı: URL'de Trendyol/Dolap/Localhost olamaz)
2. `supabase secrets set WEBHOOK_API_KEY=<uzun-rastgele-değer>`
3. Yönetim → Entegrasyonlar → Trendyol → **5b · Webhook**: satıcı ID yazıp "Webhook oluştur".
4. Çalıştığını görünce zamanlayıcıyı 10 dakikaya çekin:
   `select cron.alter_job((select jobid from cron.job where jobname='trendyol-sync-orders'), schedule := '*/10 * * * *');`
- Alıcı **idempotent**'tir (aynı bildirim tekrar gelirse yazmaz; Trendyol "en az bir kez" iletir).
- Hatalı istekte Trendyol 5 dk'da bir tekrar dener, uzun süre başarısızlıkta webhook'u pasife alır → önce 200 dönülür,
  yalnızca gerçek DB hatasında 500.

## 3) Menü / sipariş alırken adet girişi
Yeni `QtyStepper`: **− [yazılabilir sayı] +** ve altında **+5 +10 +25 +50 +100**.
Sayıya dokunup doğrudan yazılır (ör. 66), Enter veya dışarı dokunma uygular; boş/0 girilirse eski değer korunur.
Eklendiği yerler: Hızlı sipariş (NewOrderModal sepeti), Masa → sandalye siparişi, Sipariş düzenleme.

## 4) Kurulum sırası
1. Supabase → SQL Editor: `sql/40_trendyol_load_fix.sql` (tamamı)
2. `supabase functions deploy platform-trendyol` (ve `_shared` değiştiği için `google-reviews-sync`/`platform-migros` gerekmez)
3. (İsteğe bağlı) `order-webhook` – yukarıdaki adımlar
4. Siteyi derleyip yayınlayın (`npm run build`)
5. Kontrol: `select jobname, schedule from cron.job;` → `trendyol-sync-orders | */2 * * * *`
   Usage sayfasında Egress/Log grafikleri 1–2 saat içinde düşmeli.

> Not: Egress zaten limiti aştıysa (17,9/5 GB) faturalama dönemi sıfırlanana kadar Supabase Free kısıtlaması sürebilir;
> düzeltmeler yeni dönemde yeniden aşılmasını önler. Acil ise Pro'ya geçmek kısıtı hemen kaldırır.
