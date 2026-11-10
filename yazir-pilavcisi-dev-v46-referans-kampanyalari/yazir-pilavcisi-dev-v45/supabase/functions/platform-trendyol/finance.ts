// Trendyol Muhasebe ve Finans (Cari Hesap Ekstresi) — settlements / otherfinancials / payment-order
// Doküman: https://developers.trendyol.com/docs/cari-hesap-ekstresi-entegrasyonu
//
// ÖNEMLİ: Bu servisler Trendyol Pazaryeri dokümanında (apigw.trendyol.com) yayınlanmıştır; Trendyol Go Yemek
// (api.tgoapis.com) kimlikleriyle çalışıp çalışmadığı belgelerde AÇIKÇA yazmıyor. Bu yüzden önce
// "finance_probe" çalıştırılır: HTTP durumunu ve Trendyol'un yanıtını olduğu gibi gösterir.
// Taban adres / satıcı kimliği integrations.config ile değiştirilebilir:
//   finance_base_url, finance_environment (prod|stage), finance_seller_id
import { msg } from '../_shared/common.ts';

const FIN_BASES: Record<string, string> = {
  prod: 'https://apigw.trendyol.com/integration/finance/che',
  stage: 'https://stageapigw.trendyol.com/integration/finance/che',
};

// Doküman: transactionType girilmesi ZORUNLU. Dönen "transactionType" Türkçe etiket olduğundan
// (örn. "Satış") hangi türü sorguladığımızı biz biliriz → tür başına ayrı istek atıp etiketini kendimiz yazarız.
export const SETTLEMENT_TYPES = [
  'Sale', 'Return', 'Discount', 'DiscountCancel', 'Coupon', 'CouponCancel',
  'ProvisionPositive', 'ProvisionNegative', 'ManualRefund', 'ManualRefundCancel',
  'TyDiscount', 'TyDiscountCancel', 'TyCoupon', 'TyCouponCancel',
  'SellerRevenuePositive', 'SellerRevenueNegative', 'CommissionPositive', 'CommissionNegative',
  'SellerRevenuePositiveCancel', 'SellerRevenueNegativeCancel', 'CommissionPositiveCancel', 'CommissionNegativeCancel',
  'DeliveryFee', 'DeliveryFeeCancel', 'PayByLink',
];
export const OTHER_TYPES = [
  'Stoppage', 'CashAdvance', 'WireTransfer', 'IncomingTransfer', 'ReturnInvoice',
  'CommissionAgreementInvoice', 'PaymentOrder', 'DeductionInvoices', 'FinancialItem',
];

const MAX_WINDOW_MS = 15 * 24 * 3600 * 1000;   // dokümana göre startDate–endDate en çok 15 gün
const PAGE_SIZE = 500;
const MAX_PAGES = 40;                           // tür başına güvenlik sınırı (20.000 kayıt)

export interface FinCtx { base: string; sellerId: string; headers: Record<string, string> }

export function makeFinCtx(cfg: any, auth: string, supplierId: string): FinCtx {
  const env = cfg.finance_environment === 'stage' ? 'stage' : 'prod';
  const base = String(cfg.finance_base_url || FIN_BASES[env]).replace(/\/+$/, '');
  const sellerId = String(cfg.finance_seller_id || supplierId).trim();
  if (!sellerId || sellerId === '000') throw new Error('Finans için satıcı kimliği (supplier_id / finance_seller_id) girilmemiş.');
  return {
    base, sellerId,
    headers: { Authorization: auth, 'User-Agent': `${sellerId} - SelfIntegration`, Accept: 'application/json' },
  };
}

class FinHttpError extends Error { status: number; body: string; url: string;
  constructor(status: number, body: string, url: string) { super(`Trendyol finans → HTTP ${status}: ${body.slice(0, 300)}`); this.status = status; this.body = body; this.url = url; } }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Geçici hatalarda (429 / 5xx / ağ) üstel bekleme ile yeniden dener. Kalıcı hata (4xx) hemen fırlatılır. */
