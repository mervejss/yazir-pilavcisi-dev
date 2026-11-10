# v33 — Telefon müşterisi · Siparişi tekrarla · Kurye ataması · Google harita konum seçici

## 1) Kurulum (sırayla)

1. **SQL:** Supabase → SQL Editor → `sql/25_phone_customers_maps.sql` dosyasını bir kez çalıştırın (tekrar çalıştırmak güvenli).
   Önkoşul: 08_quick_order_support.sql, 10, 15 ve 20 numaralı dosyalar daha önce çalışmış olmalı.
2. **Google Maps anahtarı:** `.env` dosyasına ekleyin (Vercel'de de Environment Variables'a):
   ```
   VITE_GOOGLE_MAPS_API_KEY=AIza...
   ```
3. Google Cloud Console → APIs & Services → şunları **Enable** edin:
   - **Maps JavaScript API** (harita, pin, sürükleme)
   - **Geocoding API** (adres ↔ konum)
   - **Places API (New)** (adres arama / otomatik tamamlama)
   - *Directions API* isteğe bağlı: kapalıysa kurye haritasında yol yerine kuş uçuşu çizgi ve mesafe gösterilir.
4. Anahtarı **HTTP referrer** ile kısıtlayın (`https://alanadiniz.com/*`, `http://localhost:3000/*`) ve API kısıtlamasında yukarıdaki API'leri seçin. Faturalandırma hesabı bağlı olmalı.
5. `npm install && npm run build` (Vercel otomatik yapar).

Anahtar girilmezse her şey çalışır; yalnızca arama/pin/otomatik adres çözme kapanır ve gömülü Google haritası + "Google Haritalar'da aç" bağlantıları gösterilir.

## 2) Neler değişti

**Admin → Yeni Sipariş (Hızlı / Detaylı)**
- Üç seçenek: **Paket Servis**, **Gel-Al**, **Restoranda**. Restoranda'da kurye yoktur.
- Paket servis: telefon, ad, mahalle, açık adres, **harita seçici**, teslimat ücreti (boşsa varsayılan), **kurye seçimi** (çevrimiçi kuryeler önde, "Sonra ata" seçeneği var).
- Kurye, sipariş **"Yeni"** durumundayken atanır; mutfak hazırladıkça kurye bildirimi ve akış normal devam eder.
- Telefon yazarken (veya isim) kayıtlı müşteri otomatik aranır: adresleri, notu ve **geçmiş siparişleri** gelir. Tam numara tek müşteriyle eşleşirse otomatik seçilir.
- **🔁 Tekrarla:** geçmiş siparişin kalemleri (güncel fiyatla), adresi, konumu ve notu tek tıkla sepete gelir. Menüde artık olmayan/tükenen ürünler uyarıyla atlanır.
- Telefon biçimi önemsizdir (`0555 123 45 67`, `5551234567`, `+90 555…` aynı müşteridir).

**Telefon müşterisi kaydı**
- Telefonla paket/gel-al siparişi girilince müşteri **otomatik** kaydedilir (e-posta/şifre gerekmez, hesabı yoktur). Adres ve konum da müşteri kaydına eklenir.
- Bu kayıtları yalnızca personel/yönetici görür (müşteri tarafında okuma yetkisi yoktur).
- **Müşteriler** sayfası: "📞 Telefon müşterisi ekle", müşteri detayında kayıtlı adresler (haritada göster / Google Haritalar), "➕ Adres ekle", "🛒 Bu müşteri için sipariş al" ve her geçmiş siparişte **🔁 Tekrarla**.
- **Sipariş panosu:** her kartta **🔁 Tekrarla** (paket/gel-al), adres yanında **🗺️ Harita** ve **Google Haritalar** bağlantısı, kurye seçimi artık "Yeni" siparişte de açık.

**Web sitesi sipariş sayfası**
- Eski "GPS konumumu ekle" yerine harita: arama kutusu (Google), haritaya dokunma, pini sürükleme, "Konumum", "Yazdığım adresi haritada bul". Konum seçilince adres boşsa otomatik doldurulur; doluysa "Adrese yaz" önerisi çıkar. Seçilen noktanın **Google Haritalar bağlantısı** forma yazılır ve kopyalanabilir.
- Yazılı adres haritada kendiliğinden bulunur (elle pin koymadıysanız).

**Kurye**
- Paket kartındaki adres alanına dokununca harita açılır; kartta konumun işaretli olup olmadığı yazar. "Google Haritalar" düğmesi koordinat varsa birebir noktayı, yoksa yazılı adresi açar.
- Directions API yoksa yol çizgisi yerine kuş uçuşu çizgi gösterilir.

## 3) Bilmeniz gerekenler

- `orders.lat/lng` zaten vardı; artık dolu gelir. Konum işaretlenmeyen siparişte harita yazılı adresten çözülür.
- Kısa `maps.app.goo.gl` bağlantıları tarayıcıdan çözülemez; "bağlantı yapıştır" için tam bağlantı veya `37.95,32.51` biçimi gerekir.
- Adres çözme aramasında "Konya" öncelenir (önceki "Selçuklu" zorlaması kaldırıldı; Meram/Karatay adresleri doğru bulunsun diye).
- SQL 25 çalışmadan da eski sipariş akışı çalışır; yalnızca kurye ön ataması, müşteri arama ve tekrarla kullanılamaz (ekranda uyarı çıkar).

## 4) Değişen / yeni dosyalar

Yeni: `sql/25_phone_customers_maps.sql`, `src/components/maps/LocationPicker.tsx`, `src/components/maps/AddressMap.tsx`, `src/components/admin/PhoneCustomerPanel.tsx`, `src/lib/staffCustomers.ts`
Değişen: `src/components/admin/NewOrderModal.tsx`, `src/lib/googleMaps.ts`, `src/components/maps/RouteMap.tsx`, `src/pages/admin/OrdersBoard.tsx`, `src/pages/admin/CustomersAdmin.tsx`, `src/pages/public/OrderPage.tsx`, `src/pages/courier/CourierApp.tsx`, `src/styles/global.css` (sonuna v33 bloğu), `.env.example`
