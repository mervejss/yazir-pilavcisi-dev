# Yazır Pilavcısı v53 – Ürün bağlantıları, satış durumu ve kupon yönetimi gezinmesi

## Değişiklikler
- Sepetteki ürün adına tıklanınca `/menu/sade-pilav?productId=...` biçiminde, Türkçe karakter içermeyen ürün slug'ı ile doğru ürün detayına gidilir.
- Sepet ve geçmiş sipariş bağlantıları ürün ID'sini korur; aynı isimli ürünlerde doğru kaydın açılması sağlanır.
- Menü detayında ürün tükenmişse veya aktif satış seçeneği kalmamışsa açık uyarı gösterilir ve sepete ekleme engellenir.
- Sepet/geçmiş sipariş bağlantısındaki ürün artık aktif menüde değilse ürün ID'siyle tekrar kontrol edilir; ürün pasif/satış dışıysa müşteriye bilgilendirme gösterilir. Ürün kaydı erişilemiyorsa da genel bir kaldırılmış ürün uyarısı gösterilir.
- Kuponlar, Referans Kampanyaları ve Kullanım Raporu arasında aynı sayfada sekmelerle geçiş yapılır.
- Alt sayfalardaki “Kuponlara dön” düğmesi sola taşındı; doğrudan kupon listesine döner.
- Alt sekme seçimi URL'deki `view` parametresiyle tutulur; tarayıcının geri/ileri tuşları sekmeler arasında çalışır.

## Güncellenen dosyalar
- `src/pages/public/OrderPage.tsx`
- `src/pages/public/MenuPage.tsx`
- `src/pages/public/ProfilePage.tsx`
- `src/components/menu/ProductDetailModal.tsx`
- `src/pages/admin/CouponsAdmin.tsx`
- `src/styles/global.css`

## Kurulum
Önceki `.env` dosyanızı koruyun. Kaynakları güncelledikten sonra `npm ci` ve `npm run build` çalıştırıp Cloudflare Pages'e deploy edin. Bu sürüm için yeni SQL migration gerekmiyor.

## Doğrulama
Kaynak değişiklikleri gözden geçirildi. Bu çalışma ortamında `npm ci` zaman aşımına uğradığı için tam TypeScript/Vite build testi tamamlanamadı. Canlıya almadan önce kendi ortamınızda build doğrulaması yapın.
