# V62 – Kullanım ve arayüz

1. **Masa/sandalye siparişi**: açılır liste yerine hızlı siparişteki aramalı + kategori sekmeli ürün seçici (`ProductPicker`). Aynı sandalyeye aynı ürün tekrar eklenirse adet artar.
2. **Müşteri sepeti**: `type=number` kalktı; yazılabilir sayı + `−`/`+` + hızlı `+5` `+10` (QtyStepper).
3. **Kurye çevrimdışı kuyruğu** (`src/lib/offlineQueue.ts`): yola çıktı / teslim / ödeme yöntemi / not / ayrı ödemeler internet yokken telefonda saklanır, bağlantı gelince SIRAYLA otomatik gönderilir (15 sn'de bir, "online" olayında, uygulama öne gelince, "Şimdi gönder" düğmesi). Bekleyen teslim ekranda hemen uygulanmış görünür. Kuyrukta bekleyen varsa yeni işlemler arkasına eklenir (sıra bozulmaz). Sunucu "uygulanamaz" derse işlem atılır ve uyarı çıkar. Yeni SQL gerekmez.
4. **Hesap fişi** (`src/lib/printBill.ts`): Hesabı Kapat ekranında "🖨️ Şimdi yazdır" ve "Hesabı kapatınca fişi yazdır" (cihazda hatırlanır). Toplu: hesap dökümü + ödeme yöntemi. Bölünmüş: hesap dökümü + **kişi başı fiş** (kişinin kalemleri, ödediği tutar, yöntem). 80 mm, tek yazdırma işinde her fiş ayrı sayfa.