async function finGet(ctx: FinCtx, path: string, params: Record<string, string | number | undefined>, retries = 4) {
  const qs = Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  const url = `${ctx.base}/sellers/${encodeURIComponent(ctx.sellerId)}/${path}${qs ? '?' + qs : ''}`;
  let last: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { method: 'GET', headers: ctx.headers });
      const text = await res.text();
      if (res.ok) {
        try { return text ? JSON.parse(text) : {}; } catch { throw new Error('Trendyol finans: JSON olmayan yanıt: ' + text.slice(0, 200)); }
      }
      const err = new FinHttpError(res.status, text, url);
      if (res.status !== 429 && res.status < 500) throw err;          // 400/401/403/404 → tekrar denemeye değmez
      last = err;
    } catch (e) {
      if (e instanceof FinHttpError && e.status !== 429 && e.status < 500) throw e;
      last = e;
    }
    if (attempt < retries) await sleep(700 * 2 ** attempt + Math.floor(Math.random() * 300));
  }
  throw last instanceof Error ? last : new Error(String(last));
}

const ms2iso = (v: any) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : new Date(Number(v)).toISOString());
const n = (v: any) => (v == null || v === '' ? null : Number(v));

async function pagedRows(ctx: FinCtx, path: string, params: Record<string, string | number | undefined>): Promise<any[]> {
  const out: any[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const d = await finGet(ctx, path, { ...params, page, size: PAGE_SIZE });
    const content: any[] = d?.content || [];
    out.push(...content);
    const total = Number(d?.totalPages ?? 1);
    if (page + 1 >= total || !content.length) break;
  }
  return out;
}

/** Küçük gruplar halinde paralel çalıştır (Trendyol hız sınırına saygı). */
async function inBatches<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  return out;
}

function mapSettlement(r: any, type: string) {
  return {
    id: String(r.id),
    platform: 'trendyol',
    transaction_date: ms2iso(r.transactionDate),
    transaction_type: type,
    transaction_label: r.transactionType ?? null,
    description: r.description ?? null,
    barcode: r.barcode ?? null,
    receipt_id: n(r.receiptId),
    order_number: r.orderNumber != null ? String(r.orderNumber) : null,
    shipment_package_id: r.shipmentPackageId != null ? String(r.shipmentPackageId) : null,
    order_date: ms2iso(r.orderDate),
    debt: n(r.debt) ?? 0,
    credit: n(r.credit) ?? 0,
    commission_rate: n(r.commissionRate),
    commission_amount: n(r.commissionAmount),
    seller_revenue: n(r.sellerRevenue),
    payment_period: n(r.paymentPeriod),
    payment_order_id: n(r.paymentOrderId),
    payment_date: ms2iso(r.paymentDate),
    commission_invoice_serial: r.commissionInvoiceSerialNumber ?? null,
    source: 'api',
    raw: r,
    synced_at: new Date().toISOString(),
  };
}
function mapOther(r: any, type: string) {
  return {
    id: String(r.id), platform: 'trendyol',
    transaction_date: ms2iso(r.transactionDate), transaction_type: type, transaction_label: r.transactionType ?? null,
    description: r.description ?? null, receipt_id: n(r.receiptId),
    debt: n(r.debt) ?? 0, credit: n(r.credit) ?? 0, payment_order_id: n(r.paymentOrderId),
    commission_invoice_serial: r.commissionInvoiceSerialNumber ?? null,
    source: 'api', raw: r, synced_at: new Date().toISOString(),
  };
}

async function upsert(db: any, table: string, rows: any[]) {
  const seen = new Set<string>();
  const uniq = rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  for (let i = 0; i < uniq.length; i += 400) {
    const { error } = await db.from(table).upsert(uniq.slice(i, i + 400), { onConflict: 'id' });
    if (error) throw new Error(`${table} yazılamadı: ${msg(error)}`);
  }
  return uniq.length;
}

