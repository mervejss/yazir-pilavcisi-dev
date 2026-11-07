# Müşteri Sipariş Sayfası (`/siparis`) için Sesle Yazma

İstediğiniz gibi **`localhost:3002/siparis`** (müşterinin kendisinin sipariş verdiği herkese açık sayfa,
kod: `src/pages/public/OrderPage.tsx`) içine de mikrofon düğmeleri eklendi. Artık müşteri kendi
siparişini verirken de yazmak yerine sesle söyleyebiliyor.

## Bu sayfada mikrofon eklenen alanlar

- **Ad Soyad**
- **Telefon Numarası** (durdurunca numara otomatik 05xx xxx xx xx biçimine normalize edilir)
- **Mahalle / Semt**
- **Açık Adres** (cadde/sokak/bina/daire)
- **Sipariş Notu**

Her biri bağımsız çalışır: 🎙️'e basılır, konuşulan her şey **o anda, o kutuya** yazılır, ⏹️'e
basılana kadar durmaz. Tamamen isteğe bağlı — müşteri her zaman elle de yazabilir.

## Önceki güncellemeyle birlikte artık mikrofon şurada da var

- **Yeni Sipariş** ekranı (admin, Hızlı Sipariş): Not, Açık adres, Telefon, Müşteri adı — paket/gel-al/restoranda hepsinde.
- **Müşteriler** sayfası (admin): profil düzenleme ve "Telefon müşterisi ekle" formları.
- **`/siparis`** (bu güncelleme): müşterinin kendi sipariş formu.

## Değişen / eklenen dosyalar (bu zip, kümülatif — hepsi dahil)

```
src/components/ui/VoiceDictateButton.tsx     → (önceki güncellemeden) tekil mikrofon düğmesi
src/lib/voiceOrderParser.ts                  → (önceki güncellemeden) akıllı ayrıştırma
src/components/admin/NewOrderModal.tsx       → (önceki güncellemeden)
src/components/admin/PhoneCustomerPanel.tsx  → (önceki güncellemeden)
src/pages/admin/CustomersAdmin.tsx           → (önceki güncellemeden)
src/pages/public/OrderPage.tsx               → YENİ eklendi — /siparis sayfasındaki 5 alana mikrofon
src/styles/global.css                        → (önceki güncellemeden, .fld-row / .voice-mic-btn stilleri)
```

Kök `src/` klasörünüzün üzerine bu zip'teki `src/`'i kopyalayıp `npm run build` çalıştırmanız yeterli.
`tsc --noEmit` ve `vite build` ile hatasız derlendiği test edildi (OrderPage dahil tüm sayfalar).
