# v47 — Referans indirimi menü fiyatlarında

## Düzeltme
- Menü sayfasında `ProductCard` bileşenine aktif kullanıcının referans kampanyasından gelen ürün indirimi aktarılır.
- Ana sayfadaki öne çıkan ürün kartları ve ürün detay penceresi de aynı indirimi gösterir.
- Sepet sabit çubuğunda ürün bazlı referans indirimi varsa eski toplam üstü çizili, indirimli toplam görünür.
- İndirim yalnızca giriş yapmış ve hesabına aktif referans kodu uygulanmış kullanıcıya gösterilir.
- Kampanya kapsamı `cart` ise ürün etiket fiyatları değiştirilmez; sepet toplamı indirimi sipariş özetinde uygulanmaya devam eder.

## Dosyalar
- `src/pages/public/MenuPage.tsx`
- `src/pages/public/Home.tsx`

## Not
Bu düzeltme istemci tarafındaki fiyat gösterimini tamamlar. Sipariş tarafındaki güvenilir indirim uygulaması mevcut `place_order_with_referral` Supabase fonksiyonunda kalır. Tam `npm run build` doğrulaması bu ortamda tamamlanamadı; `npm ci` zaman aşımına uğradı ve eksik `node_modules` nedeniyle TypeScript tip tanımları bulunamadı.
