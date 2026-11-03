// Trendyol Go (Uber Eats geçişi dahil) — Yemek entegrasyonu
// Dağıtım:  supabase functions deploy platform-trendyol
// Gizliler: supabase secrets set TRENDYOL_API_KEY=... TRENDYOL_API_SECRET=... CRON_SECRET=...
//
// ÖNEMLİ: Aşağıdaki ENDPOINTS haritası, TGO geliştirici dokümanındaki uç nokta yollarına göre
// canlıya almadan önce DOĞRULANMALIDIR. Yollar tek yerde toplandığı için düzeltmek tek satırdır;
// ayrıca integrations.config.endpoints ile ezilebilir.
import { adminClient, authorize, CORS, json, logEvent, msg, touchPlatform } from '../_shared/common.ts';

const PLATFORM = 'trendyol';
const BASES: Record<string, string> = {
  prod: 'https://api.tgoapis.com',
  stage: 'https://stageapi.tgoapis.com',
};

type Ctx = { supplierId: string; storeId: string; base: string; auth: string; ua: string; ep: Record<string, string>; cfg: any };

// {s}=supplierId  {st}=storeId  {p}=packageId  {id}=ürün/kategori id
const ENDPOINTS: Record<string, string> = {
  packages:        'GET  /integrator/order/meal/suppliers/{s}/stores/{st}/packages',
  accept:          'PUT  /integrator/order/meal/suppliers/{s}/packages/{p}/accepted',
  prepared:        'PUT  /integrator/order/meal/suppliers/{s}/packages/{p}/prepared',
  shipped:         'PUT  /integrator/order/meal/suppliers/{s}/packages/{p}/shipped',
  delivered:       'PUT  /integrator/order/meal/suppliers/{s}/packages/{p}/delivered',
  cancel:          'PUT  /integrator/order/meal/suppliers/{s}/packages/{p}/cancelled',
  invoiced:        'POST /integrator/order/meal/suppliers/{s}/packages/{p}/invoiced',
  restaurant_info: 'GET  /integrator/restaurant/meal/suppliers/{s}/stores/{st}',
  working_hours:   'PUT  /integrator/restaurant/meal/suppliers/{s}/stores/{st}/working-hours',
  working_status:  'PUT  /integrator/restaurant/meal/suppliers/{s}/stores/{st}/status',
  delivery_time:   'PUT  /integrator/restaurant/meal/suppliers/{s}/stores/{st}/delivery-time',
  menus:           'GET  /integrator/product/meal/suppliers/{s}/stores/{st}/menus',
  product_status:  'PUT  /integrator/product/meal/suppliers/{s}/stores/{st}/products/{id}/status',
  product_price:   'PUT  /integrator/product/meal/suppliers/{s}/stores/{st}/products/{id}/price',
  category_status: 'PUT  /integrator/product/meal/suppliers/{s}/stores/{st}/categories/{id}/status',
  reviews:         'GET  /integrator/review/meal/suppliers/{s}/stores/{st}/reviews',
};

