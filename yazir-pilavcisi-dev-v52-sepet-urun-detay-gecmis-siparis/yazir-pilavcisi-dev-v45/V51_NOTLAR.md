# v51 – Global Sepetim ve Hesap Menüsü

## Değişiklikler
- Sepet özeti artık tüm herkese açık sayfalardaki üst menüde görünür.
- Ürün adedi ve sepet tutarı Zustand sepetinden canlı hesaplanır.
- Aktif referans kampanyası varsa ürün bazlı veya sepet bazlı indirim, sipariş ekranındaki hesaplama mantığıyla özetlenir; normal toplam üzeri çizili, net toplam gösterilir.
- Sepet özeti doğrudan `/siparis` sayfasına gider.
- Müşteri adı masaüstünde hover, tıklama ve klavye odağıyla; mobilde dokunmayla açılan hesap menüsüne dönüştürüldü.
- Hesap menüsünden profil, siparişler, değerlendirmeler, adresler, referans, hesap bilgileri ve çıkış işlemlerine doğrudan erişilir.
- Profil sayfası `?tab=` parametresini dinler; açılır menüden seçilen sekme doğrudan açılır.
- Mobil header için daha kompakt sepet ve profil kontrolleri eklendi.

## Kurulum
- v50 proje dosyalarının üzerine bu ZIP içeriğini yazın.
- `.env` dosyanızı koruyun.
- Veritabanı migration'ı gerekmez.