type Scope = { startDate: number; endDate: number } | { paymentOrderId: number };
const scopeParams = (s: Scope): Record<string, number> =>
  'paymentOrderId' in s ? { paymentOrderId: s.paymentOrderId } : { startDate: s.startDate, endDate: s.endDate };

async function syncSettlements(ctx: FinCtx, db: any, scope: Scope) {
  const perType: Record<string, number> = {};
  const errors: string[] = [];
  const all: any[] = [];
  await inBatches(SETTLEMENT_TYPES, 3, async (t) => {
    try {
      const rows = await pagedRows(ctx, 'settlements', { transactionType: t, ...scopeParams(scope) });
      perType[t] = rows.length;
      all.push(...rows.map((r) => mapSettlement(r, t)));
    } catch (e) {
      // Kimlik/yol hatası (401/403/404) tüm türler için aynıdır → ilk hatada anlamlı mesajla dur
      if (e instanceof FinHttpError && [401, 403, 404].includes(e.status)) throw e;
      errors.push(`${t}: ${msg(e)}`);
    }
  });
  const saved = await upsert(db, 'finance_settlements', all);
  return { saved, per_type: perType, errors };
}

async function syncOther(ctx: FinCtx, db: any, scope: Scope) {
  const perType: Record<string, number> = {};
  const errors: string[] = [];
  const all: any[] = [];
  // Platform hizmet bedeli ayrı filtrelenir; aynı kaydı iki kez yazmamak için önce onu alırız
  const feeIds = new Set<string>();
  try {
    const fees = await pagedRows(ctx, 'otherfinancials', { transactionType: 'DeductionInvoices', transactionSubType: 'PlatformServiceFee', ...scopeParams(scope) });
    fees.forEach((r) => feeIds.add(String(r.id)));
    perType['PlatformServiceFee'] = fees.length;
    all.push(...fees.map((r) => mapOther(r, 'PlatformServiceFee')));
  } catch (e) {
    if (e instanceof FinHttpError && [401, 403, 404].includes(e.status)) throw e;
    errors.push(`PlatformServiceFee: ${msg(e)}`);
  }
  await inBatches(OTHER_TYPES, 2, async (t) => {
    try {
      const rows = await pagedRows(ctx, 'otherfinancials', { transactionType: t, ...scopeParams(scope) });
      const mine = t === 'DeductionInvoices' ? rows.filter((r) => !feeIds.has(String(r.id))) : rows;
      perType[t] = mine.length;
      all.push(...mine.map((r) => mapOther(r, t)));
    } catch (e) {
      if (e instanceof FinHttpError && [401, 403, 404].includes(e.status)) throw e;
      errors.push(`${t}: ${msg(e)}`);
    }
  });
  const saved = await upsert(db, 'finance_other', all);
  return { saved, per_type: perType, errors };
}

/**
 * Haftalık ödeme emirleri (PAID). Sayfa başına en çok 10 kayıt.
 * Trendyol bazen bu uçta HTTP 500 döndürür (satıcıya özgü / geçici). Bu durum ASLA senkronu bozmaz:
 *  1) farklı parametre kombinasyonları denenir, 2) hâlâ 500 ise ödeme emirleri otomatik olarak
 *  otherfinancials → "PaymentOrder" (Hakediş ödemesi) kayıtlarından TÜRETİLİR (aynı tutar, aynı numara).
 */
