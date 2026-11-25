import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSurcharge, validSurchargeInput, parseNum, distanceKm, suggestByDistance, suggestByTime, buildSuggestions } from '../src/lib/orderSurcharge.ts';

const REST = { lat: 37.9575, lng: 32.509867 };
const at = (h, m) => new Date(2026, 10, 26, h, m);

test('sabit TL + yüzde birlikte (yüzde, indirim sonrası ürün tutarından)', () => {
  const r = computeSurcharge(400, { amount: 20, percent: 5, reason: 'x' });
  assert.equal(r.fixed, 20); assert.equal(r.pctAmount, 20); assert.equal(r.total, 40); assert.equal(r.active, true);
});
test('yalnızca TL / yalnızca %', () => {
  assert.equal(computeSurcharge(400, { amount: 35, percent: 0, reason: '' }).total, 35);
  assert.equal(computeSurcharge(333.33, { amount: 0, percent: 10, reason: '' }).total, 33.33);
});
test('boş / eksi / aşırı değerler güvenli', () => {
  assert.equal(computeSurcharge(400, null).active, false);
  assert.equal(computeSurcharge(400, { amount: -5, percent: -1, reason: '' }).total, 0);
  assert.equal(computeSurcharge(400, { amount: 0, percent: 500, reason: '' }).total, 400);   // en fazla %100
});
test('girdi doğrulama', () => {
  assert.ok(validSurchargeInput('25', '')); assert.ok(validSurchargeInput('', '7,5')); assert.ok(validSurchargeInput('10', '5'));
  assert.ok(!validSurchargeInput('', '')); assert.ok(!validSurchargeInput('0', '0')); assert.ok(!validSurchargeInput('abc', '')); assert.ok(!validSurchargeInput('', '101')); assert.ok(!validSurchargeInput('-3', ''));
  assert.equal(parseNum('12,5'), 12.5);
});
test('mesafe: 1° enlem ≈ 111 km', () => {
  const km = distanceKm({ lat: 37, lng: 32 }, { lat: 38, lng: 32 });
  assert.ok(km > 110.5 && km < 111.9, String(km));
});
test('mesafe basamakları', () => {
  const north = (km) => ({ lat: REST.lat + km / 111.19, lng: REST.lng });
  assert.equal(suggestByDistance(REST, north(2)).amount, 0);
  assert.equal(suggestByDistance(REST, north(4)).amount, 20);
  assert.equal(suggestByDistance(REST, north(7)).amount, 40);
  assert.equal(suggestByDistance(REST, north(10)).amount, 70);
  assert.equal(suggestByDistance(REST, north(30)).amount, 100);
  assert.equal(suggestByDistance(REST, null), null);
});
test('saat basamakları (gece yarısından sonra)', () => {
  assert.equal(suggestByTime(at(14, 30)).amount, 0);
  assert.equal(suggestByTime(at(23, 30)).amount, 0);
  assert.equal(suggestByTime(at(0, 0)).amount, 20);
  assert.equal(suggestByTime(at(0, 59)).amount, 20);
  const s = suggestByTime(at(1, 20)); assert.equal(s.amount, 30); assert.match(s.text, /1 sa 20 dk sonra/);
  assert.equal(suggestByTime(at(3, 0)).amount, 50);
  assert.equal(suggestByTime(at(5, 0)).amount, 0);
});
test('birleşik öneri: mesafe + gece', () => {
  const dest = { lat: REST.lat + 7 / 111.19, lng: REST.lng };
  const s = buildSuggestions(REST, dest, at(1, 20));
  assert.equal(s.total, 70); assert.deepEqual(s.options.map((o) => o.key), ['both', 'distance', 'time']);
  assert.equal(s.options[0].amount, 70);
  const day = buildSuggestions(REST, dest, at(13, 0)); assert.deepEqual(day.options.map((o) => o.key), ['distance']);
  const near = buildSuggestions(REST, { lat: REST.lat + 0.005, lng: REST.lng }, at(13, 0)); assert.equal(near.options.length, 0);
});
