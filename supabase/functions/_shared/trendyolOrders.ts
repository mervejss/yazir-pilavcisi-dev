// Trendyol sipariş paketi → bizim sipariş modeli. platform-trendyol kullanır.
const PLATFORM = 'trendyol';

// Platform durumu → bizim durum
export const STATUS_MAP: Record<string, string> = {
  Created: 'new', Received: 'new', Awaiting: 'new', Picking: 'preparing', Accepted: 'preparing', Invoiced: 'preparing',
  Prepared: 'ready', Shipped: 'on_the_way', AtCollectionPoint: 'on_the_way', Delivered: 'delivered',
  Cancelled: 'cancelled', Canceled: 'cancelled', UnSupplied: 'cancelled', UnDelivered: 'cancelled', Returned: 'cancelled',
};
// Büyük/küçük harf ve alt çizgiden bağımsız eşleşir: "AT_COLLECTION_POINT" = "AtCollectionPoint" (Marketplace webhook biçimi)
const squash = (x: string) => String(x || '').toLowerCase().replace(/[_\s-]/g, '');
const STATUS_MAP_LC: Record<string, string> = Object.fromEntries(Object.entries(STATUS_MAP).map(([k, v]) => [squash(k), v]));
export const mapStatus = (st: string): string | undefined => STATUS_MAP[st] ?? STATUS_MAP_LC[squash(st)];


export function mapPackage(pkg: any) {
  const a = pkg.address || {};
  const c = pkg.customer || {};
  const lines: any[] = pkg.lines || pkg.items || [];
  // Maskeli alanlar ("TGO Yemek") ve açık adres: address1 serbest metindir — AYRIŞTIRMAYIZ, olduğu gibi saklarız.
  const address = [a.address1, a.address2].filter(Boolean).join(' ').trim();
  const phone = a.phone || c.phone || pkg.callCenterPhone || null;
  // GERÇEK YAPI (doğrulandı): her "line" birden fazla "items" (adet) içerir; fiyat = unitSellingPrice (seçenekler dahil, birim).
  const qtyOf = (l: any) => Array.isArray(l.items) && l.items.length ? l.items.filter((i: any) => !i.isCancelled).length : Number(l.quantity ?? 1);
  const unitOf = (l: any) => Number(l.unitSellingPrice ?? l.price ?? l.unitPrice ?? 0);
  const gross = lines.reduce((t, l) => t + unitOf(l) * qtyOf(l), 0);
  const gTotal = Number(pkg.totalPrice ?? 0);
  // İndirim: satıcının karşıladığı promosyonlar. DOĞRULAYIN: totalPrice indirimden ÖNCE brüt tutar gibi görünüyor.
  const discount = Number(pkg.totalDiscount ?? 0) || (pkg.promotions || []).reduce((t: number, x: any) => t + Number(x.totalSellerAmount || 0), 0);
  const fee = Number(pkg.totalDeliveryPrice ?? pkg.deliveryFee ?? pkg.packagingFee ?? 0);
  const totalPrice = Math.max(gTotal - discount, 0);
  const ref = String(pkg.id ?? pkg.packageId ?? pkg.orderNumber ?? '');
  const nm = (x: any) => (typeof x === 'string' ? x : x?.name);
  return {
    source: PLATFORM,
    external_ref: ref,
    status: mapStatus(pkg.packageStatus || pkg.status) || 'new',
    customer_name: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.name || 'Trendyol Go Müşterisi',
    customer_phone: phone,
    delivery_address: address || null,
    // Trendyol "addressDescription" (adres tarifi, ör. "Kadıköy - ISA2") — ayrı alanda saklanır
    address_description: a.addressDescription ? String(a.addressDescription).trim() || null : null,
    district: a.district || a.neighborhood || null,
    lat: a.latitude ?? null, lng: a.longitude ?? null,
    note: pkg.customerNote || pkg.note || null,
    subtotal: gross || gTotal, delivery_fee: fee, discount, total: totalPrice,
    // IVR / çağrı merkezi: PIN (Uber 8 hane, TGO 11 hane sipariş no), dinamik hat, 5 karakterli sipariş kodu
    pin_code: a.pinCode ? String(a.pinCode) : (pkg.orderNumber ? String(pkg.orderNumber) : null),
    order_code: pkg.orderCode ? String(pkg.orderCode) : null,
    call_center_phone: pkg.callCenterPhone || a.phone || null,
    platform_app: pkg.userInformation?.appName || null,
    platform_status: pkg.packageStatus || pkg.status || null,
    // kupon alanı boş gelir (promotions kullanılır) — ham veri saklanır
    payload: pkg,
    items: lines.map((l) => ({
      name: l.name || l.productName,
      variant: [
        ...(l.modifierProducts || l.options || []).map(nm),
        ...(l.extraIngredients || []).map((x: any) => '+' + nm(x)),
        ...(l.removedIngredients || []).map((x: any) => '-' + nm(x)),
      ].filter(Boolean).join(', ') || null,
      unit_price: unitOf(l), quantity: Math.max(qtyOf(l), 1), note: l.note || null,
    })),
  };
}