export async function financePaymentOrders(ctx: FinCtx, db: any, pages = 12) {
  const variants: Record<string, string | number | undefined>[] = [{ size: 10 }, {}, { page: 0 }];
  let rows: any[] = [];
  let apiError: string | null = null;
  for (const v of variants) {
    try {
      const got: any[] = [];
      for (let p = 0; p < pages; p++) {
        const d = await finGet(ctx, 'payment-order', { ...v, ...(v.size ? { page: p } : {}) }, 2);
        const content: any[] = Array.isArray(d) ? d : (d?.content || []);
        got.push(...content);
        if (Array.isArray(d) || !v.size || p + 1 >= Number(d?.totalPages ?? 1) || !content.length) break;
      }
      rows = got; apiError = null;
      break;
    } catch (e) {
      apiError = msg(e);
      if (e instanceof FinHttpError && [401, 403, 404].includes(e.status)) break;
    }
  }

  const mapped = rows.map((r) => ({
    id: Number(r.id), platform: 'trendyol', status: r.status ?? null, amount: n(r.amount),
    payout_date: ms2iso(r.payoutDate), payment_type: r.paymentType ?? null, raw: r, synced_at: new Date().toISOString(),
  })).filter((r) => Number.isFinite(r.id));
  const seen = new Set<number>();
  const uniq = mapped.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  if (uniq.length) {
    const { error } = await db.from('finance_payment_orders').upsert(uniq, { onConflict: 'id' });
    if (error) throw new Error('finance_payment_orders yazılamadı: ' + msg(error));
  }

  // Yedek: API cevap vermediyse (veya hiç kayıt dönmediyse) otherfinancials'tan türet — var olan gerçek kayıtlara dokunma
  let derived = 0;
  if (apiError || !uniq.length) {
    const { data: oth } = await db.from('finance_other').select('payment_order_id,debt,credit,transaction_date')
      .eq('transaction_type', 'PaymentOrder').not('payment_order_id', 'is', null).order('transaction_date', { ascending: false }).limit(200);
    const { data: have } = await db.from('finance_payment_orders').select('id').limit(1000);
    const haveIds = new Set<number>((have || []).map((x: any) => Number(x.id)));
    const agg = new Map<number, { amount: number; date: string | null }>();
    for (const o of oth || []) {
      const id = Number(o.payment_order_id);
      const e = agg.get(id) || { amount: 0, date: o.transaction_date };
      e.amount += (Number(o.debt) || 0) - (Number(o.credit) || 0);
      agg.set(id, e);
    }
    const add = [...agg.entries()].filter(([id]) => !haveIds.has(id)).map(([id, e]) => ({
      id, platform: 'trendyol', status: 'PAID', amount: Math.round(e.amount * 100) / 100, payout_date: e.date,
      payment_type: 'PAYMENT', raw: { derived: true, from: 'otherfinancials.PaymentOrder' }, synced_at: new Date().toISOString(),
    }));
    if (add.length) {
      const { error } = await db.from('finance_payment_orders').upsert(add, { onConflict: 'id' });
      if (error) throw new Error('finance_payment_orders (türetilen) yazılamadı: ' + msg(error));
    }
    derived = add.length;
  }
  return { saved: uniq.length, derived, source: apiError ? 'derived' : 'api', warning: apiError };
}

/** Son N ödeme emrinin tüm kayıtlarını (paymentOrderId ile) yeniden çeker → payment_order_id / ödeme tarihi sonradan dolar. */
export async function financeRefreshRecentPayments(ctx: FinCtx, db: any, count = 4) {
  const { data } = await db.from('finance_payment_orders').select('id').order('payout_date', { ascending: false }).limit(count);
  const out: Record<string, any> = {};
  for (const p of data || []) {
    try {
      const sc: Scope = { paymentOrderId: Number(p.id) };
      const a = await syncSettlements(ctx, db, sc);
      const b = await syncOther(ctx, db, sc);
      out[String(p.id)] = { settlements: a.saved, other: b.saved, errors: [...a.errors, ...b.errors] };
    } catch (e) {
      if (e instanceof FinHttpError && [401, 403, 404].includes(e.status)) throw e;
      out[String(p.id)] = { error: msg(e) };
    }
  }
  return out;
}

