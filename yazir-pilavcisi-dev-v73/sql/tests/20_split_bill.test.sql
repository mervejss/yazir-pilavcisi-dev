\set ON_ERROR_STOP on
begin;
\i tests/_helpers.sql
do $$
declare t uuid; s uuid; o1 uuid; o2 uuid; r jsonb; msg text;
begin
  perform pg_temp.login_as_owner();
  insert into public.dining_tables (number, name) values (9001, 'Test') returning id into t;
  insert into public.table_sessions (table_id) values (t) returning id into s;
  update public.dining_tables set status = 'served' where id = t;
  insert into public.orders (source, order_type, status, subtotal, total, table_id, table_session_id, payment_status)
    values ('table', 'dine_in', 'delivered', 300, 300, t, s, 'pending') returning id into o1;
  insert into public.orders (source, order_type, status, subtotal, total, table_id, table_session_id, payment_status)
    values ('table', 'dine_in', 'delivered', 150.50, 150.50, t, s, 'pending') returning id into o2;
  insert into public.orders (source, order_type, status, subtotal, total, table_id, table_session_id, payment_status)
    values ('table', 'dine_in', 'cancelled', 999, 999, t, s, 'pending');   -- iptal: hesaba girmemeli

  -- toplam tutmuyorsa reddedilir ve hiçbir ödeme kaydı yazılmaz
  begin
    perform public.close_table_bill_split(t, '[{"label":"A","method":"cash_at_table","amount":200},{"label":"B","method":"card_at_table","amount":100}]'::jsonb);
    assert false, 'TEST_FAIL eksik toplam kabul edildi';
  exception when others then
    assert sqlerrm like '%eşit olmalı%', 'beklenmeyen hata: ' || sqlerrm;
  end;
  assert (select count(*) from public.table_split_payments where session_id = s) = 0, 'reddedilen ödeme yazıldı';
  assert (select status from public.table_sessions where id = s) = 'open', 'oturum kapanmamalıydı';

  -- geçersiz yöntem ve negatif tutar reddedilir
  begin perform public.close_table_bill_split(t, '[{"method":"bitcoin","amount":450.5}]'::jsonb); assert false, 'TEST_FAIL';
  exception when others then assert sqlerrm like '%Geçersiz ödeme yöntemi%', sqlerrm; end;
  begin perform public.close_table_bill_split(t, '[{"method":"cash_at_table","amount":-5},{"method":"card_at_table","amount":455.5}]'::jsonb); assert false, 'TEST_FAIL';
  exception when others then assert sqlerrm like '%Geçersiz tutar%', sqlerrm; end;
  begin perform public.close_table_bill_split(t, '[]'::jsonb); assert false, 'TEST_FAIL';
  exception when others then assert sqlerrm like '%boş%', sqlerrm; end;

  -- 3'e bölünmüş doğru toplam (150.17 + 150.17 + 150.16 = 450.50; kuruş düzeyi) kabul edilir
  r := public.close_table_bill_split(t, '[{"label":"Ali","method":"cash_at_table","amount":150.17},{"label":"Veli","method":"card_at_table","amount":150.17},{"label":"Ayşe","method":"card_at_table","amount":150.16}]'::jsonb);
  assert (r->>'payments')::int = 3, 'ödeme sayısı yanlış: ' || r::text;
  assert (select sum(amount) from public.table_split_payments where session_id = s) = 450.50, 'kaydedilen toplam yanlış';
  assert (select status from public.table_sessions where id = s) = 'closed', 'oturum kapanmadı';
  assert (select payment_method from public.table_sessions where id = s) = 'card_at_table', 'baskın yöntem (kart) yazılmalıydı';
  assert (select count(*) from public.orders where table_session_id = s and payment_status = 'paid' and status = 'delivered') = 2, 'siparişler ödendi işaretlenmedi';
  assert (select payment_status from public.orders where table_session_id = s and status = 'cancelled') = 'pending', 'iptal sipariş ödendi sayılmamalı';

  -- kapanmış hesap ikinci kez kapatılamaz
  begin perform public.close_table_bill_split(t, '[{"method":"cash_at_table","amount":450.5}]'::jsonb); assert false, 'TEST_FAIL';
  exception when others then assert sqlerrm like '%açık hesap yok%', sqlerrm; end;
  raise notice 'hesap bölme testleri tamam';
end $$;
rollback;
