-- =====================================================================
-- YAZIR PİLAVCISI · 06 · Başlangıç verileri (demodaki menü, 5 masa, ayarlar, yetkiler)
-- 05_storage_realtime_cron.sql'den SONRA çalıştırın.
-- =====================================================================
select set_config('app.skip_audit', '1', false);   -- başlangıç verisi denetim kaydını şişirmesin

-- ---------- Yetki kataloğu ----------
insert into public.permissions (key, label, group_name, sort_order) values
  ('orders.view',            'Siparişleri görüntüle',               'Siparişler', 10),
  ('orders.create',          'Sipariş ekle (telefon / masa)',       'Siparişler', 11),
  ('orders.edit',            'Sipariş düzenle ve durum değiştir',   'Siparişler', 12),
  ('orders.cancel',          'Sipariş iptal et',                    'Siparişler', 13),
  ('orders.assign_courier',  'Kurye ata',                           'Siparişler', 14),
  ('tables.view',            'Masaları görüntüle',                  'Masalar',    20),
  ('tables.operate',         'Masa durumu / hesap kapatma',         'Masalar',    21),
  ('tables.manage',          'Masa ekle, sil, yerleşimi düzenle',   'Masalar',    22),
  ('couriers.view',          'Kuryeleri ve canlı konumu görüntüle', 'Kuryeler',   30),
  ('couriers.manage',        'Kurye ekle, düzenle, pasifleştir',    'Kuryeler',   31),
  ('menu.manage',            'Menü, fiyat ve fotoğraf yönetimi',    'Menü',       40),
  ('reports.view',           'Raporlar ve analiz',                  'Raporlar',   50),
  ('customers.view',         'Müşterileri görüntüle',               'Müşteriler', 60),
  ('customers.manage',       'Müşteri bilgisi düzenle',             'Müşteriler', 61),
  ('feedback.view',          'Geri bildirimleri görüntüle',         'Diğer',      70),
  ('staff.view',             'Personel listesini görüntüle',        'Personel',   80),
  ('settings.manage',        'İşletme ayarları ve yorumlar',        'Ayarlar',    90),
  ('integrations.manage',    'Platform entegrasyonları',            'Ayarlar',    91),
  ('audit.view',             'İşlem kayıtlarını (denetim) görüntüle', 'Ayarlar',  92);

-- Operatör varsayılanı (sahip değiştirebilir). Alt yönetici: varsayılan yetki YOK; sahip tek tek verir.
insert into public.role_permissions (role, permission_key) values
  ('operator', 'orders.view'), ('operator', 'orders.create'), ('operator', 'orders.edit'),
  ('operator', 'orders.assign_courier'),
  ('operator', 'tables.view'), ('operator', 'tables.operate'),
  ('operator', 'couriers.view'),
  ('operator', 'menu.manage'),
  ('operator', 'customers.view'), ('operator', 'customers.manage'),
  ('operator', 'feedback.view');

-- ---------- İşletme ayarları ----------
insert into public.business_settings
  (id, name, slogan, phone, whatsapp, address, iban, iban_holder, delivery_fee, min_order_amount,
   estimated_delivery_min, estimated_delivery_max)
values
  (1, 'Yazır Pilavcısı', 'Tane tane pilav, 15 dakikada kapında.', '0540 331 41 42', '05403314142',
   'Yazır mah. Şehit Erkan Özbalcı sk. 20/b, Selçuklu / Konya (Reyhan İş Merkezi arkası)',
   'TR00 0000 0000 0000 0000 0000 00', 'Yazır Pilavcısı', 0, 0, 15, 25)
on conflict (id) do nothing;

-- Pzt–Cmt 12:00–03:00, Pazar 14:00–03:00 (ertesi gün kapanış)
insert into public.opening_hours (day_of_week, open_time, close_time, closes_next_day, is_closed) values
  (1, '12:00', '03:00', true, false), (2, '12:00', '03:00', true, false), (3, '12:00', '03:00', true, false),
  (4, '12:00', '03:00', true, false), (5, '12:00', '03:00', true, false), (6, '12:00', '03:00', true, false),
  (7, '14:00', '03:00', true, false);

-- ---------- Sipariş kaynakları ----------
insert into public.order_sources (code, label, color, is_platform, commission_rate, sort_order) values
  ('web',         'Web',           '#14110c', false, 0, 1),
  ('phone',       'Telefon',       '#6b6556', false, 0, 2),
  ('table',       'Masa / QR',     '#f2b705', false, 0, 3),
  ('yemeksepeti', 'Yemeksepeti',   '#fa0050', true,  0, 4),
  ('trendyol',    'Trendyol Yemek','#f27a1a', true,  0, 5),
  ('getir',       'Getir Yemek',   '#5d3ebc', true,  0, 6),
  ('migros',      'Migros Yemek',  '#d9480f', true,  0, 7),
  ('counter',     'Restoran / Tezgâh', '#d4af37', false, 0, 8);

insert into public.integrations (platform) values ('yemeksepeti'), ('trendyol'), ('getir'), ('migros');

-- ---------- Menü ----------
insert into public.categories (name, slug, sort_order) values
  ('Pilavlar', 'pilavlar', 1), ('Çorbalar & Yanlar', 'corbalar-yanlar', 2), ('İçecekler', 'icecekler', 3);