// Platform durumu → bizim durum
const STATUS_MAP: Record<string, string> = {
  Created: 'new', Received: 'new', Picking: 'preparing', Accepted: 'preparing', Invoiced: 'preparing',
  Prepared: 'ready', Shipped: 'on_the_way', Delivered: 'delivered', Cancelled: 'cancelled', UnSupplied: 'cancelled',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const az = await authorize(req);
  if (!az.ok) return json({ ok: false, error: az.reason }, 401);

  const db = adminClient();
  let body: any = {};
  try { body = await req.json(); } catch { /* boş gövde */ }
  const action: string = body.action || 'status';

  try {
    const { data: row } = await db.from('integrations').select('*').eq('platform', PLATFORM).single();
    const cfg = (row as any)?.config || {};

    if (action === 'status') return json({ ok: true, ...(await statusInfo(cfg, row)) });

    if (!(row as any)?.is_enabled && az.via === 'cron') return json({ ok: true, skipped: 'Entegrasyon kapalı' });

    const ctx = makeCtx(cfg);
    const t0 = Date.now();
    let result: any;

    switch (action) {
      case 'test_connection': result = await testConnection(ctx, db); break;
      case 'sync_orders':     result = await syncOrders(ctx, db); break;
      case 'order_status':    result = await pushOrderStatus(ctx, db, body); break;
      case 'push_invoice':    result = await pushInvoice(ctx, body); break;
      case 'restaurant_info': result = await call(ctx, 'restaurant_info'); break;
      case 'set_working_status': result = await call(ctx, 'working_status', {}, { status: body.open ? 'OPEN' : 'CLOSED' }); break;
      case 'set_delivery_time':  result = await call(ctx, 'delivery_time', {}, { minTime: body.min, maxTime: body.max }); break;
      case 'push_working_hours': result = await pushWorkingHours(ctx, db); break;
      case 'sync_menu':       result = await syncMenu(ctx, db); break;
      case 'product_availability': result = await call(ctx, 'product_status', { id: body.external_id }, { status: body.available ? 'AVAILABLE' : 'UNAVAILABLE' }); break;
      case 'product_price':   result = await call(ctx, 'product_price', { id: body.external_id }, { price: Number(body.price) }); break;
      case 'reviews':         result = await reviews(ctx); break;
      default: return json({ ok: false, error: 'Bilinmeyen işlem: ' + action }, 400);
    }

    await logEvent(db, PLATFORM, action === 'sync_orders' ? 'in' : 'out', action, { ms: Date.now() - t0, payload: summarize(result) });
    if (action !== 'reviews') await touchPlatform(db, PLATFORM, true);
    return json({ ok: true, result });
  } catch (e) {
    // Hata YALNIZCA bu platformun kaydına yazılır.
    const m = msg(e);
    await logEvent(db, PLATFORM, 'out', action, { error: m });
    await touchPlatform(db, PLATFORM, false, m);
    return json({ ok: false, error: m }, 200);
  }
});

// ---------------------------------------------------------------------
function makeCtx(cfg: any): Ctx {
  const key = Deno.env.get('TRENDYOL_API_KEY');
  const secret = Deno.env.get('TRENDYOL_API_SECRET');
  if (!key || !secret) throw new Error('TRENDYOL_API_KEY / TRENDYOL_API_SECRET henüz tanımlanmamış (Edge Function secrets).');
  const supplierId = String(cfg.supplier_id || '').trim();
  const storeId = String(cfg.store_id || '').trim();
  if (!supplierId || supplierId === '000' || !storeId || storeId === '000') {
    throw new Error('Satıcı (supplier) ve mağaza (store) kimlikleri henüz girilmemiş (şu an "000").');
  }
  return {
    supplierId, storeId, cfg,
    base: BASES[cfg.environment === 'prod' ? 'prod' : 'stage'],
    auth: 'Basic ' + btoa(`${key}:${secret}`),
    ua: `${supplierId} - SelfIntegration`,
    ep: { ...ENDPOINTS, ...(cfg.endpoints || {}) },
  };
}

