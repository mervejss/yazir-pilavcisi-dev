-- =====================================================================
-- YAZIR PİLAVCISI · 37 · MASA HESABI DENETİMİ (SADECE OKUMA)
-- Supabase SQL Editor'de çalıştırın. Hiçbir siparişi, masayı veya oturumu değiştirmez.
-- Amaç: Tüm masaların açık oturumlarını, oturum yaşını ve sipariş toplamlarını
-- tek tek görmek; özellikle Masa 3'te eski oturum açık kalmış mı doğrulamak.
-- =====================================================================

-- 1) TÜM MASALAR: Her masanın açık oturumu ve gerçek sipariş toplamı.
select
  t.number as masa_no,
  coalesce(t.name, 'Masa ' || t.number::text) as masa_adi,
  t.status as masa_durumu,
  s.id as acik_oturum_id,
  s.status as oturum_durumu,
  s.opened_at as oturum_baslangici,
  case when s.opened_at is not null
       then round(extract(epoch from (now() - s.opened_at)) / 3600.0, 1)
       else null end as acik_saat,
  count(o.id) filter (where o.status <> 'cancelled') as siparis_sayisi,
  coalesce(sum(o.total) filter (where o.status <> 'cancelled'), 0) as siparis_toplami,
  count(o.id) filter (where o.status in ('new','preparing','ready','assigned','on_the_way')) as servis_bekleyen,
  count(o.id) filter (where o.status = 'delivered') as teslim_edilen,
  s.total as oturum_kapanis_toplami
from public.dining_tables t
left join public.table_sessions s
  on s.table_id = t.id and s.status = 'open'
left join public.orders o
  on o.table_session_id = s.id
where t.is_active = true
group by t.id, t.number, t.name, t.status, s.id, s.status, s.opened_at, s.total
order by t.number;

-- 2) TÜM AÇIK OTURUMLARIN SİPARİŞLERİ: Sipariş no, saat, kaynak, durum ve tutar.
-- Aynı masada sabahki/eski siparişler hâlâ açık oturuma bağlı mı buradan görülür.
select
  t.number as masa_no,
  s.id as oturum_id,
  s.opened_at as oturum_baslangici,
  o.order_no,
  o.created_at as siparis_saati,
  o.source as siparis_kaynagi,
  o.status as siparis_durumu,
  o.subtotal,
  o.delivery_fee,
  o.discount,
  o.total,
  coalesce(items.kalem_sayisi, 0) as kalem_satiri,
  coalesce(items.urun_adedi, 0) as toplam_urun_adedi
from public.table_sessions s
join public.dining_tables t on t.id = s.table_id
left join public.orders o on o.table_session_id = s.id and o.status <> 'cancelled'
left join lateral (
  select count(*) as kalem_sayisi, coalesce(sum(oi.quantity), 0) as urun_adedi
  from public.order_items oi where oi.order_id = o.id
) items on true
where s.status = 'open'
order by t.number, o.created_at;

-- 3) MASA BAZINDA SON OTURUMLAR: Eski kapanmamış oturum var mı kontrol edin.
select
  t.number as masa_no,
  s.id as oturum_id,
  s.status as oturum_durumu,
  s.opened_at,
  s.closed_at,
  s.total as kapanista_kaydedilen_tutar,
  count(o.id) filter (where o.status <> 'cancelled') as siparis_sayisi,
  coalesce(sum(o.total) filter (where o.status <> 'cancelled'), 0) as siparislerden_hesaplanan_tutar
from public.table_sessions s
join public.dining_tables t on t.id = s.table_id
left join public.orders o on o.table_session_id = s.id
where t.is_active = true
  and s.opened_at >= now() - interval '7 days'
group by t.number, s.id, s.status, s.opened_at, s.closed_at, s.total
order by t.number, s.opened_at desc;

-- NOT:
-- Eski bir oturum hâlâ 'open' görünüyorsa eski siparişler aynı masanın açık hesabına
-- dahil ediliyor olabilir. Bu dosya hiçbir hesabı otomatik kapatmaz. Çıktıları incelemeden
-- oturum/sipariş silmeyin veya durumunu elle değiştirmeyin.
