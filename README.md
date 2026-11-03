# 🍚 Yazır Pilavcısı - Web, Admin & Kurye Portalı

Bu proje, **Yazır Pilavcısı (Konya, Selçuklu)** için sıfırdan geliştirilmiş tam kapsamlı React + TypeScript + Supabase tek sayfa web uygulamasıdır (SPA).

---

## 🚀 Kesinleşen Mimari & Teknolojiler
- **Frontend:** React 18 + TypeScript + Vite + Zustand + CSS Variables Dual-Theme Engine
- **Veritabanı & Backend:** Supabase (PostgreSQL 15+)
- **Yetkilendirme:** Supabase Auth (Rol bazlı: Sahip, Alt Yönetici, Operatör, Kurye, Müşteri)
- **Güvenlik:** Tam Row Level Security (RLS) politikaları ve SQL trigger'ları
- **Canlı Takip:** Supabase Realtime (Anlık siparişler, masa durumları, kurye GPS konumları)
- **Depolama:** Supabase Storage (`product-images`, `business-images`)
- **Yayınlama:** Cloudflare Pages (Özel domain)

---

## ✨ Yeni ve Gelişmiş Özellikler

### 🌓 1. Açık / Koyu Mod (Light & Dark Theme Engine)
- Uygulama geneline entegre edilmiş, WCAG kontrast standartlarına tam uyumlu renk paleti.
- Başlıktaki **☀️/🌙 tema değiştirme düğmesi** ile tek tıkla anında geçiş.
- Kullanıcının tercihi `localStorage` üzerinde kalıcı olarak saklanır.
- Form elemanları, butonlar, paneller ve kartlar açık/koyu modda yüksek okunabilirlikle sunulur.

### 🔐 2. Ayrılmış Giriş & Kayıt Mimarisi
- **Müşteri Giriş & Kayıt:**
  - `/giris` ve `/kayit` sayfaları tamamen müşterilere özeldir.
  - Hızlı üye olma (Ad Soyad, Telefon, E-posta, Şifre).
  - Sayfanın altında personele özel giriş uyarısı ve doğrudan yönlendirme linki.
- **Personel & Kurye Portalı:**
  - `/personel-giris`: İşletme Sahibi (`owner`), Alt Yönetici (`sub_admin`), Operatör (`operator`) ve Kurye (`courier`) için ayrılmış yüksek güvenlikli giriş portalı.
  - Giriş yapan personelin rolüne göre otomatik yönlendirme: Kuryeler anında `/kurye` ekranına, yöneticiler `/admin` paneline yönlendirilir.
- **Çıkış Desteği:**
  - Müşteri başlığında, profil sayfasında, admin paneli kenar çubuğunda ve kurye ekranında tek tıkla oturum kapatma imkanı.

### 👤 3. Müşteri Profil Sayfası (`/profil`)
- **Kişisel Bilgiler:** Ad Soyad ve telefon numarası güncelleme.
- **Kayıtlı Adresler Yönetimi:**
  - Birden fazla teslimat adresi tanımlama (Ev, İş, Anne Evi vb.).
  - Açık adres, ilçe ve özel kurye teslimat notları.
  - **📍 GPS Konumumu Al:** Tarayıcı üzerinden tek tıkla harita koordinatlarını (lat, lng) otomatik kaydetme.
  - Varsayılan adres belirleme, adres düzenleme ve silme.
- **Geçmiş Siparişler & Canlı Takip:**
  - Verilen tüm geçmiş siparişlerin durumları, ürün kalemleri, fiyatları ve porsiyon detayları.
  - **🔁 Tüm Siparişi Tekrarla:** Geçmiş siparişteki tüm ürünleri tek tıkla anında yeni sepete ekleme.
  - **➕ Ürünü Sepete Ekle:** Geçmiş siparişin içerisinden istenen spesifik ürünü tekil olarak sepete ekleme.
  - Canlı sipariş durumunu takip etme bağlantısı (`/takip/:orderId`).

### 🛒 4. Akıllı Sipariş & Sepet Sistemi (`/siparis`)
- Giriş yapmış üyeler için kayıtlı adreslerden tek tıkla seçim yapabilme.
- Giriş yapmadan (misafir) sipariş verme imkanı; ancak üye olunduğunda adreslerin saklanacağı ve sipariş geçmişinin görüntülenebileceği bilgilendirme uyarısı.
- Serbest miktar belirleme (1, 2, 3, 5, 10...) ve stok adedine göre maksimum sınır kontrolü.