async function call(ctx: Ctx, name: string, vars: Record<string, string> = {}, payload?: unknown, query = '') {
  const spec = ctx.ep[name];
  if (!spec) throw new Error('Uç nokta tanımsız: ' + name);
  const [method, rawPath] = spec.trim().split(/\s+/);
  const path = rawPath
    .replace('{s}', encodeURIComponent(ctx.supplierId)).replace('{st}', encodeURIComponent(ctx.storeId))
    .replace('{p}', encodeURIComponent(vars.p || '')).replace('{id}', encodeURIComponent(vars.id || ''));
  const res = await fetch(ctx.base + path + query, {
    method,
    headers: { Authorization: ctx.auth, 'User-Agent': ctx.ua, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: payload !== undefined && method !== 'GET' ? JSON.stringify(payload) : undefined,
  });
  const text = await res.text();
  let data: any = text;
  try { data = text ? JSON.parse(text) : {}; } catch { /* düz metin */ }
  if (!res.ok) {
    const e: any = new Error(`TGO ${name} → HTTP ${res.status}: ${typeof data === 'string' ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300)}`);
    e.status = res.status; e.data = data;
    throw e;
  }
  return data;
}

async function statusInfo(cfg: any, row: any) {
  const k = !!Deno.env.get('TRENDYOL_API_KEY'), s = !!Deno.env.get('TRENDYOL_API_SECRET');
  return {
    secrets_set: k && s,
    ids_set: !!cfg.supplier_id && cfg.supplier_id !== '000' && !!cfg.store_id && cfg.store_id !== '000',
    cron_secret_set: !!Deno.env.get('CRON_SECRET'),
    environment: cfg.environment === 'prod' ? 'prod' : 'stage',
    status: row?.status,
  };
}

async function testConnection(ctx: Ctx, _db: any) {
  const info = await call(ctx, 'restaurant_info');
  return { reachable: true, restaurant: info };
}

// ---------------------------------------------------------------------
// Siparişler (Uber Eats geçişi alanları dahil)
// ---------------------------------------------------------------------
function mapPackage(pkg: any) {
  const a = pkg.address || {};
  const c = pkg.customer || {};
  const lines: any[] = pkg.lines || pkg.items || [];
  // Maskeli alanlar ("TGO Yemek") ve açık adres: address1 serbest metindir — AYRIŞTIRMAYIZ, olduğu gibi saklarız.
  const address = [a.address1, a.address2].filter(Boolean).join(' ').trim();
  const phone = a.phone || c.phone || pkg.callCenterPhone || null;
  const totalPrice = Number(pkg.totalPrice ?? pkg.totalPriceAfterDiscount ?? 0);
  const discount = Number(pkg.totalDiscount ?? 0);
  const fee = Number(pkg.deliveryFee ?? pkg.packagingFee ?? 0);
  const ref = String(pkg.id ?? pkg.packageId ?? pkg.orderNumber ?? '');
  return {
    source: PLATFORM,
    external_ref: ref,
    status: STATUS_MAP[pkg.packageStatus || pkg.status] || 'new',
    customer_name: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.name || 'Trendyol Go Müşterisi',
    customer_phone: phone,
    delivery_address: address || null,
    district: a.district || a.neighborhood || null,
    lat: a.latitude ?? null, lng: a.longitude ?? null,
    note: pkg.customerNote || pkg.note || null,
    subtotal: Math.max(totalPrice + discount - fee, 0), delivery_fee: fee, discount, total: totalPrice,
    // IVR / çağrı merkezi: PIN (Uber 8 hane, TGO 11 hane sipariş no), dinamik hat, 5 karakterli sipariş kodu
    pin_code: a.pinCode ? String(a.pinCode) : (pkg.orderNumber ? String(pkg.orderNumber) : null),
    order_code: pkg.orderCode ? String(pkg.orderCode) : null,
    call_center_phone: pkg.callCenterPhone || a.phone || null,
    platform_app: pkg.userInformation?.appName || null,
    platform_status: pkg.packageStatus || pkg.status || null,
    // kupon alanı boş gelir (promotions kullanılır) — ham veri saklanır
    payload: pkg,
    items: lines.map((l) => ({
      name: l.name || l.productName, variant: (l.modifierProducts || l.options || []).map((m: any) => m.name).filter(Boolean).join(', ') || null,
      unit_price: Number(l.price ?? l.unitPrice ?? 0), quantity: Number(l.quantity ?? 1), note: l.note || null,
    })),
  };
}

async function syncOrders(ctx: Ctx, db: any) {
  const statuses = 'Created,Picking,Invoiced,Shipped';
  const data = await call(ctx, 'packages', {}, undefined, `?packageStatuses=${statuses}&size=50`);
  const list: any[] = data?.content || data?.packages || (Array.isArray(data) ? data : []);
  let created = 0, updated = 0, failed = 0;
  for (const pkg of list) {
    try {
      const { data: r, error } = await db.rpc('platform_ingest_order', { p: mapPackage(pkg) });
      if (error) throw error;
      if (r?.created) {
        created++;
        if (ctx.cfg.auto_accept && (pkg.packageStatus || pkg.status) === 'Created') {
          try { await call(ctx, 'accept', { p: String(pkg.id) }, {}); } catch (e) { await logEvent(db, PLATFORM, 'out', 'auto_accept', { ref: String(pkg.id), error: msg(e) }); }
        }
      } else updated++;
    } catch (e) {
      failed++;
      await logEvent(db, PLATFORM, 'in', 'ingest', { ref: String(pkg?.id ?? ''), error: msg(e), payload: pkg });
    }
  }
  await db.from('integrations').update({ last_sync_at: new Date().toISOString(), last_order_sync_at: new Date().toISOString() }).eq('platform', PLATFORM);
  return { fetched: list.length, created, updated, failed };
}

// Bizim durum değişikliğimiz → TGO'ya bildirim. Başarısızlık siparişi bozmaz, yalnızca loglanır.
async function pushOrderStatus(ctx: Ctx, db: any, body: any) {
  const { data: o } = await db.from('orders').select('id,external_ref,platform_status,source,cancel_reason').eq('id', body.order_id).single();
  if (!o || o.source !== PLATFORM || !o.external_ref) throw new Error('Bu sipariş Trendyol Go siparişi değil');
  const p = o.external_ref;
  switch (body.status) {
    case 'preparing': {
      const r = await call(ctx, 'accept', { p }, {});
      return { sent: 'accepted', r };
    }
    case 'ready': return { sent: 'prepared', r: await call(ctx, 'prepared', { p }, {}) };
    case 'assigned': case 'on_the_way': return { sent: 'shipped', r: await call(ctx, 'shipped', { p }, {}) };
    case 'delivered': return { sent: 'delivered', r: await call(ctx, 'delivered', { p }, {}) };
    case 'cancelled': return { sent: 'cancelled', r: await call(ctx, 'cancel', { p }, { reasonId: body.reason_id ?? 0, description: o.cancel_reason || body.note || 'İşletme iptali' }) };
    default: return { sent: null };
  }
}

// ---------------------------------------------------------------------
// Restoran: çalışma saatleri (kendi opening_hours → TGO)
// ---------------------------------------------------------------------
async function pushWorkingHours(ctx: Ctx, db: any) {
  const { data: hrs } = await db.from('opening_hours').select('*').order('day_of_week');
  const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
  const payload = {
    workingHours: (hrs || []).map((h: any) => ({
      dayOfWeek: days[(Number(h.day_of_week) + 6) % 7] ?? days[0],
      openingTime: String(h.open_time).slice(0, 5), closingTime: String(h.close_time).slice(0, 5), isClosed: !!h.is_closed,
    })),
  };
  return await call(ctx, 'working_hours', {}, payload);
}

// ---------------------------------------------------------------------
// Menü: platform menüsünü çek → ürün eşleştirme tablosuna yaz (ad eşleşmesi); kendi menü durumunu it
// ---------------------------------------------------------------------
async function syncMenu(ctx: Ctx, db: any) {
  const data = await call(ctx, 'menus');
  const products: any[] = [];
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.id && n.name && (n.price !== undefined || n.salePrice !== undefined)) products.push(n);
    for (const v of Object.values(n)) if (typeof v === 'object') walk(v);
  };
  walk(data);
  const { data: mine } = await db.from('products').select('id,name');
  const norm = (s: string) => (s || '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
  const byName = new Map<string, string>((mine || []).map((p: any) => [norm(p.name), p.id]));
  let matched = 0;
  for (const p of products) {
    const pid = byName.get(norm(p.name));
    if (!pid) continue;
    const { error } = await db.from('product_platform_mappings').upsert(
      { product_id: pid, platform: PLATFORM, external_id: String(p.id), external_name: p.name, last_synced_at: new Date().toISOString() },
      { onConflict: 'platform,external_id' });
    if (!error) matched++;
  }
  await db.from('integrations').update({ last_menu_sync_at: new Date().toISOString() }).eq('platform', PLATFORM);
  return { platform_products: products.length, matched, unmatched: products.length - matched };
}

