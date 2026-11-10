-- Eski "Durum yollarını kaydet" ile yazılan (yanlış olabilen) uç nokta kayıtlarını temizler.
-- Kod artık doğrulanmış yolları kendi içinde sabit tuttuğu için gerekli değil ama temizlik için önerilir.
update integrations set config = config - 'endpoints' where platform = 'trendyol';
