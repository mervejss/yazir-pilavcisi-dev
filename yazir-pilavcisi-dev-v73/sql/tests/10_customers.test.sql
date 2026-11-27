\set ON_ERROR_STOP on
begin;
\i tests/_helpers.sql
do $$
declare a uuid; b uuid; r jsonb; n1 bigint; n2 bigint; m int; msg text; fc record; cnt int;
begin
  perform pg_temp.login_as_owner();

  -- numaralama: yeni müşteri otomatik numara alır, artarak gider
  insert into public.customers (full_name, phone) values ('Ahmet Yılmaz', '0555 111 22 33') returning id, customer_no into a, n1;
  insert into public.customers (full_name, phone) values ('Veli Kaya', '0532 000 11 22') returning id, customer_no into b, n2;
  assert n1 >= 1001, 'numara 1001den başlamalı: ' || n1;
  assert n2 > n1, 'numara artmalı';

  -- numara değiştirilemez
  begin
    update public.customers set customer_no = 5 where id = a;
    assert false, 'TEST_FAIL numara değiştirilebildi';
  exception when others then
    assert sqlerrm like '%değiştirilemez%', 'beklenen hata gelmedi: ' || sqlerrm;
  end;

  -- telefon kontrolü: biçimden bağımsız eşleşir, kendisini hariç tutar, kısa numarada boş döner
  r := public.staff_check_phone('+90 555 111 2233');
  assert jsonb_array_length(r->'matches') = 1, 'eşleşme bulunamadı: ' || r::text;
  assert (r->'matches'->0->>'customer_no')::bigint = n1, 'yanlış müşteri numarası';
  assert r->'matches'->0->>'full_name' = 'Ahmet Yılmaz', 'yanlış ad';
  assert jsonb_array_length(public.staff_check_phone('05551112233', a)->'matches') = 0, 'kendisi hariç tutulmadı';
  assert jsonb_array_length(public.staff_check_phone('0555')->'matches') = 0, 'kısa numara eşleşmemeli';

  -- aynı telefonla yeni müşteri: uyarı döner, HİÇBİR ŞEY değişmez (ad ezilmez, yeni kayıt açılmaz)
  select count(*) into cnt from public.customers;
  r := public.staff_save_customer(null, 'Başka Biri', '5551112233', 'not', null);
  assert (r->>'duplicate')::boolean, 'duplicate uyarısı gelmedi: ' || r::text;
  assert (r->'existing'->>'customer_no')::bigint = n1, 'uyarıda yanlış numara';
  assert (select full_name from public.customers where id = a) = 'Ahmet Yılmaz', 'mevcut müşterinin adı ezildi!';
  assert (select count(*) from public.customers) = cnt, 'uyarıya rağmen yeni kayıt açıldı';

  -- onaylanırsa (p_merge) mevcut müşteriye işlenir
  r := public.staff_save_customer(null, 'Ahmet Y.', '5551112233', null, null, true);
  assert (r->>'customer_id')::uuid = a and not (r->>'created')::boolean, 'birleştirme çalışmadı: ' || r::text;
  assert (select full_name from public.customers where id = a) = 'Ahmet Y.', 'birleştirmede ad güncellenmedi';
  assert (select count(*) from public.customers) = cnt, 'birleştirme yeni kayıt açtı';

  -- yeni numara: kayıt açılır ve numara döner
  r := public.staff_save_customer(null, 'Yeni Müşteri', '0541 999 88 77', null, null);
  assert (r->>'created')::boolean and (r->>'customer_no')::bigint > n2, 'yeni müşteri kaydedilemedi: ' || r::text;

  -- mevcut müşterinin telefonunu başkasının numarasına çevirmek engellenir; mesajda numara + ad vardır
  begin
    perform public.admin_update_customer(b, 'Veli Kaya', '0555 111 22 33', null);
    assert false, 'TEST_FAIL başkasının numarasına geçiş engellenmedi';
  exception when others then
    assert sqlerrm like '%#' || n1 || '%' and sqlerrm like '%Ahmet%', 'hata mesajı numara/ad içermiyor: ' || sqlerrm;
  end;
  -- numara değişmiyorsa (başka alan düzenleme) engellenmez; kendi numarasına kaydetmek serbest
  perform public.admin_update_customer(b, 'Veli K.', '0532 000 11 22', 'not');
  assert (select full_name from public.customers where id = b) = 'Veli K.', 'normal düzenleme başarısız';

  -- numarayla arama (#1001) ve listede numara
  select count(*) into cnt from public.staff_find_customers('#' || n1);
  assert cnt = 1, 'numarayla arama bulamadı';
  assert (select customer_no from public.admin_customers() where id = a) = n1, 'admin_customers numara döndürmedi';
  raise notice 'customers testleri tamam';
end $$;
rollback;