/**
 * Kargo faturası kalemleri (cari ekstredeki "Kargo Fatura" kayıtlarının id'si = invoiceSerialNumber).
 * Doküman: https://developers.trendyol.com/docs/kargo-faturas%C4%B1-detaylar%C4%B1
 */
export async function financeCargoInvoices(ctx: FinCtx, db: any, limit = 30) {
  const { data: inv } = await db.from('finance_other').select('id,transaction_label,transaction_date,debt,credit,description')
    .or('transaction_label.ilike.%kargo%,description.ilike.%kargo%').order('transaction_date', { ascending: false }).limit(limit);
  const { data: done } = await db.from('finance_cargo_items').select('invoice_serial').limit(5000);
  const doneSet = new Set<string>((done || []).map((x: any) => String(x.invoice_serial)));
  let saved = 0; const errors: string[] = []; let invoices = 0;
  for (const i of inv || []) {
    const serial = String(i.id);
    if (doneSet.has(serial)) continue;
    try {
      const rows: any[] = [];
      for (let page = 0; page < 20; page++) {
        const d = await finGet(ctx, `cargo-invoice/${encodeURIComponent(serial)}/items`, { page, size: 500 }, 2);
        const content: any[] = d?.content || [];
        rows.push(...content);
        if (page + 1 >= Number(d?.totalPages ?? 1) || !content.length) break;
      }
      const mapped = rows.map((r, idx) => ({
        id: `${serial}:${r.parcelUniqueId ?? idx}:${r.shipmentPackageType ?? ''}`.slice(0, 200),
        invoice_serial: serial, invoice_date: i.transaction_date, parcel_id: r.parcelUniqueId != null ? String(r.parcelUniqueId) : null,
        order_number: r.orderNumber != null ? String(r.orderNumber) : null, package_type: r.shipmentPackageType ?? null,
        amount: n(r.amount) ?? 0, desi: n(r.desi), raw: r, synced_at: new Date().toISOString(),
      }));
      if (mapped.length) saved += await upsert(db, 'finance_cargo_items', mapped);
      invoices++;
    } catch (e) {
      if (e instanceof FinHttpError && [401, 403].includes(e.status)) throw e;
      errors.push(`${serial}: ${msg(e)}`);
    }
  }
  return { invoices, saved, errors };
}

/**
 * Senkron: { from, to } (ms, en çok 15 gün) VEYA { payment_order_id }.
 * kinds: ['settlements','other','payment_orders'] (varsayılan hepsi)
 */
export async function financeSync(ctx: FinCtx, db: any, body: any) {
  const kinds: string[] = Array.isArray(body.kinds) && body.kinds.length ? body.kinds : ['settlements', 'other', 'payment_orders'];
  let scope: Scope | null = null;
  if (body.payment_order_id) scope = { paymentOrderId: Number(body.payment_order_id) };
  else if (body.from && body.to) {
    const from = Number(body.from), to = Number(body.to);
    if (!(to > from)) throw new Error('Bitiş tarihi başlangıçtan sonra olmalı.');
    if (to - from > MAX_WINDOW_MS) throw new Error('Trendyol: startDate–endDate en çok 15 gün olabilir.');
    scope = { startDate: from, endDate: to };
  }
  const out: any = { kinds };
  if (scope && kinds.includes('settlements')) out.settlements = await syncSettlements(ctx, db, scope);
  if (scope && kinds.includes('other')) out.other = await syncOther(ctx, db, scope);
  // Ödeme emirleri / kargo / son ödemelerin yenilenmesi ASLA tüm senkronu düşürmez (Trendyol payment-order bazen 500 verir)
  if (kinds.includes('payment_orders')) {
    try { out.payment_orders = await financePaymentOrders(ctx, db); } catch (e) { out.payment_orders = { error: msg(e) }; }
  }
  if (kinds.includes('recent_payments')) {
    try { out.recent_payments = await financeRefreshRecentPayments(ctx, db, Number(body.recent_count) || 4); } catch (e) { out.recent_payments = { error: msg(e) }; }
  }
  if (kinds.includes('cargo')) {
    try { out.cargo = await financeCargoInvoices(ctx, db); } catch (e) { out.cargo = { error: msg(e) }; }
  }
  return out;
}

