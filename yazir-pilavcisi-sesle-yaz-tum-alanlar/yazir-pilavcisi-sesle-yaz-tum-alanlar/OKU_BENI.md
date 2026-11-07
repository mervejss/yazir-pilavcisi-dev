# Sesle Yazma — Tüm Alanlara Yayma + Doldurma Hatası Düzeltmesi

## Neyi düzelttim?

Önceki sürümde "Durdur ve Ayrıştır" basınca metin Not alanına ekleniyordu ama isim/telefon/adres
alanları **sadece** konuşmada "adım...", "telefonum...", "adresim..." gibi belirli tetik kelimeler
geçerse doluyordu. Gerçek bir telefon görüşmesinde bu kelimeler her zaman geçmediği için form
boş kalıyordu. Bunu iki yönden çözdüm:

1. **Akıllı ayrıştırıcıyı (`voiceOrderParser.ts`) gevşettim** — çok daha fazla doğal söyleyiş
   kalıbını tanıyor (ör. "ben", "cep", "gsm", "rica ediyorum" vb.) ve telefon numarasını virgül/tire
   gibi ayraçlarla da yakalıyor. Bulduğu her alanı artık **doğrudan ilgili kutuya yazıyor** (önceden
   adres sadece kutu boşsa yazılıyordu, artık buluşu varsa yazılıyor).
2. **Asıl çözüm: artık her önemli alanın yanına kendi tekil 🎙️ mikrofon düğmesi eklendi.**
   Böylece personel isterse tüm görüşmeyi tek kutuya konuşup otomatik ayrıştırmayı denesin, isterse
   doğrudan "Telefon" kutusunun yanındaki mikrofona basıp sadece numarayı söylesin — o anda
   **o kutuya** yazılır. Bu, NLP tahminine bağlı kalmadan %100 garanti dolduruyor.

## Yeni dosya

- **`src/components/ui/VoiceDictateButton.tsx`** — herhangi bir input/textarea'nın yanına konabilen,
  tek başına çalışan mikrofon düğmesi. Tıklanınca o alana **anlık olarak** konuşulanı yazar,
  "Durdur"a (tekrar tıklama) basılana kadar kendiliğinden kesilmez (tarayıcı sessizlikte otomatik
  durdurursa anında kendini yeniden başlatır). Telefon gibi alanlarda `onFinalize` ile bitince
  numarayı otomatik temizleyip normalize ediyor.

## Mikrofon eklenen tüm yerler

**Yeni Sipariş ekranı (`NewOrderModal.tsx`)** — paket servis / gel-al / restoranda, hepsinde geçerli:
- **Not / Sipariş notu** alanı → artık sipariş tipi ne olursa olsun (paket, gel-al, restoranda) mikrofonla doldurulabiliyor.
- **Açık adres** alanı (paket servis seçiliyken) → kendi mikrofonu var.
- 📞 Telefon kaynağı seçilince çıkan büyük "Sesle Sipariş Gir" kutusu da duruyor (tüm görüşmeyi tek seferde dökmek isteyenler için), artık daha isabetli dolduruyor.

**Telefon/İsim paneli (`PhoneCustomerPanel.tsx`, Yeni Sipariş içinde kullanılır)**:
- **Telefon** alanı → mikrofonla söylenen numarayı otomatik temizleyip (05xx xxx xx xx) yazar.
- **Müşteri adı** alanı → mikrofonla doğrudan yazar.

**Müşteriler sayfası (`CustomersAdmin.tsx`)** — "müşteri siparişi" tarafı:
- Müşteri profili düzenleme: **Ad soyad**, **Telefon**, **Yönetici notu** alanlarının hepsinde mikrofon var.
- "📞 Telefon müşterisi ekle" penceresi: **Telefon**, **Ad soyad**, **Not**, **Açık adres** alanlarının hepsinde mikrofon var.
- Bu sayfadaki "🛒 Bu müşteri için sipariş al" butonu zaten `NewOrderModal`'ı açıyor, yani oradaki tüm mikrofonlar müşteri siparişinde de otomatik olarak geçerli.

## Nasıl çalışır (kullanıcı tarafı)

1. İlgili alanın yanındaki 🎙️ simgesine tıklanır (tarayıcı ilk seferde mikrofon izni ister).
2. Konuşulan her şey o kutuya **anlık olarak** yazılır. Kesilmez, "⏹️ Durdur" basılana kadar devam eder.
3. "⏹️ Durdur"a basılınca kayıt biter (telefon alanında numarası otomatik düzgün biçime getirilir).
4. Metin istenirse elle düzeltilebilir — sesli sistem **zorunlu değil**, manuel yazma her zaman açık kalır.

## Değişen / eklenen dosyalar

```
src/components/ui/VoiceDictateButton.tsx     → YENİ — tekil, her alana takılabilen mikrofon düğmesi
src/lib/voiceOrderParser.ts                  → GÜNCELLENDİ — daha gevşek/isabetli ayrıştırma
src/components/admin/NewOrderModal.tsx       → GÜNCELLENDİ — Not ve Adres alanlarına mikrofon, otomatik doldurma düzeltmesi
src/components/admin/PhoneCustomerPanel.tsx  → GÜNCELLENDİ — Telefon ve Müşteri adı alanlarına mikrofon
src/pages/admin/CustomersAdmin.tsx           → GÜNCELLENDİ — müşteri profili + "telefon müşterisi ekle" formlarına mikrofon
src/styles/global.css                        → GÜNCELLENDİ — .fld-row ve .voice-mic-btn stilleri eklendi (en altta değil, önceki sesli-sipariş stillerinin hemen ardına)
```

Projenizin kök `src/` klasörünün üzerine bu zip'teki `src/` klasörünü kopyalayıp her zamanki gibi
`npm run build` çalıştırmanız yeterli. `tsc --noEmit` ve `vite build` ile hatasız derlendiği test edildi.

## Not

Sistem tarayıcının yerleşik Web Speech API'sini kullanır — ek API maliyeti yoktur. Chrome/Edge gibi
Chromium tabanlı tarayıcılarda sorunsuz çalışır. Desteklemeyen bir tarayıcıda mikrofon düğmesi
otomatik olarak hiç görünmez, personel elle yazmaya devam eder.
