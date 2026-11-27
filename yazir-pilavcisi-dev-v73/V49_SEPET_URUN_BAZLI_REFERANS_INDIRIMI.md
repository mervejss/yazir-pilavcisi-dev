# V49 – Sepette ürün bazlı referans indirimi

## Değişiklikler
- Ürün bazlı (`scope = product`) aktif referans kampanyalarında sepet satırlarında eski fiyat üstü çizili, indirimli satır toplamı ve indirim yüzdesi gösterilir.
- Adet birden fazlaysa indirimli birim fiyat da gösterilir.
- Sepet bazlı (`scope = cart`) kampanyalarda ürün satırlarının fiyatları değiştirilmez; indirim yalnızca sepet toplamında gösterilir.
- Ürün bazlı indirim tutarı, her birim fiyatı iki ondalığa yuvarlayarak hesaplanır. Bu yöntem `sql/36_referral_campaigns.sql` içindeki `round(unit_price * (1 - v_pct/100), 2)` hesabıyla eşleştirilmiştir.
- Sipariş onay butonunda indirimler sonrası genel toplam gösterilir.
- Menü kartı, ürün detay penceresi ve menüdeki sepet toplamı aynı iki ondalık yuvarlama yardımcı fonksiyonunu kullanır.

## Kontrol edilen örnek
130 + 160 + 180 + 180 + 350 + 450 + 120 = 1.570 TL

%10 ürün bazlı indirimli tutarlar:
117 + 144 + 162 + 162 + 315 + 405 + 108 = 1.413 TL

Toplam indirim: 157 TL.

## Kurulum
- Önceki sürümdeki `.env` dosyanızı koruyun.
- Kaynak kodlarını güncelleyin ve `npm ci` ardından `npm run build` çalıştırın.
- Bu sürüm yeni bir SQL migration gerektirmez; V46 referans kampanya SQL yapısını kullanır.
