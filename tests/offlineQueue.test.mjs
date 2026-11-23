import test from 'node:test';
import assert from 'node:assert/strict';

// tarayıcı ortamı taklidi
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const nav = { onLine: true };
Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
const NET = { message: 'TypeError: Failed to fetch' };            // ağ hatası (kod yok)
const BIZ = (m) => ({ message: m, code: 'P0001' });               // sunucu iş kuralı hatası

let n = 0;
async function fresh() {                                           // her test için modülün temiz kopyası
  store.clear(); nav.onLine = true;
  return import(`../src/lib/offlineQueue.ts?t=${++n}`);
}
const calls = [];
const rpcWith = (fn) => { calls.length = 0; globalThis.__rpc = async (name, args) => { calls.push([name, args]); return fn(name, args); }; };
const stored = () => JSON.parse(store.get('yz_courier_queue_v1') || '[]');

test('bağlantı varken doğrudan gönderir, kuyruğa yazmaz', async () => {
  const q = await fresh(); rpcWith(() => ({ data: 'tamam', error: null }));
  const r = await q.runOrQueue('update_order_status', { id: 1 }, { label: 'teslim' });
  assert.deepEqual(r, { ok: true, queued: false, data: 'tamam' });
  assert.equal(calls.length, 1); assert.equal(stored().length, 0);
});

test('sunucu iş kuralı hatası: kuyruğa ALINMAZ, hata döner', async () => {
  const q = await fresh(); rpcWith(() => ({ data: null, error: BIZ('zaten teslim edilmiş') }));
  const r = await q.runOrQueue('update_order_status', { id: 1 }, { label: 'teslim' });
  assert.deepEqual(r, { ok: false, error: 'zaten teslim edilmiş' });
  assert.equal(stored().length, 0);
});

test('ağ hatası: kuyruğa alınır, bağlantı gelince gönderilir ve kuyruk boşalır', async () => {
  const q = await fresh(); rpcWith(() => ({ data: null, error: NET }));
  const r = await q.runOrQueue('courier_set_payment', { id: 7, m: 'cash' }, { label: 'ödeme', dedupeKey: 'pay:7' });
  assert.deepEqual(r, { ok: true, queued: true });
  assert.equal(stored().length, 1, 'tarayıcıda saklanmalı (sayfa kapansa da kaybolmasın)');
  rpcWith(() => ({ data: 1, error: null }));
  const f = await q.flushQueue();
  assert.equal(f.sent, 1); assert.equal(stored().length, 0);
});

test('çevrimdışıyken (navigator.onLine=false) sunucuya hiç istek atmaz', async () => {
  const q = await fresh(); rpcWith(() => ({ data: 1, error: null })); nav.onLine = false;
  const r = await q.runOrQueue('update_order_status', { id: 1 }, { label: 'yola çıktı' });
  assert.deepEqual(r, { ok: true, queued: true });
  assert.equal(calls.length, 0); assert.equal(stored().length, 1);
});

test('sıra bozulmaz: kuyrukta bekleyen varken yeni işlem de arkasına girer (önce ödeme, sonra teslim)', async () => {
  const q = await fresh(); rpcWith(() => ({ data: null, error: NET }));
  await q.runOrQueue('courier_set_payment', { id: 1 }, { label: 'ödeme' });
  await q.runOrQueue('update_order_status', { id: 1, s: 'delivered' }, { label: 'teslim' });
  assert.deepEqual(stored().map((o) => o.rpc), ['courier_set_payment', 'update_order_status']);
  const order = [];
  rpcWith((name) => { order.push(name); return { data: 1, error: null }; });
  const f = await q.flushQueue();
  assert.equal(f.sent, 2); assert.deepEqual(order, ['courier_set_payment', 'update_order_status']);
});

test('dedupeKey: bekleyen aynı anahtarlı işlem yenisiyle DEĞİŞİR (tek kayıt, en son veri)', async () => {
  const q = await fresh(); rpcWith(() => ({ data: null, error: NET }));
  await q.runOrQueue('courier_save_splits', { id: 5, list: [1] }, { label: 'böl', dedupeKey: 'splits:5' });
  await q.runOrQueue('courier_save_splits', { id: 5, list: [1, 2] }, { label: 'böl', dedupeKey: 'splits:5' });
  const s = stored(); assert.equal(s.length, 1); assert.deepEqual(s[0].args.list, [1, 2]);
});

test('flush: ağ hatasında durur, sırayı ve kalanları KORUR', async () => {
  const q = await fresh(); rpcWith(() => ({ data: null, error: NET }));
  await q.runOrQueue('a', {}, { label: 'A' }); await q.runOrQueue('b', {}, { label: 'B' });
  let i = 0; rpcWith(() => (i++ === 0 ? { data: 1, error: null } : { data: null, error: NET }));
  const f = await q.flushQueue();
  assert.equal(f.sent, 1); assert.deepEqual(stored().map((o) => o.rpc), ['b']);
});

test('flush: iş kuralı hatası olan işlem atılır ve bildirilir, sıradaki devam eder', async () => {
  const q = await fresh(); rpcWith(() => ({ data: null, error: NET }));
  await q.runOrQueue('bad', {}, { label: 'Kötü' }); await q.runOrQueue('good', {}, { label: 'İyi' });
  rpcWith((name) => (name === 'bad' ? { data: null, error: BIZ('geçersiz durum') } : { data: 1, error: null }));
  const f = await q.flushQueue();
  assert.equal(f.sent, 1); assert.equal(f.dropped.length, 1); assert.match(f.dropped[0], /Kötü.*geçersiz durum/);
  assert.equal(stored().length, 0);
});

test('oturum (jwt) hatası: işlem ATILMAZ, tekrar denenmek üzere kuyrukta kalır', async () => {
  const q = await fresh(); rpcWith(() => ({ data: null, error: NET }));
  await q.runOrQueue('x', {}, { label: 'X' });
  rpcWith(() => ({ data: null, error: { message: 'JWT expired', code: 'PGRST301' } }));
  const f = await q.flushQueue();
  assert.equal(f.sent, 0); assert.equal(f.dropped.length, 0); assert.equal(stored().length, 1); assert.equal(stored()[0].tries, 1);
});

test('isNetworkError: kodlu sunucu hatası ağ hatası sayılmaz', async () => {
  const q = await fresh();
  assert.equal(q.isNetworkError({ message: 'Failed to fetch' }), true);
  assert.equal(q.isNetworkError({ message: 'Failed to fetch', code: '23505' }), false);
  assert.equal(q.isNetworkError({ message: 'duplicate key', code: '23505' }), false);
});