insert into public.products (category_id, slug, name, description, emoji, kcal, protein_g, carb_g, is_daily, sort_order)
select c.id, v.slug, v.name, v.descr, v.emoji, v.kcal, v.pro, v.carb, v.daily, v.ord
from (values
  ('sade',     'Pilavlar', 'Sade Pilav',              'Tane tane, tereyağlı şehriyeli klasik pilav.', '🍚', 320, 6, 58, false, 1),
  ('tavuk',    'Pilavlar', 'Tavuk Pilav',             'Özenle haşlanır, el emeğiyle didilir, tane tane pilavın üzerine servis edilir.', '🍗', 480, 28, 60, false, 2),
  ('sporcu',   'Pilavlar', 'Sporcu Pilav',            'Çift tavuk, az yağlı. Sporcuların favorisi.', '💪', 560, 44, 58, false, 3),
  ('kori',     'Pilavlar', 'Körili Tavuk Pilav',      'Hafif acılı köri sosuyla tavuk pilav.', '🍛', 540, 30, 62, false, 4),
  ('barbekul', 'Pilavlar', 'Barbekülü Tavuk Pilav',   'Dumanlı barbekü sosu, didilmiş tavuk.', '🔥', 560, 29, 66, false, 5),
  ('etli',     'Pilavlar', 'Etli Pilav',              'Yavaş pişmiş, lokum gibi et.', '🥩', 690, 38, 58, false, 6),
  ('deniz',    'Pilavlar', 'Denizaltı',               'Etin ve tavuğun bir arada olduğu doyurucu karışık.', '🌊', 780, 52, 60, false, 7),
  ('kuru',     'Pilavlar', 'Kuru Fasulyeli Pilav',    'Odun ateşi tadında kuru fasulye ile.', '🫘', 520, 18, 78, false, 8),
  ('midye',    'Pilavlar', 'Midye Dolma',             'Baharatlı iç pilavlı, limonla.', '🦪', 45, 2, 6, false, 9),
  ('araba',    'Çorbalar & Yanlar', 'Arabaşı',        'Konya’nın geleneksel çorbası. Her gün.', '🥣', 260, 14, 20, true, 1),
  ('mercimek', 'Çorbalar & Yanlar', 'Mercimek Çorbası','Limon ve pul biberle.', '🍲', 190, 9, 28, true, 2),
  ('iskembe',  'Çorbalar & Yanlar', 'İşkembe (Cuma–Cumartesi)', 'Sarımsaklı sirkeli klasik.', '🍜', 240, 16, 12, true, 3),
  ('ayran',    'İçecekler', 'Ayran',                  'Soğuk, köpüklü.', '🥛', 70, 4, 5, false, 1),
  ('cola',     'İçecekler', 'Coca-Cola',              '', '🥤', 140, 0, 35, false, 2),
  ('fuse',     'İçecekler', 'Fuse Tea',               '', '🧊', 90, 0, 22, false, 3),
  ('soda',     'İçecekler', 'Soda',                   '', '🫧', 0, 0, 0, false, 4),
  ('su',       'İçecekler', 'Su',                     '', '💧', 0, 0, 0, false, 5)
) as v(slug, cat, name, descr, emoji, kcal, pro, carb, daily, ord)
join public.categories c on c.name = v.cat;

insert into public.product_variants (product_id, name, price, sort_order)
select p.id, v.vname, v.price, v.ord
from (values
  ('sade','1 porsiyon',100,1),
  ('tavuk','1 porsiyon',120,1), ('tavuk','1,5 porsiyon',160,2),
  ('sporcu','1 porsiyon',170,1), ('sporcu','1,5 porsiyon',190,2),
  ('kori','1 porsiyon',180,1), ('kori','1,5 porsiyon',200,2),
  ('barbekul','1 porsiyon',180,1), ('barbekul','1,5 porsiyon',200,2),
  ('etli','1 porsiyon',350,1), ('etli','1,5 porsiyon',400,2),
  ('deniz','1 porsiyon',400,1), ('deniz','1,5 porsiyon',450,2),
  ('kuru','1 porsiyon',150,1), ('kuru','1,5 porsiyon',180,2),
  ('midye','1 tane',20,1), ('midye','1 kg',800,2),
  ('araba','1 kase',120,1),
  ('mercimek','1 kase',120,1),
  ('iskembe','1 kase',180,1),
  ('ayran','küçük',25,1), ('ayran','büyük',35,2),
  ('cola','şişe',70,1), ('cola','teneke',80,2), ('cola','1 litre',90,3),
  ('fuse','330 ml',70,1),
  ('soda','sade',20,1), ('soda','meyveli',25,2),
  ('su','0,5 l',20,1)
) as v(slug, vname, price, ord)
join public.products p on p.slug = v.slug;

-- ---------- Masalar (QR kodları tetikleyiciyle otomatik oluşur) ----------
insert into public.dining_tables (number, name, capacity, pos_x, pos_y, shape) values
  (1, 'Masa 1', 4,  40,  40, 'square'),
  (2, 'Masa 2', 4, 200,  40, 'square'),
  (3, 'Masa 3', 4, 360,  40, 'round'),
  (4, 'Masa 4', 6,  40, 200, 'rect'),
  (5, 'Masa 5', 6, 240, 200, 'rect');

-- ---------- Yorumlar: GERÇEK Google yorumlarıyla değiştirilene kadar yayında DEĞİL ----------
insert into public.site_reviews (author, rating, body, is_published, sort_order) values
  ('Mehmet K.', 5, 'Pilav tane tane, tavuk taze. Kurye 12 dakikada getirdi.', false, 1),
  ('Ayşe T.',   5, 'Mevlit için 120 kişilik sipariş verdik, zamanında ve sıcak geldi. Teşekkürler.', false, 2),
  ('Burak Y.',  4, 'Sporcu pilav çok iyi, ayran biraz daha soğuk olsa tam olurdu.', false, 3),
  ('Selin A.',  5, 'Gece 2’de açık olan nadir yerlerden. Fiyatlar makul.', false, 4),
  ('Hasan D.',  5, 'Etli pilav lokum gibiydi.', false, 5);

select set_config('app.skip_audit', '', false);
