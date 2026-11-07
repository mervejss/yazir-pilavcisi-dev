# Sesle Sipariş Gir — Güncelleme

## Neler değişti?

1. **`src/lib/voiceOrderParser.ts`** (YENİ)
   - Konuşmadan yazıya dökülen ham metni akıllıca ayrıştırır.
   - Telefon, isim, adres, mahalle gibi alanları yakalar.
   - Tanıyamadığı/kalan her şeyi kaybetmeden not alanına ekler, orijinal ham metni de her zaman geri döndürür.

2. **`src/components/admin/NewOrderModal.tsx`** (GÜNCELLENDİ)
   - "Hızlı Sipariş / Yeni Sipariş" ekranında **"Sipariş nereden geldi?"** kısmında **📞 Telefon** seçilince, hemen altında bir **🎙️ Sesle Sipariş Gir** kutusu belirir.
   - Butona basınca tarayıcının konuşma tanıma özelliği (Web Speech API, `tr-TR`) başlar ve **"Durdur ve Ayrıştır"** butonuna basılana kadar asla kendiliğinden durmaz (tarayıcı sessizlikte otomatik kapatırsa sistem anında yeniden başlatır).
   - Konuşulan her şey anlık olarak metin kutusuna yazılır.
   - **Durdur**'a basılınca:
     - Telefon numarası → *Telefon* alanına,
     - İsim → *Ad Soyad* alanına,
     - Adres/mahalle → *Açık adres* ve *Mahalle* alanlarına otomatik yazılır.
     - Ayrıştırılamayan kısımlar + **konuşmanın TAM ham metni** her zaman *Not* alanına eklenir — hiçbir şey unutulmaz, personel isterse kontrol edip düzeltebilir.
   - Manuel yazma sistemi olduğu gibi duruyor; sesli sistem tamamen **isteğe bağlı**, zorunlu değil.
   - Mikrofon desteklemeyen tarayıcılarda (Chrome önerilir) buton devre dışı kalır ve kullanıcıya bilgi verilir.

3. **`src/styles/global.css`** (GÜNCELLENDİ — en altta değil, `.no-block` bölümünün hemen ardına birkaç kısa kural eklendi)
   - Sesli sipariş kutusu ve "dinleniyor" animasyonu için stiller eklendi (`.voice-order-box`, `.voice-order-ta`, `.voice-order-actions`, `.voice-recording`, `.voice-rec-dot`).

## Nasıl uygulanır?

Bu zip'teki `src/` klasörünü projenizin kök dizinindeki `src/` klasörünün üzerine kopyalayın (3 dosya değişti/eklendi, başka hiçbir şeye dokunulmadı):

```
src/lib/voiceOrderParser.ts                → YENİ dosya
src/components/admin/NewOrderModal.tsx     → üzerine yazın
src/styles/global.css                      → üzerine yazın
```

Sonra her zamanki gibi:

```
npm install   # (gerekirse)
npm run build
```

`tsc --noEmit` ve `vite build` ile test edildi, hatasız derleniyor.

## Notlar

- Sistem tarayıcının yerleşik **Web Speech API**'sini kullanır (sunucu/API maliyeti yok). Chrome/Edge gibi Chromium tabanlı tarayıcılarda sorunsuz çalışır; Safari/Firefox desteği sınırlı olabilir — böyle durumda buton otomatik devre dışı kalır, personel elle yazmaya devam edebilir.
- Mikrofon izni ilk kullanımda tarayıcı tarafından sorulur.
- Ayrıştırma kuralları anahtar kelime tabanlıdır (örn. "adım...", "telefonum...", "adresim..."). Personel konuşurken bu tür doğal ifadeleri kullanırsa (örn. *"Adım Ahmet Yılmaz, telefonum 0532 123 45 67, adresim Yazır Mahallesi..."*) alanlar çok daha isabetli dolar. Yine de her ihtimale karşı ham metnin tamamı not'ta saklanır.
