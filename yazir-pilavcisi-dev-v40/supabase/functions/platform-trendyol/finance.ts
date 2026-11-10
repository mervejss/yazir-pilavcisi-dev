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

async function finGet(ctx: FinCtx, path: string, params: Record<string, string | number | undefined>) {
  const qs = Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  const url = `${ctx.base}/sellers/${encodeURIComponent(ctx.sellerId)}/${path}${qs ? '?' + qs : ''}`;
  const res = await fetch(url, { method: 'GET', headers: ctx.headers });
  const text = await res.text();
  if (!res.ok) throw new FinHttpError(res.status, text, url);
  try { return text ? JSON.parse(text) : {}; } catch { throw new Error('Trendyol finans: JSON olmayan yanıt: ' + text.slice(0, 200)); }
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
  await inBatches(SETTLEMENT_TYPES, 4, async (t) => {
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
  await inBatches(OTHER_TYPES, 3, async (t) => {
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

/** Haftalık ödeme emirleri (PAID). Sayfa başına en çok 10 kayıt. */
export async function financePaymentOrders(ctx: FinCtx, db: any, pages = 12) {
  const rows: any[] = [];
  for (let p = 0; p < pages; p++) {
    const d = await finGet(ctx, 'payment-order', { page: p, size: 10 });
    const content: any[] = d?.content || [];
    rows.push(...content);
    if (p + 1 >= Number(d?.totalPages ?? 1) || !content.length) break;
  }
  const mapped = rows.map((r) => ({
    id: Number(r.id), platform: 'trendyol', status: r.status ?? null, amount: n(r.amount),
    payout_date: ms2iso(r.payoutDate), payment_type: r.paymentType ?? null, raw: r, synced_at: new Date().toISOString(),
  }));
  const seen = new Set<number>();
  const uniq = mapped.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  if (uniq.length) {
    const { error } = await db.from('finance_payment_orders').upsert(uniq, { onConflict: 'id' });
    if (error) throw new Error('finance_payment_orders yazılamadı: ' + msg(error));
  }
  return { saved: uniq.length };
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
  if (kinds.includes('payment_orders')) out.payment_orders = await financePaymentOrders(ctx, db);
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
    await tryOne('payment-order', 'payment-order', { page: 0, size: 1 }),
  ];
  const works = checks.some((c) => c.ok);
  return {
    works, base: ctx.base, seller_id: ctx.sellerId, checks,
    hint: works ? 'Finans servisleri bu kimliklerle çalışıyor.'
      : 'Finans servisleri bu kimliklerle yanıt vermedi (401/403 = yetki, 404 = yol/satıcı kimliği). Trendyol Go anahtarları Pazaryeri finans servisini kapsamıyor olabilir: Trendyol entegrasyon destek ile teyit edin ya da panelden indirdiğiniz cari hesap ekstresini "Dosyadan içe aktar" ile yükleyin.',
  };
}
