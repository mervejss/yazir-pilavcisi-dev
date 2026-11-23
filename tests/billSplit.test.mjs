import test from 'node:test';
import assert from 'node:assert/strict';
import { r2, normalizeRefs, splitRemaining } from '../src/lib/billSplit.ts';

test('r2 kuruşa yuvarlar', () => {
  assert.equal(r2(150.165), 150.17);
  assert.equal(r2(0.1 + 0.2), 0.3);
  assert.equal(r2(10), 10);
  assert.ok(!Object.is(r2(0.1 + 0.2 - 0.3), -0), '-0 çıkmamalı');
});

test('normalizeRefs: eski "id#n" dizeleri ve yeni {k,n} biçimi birleşir', () => {
  assert.deepEqual(normalizeRefs(['a#0', 'a#1', 'b#0']), [{ k: 'a', n: 2 }, { k: 'b', n: 1 }]);
  assert.deepEqual(normalizeRefs([{ k: 'a', n: 2 }, { k: 'a', n: 1 }]), [{ k: 'a', n: 3 }]);
  assert.deepEqual(normalizeRefs([{ k: 'x' }]), [{ k: 'x', n: 1 }]);   // adet yoksa 1
  assert.deepEqual(normalizeRefs(null), []);
  assert.deepEqual(normalizeRefs('x'), []);
});

test('splitRemaining: kalan = toplam − ödemeler (kuruş hatası yok)', () => {
  const p = (amount) => ({ label: '', method: 'cash_at_table', amount, lines: [] });
  assert.equal(splitRemaining([], 450.5), 450.5);
  assert.equal(splitRemaining([p(150.17), p(150.17)], 450.5), 150.16);
  assert.equal(splitRemaining([p(0.1), p(0.2)], 0.3), 0);
});

test('eşit bölme: her ödemede kalan/kalan kişi; son kişi tam kalanı öder, toplam KURUŞ kuruşa tutar', () => {
  for (const [total, n] of [[450.5, 3], [100, 3], [99.99, 7], [1, 3], [1234.56, 6], [0.05, 2]]) {
    const paid = [];
    for (let left = n; left >= 1; left--) {
      const remaining = splitRemaining(paid, total);
      const amount = left <= 1 ? remaining : r2(remaining / left);   // BillSplitter'daki equalAmount kuralı
      assert.ok(amount >= 0, `negatif tutar (${total}/${n})`);
      paid.push({ label: '', method: 'cash_at_table', amount, lines: [] });
    }
    assert.equal(splitRemaining(paid, total), 0, `${total} / ${n} kişi: kalan 0 olmalı`);
    assert.equal(r2(paid.reduce((a, x) => a + x.amount, 0)), total);
  }
});
