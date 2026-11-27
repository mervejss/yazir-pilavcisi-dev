import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDiscount, discountPayload, validPercent, validValue } from '../src/lib/orderDiscount.ts';

const L = [
  { variant_id: 'a', name: 'Pilav', price: 100, qty: 2 },   // 200
  { variant_id: 'b', name: 'Ayran', price: 33.33, qty: 3 }, // 99.99
];
const P = (mode, value, excluded = []) => ({ mode, unit: 'percent', value, excluded });
const A = (mode, value, excluded = []) => ({ mode, unit: 'amount', value, excluded });

test('doğrulama', () => {
  assert.ok(validPercent(10) && validPercent(100) && validPercent(0.5));
  assert.ok(!validPercent(0) && !validPercent(101) && !validPercent(NaN) && !validPercent(-5));
  assert.ok(validValue('amount', 70) && validValue('amount', 0.5) && !validValue('amount', 0) && !validValue('amount', -1) && !validValue('amount', NaN));
  assert.ok(validValue('amount', 500) && !validValue('percent', 500));
});

test('indirim yoksa fiyatlar aynı', () => {
  const r = computeDiscount(L, null);
  assert.equal(r.active, false); assert.equal(r.discount, 0); assert.equal(r.subtotal, 299.99); assert.equal(r.subtotalAfter, 299.99);
});

test('tüm sepetten %10', () => {
  const r = computeDiscount(L, P('cart', 10));
  assert.equal(r.active, true); assert.equal(r.discount, 30); assert.equal(r.subtotalAfter, 269.99);
});

test('tüm sepetten sabit TL (−70 ₺)', () => {
  const r = computeDiscount(L, A('cart', 70));
  assert.equal(r.active, true); assert.equal(r.unit, 'amount'); assert.equal(r.discount, 70); assert.equal(r.subtotalAfter, 229.99);
});

test('sepet TL indirimi sepet tutarını aşamaz (eksiye düşmez)', () => {
  const r = computeDiscount(L, A('cart', 5000));
  assert.equal(r.discount, 299.99); assert.equal(r.subtotalAfter, 0);
});

test('her ürüne ayrı %20: satır satır, birim fiyat kuruşa yuvarlanır', () => {
  const r = computeDiscount(L, P('items', 20));
  assert.equal(r.lines[0].unitAfter, 80); assert.equal(r.lines[0].lineAfter, 160); assert.equal(r.lines[0].saved, 40);
  assert.equal(r.lines[1].unitAfter, 26.66); assert.equal(r.lines[1].lineAfter, 79.98); assert.equal(r.lines[1].saved, 20.01);
  assert.equal(r.subtotalAfter, 239.98); assert.equal(r.discount, 60.01);
});

test('her ürüne ayrı −10 ₺: her ürünün BİRİM fiyatından düşer, 0 altına inmez', () => {
  const r = computeDiscount(L, A('items', 10));
  assert.equal(r.lines[0].unitAfter, 90); assert.equal(r.lines[0].lineAfter, 180); assert.equal(r.lines[0].saved, 20);
  assert.equal(r.lines[1].unitAfter, 23.33); assert.equal(r.lines[1].lineAfter, 69.99); assert.equal(r.lines[1].saved, 30);
  assert.equal(r.discount, 50); assert.equal(r.subtotalAfter, 249.99);
  const big = computeDiscount(L, A('items', 500));
  assert.equal(big.lines[0].unitAfter, 0); assert.equal(big.subtotalAfter, 0); assert.equal(big.discount, 299.99);
});

test('indirimden çıkarılan satır değişmez', () => {
  const r = computeDiscount(L, P('items', 50, ['a']));
  assert.equal(r.lines[0].saved, 0); assert.equal(r.lines[0].value, 0); assert.equal(r.lines[0].lineAfter, 200); assert.equal(r.lines[1].value, 50);
});

test('hepsi çıkarılırsa indirim aktif değil', () => {
  assert.equal(computeDiscount(L, P('items', 10, ['a', 'b'])).active, false);
});

test('%100 siparişi 0 yapar, eksiye düşmez', () => {
  assert.equal(computeDiscount(L, P('cart', 100)).subtotalAfter, 0);
});

test('RPC parametreleri', () => {
  assert.deepEqual(discountPayload(L, P('cart', 10)), { p_discount_mode: 'cart', p_discount_percent: 10, p_discount_lines: null });
  assert.deepEqual(discountPayload(L, A('cart', 70)), { p_discount_mode: 'cart_amount', p_discount_percent: 70, p_discount_lines: null });
  const p = discountPayload(L, P('items', 20, ['a']));
  assert.equal(p.p_discount_mode, 'items'); assert.deepEqual(p.p_discount_lines, [{ variant_id: 'b', percent: 20 }]);
  const q = discountPayload(L, A('items', 10));
  assert.deepEqual(q.p_discount_lines, [{ variant_id: 'a', amount: 10 }, { variant_id: 'b', amount: 10 }]);
});