### 🪑 5. Görsel Masa & Sandalye Düzeni (`/admin/masalar`)
- Masaların şekil ayarı: **Kare (`square`)**, **Dikdörtgen (`rect`)**, **Yuvarlak (`round`)**.
- Dinamik sandalye kapasitesi (1 - 12+ sandalye) `+` ve `-` butonlarıyla anında artırılıp azaltılabilir.
- Masanın etrafında sandalyeler görsel olarak çizilir ve numaralandırılır (`Sandalye 1`, `Sandalye 2`, ...).
- **Sandalyeye Özel Sipariş Alma:**
  - Garson/kasiyer masayı ve siparişi veren ilgili sandalyeyi seçer (Örn: `[Sandalye 2]`).
  - Sipariş kalemine otomatik olarak `[Sandalye X]` etiketi iliştirilir.
  - Hangi sandalyedeki müşterinin ne sipariş ettiği anında görünür.
- Masanın açık hesabı, sipariş hazırlık durumu ve tek tıkla hesap kapatma (`Nakit`, `POS Kart`, `IBAN`).
- Masaya özel QR kod oluşturma, önizleme ve yazdırma.

### 🛵 6. Kurye Çoklu Paket & Canlı GPS Takibi (`/kurye`)
- Kurye aynı anda birden fazla paketi zimmetine alabilir.
- Adım adım paket durum güncellemeleri:
  - `assigned` ➡️ `on_the_way`: **"🛵 Restorandan Teslim Aldım (Yola Çık)"**
  - `on_the_way` ➡️ `delivered`: **"✓ Müşteriye Teslim Ettim"**
- Kapıda tahsilat türü yönlendirmesi (Kapıda Nakit, POS Kart, veya IBAN/Online Ödendi uyarısı).
- Tek tıkla müşterinin açık adresine veya GPS koordinatına **Google Haritalar Rotası Başlatma**.
- Canlı GPS konum paylaşımı (`update_courier_location` RPC).
- Çevrimiçi / Çevrimdışı durum butonu (`set_courier_online` RPC).

---

## 📁 Dosya Yapısı

```
yazir-pilavcisi-web/
├── public/                 # Statik varlıklar & ikonlar
├── sql/
│   └── yazir_full_schema.sql  # Supabase veritabanı tam SQL şeması
├── src/
│   ├── components/         # Yeniden kullanılabilir UI bileşenleri
│   │   └── ui/             # ThemeToggle, Modal, StatusBadge, LoadingSpinner, Logo
│   ├── hooks/              # Custom React hooks (Adresler, Siparişler, Menü, Masalar vb.)
│   ├── lib/                # Supabase client, sabitler ve yardımcı fonksiyonlar
│   ├── pages/
│   │   ├── admin/          # Yönetim paneli (Masalar, Siparişler, Kuryeler, Menü, Raporlar)
│   │   ├── auth/           # Müşteri ve Personel giriş/kayıt sayfaları
│   │   ├── courier/        # Kurye mobil web arayüzü
│   │   └── public/         # Müşteri web sitesi sayfaları (Menü, Sipariş, Profil, vb.)
│   ├── stores/             # Zustand durum yönetimi (authStore, cartStore, themeStore)
│   ├── styles/             # Global CSS ve Açık/Koyu tema değişkenleri
│   ├── types/              # TypeScript veritabanı arayüzleri
│   ├── App.tsx             # Ana router yapılandırması
│   └── main.tsx            # Uygulama başlangıç noktası
├── .env.example            # Örnek ortam değişkenleri
├── index.html              # HTML şablonu
├── package.json            # Paket bağımlılıkları ve script'ler
├── tsconfig.json           # TypeScript yapılandırması
└── vite.config.ts          # Vite yapılandırması
```

---

## 🛠️ Kurulum & Çalıştırma Adımları

