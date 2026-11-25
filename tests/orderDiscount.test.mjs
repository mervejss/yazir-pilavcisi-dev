import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDiscount, discountPayload, validPercent } from '../src/lib/orderDiscount.ts';

const L = [
  { variant_id: 'a', name: 'Pilav', price: 100, qty: 2 },   // 200
  { variant_id: 'b', name: 'Ayran', price: 33.33, qty: 3 }, // 99.99
];

test('yüzde doğrulama', () => {
  assert.ok(validPercent(10)); assert.ok(validPercent(100)); assert.ok(validPercent(0.5));
  assert.ok(!validPercent(0)); assert.ok(!validPercent(101)); assert.ok(!validPercent(NaN)); assert.ok(!validPercent(-5));
});

test('indirim yoksa fiyatlar aynı', () => {
  const r = computeDiscount(L, null);
  assert.equal(r.active, false); assert.equal(r.discount, 0); assert.equal(r.subtotal, 299.99); assert.equal(r.subtotalAfter, 299.99);
});

test('tüm sepetten %10', () => {
  const r = computeDiscount(L, { mode: 'cart', percent: 10, excluded: [] });
  assert.equal(r.active, true); assert.equal(r.subtotal, 299.99);
  assert.equal(r.discount, 30); assert.equal(r.subtotalAfter, 269.99);
});

test('her ürüne ayrı %20: satır satır, birim fiyat kuruşa yuvarlanır', () => {
  const r = computeDiscount(L, { mode: 'items', percent: 20, excluded: [] });
  assert.equal(r.lines[0].unitAfter, 80); assert.equal(r.lines[0].lineAfter, 160); assert.equal(r.lines[0].saved, 40);
  assert.equal(r.lines[1].unitAfter, 26.66); assert.equal(r.lines[1].lineAfter, 79.98); assert.equal(r.lines[1].saved, 20.01);
  assert.equal(r.subtotalAfter, 239.98); assert.equal(r.discount, 60.01);
  assert.equal(Math.round((r.subtotal - r.discount) * 100), Math.round(r.subtotalAfter * 100));
});

test('indirimden çıkarılan satır değişmez', () => {
  const r = computeDiscount(L, { mode: 'items', percent: 50, excluded: ['a'] });
  assert.equal(r.lines[0].saved, 0); assert.equal(r.lines[0].percent, 0); assert.equal(r.lines[0].lineAfter, 200);
  assert.equal(r.lines[1].percent, 50);
});

test('hepsi çıkarılırsa indirim aktif değil', () => {
  assert.equal(computeDiscount(L, { mode: 'items', percent: 10, excluded: ['a', 'b'] }).active, false);
});

test('%100 siparişi 0 yapar, eksiye düşmez', () => {
  const r = computeDiscount(L, { mode: 'cart', percent: 100, excluded: [] });
  assert.equal(r.subtotalAfter, 0);
});

test('RPC parametreleri', () => {
  assert.deepEqual(discountPayload(L, { mode: 'cart', percent: 10, excluded: [] }), { p_discount_mode: 'cart', p_discount_percent: 10, p_discount_lines: null });
  const p = discountPayload(L, { mode: 'items', percent: 20, excluded: ['a'] });
  assert.equal(p.p_discount_mode, 'items'); assert.deepEqual(p.p_discount_lines, [{ variant_id: 'b', percent: 20 }]);
});
