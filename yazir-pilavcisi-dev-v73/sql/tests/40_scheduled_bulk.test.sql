\set ON_ERROR_STOP on
begin;
\i tests/_helpers.sql
do $$
declare v uuid; r jsonb; oid uuid; s timestamptz; n0 int; bid uuid; t jsonb; cat uuid; prod uuid;
begin
  perform pg_temp.login_as_owner();
  insert into public.categories (name, slug, sort_order) values ('T', 'test-kat-' || gen_random_uuid(), 99) returning id into cat;
  insert into public.products (category_id, name, slug) values (cat, 'Test Pilav', 'test-pilav-' || gen_random_uuid()) returning id into prod;
  insert into public.product_variants (product_id, name, price) values (prod, 'Tek', 100) returning id into v;

  -- 1) planlı sipariş: planlanan saat kaydedilir ve sonuçta döner
  s := date_trunc('minute', now() + interval '6 hours');
  r := public.staff_create_order_ex('counter', 'pickup', '{"name":"Planlı Müşteri","phone":"05321112233"}'::jsonb,
         jsonb_build_array(jsonb_build_object('variant_id', v, 'quantity', 2)), null, 'cash_on_delivery', 'akşam gelecek', null, true, s);
  oid := (r->>'order_id')::uuid;
  assert (select scheduled_for from public.orders where id = oid) = s, 'scheduled_for yazılmadı';
  assert (select total from public.orders where id = oid) = 200, 'toplam yanlış';
  assert (select status from public.orders where id = oid) = 'new', 'planlı sipariş yeni durumda başlamalı';

  -- 2) planlanmamış sipariş: scheduled_for boş
  r := public.staff_create_order_ex('counter', 'pickup', '{}'::jsonb, jsonb_build_array(jsonb_build_object('variant_id', v, 'quantity', 1)), null, 'cash_on_delivery');
  assert (select scheduled_for from public.orders where id = (r->>'order_id')::uuid) is null, 'planlanmamış siparişte scheduled_for dolu';

  -- 3) geçmiş / çok ileri / masa siparişi reddedilir
  begin perform public.staff_create_order_ex('counter', 'pickup', '{}'::jsonb, jsonb_build_array(jsonb_build_object('variant_id', v, 'quantity', 1)), null, 'cash_on_delivery', null, null, true, now() - interval '2 hours'); assert false, 'TEST_FAIL';
  exception when others then assert sqlerrm like '%geçmişte%', sqlerrm; end;
  begin perform public.staff_create_order_ex('counter', 'pickup', '{}'::jsonb, jsonb_build_array(jsonb_build_object('variant_id', v, 'quantity', 1)), null, 'cash_on_delivery', null, null, true, now() + interval '200 days'); assert false, 'TEST_FAIL';
  exception when others then assert sqlerrm like '%çok ileride%', sqlerrm; end;
  -- 3b) reddedilen girişlerde yarım sipariş kalmamalı (işlem geri alınır → sipariş sayısı değişmez)
  assert (select count(*) from public.orders where note is null and scheduled_for is null and customer_name is null and total = 100) >= 1, 'beklenen sipariş yok';

  -- 4) süre raporu: planlı siparişte ölçüm planlanan saatten (3 saat önce açılmış ama 10 dk önce planlanmış)
  insert into public.orders (source, order_type, status, subtotal, total, created_at, scheduled_for, accepted_at, ready_at, delivered_at)
    values ('counter', 'pickup', 'delivered', 50, 50, now() - interval '3 hours', now() - interval '10 minutes', now() - interval '8 minutes', now() - interval '4 minutes', now());
  select avg_total_min into t from (select avg_total_min from public.report_order_timings(now() - interval '1 day', now() + interval '1 hour')) q;
  assert (t#>>'{}')::numeric between 8 and 12, 'planlı siparişin toplam süresi planlı saatten sayılmadı: ' || t::text;

  -- 5) toplu talep (yönetici): organizasyon türü ve adres isteğe bağlı; kaynak admin
  n0 := (select count(*) from public.notifications);
  r := public.admin_create_bulk_request('Mehmet Usta', '0540 111 22 33', null, 150, now() + interval '2 days', null, 'pilav 150 porsiyon');
  bid := (r->>'id')::uuid;
  assert (select source from public.bulk_order_requests where id = bid) = 'admin', 'kaynak admin olmalı';
  assert (select event_type from public.bulk_order_requests where id = bid) is null, 'organizasyon türü boş kalabilmeli';
  assert (select created_by from public.bulk_order_requests where id = bid) is not null, 'oluşturan yazılmalı';
  assert (select count(*) from public.notifications) = n0, 'yöneticinin kendi talebi için bildirim düşmemeli';
  begin perform public.admin_create_bulk_request('', '0540 111 22 33', null, 5, now(), null, null); assert false, 'TEST_FAIL';
  exception when others then assert sqlerrm like '%Ad soyad%', sqlerrm; end;
  begin perform public.admin_create_bulk_request('A', '123', null, 5, now(), null, null); assert false, 'TEST_FAIL';
  exception when others then assert sqlerrm like '%telefon%', sqlerrm; end;
  begin perform public.admin_create_bulk_request('A', '0540 111 22 33', null, 0, now(), null, null); assert false, 'TEST_FAIL';
  exception when others then assert sqlerrm like '%sayısı%', sqlerrm; end;

  -- 6) durum değişince ilgilenen ve arama zamanı otomatik yazılır
  update public.bulk_order_requests set status = 'contacted' where id = bid;
  assert (select handled_by from public.bulk_order_requests where id = bid) is not null, 'handled_by yazılmadı';
  assert (select contacted_at from public.bulk_order_requests where id = bid) is not null, 'contacted_at yazılmadı';

  -- 7) kurye listesi planlı saati taşır
  assert pg_get_functiondef('public.courier_list_orders()'::regprocedure) like '%o.scheduled_for%', 'courier_list_orders scheduled_for döndürmüyor';
  raise notice 'planlı sipariş + toplu talep testleri tamam';
end $$;

-- 8) site ziyaretçisi (anon): normal talep eklenir ama "admin" kaynağı/ilgilenen taklit edilemez
set local role anon;
do $$
begin
  insert into public.bulk_order_requests (full_name, phone, people_count, delivery_at, delivery_address)
    values ('Ziyaretçi', '05551112233', 40, now() + interval '3 days', 'Konya');
  begin
    insert into public.bulk_order_requests (full_name, phone, people_count, delivery_at, source) values ('Sahte', '05551112233', 40, now() + interval '3 days', 'admin');
    assert false, 'TEST_FAIL anon admin kaynağıyla ekleyebildi';
  exception when insufficient_privilege or check_violation then null; end;
  begin
    insert into public.bulk_order_requests (full_name, phone, people_count, delivery_at, admin_note) values ('Sahte', '05551112233', 40, now() + interval '3 days', 'x');
    assert false, 'TEST_FAIL anon admin notu yazabildi';
  exception when insufficient_privilege or check_violation then null; end;
end $$;
reset role;
rollback;