/**
 * GÜNLÜK OTOMATİK ÇEKİM (cron): son 14 gün (Trendyol kayıtları teslimden sonra oluştuğu için geriye dönük yenilenir),
 * ödeme emirleri, son 4 ödemenin tüm kayıtları ve kargo faturaları. Tekrar çalıştırmak güvenlidir (upsert).
 * part: 'settlements' | 'other' | 'rest'  → her biri ayrı cron ile çağrılır (Edge Function süre sınırı için).
 */
export async function financeDaily(ctx: FinCtx, db: any, part: string) {
  const to = Date.now() + 3600 * 1000;
  const from = to - 14 * 24 * 3600 * 1000;
  if (part === 'settlements') return { settlements: await syncSettlements(ctx, db, { startDate: from, endDate: to }) };
  if (part === 'other') return { other: await syncOther(ctx, db, { startDate: from, endDate: to }) };
  const out: any = {};
  try { out.payment_orders = await financePaymentOrders(ctx, db); } catch (e) { out.payment_orders = { error: msg(e) }; }
  try { out.recent_payments = await financeRefreshRecentPayments(ctx, db, 4); } catch (e) { out.recent_payments = { error: msg(e) }; }
  try { out.cargo = await financeCargoInvoices(ctx, db); } catch (e) { out.cargo = { error: msg(e) }; }
  return out;
}

/** Bağlantı denemesi: hata fırlatmaz, ham HTTP sonucunu döndürür (kullanıcı neyin yanlış olduğunu görsün). */
export async function financeProbe(ctx: FinCtx) {
  const to = Date.now(), from = to - 7 * 24 * 3600 * 1000;
  const tryOne = async (label: string, path: string, params: Record<string, string | number>) => {
    try {
      const d = await finGet(ctx, path, params);
      return { label, ok: true, status: 200, total: d?.totalElements ?? null, sample: (d?.content || []).slice(0, 1) };
    } catch (e) {
      if (e instanceof FinHttpError) return { label, ok: false, status: e.status, body: e.body.slice(0, 400), url: e.url };
      return { label, ok: false, status: 0, body: msg(e) };
    }
  };
  const checks = [
    await tryOne('settlements (Sale, son 7 gün)', 'settlements', { transactionType: 'Sale', startDate: from, endDate: to, page: 0, size: 1 }),
    await tryOne('otherfinancials (PaymentOrder, son 7 gün)', 'otherfinancials', { transactionType: 'PaymentOrder', startDate: from, endDate: to, page: 0, size: 1 }),
    await tryOne('payment-order', 'payment-order', { page: 0, size: 10 }),
  ];
  const works = checks.slice(0, 2).some((c) => c.ok);   // payment-order 500 verse bile ana servisler çalışıyorsa bağlantı sağlamdır
  return {
    works, base: ctx.base, seller_id: ctx.sellerId, checks,
    hint: works ? (checks[2]?.ok ? 'Finans servisleri bu kimliklerle çalışıyor.' : 'settlements / otherfinancials çalışıyor. payment-order Trendyol tarafında hata veriyor (HTTP ' + (checks[2] as any)?.status + ') — ödeme emirleri otomatik olarak otherfinancials kayıtlarından türetilir, veri kaybı olmaz.')
      : 'Finans servisleri bu kimliklerle yanıt vermedi (401/403 = yetki, 404 = yol/satıcı kimliği). Trendyol Go anahtarları Pazaryeri finans servisini kapsamıyor olabilir: Trendyol entegrasyon destek ile teyit edin ya da panelden indirdiğiniz cari hesap ekstresini "Dosyadan içe aktar" ile yükleyin.',
  };
}
