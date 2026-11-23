import test from 'node:test';
import assert from 'node:assert/strict';
import { mapStatus, mapPackage } from '../supabase/functions/_shared/trendyolOrders.ts';

// Trendyol Go belgesindeki "Model 1" örnek paketi (kısaltılmış, sayılar aynı)
const item = (n) => ({ packageItemId: String(n), lineItemId: n, isCancelled: false, coupon: null, promotions: [] });
const model1 = () => ({
  id: '4dc2e957', orderCode: '1E1', orderNumber: '1199521762', totalPrice: 602.7, callCenterPhone: '0212 365 34 03',
  deliveryType: 'STORE', packageStatus: 'Created', customerNote: 'Servis İstiyorum', totalDeliveryPrice: 15.99,
  customer: { firstName: 'Oms', lastName: 'M' },
  address: { address1: 'Gündoğdu Koleji Yanı', address2: 'İş Adresi', district: 'Kadıköy', addressDescription: 'Kadıköy - ISA2', phone: '5554443322', pinCode: '673985557', latitude: '36.98', longitude: '35.32' },
  userInformation: { appName: 'Trendyol' },
  lines: [
    { name: 'Big King Menü', unitSellingPrice: 145, price: 145, items: [item(1), item(2)], modifierProducts: [{ name: 'Big King' }, { name: 'Sprite' }], extraIngredients: [], removedIngredients: [] },
    { name: 'Çiğ Köfte Menü', unitSellingPrice: 75, price: 75, items: [item(3), item(4)], modifierProducts: [{ name: 'Ayran (küçük)' }], extraIngredients: [], removedIngredients: [] },
    { name: 'Tavuklu Salatalı Pilav', unitSellingPrice: 81.35, price: 81.35, items: [item(5), item(6)], modifierProducts: [], extraIngredients: [], removedIngredients: [] },
  ],
});

test('durum eşleme: bilinen tüm Trendyol durumları', () => {
  const exp = { Created: 'new', Picking: 'preparing', Invoiced: 'preparing', Shipped: 'on_the_way', Delivered: 'delivered', Cancelled: 'cancelled', UnSupplied: 'cancelled' };
  for (const [k, v] of Object.entries(exp)) assert.equal(mapStatus(k), v, k);
  assert.equal(mapStatus('delivered'), 'delivered');            // büyük/küçük harf
  assert.equal(mapStatus('AT_COLLECTION_POINT'), 'on_the_way'); // alt çizgili biçim
  assert.equal(mapStatus('BilinmeyenDurum'), undefined);        // bilinmeyen: eşlenmez (çağıran 'new' varsayar, sipariş kaybolmaz)
});

test('Model 1 paketi: adet = items sayısı, toplam belge ile birebir (602,70), PIN ve adres tarifi', () => {
  const m = mapPackage(model1());
  assert.equal(m.source, 'trendyol'); assert.equal(m.external_ref, '4dc2e957'); assert.equal(m.status, 'new');
  assert.deepEqual(m.items.map((i) => [i.name, i.quantity, i.unit_price]), [['Big King Menü', 2, 145], ['Çiğ Köfte Menü', 2, 75], ['Tavuklu Salatalı Pilav', 2, 81.35]]);
  assert.equal(m.subtotal, 602.7); assert.equal(m.total, 602.7); assert.equal(m.delivery_fee, 15.99); assert.equal(m.discount, 0);
  assert.equal(m.pin_code, '673985557'); assert.equal(m.address_description, 'Kadıköy - ISA2');
  assert.equal(m.delivery_address, 'Gündoğdu Koleji Yanı İş Adresi'); assert.equal(m.customer_name, 'Oms M');
  assert.equal(m.items[0].variant, 'Big King, Sprite'); assert.equal(m.platform_app, 'Trendyol');
});

test('kısmi iptal: iptal edilen kalem adetten düşer', () => {
  const p = model1(); p.lines[0].items[1].isCancelled = true;
  const m = mapPackage(p);
  assert.equal(m.items[0].quantity, 1);
  assert.ok(Math.abs(m.subtotal - 457.7) < 0.001);
});

test('indirim toplamdan düşülür, toplam asla eksiye düşmez', () => {
  const p = model1(); p.totalDiscount = 50;
  assert.equal(mapPackage(p).total, 552.7);
  p.totalDiscount = 9999; assert.equal(mapPackage(p).total, 0);
});

test('Model 2 (Trendyol kuryesi, maskeli adres): çökmez, müşteri adı/telefon dolu kalır', () => {
  const p = model1(); p.deliveryType = 'GO'; p.address = { address1: 'TGO Yemek', city: 'TGO Yemek', district: 'TGO Yemek', addressDescription: 'TGO Yemek', phone: '0212 365 34 03' };
  const m = mapPackage(p);
  assert.ok(m.customer_phone); assert.equal(m.items.length, 3); assert.equal(m.total, 602.7);
});

test('eksik/boş alanlar: sipariş yine de oluşturulabilir (kaybolmaz)', () => {
  const m = mapPackage({ id: 'abc', packageStatus: 'Created', lines: [{ name: 'X', price: 10 }] });
  assert.equal(m.external_ref, 'abc'); assert.equal(m.items[0].quantity, 1); assert.equal(m.customer_name, 'Trendyol Go Müşterisi');
  assert.equal(mapPackage({ id: 'z', packageStatus: 'Delivered', lines: [] }).status, 'delivered');
});
