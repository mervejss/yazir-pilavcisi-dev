\set ON_ERROR_STOP on
begin;
\i tests/_helpers.sql
do $$
declare r jsonb; r2 jsonb; id1 uuid; pay jsonb; t1 timestamptz; big jsonb; cnt int;
begin
  perform pg_temp.login_as_service();
  big := jsonb_build_object('id','pkg-1','orderNumber','1199521762','shipmentPackageId','777','packageStatus','Created',
           'address', jsonb_build_object('addressDescription','Kadıköy - ISA2','address1','Gündoğdu'),
           'customer', jsonb_build_object('firstName','Oms'),
           'lines', jsonb_build_array(jsonb_build_object('name','Pilav','price',130)),
           'padding', repeat('x', 2000));
  pay := jsonb_build_object('source','trendyol','external_ref','pkg-1','status','new','customer_name','Oms M','customer_phone','5554443322',
           'delivery_address','Gündoğdu Koleji','district','Kadıköy','total',260,'subtotal',260,'platform_status','Created','pin_code','673985557',
           'items', jsonb_build_array(jsonb_build_object('name','Sade Pilav','unit_price',130,'quantity',2)), 'payload', big);

  -- 1) ilk giriş sipariş oluşturur; ham paket ayrı tabloda, orders'ta yalnızca küçük özet
  r := public.platform_ingest_order(pay);
  assert (r->>'created')::boolean, 'sipariş oluşmadı';
  id1 := (r->>'order_id')::uuid;
  assert (select total from public.orders where id = id1) = 260, 'toplam yanlış';
  assert (select count(*) from public.order_items where order_id = id1) = 1, 'kalem yok';
  assert (select external_payload->>'orderNumber' from public.orders where id = id1) = '1199521762', 'özet orderNumber eksik (raporlar bunu kullanır)';
  assert (select external_payload->'address'->>'addressDescription' from public.orders where id = id1) = 'Kadıköy - ISA2', 'özet adres tarifi eksik';
  assert (select external_payload ? 'lines' from public.orders where id = id1) = false, 'ham paket orders tablosunda kalmış';
  assert length((select external_payload::text from public.orders where id = id1)) < 500, 'orders.external_payload küçük olmalı';
  assert (select payload ? 'lines' from public.order_payloads where order_id = id1), 'ham paket order_payloads''ta yok';

  -- 2) aynı paket tekrar gelirse (çekim tekrarı) ÇİFT SİPARİŞ OLMAZ
  r2 := public.platform_ingest_order(pay);
  assert not (r2->>'created')::boolean and (r2->>'order_id')::uuid = id1, 'tekrar gelen paket yeni sipariş açtı';
  select count(*) into cnt from public.orders where source = 'trendyol' and external_ref = 'pkg-1';
  assert cnt = 1, 'aynı external_ref ile birden fazla sipariş: ' || cnt;

  -- 3) değişmeyen paket orders satırına YAZMAZ (Realtime/egress yükünü önleyen asıl düzeltme)
  select updated_at into t1 from public.orders where id = id1;
  perform pg_sleep(0.05);
  perform public.platform_ingest_order(pay);
  perform public.platform_apply_status(id1, 'new', 'Created', null, big, null, null);
  assert (select updated_at from public.orders where id = id1) = t1, 'değişmeyen pakette orders güncellendi (gereksiz yazım)';

  -- 4) durum yalnızca İLERİ gider; geri dönmez
  perform public.platform_apply_status(id1, 'preparing', 'Picking', null, null, null, null);
  assert (select status from public.orders where id = id1) = 'preparing', 'ileri geçiş olmadı';
  perform public.platform_apply_status(id1, 'new', 'Created', null, null, null, null);
  assert (select status from public.orders where id = id1) = 'preparing', 'durum geriye gitti';
  perform public.platform_apply_status(id1, 'delivered', 'Delivered', null, null, null, null);
  assert (select status from public.orders where id = id1) = 'delivered', 'teslim edildi olmadı';
  perform public.platform_apply_status(id1, 'preparing', 'Picking', null, null, null, null);
  assert (select status from public.orders where id = id1) = 'delivered', 'teslim sonrası geri gitti';

  -- 5) kısmi iptal/tutar değişimi: kalemler ve toplam eşitlenir (bitmemiş sipariş)
  pay := jsonb_set(pay, '{external_ref}', '"pkg-2"');
  r := public.platform_ingest_order(pay);
  id1 := (r->>'order_id')::uuid;
  perform public.platform_update_items(id1, jsonb_build_object('total', 130, 'subtotal', 130, 'delivery_fee', 0, 'discount', 0,
            'items', jsonb_build_array(jsonb_build_object('name','Sade Pilav','unit_price',130,'quantity',1))));
  assert (select total from public.orders where id = id1) = 130, 'kısmi iptalde toplam güncellenmedi';
  assert (select sum(quantity) from public.order_items where order_id = id1) = 1, 'kalem adedi güncellenmedi';

  -- 6) geçersiz platform / boş sipariş numarası reddedilir
  begin perform public.platform_ingest_order(jsonb_set(pay, '{source}', '"yok"')); assert false, 'TEST_FAIL';
  exception when others then assert sqlerrm like '%Geçersiz platform%', sqlerrm; end;
  begin perform public.platform_ingest_order(pay - 'external_ref'); assert false, 'TEST_FAIL';
  exception when others then assert sqlerrm like '%Geçersiz platform%', sqlerrm; end;

  -- 7) yetkisiz kullanıcı (anon/giriş yapmış müşteri) bu fonksiyonları ÇAĞIRAMAZ
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  begin perform public.platform_ingest_order(pay); assert false, 'TEST_FAIL müşteri sipariş ekleyebildi';
  exception when others then assert sqlerrm like '%Yetkisiz%', sqlerrm; end;
  raise notice 'trendyol testleri tamam';
end $$;
rollback;