// ---------------------------------------------------------------------
// Yorumlar: Uber'den geçen mağazalarda 403 (endpoint.not-available.error) döner → ÇÖKME YOK, "desteklenmiyor" olarak bildir
// ---------------------------------------------------------------------
async function reviews(ctx: Ctx) {
  try {
    return { supported: true, data: await call(ctx, 'reviews') };
  } catch (e: any) {
    const code = JSON.stringify(e?.data || '');
    if (e?.status === 403 || code.includes('endpoint.not-available')) {
      return { supported: false, reason: 'Bu mağaza için yorum uç noktası kullanılamıyor (Uber Eats geçişi).' };
    }
    throw e;
  }
}

function summarize(r: any) {
  if (!r || typeof r !== 'object') return r;
  const { r: _x, restaurant: _y, data: _z, ...rest } = r;
  return rest;
}

// Uber geçişi: sipariş otomatik "Invoiced" olabilir; /invoiced tekrarı HATA sayılmaz.
async function pushInvoice(ctx: Ctx, body: any) {
  try {
    return await call(ctx, 'invoiced', { p: body.package_id }, body.payload || {});
  } catch (e: any) {
    if ([400, 409, 422].includes(e?.status)) return { already_invoiced: true, note: msg(e) };
    throw e;
  }
}
