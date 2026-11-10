# v48 – Bildirim Konumu Düzeltmesi

## Değişiklik
- `src/main.tsx` içindeki global `react-hot-toast` Toaster konumu güncellendi.
- Bildirimler üst navigasyonun altına, güvenli alan dikkate alınarak taşındı (`76px + safe-area-inset-top`).
- Toast katmanının z-index değeri 240 olarak ayarlandı. Admin yeni sipariş alarm çubuğu z-index 300 olduğundan alarm butonları toast tarafından örtülmez.
- Değişiklik tüm sayfalardaki başarı, hata ve bilgi bildirimlerine uygulanır; tek tek toast çağrılarını değiştirmek gerekmez.

## Kurulum
Bu ZIP, v47 tabanlı güncel projedir. Mevcut `.env` dosyanızı koruyun. Dosyaları proje üzerine aktarın ve `npm run build` ardından Cloudflare Pages'e deploy edin.
