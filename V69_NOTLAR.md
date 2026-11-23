# v69 — Yeni Sipariş penceresi geniş/ferah + kategori ikonları
- Pencere 1120 → en fazla 1720 px; geniş ekranda 3 sütun: sipariş bilgisi | menü | sepet. Menü kartları büyüdü, aralıklar açıldı; kategori çipleri tek satırda kaydırmak yerine alta sarar.
- Kategori çiplerinde çizgi ikonları (emoji değil): pilav, çorba, içecek, çay/kahve, tatlı, tost/burger, midye, balık, pizza, kampanya/menü, ızgara... Eşleşme kategori adına göre otomatik (src/lib/categoryIcon.ts); aynı ikonlar herkese açık menüde de kullanılır.
- Masa/sandalye ekranındaki ürün seçici de ikonları alır; geniş yerleşim yalnızca Yeni Sipariş penceresinde.