### 1. Supabase Projesi Oluşturma
1. [supabase.com](https://supabase.com) adresine gidin ve yeni bir proje oluşturun ("Yazır Pilavcısı").
2. Sol menüden **SQL Editor** bölümüne girin.
3. `sql/yazir_full_schema.sql` dosyasının içeriğini yapıştırıp **Run** butonuna basın.
4. İlk işletme sahibi hesabını tanımlamak için:
   - Supabase menüsünden **Authentication > Users** sekmesine gidin.
   - "Add User > Create User" ile işletme sahibinin e-posta ve şifresini belirleyin (örn: `sahip@yazirpilavcisi.com`).
   - Tekrar SQL Editor'e gelerek şu sorguyu çalıştırın:
     ```sql
     select public.bootstrap_owner('sahip@yazirpilavcisi.com');
     ```

### 2. Ortam Değişkenleri (`.env`)
Proje ana dizininde `.env` dosyası oluşturun ve Supabase bilgilerinizi girin:
```env
VITE_SUPABASE_URL=https://PROJE_KODUNUZ.supabase.co
VITE_SUPABASE_ANON_KEY=SUPABASE_ANON_KEY_BURAYA
```

### 3. Bağımlılıkları Yükleme & Geliştirme Sunucusu
```bash
npm install
npm run dev
```
Uygulama `http://localhost:3000` adresinde çalışacaktır.

### 4. Canlıya Alma (Cloudflare Pages)
1. Projeyi GitHub veya Git deponuza gönderin.
2. Cloudflare Dashboard'da **Workers & Pages > Create application > Pages > Connect to Git** seçin.
3. Yapılandırma ayarları:
   - **Framework preset:** `Vite`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. **Environment variables** kısmına `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` değerlerini girin.
5. **Save and Deploy** butonuna tıklayın.

---

## 🆕 v6 Güncellemesi (altın tema, hızlı sipariş, masa planı)

- **Altın / siyah / beyaz / gri tema:** Tüm site yeni renk sistemine geçti (`src/styles/global.css`, en alttaki v6 bloğu). Varsayılan tema koyu; üstteki düğmeyle açık moda geçilir.
- **Logo:** `public/logo.png` (tam logo), `public/logo-mark.png` (amblem), `public/favicon.png`. Değiştirmek için aynı adlı dosyaları değiştirin.
- **Animasyonlu, ikonlu menü:** Üst menü ve yönetim paneli menüsü (`PublicLayout.tsx`, `AdminLayout.tsx`, `components/ui/Icon.tsx`).
- **Hızlı Sipariş:** Yönetim panelinde sol menüdeki **Hızlı Sipariş** ya da Siparişler / Masalar sayfaları. İki mod:
  - **Hızlı:** Paket/Gel-Al (ad-telefon gerekmez) veya Restoranda (masa seç). Menüden ürüne dokun, toplam otomatik hesaplanır. "Teslim edildi olarak kaydet" ile tezgâh satışı tek tıkla kayda geçer.
  - **Detaylı:** Eski telefon/adres/teslimat formu.
  - Tarih-saat veritabanı tarafından otomatik tutulur.
- **Masa ve Restoran Düzeni:** Şekilli kat planı (yuvarlak/kare/dikdörtgen + sandalyeler), canlı tutar ve durum, filtre, özet kartları. Seçili masa paneli artık canlı güncellenir.
- **Menü:** Kategori kategori bölümler, sabit kategori çubuğu, arama, mobilde sepet çubuğu.
- **Düzeltmeler:** Sipariş panosunda sonsuz yenileme döngüsü, kuruşlu fiyatların yuvarlanması, gel-al/masa siparişlerinde hatalı "Yola çıktı" butonu.

### ⚠️ Veritabanı yaması (bir kez çalıştırın)
Supabase → SQL Editor → `sql/08_quick_orders.sql` dosyasını yapıştırıp çalıştırın.
Bu yama "Restoran / Tezgâh" sipariş kaynağını ekler ve personelin gel-al siparişini ad/telefon olmadan kaydedebilmesini sağlar.
Sıfırdan kurulumda `sql/yazir_full_schema.sql` zaten güncel halidir.

---

## 🆕 v7 — Çalışma saati düzenleme, kapalı durumu, yeni footer

1. **Önce SQL:** Supabase > SQL Editor'de `sql/09_hours_overrides.sql` dosyasını çalıştırın (tekrar çalıştırılabilir).
   - `opening_hours` = haftalık standart ("her zaman için" düzenleme)
   - `opening_hours_overrides` = tarihe özel saat ("sadece bugün/o gün için" düzenleme)
   - `is_open_now()` artık özel günleri de hesaba katar (sunucu tarafı sipariş kontrolü dahil).
2. **Admin › İşletme Ayarları:** her gün için ✏️ düzenle → "Sadece bugün mü, her zaman mı?" sorusu → kaydet.
3. **Online Sipariş Kabulü** anahtarı anında kaydedilir; kapalıyken sitede "Şu an sipariş almıyoruz" görünür, sipariş butonu kilitlenir.
4. **Footer:** H&M Software Studio telif satırı + e-posta, Instagram, adres, Google Harita (yakınlaştırılabilir), geniş çalışma saatleri.
5. **İletişim sayfası:** Instagram + harita eklendi. WhatsApp bağlantısı `0540…` → `90540…` olarak düzeltildi.

---

## 🗺️ v8 — Canlı Harita, Kurye Takibi ve Yeni Kurye Ekranı

### Kurulum (sırayla)
1. **SQL:** Supabase → SQL Editor'de `sql/10_courier_live_tracking.sql` dosyasını bir kez çalıştırın (tekrar çalıştırmak güvenlidir; `yazir_full_schema.sql` içine de eklendi).
   - Restoran koordinatını (Şht. Erkan Özbalcı Sk. 20/b, Selçuklu) işletme ayarlarına yazar,
   - kurye isteği tablosunu ve RPC'leri (`courier_list_orders`, `courier_request_order`, `resolve_courier_request`…) oluşturur.
2. **Google Maps anahtarı:** Google Cloud Console'da **Maps JavaScript API**, **Directions API**, **Geocoding API**'yi etkinleştirip bir API anahtarı oluşturun (HTTP referrer = alan adınız). Sonra:
   - yerelde `.env` → `VITE_GOOGLE_MAPS_API_KEY=anahtarınız`
   - Cloudflare Pages → Settings → Environment variables → aynı değişken, ardından yeniden yayınlayın.
   - Anahtar yoksa sistem bozulmaz: temel (anahtarsız) Google gömülü haritası ve "Google Haritalar'da aç" bağlantıları gösterilir; canlı işaretçiler/yol çizimi anahtarla çalışır.

### Admin → Canlı Harita
- Restoran konumu (Google pini), **çevrimiçi kuryeler** (anlık, yumuşak hareketli), **aktif sipariş konumları** (koordinat yoksa adres otomatik çözülür), kurye→sipariş kesikli çizgisi, trafik katmanı, "Hepsini göster".
- Sağ panel: kurye listesi (hız, pil, konum yaşı; 2 dk'dan eski konum gri), aktif teslimatlar ve **doğrudan kurye atama**.
- **Kurye istekleri:** kurye "paketi ben alıyorum" deyince üstte bildirim + Siparişler panosunda kartta **Onayla / Reddet** görünür. Onay = sipariş otomatik atanır (yeni ise "Hazırlanıyor"a alınır).

### Kurye ekranı (`/kurye`, telefon öncelikli, tam ekran)
- En üstte **Konum paylaşımı AÇ/KAPAT** düğmesi: açıkken yönetici haritada görür, kapatınca konum silinir ve görünmez.
- Alt sekmeler: **Tüm Siparişler** · **Benimkiler** · **Geçmiş**.
  - Tüm siparişlerde başkasının paketinde müşteri adı/telefon/açık adres gizlidir (yalnızca mahalle); kendi paketinde her şey görünür.
  - **Paketi ben alıyorum** → yöneticiye istek gider; onaylanınca "Benimkiler"e düşer.
  - Müşteri adı, telefon (tek dokunuşla ara), açık adres, ürünler, not, tahsilat bilgisi.
- **Haritada göster:** tam ekran harita; kurye konumu ↔ adres arası **yol çizilir**, mesafe + tahmini süre gösterilir, yakınlaştır/uzaklaştır, "Beni takip et". **Google Haritalar'da aç** düğmesi telefondaki Google Haritalar uygulamasını açar.
- "Paketi aldım · Yola çık" dediğinde konum paylaşımı otomatik açılır ve yol çizimi başlar.
- Ana ekrana eklenirse uygulama gibi açılır (PWA).

### ⚠️ Arka plan konum takibi hakkında (dürüst not)
Web tarayıcıları, sayfa kapalı/ekran kilitliyken GPS'i güvenilir şekilde çalıştırmaz (özellikle iPhone). Bu sürüm: ekranı açık tutar (Wake Lock), sayfa öne gelince konumu anında gönderir, kalıcı hareketsizlikte de 20 sn'de bir "buradayım" iletir. **Kurye sayfayı açık bırakıp ekranı kilitlememelidir.** Kilit ekranında da kesintisiz takip isteniyorsa ileride yerel (Android/iOS) uygulama gerekir.

---

## 🔌 v9 — Platform Entegrasyonları (1. adım: Trendyol Go)

### Mimari (kısaca)
- **Her platform ayrı:** ayrı `integrations` satırı, ayrı Edge Function (`supabase/functions/platform-<ad>`), ayrı hata kaydı (`integration_events`), ayrı admin sayfası. Bir platformun hatası yalnızca o platformun durumunu `error` yapar; diğer platformların siparişleri ve web/masa/telefon siparişleri etkilenmez.
- **Tüm siparişler tek yerde:** `/admin/siparisler` her kaynaktan gelen siparişi gösterir; kartın **sağ üstünde** kaynak etiketi vardır: 🟠 Trendyol Go · 🔴 Yemeksepeti · 🟢 Migros Yemek · 🟣 Getir · 🌐 Online Sipariş · 🍽️ Masa Servisi · 🥡 Restoran Paket. Üstte kaynağa göre süzme çubuğu bulunur.
- **Gizli anahtarlar veritabanında/web kodunda YOKTUR.** Yalnızca Edge Function secrets'ta tutulur. `integrations.config` yalnızca gizli olmayan bilgileri (supplier_id, store_id, ortam…) içerir.
- **Yer tutucular:** işletmeye ait kimlikler şimdilik `000`. Netleşince `/admin/entegrasyonlar/<platform>` sayfasından girilir; kod değişmez.

### Kurulum (sırayla)
1. **SQL:** `sql/11_platform_integrations.sql` dosyasını SQL Editor'de çalıştırın (tekrar çalıştırmak güvenli; `yazir_full_schema.sql` sonuna da eklendi).
2. **Supabase CLI ile fonksiyon:** `supabase functions deploy platform-trendyol`
3. **Gizliler (yalnızca sunucuda):**
   `supabase secrets set TRENDYOL_API_KEY=... TRENDYOL_API_SECRET=... CRON_SECRET=uzun-rastgele-bir-metin`
4. `/admin/entegrasyonlar/trendyol` → Ortam (Test/Canlı), Satıcı ID ve Mağaza ID'yi girin → **Bağlantıyı test et** → **Entegrasyon açık**.
5. Panel açıkken siparişler otomatik çekilir (varsayılan 30 sn). **7/24 için** sunucu zamanlayıcısı (isteğe bağlı, pg_cron + pg_net):
   ```sql
   select cron.schedule('tgo-sync', '* * * * *', $$
     select net.http_post(
       url := 'https://PROJE.supabase.co/functions/v1/platform-trendyol',
       headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','CRON_SECRET_DEGERINIZ','Authorization','Bearer ANON_ANAHTARINIZ'),
       body := '{"action":"sync_orders"}'::jsonb) $$);
   ```

### Trendyol Go / Uber Eats geçişi — uygulananlar
| Doküman maddesi | Uygulama |
|---|---|
| `address.pinCode` (IVR; Uber 8 hane, TGO 11 hane sipariş no) | `orders.pin_code`, kartta "PIN" |
| 5 karakterli `orderCode` | `orders.order_code`, kartta "Kod" |
| Dinamik çağrı merkezi hattı (`0212 XXX YY ZZ`) | `orders.call_center_phone`; telefon kısıtı gevşetildi (3–40 karakter) |
| Maskeli kat/daire/kapı = "TGO Yemek", tam adres `address1` | `address1` **ayrıştırılmadan** serbest metin olarak `delivery_address`'e yazılır |
| `customer.id` farklı | Müşteri eşleştirmesi için kullanılmaz; ham veri `external_payload`'da |
| `coupon` boş, `promotions` | İndirim `promotions`/toplam alanlarından; ham veri saklanır |
| `userInformation.appName = "UberEats"` | `orders.platform_app` |
| Otomatik "Invoiced" | Durum eşlemesi `Invoiced → Hazırlanıyor`; `/invoiced` tekrarı hata sayılmaz |
| Yorum uç noktaları 403 (`endpoint.not-available.error`) | Hata değil "desteklenmiyor" olarak döner; çökme/kesinti yok |

Panelden yapılabilenler (Trendyol Go sayfası): bağlantı testi, siparişleri çek, otomatik kabul, sipariş durumunu (kabul/hazır/yolda/teslim/iptal) platforma bildirme (Siparişler panosundaki düğmelerle), menü eşitleme (ada göre ürün eşleme), çalışma saatlerini gönderme, restoranı açık/kapalı yapma, yorum kontrolü, hata kayıtları.

### ⚠️ Dürüst notlar
- **Canlı Supabase / canlı TGO hesabı ile test edilmedi.** Yalnızca sözdizimi denetimi yapıldı (bu ortamda `npm install`/derleme ve dış ağ yok).
- TGO dokümanı JavaScript ile yüklendiği için **uç nokta yolları ve alan adları** (`supabase/functions/platform-trendyol/index.ts` içindeki `ENDPOINTS` ve `mapPackage`) hafızadaki/teknik bilgiye göre yazıldı. **Canlıya almadan önce doküman ve test (stage) siparişiyle doğrulayın**; yollar tek haritada olduğundan düzeltme kolaydır (ayrıca `integrations.config.endpoints` ile ezilebilir).
- Yemeksepeti, Migros Yemek, Getir ve Diğer sayfaları hazır (kimlik/ayar alanları, durum, hata kaydı); **API fonksiyonları sonraki adımlarda** eklenecek (Yemeksepeti: `openapi.json` üzerinden).

---

## 🆕 v11 — Menü & Galeri Yönetimi (pro)

1. **Önce SQL:** Supabase > SQL Editor'de `sql/14_menu_gallery_pro.sql` çalıştırın (galeri tablosu + yeni alanlar: açıklama, kategori, öne çıkan).
2. `npm install` (leaflet bağımlılığı package.json'a eklendi).
3. Yeni dosyalar: `ImageStudio` (kırp/döndür/renk/boyut), `Lightbox` (tam ekran görüntüleyici), `ProductEditor`, `CategoryManagerModal`, `useAdminMenu`.
4. Not: `src/src/` klasörü eski/yedek kopyadır, uygulama `src/` içindekini kullanır.

---

## 🆕 v12 — Sesli uyarı, kanban, grafikler, kupon/kampanya, müşteriler, geçmiş, yedek

**SQL (sırayla, Supabase SQL Editor):** `14_menu_gallery_pro.sql` → `15_coupons_loyalty.sql` → `16_menu_extras_backup_audit.sql`

- **Sesli uyarı:** yönetici panelinin her sayfasında ve kurye ekranında; sağ alttaki 🔔 ile ses seviyesi, ses türü, süre (tek sefer / X sn / susturana kadar), titreşim, tarayıcı bildirimi, otomatik fiş ayarlanır (cihaza özel).
- **Sipariş panosu:** kartları sürükleyip bırakarak durum ilerletme, 80 mm mutfak fişi (🖨️ Fiş).
- **Analiz:** önceki dönemle karşılaştırmalı ciro, saatlik/günlük/haftalık/aylık grafikler, yoğunluk haritası, en çok satanlar.
- **Menü:** rozet, alerjen ve ürün seçenekleri alanları (müşteri menüsünde ürün detayında görünür).
- **Kupon & Kampanya:** yüzde/tutar/ücretsiz teslimat, saat-gün-tarih bazlı, kontenjanlı, kişiye/ilk siparişe/üyelere özel. "Sitede göster" açık olanlar `/kampanyalar` ve ana sayfada listelenir. Sepette kupon + sadakat puanı kullanılır.
- **Müşteriler:** liste, segmentler, sipariş geçmişi, puan düzenleme, yönetici notu, kişiye özel kupon.
- **İşlem Geçmişi:** kim neyi ne zaman değiştirdi; uygun kayıtlar tek tıkla geri alınır.
- **Yedekler:** tek tıkla menü yedeği, JSON indirme, geri yükleme (öncesinde otomatik yedek), günlük otomatik yedek (pg_cron).

**Bilinen sınır:** Web uygulaması, tarayıcı kapalıyken/ekran kilitliyken ses çalamaz ve konum alamaz. Tam arka plan için yerel uygulama (Capacitor) veya Web Push (sunucu anahtarı) gerekir.
