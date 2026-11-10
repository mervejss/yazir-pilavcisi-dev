// Trendyol finans hesapları: komisyon, kesintiler, KDV, maliyet, net kâr.
// Kaynak: Trendyol "Cari Hesap Ekstresi" dokümanındaki işlem türü tabloları
// (https://developers.trendyol.com/docs/cari-hesap-ekstresi-entegrasyonu).
import { bizKey } from '@/lib/analyticsData';

// ---------------------------------------------------------------------------
// Ayarlar (maliyet + KDV) — finance_settings tablosunda saklanır
// ---------------------------------------------------------------------------
export interface FinSettings {
  foodCostPct: number;        // net ürün satışının yüzde kaçı ürün/hammadde maliyeti
  packagingPerOrder: number;  // sipariş başı ambalaj (₺)
  courierPerOrder: number;    // sipariş başı kendi kurye/dağıtım maliyeti (₺)
  otherCostPct: number;       // diğer değişken giderler (net satışın %'si: işçilik payı, enerji…)
  salesVatPct: number;        // satış KDV oranı (restoran hizmeti)
  commissionVatPct: number;   // komisyon / hizmet faturası KDV oranı
  costVatPct: number;         // maliyet girdilerinin KDV'si (0 = maliyetleri KDV'siz kabul et / indirimi yok say)
}
export const DEFAULT_FIN_SETTINGS: FinSettings = {
  foodCostPct: 35, packagingPerOrder: 0, courierPerOrder: 0, otherCostPct: 0,
  salesVatPct: 10, commissionVatPct: 20, costVatPct: 0,
};

// ---------------------------------------------------------------------------
// Veri satırları
// ---------------------------------------------------------------------------
export interface SettlementRow {
  id: string; transaction_date: string | null; transaction_type: string | null; transaction_label: string | null;
  description: string | null; barcode: string | null; order_number: string | null; shipment_package_id: string | null;
  order_date: string | null; debt: number; credit: number; commission_rate: number | null; commission_amount: number | null;
  seller_revenue: number | null; payment_order_id: number | null; payment_date: string | null;
}
export interface OtherRow {
  id: string; transaction_date: string | null; transaction_type: string | null; transaction_label: string | null;
  description: string | null; debt: number; credit: number; payment_order_id: number | null;
}
export interface PaymentOrderRow { id: number; status: string | null; amount: number | null; payout_date: string | null; payment_type: string | null }

export const SETTLEMENT_COLUMNS =
  'id,transaction_date,transaction_type,transaction_label,description,barcode,order_number,shipment_package_id,order_date,debt,credit,commission_rate,commission_amount,seller_revenue,payment_order_id,payment_date';
export const OTHER_COLUMNS = 'id,transaction_date,transaction_type,transaction_label,description,debt,credit,payment_order_id';

// ---------------------------------------------------------------------------
// İşlem türü tablosu
//  sr : satıcı hakedişine etkisi (+1 ekler, -1 düşer)      → dokümandaki "sellerRevenue" sütunu
//  cs : komisyon maliyetine etkisi (+1 maliyet artar, -1 komisyon iade edilir) → "commissionAmount" sütunu
// ---------------------------------------------------------------------------
export type Group = 'sale' | 'delivery' | 'return' | 'discount' | 'tyPromo' | 'provision' | 'adjust';
export interface TypeMeta { label: string; group: Group; sr: 1 | -1 | 0; cs: 1 | -1 | 0 }

export const TYPE_META: Record<string, TypeMeta> = {
  Sale: { label: 'Satış', group: 'sale', sr: 1, cs: 1 },
  PayByLink: { label: 'Pay by Link satış', group: 'sale', sr: 1, cs: 1 },
  DeliveryFee: { label: 'Teslimat ücreti', group: 'delivery', sr: 1, cs: 1 },
  DeliveryFeeCancel: { label: 'Teslimat ücreti iptali', group: 'delivery', sr: -1, cs: -1 },
  Return: { label: 'İade', group: 'return', sr: -1, cs: -1 },
  ManualRefund: { label: 'Kısmi iade', group: 'return', sr: -1, cs: -1 },
  ManualRefundCancel: { label: 'Kısmi iade iptali', group: 'return', sr: 1, cs: 1 },
  Discount: { label: 'Satıcı indirimi', group: 'discount', sr: -1, cs: -1 },
  DiscountCancel: { label: 'Satıcı indirimi iptali', group: 'discount', sr: 1, cs: 1 },
  Coupon: { label: 'Satıcı kuponu', group: 'discount', sr: -1, cs: -1 },
  CouponCancel: { label: 'Satıcı kuponu iptali', group: 'discount', sr: 1, cs: 1 },
  TyDiscount: { label: 'Trendyol indirimi (kurumsal fatura)', group: 'tyPromo', sr: -1, cs: -1 },
  TyDiscountCancel: { label: 'Trendyol indirimi iptali', group: 'tyPromo', sr: 1, cs: 1 },
  TyCoupon: { label: 'Trendyol kuponu (kurumsal fatura)', group: 'tyPromo', sr: -1, cs: -1 },
  TyCouponCancel: { label: 'Trendyol kuponu iptali', group: 'tyPromo', sr: 1, cs: 1 },
  ProvisionPositive: { label: 'Provizyon (+) gramaj farkı', group: 'provision', sr: 1, cs: 1 },
  ProvisionNegative: { label: 'Provizyon (−) gramaj farkı', group: 'provision', sr: -1, cs: -1 },
  SellerRevenuePositive: { label: 'Hakediş düzeltme (+)', group: 'adjust', sr: 1, cs: 0 },
  SellerRevenueNegative: { label: 'Hakediş düzeltme (−)', group: 'adjust', sr: -1, cs: 0 },
  SellerRevenuePositiveCancel: { label: 'Hakediş düzeltme (+) iptali', group: 'adjust', sr: -1, cs: 0 },
  SellerRevenueNegativeCancel: { label: 'Hakediş düzeltme (−) iptali', group: 'adjust', sr: 1, cs: 0 },
  CommissionPositive: { label: 'Komisyon düzeltme (+)', group: 'adjust', sr: 0, cs: -1 },
  CommissionNegative: { label: 'Komisyon düzeltme (−)', group: 'adjust', sr: 0, cs: 1 },
  CommissionPositiveCancel: { label: 'Komisyon düzeltme (+) iptali', group: 'adjust', sr: 0, cs: 1 },
  CommissionNegativeCancel: { label: 'Komisyon düzeltme (−) iptali', group: 'adjust', sr: 0, cs: -1 },
};

/** otherfinancials türleri: kesinti sayılanlar (borç − alacak) ve nakit hareketi olanlar */
export const OTHER_LABELS: Record<string, string> = {
  Stoppage: 'E-ticaret stopajı',
  PlatformServiceFee: 'Platform hizmet bedeli',
  DeductionInvoices: 'Trendyol hizmet faturaları',
  CommissionAgreementInvoice: 'Komisyon mutabakat faturası',
  ReturnInvoice: 'İade faturası (satıcıdan)',
  FinancialItem: 'Düzeltme kayıtları',
  PaymentOrder: 'Hakediş ödemesi',
  CashAdvance: 'Erken ödeme (avans)',
  WireTransfer: 'Virman',
  IncomingTransfer: 'Gelen havale',
};
const DEDUCTION_TYPES = ['Stoppage', 'PlatformServiceFee', 'DeductionInvoices', 'CommissionAgreementInvoice', 'ReturnInvoice', 'FinancialItem'];
export const GROUP_LABELS: Record<Group, string> = {
  sale: 'Müşteri satışı', delivery: 'Teslimat ücreti', return: 'İadeler', discount: 'Satıcı indirim / kupon',
  tyPromo: 'Trendyol promosyonu (ay sonu faturalanır)', provision: 'Provizyon (gramaj)', adjust: 'Düzeltmeler',
};

// ---------------------------------------------------------------------------
// Sonuç modeli
// ---------------------------------------------------------------------------
export interface OrderFin {
  key: string; orderNumber: string; pkg: string; date: number;
  sales: number; delivery: number; returns: number; discounts: number; other: number;
  commission: number; payout: number; cost: number; profit: number;
  returned: boolean; paymentOrderId: number | null; paymentDate: number | null;
}
export interface DayFin { key: string; sales: number; commission: number; payout: number; cost: number; profit: number; orders: number }
export interface TypeFin { type: string; label: string; count: number; credit: number; debt: number; commission: number; payout: number }
export interface RateFin { rate: number; lines: number; sales: number; commission: number }
export interface ProductFin { key: string; name: string; lines: number; sales: number; returns: number; discounts: number; commission: number; payout: number; commissionPct: number }
export interface UpcomingFin { key: string; ts: number; payout: number; orders: number }
export interface Deductions { stoppage: number; platformFee: number; invoices: number; agreement: number; other: number; total: number }

export interface FinResult {
  hasData: boolean;
  gross: Record<Group, number>;           // sınıf bazında brüt akış (satıcıya etkisi, işaretli)
  grossFlow: number;
  rawCommission: number;                  // net komisyon maliyeti (KDV dahil)
  avgCommissionPct: number;               // komisyon / (satış+teslimat)
  recon: number;                          // hakedişi tutturan fark (yuvarlama / türe özgü)
  payout: number;                         // Trendyol hakedişi (settlements toplamı)
  deductions: Deductions;
  cashAfter: number;                      // hesabıma geçecek (hakediş − kesintiler)
  orders: number;
  cost: { food: number; packaging: number; courier: number; other: number; total: number };
  vat: { sales: number; commission: number; fees: number; cost: number; payable: number };
  netProfit: number;                      // stopaj hariç (mahsup edilebilir) – maliyet düşülmüş
  netProfitExVat: number;                 // KDV'ye ayrılacak tutar da düşülmüş
  marginPct: number;
  byOrder: OrderFin[];
  byDay: DayFin[];
  byType: TypeFin[];
  otherByType: { type: string; label: string; count: number; debt: number; credit: number; net: number; kind: 'kesinti' | 'hareket' }[];
  // --- v44: ek analizler ---
  avgBasket: number;                      // ortalama sepet (satış / sipariş)
  refundedOrders: number; refundRate: number;
  commissionPerOrder: number; payoutPerOrder: number; profitPerOrder: number;
  paidPayout: number;                     // ödeme emri oluşmuş (Trendyol hesabına geçmiş / geçecek) hakediş
  pendingPayout: number;                  // henüz ödeme emri oluşmamış (vadesi bekleyen) hakediş
  byRate: RateFin[];
  byProduct: ProductFin[];
  upcoming: UpcomingFin[];                // vade tarihine göre bekleyen hakediş takvimi
  firstTx: number | null; lastTx: number | null;
}

const abs = (v: any) => Math.abs(Number(v) || 0);
const ts = (v: string | null | undefined) => (v ? Date.parse(v) : NaN);
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Bir satırın brüt tutarı (ledger): alacak ya da borç, hangisi doluysa */
const amountOf = (r: SettlementRow) => Math.max(abs(r.credit), abs(r.debt));

export function rowEffects(r: SettlementRow) {
  const m = TYPE_META[r.transaction_type || ''];
  if (!m) return null;
  const amt = amountOf(r);
  const rev = r.seller_revenue != null ? abs(r.seller_revenue) : amt;
  return {
    m,
    gross: m.sr * (amt || rev),                         // satıcıya brüt etki
    commission: m.cs * abs(r.commission_amount),        // + maliyet / − iade
    payout: m.sr * rev,                                 // hakedişe etki
  };
}

export function computeFinance(settlements: SettlementRow[], others: OtherRow[], s: FinSettings): FinResult {
  const gross: Record<Group, number> = { sale: 0, delivery: 0, return: 0, discount: 0, tyPromo: 0, provision: 0, adjust: 0 };
  let rawCommission = 0, payout = 0;
  const orderMap = new Map<string, OrderFin>();
  const dayMap = new Map<string, DayFin & { _orders: Set<string> }>();
  const typeMap = new Map<string, TypeFin>();
  const rateMap = new Map<number, RateFin>();
  const prodMap = new Map<string, ProductFin>();
  const upMap = new Map<string, UpcomingFin & { _o: Set<string> }>();
  let paidPayout = 0, pendingPayout = 0, firstTx = Infinity, lastTx = -Infinity;
  const ensureDay = (k: string) => {
    let d = dayMap.get(k);
    if (!d) { d = { key: k, sales: 0, commission: 0, payout: 0, cost: 0, profit: 0, orders: 0, _orders: new Set() }; dayMap.set(k, d); }
    return d;
  };

  for (const r of settlements) {
    const fx = rowEffects(r);
    const type = r.transaction_type || '?';
    const t = typeMap.get(type) || { type, label: TYPE_META[type]?.label || r.transaction_label || type, count: 0, credit: 0, debt: 0, commission: 0, payout: 0 };
    t.count++; t.credit += Number(r.credit) || 0; t.debt += Number(r.debt) || 0;
    if (!fx) { typeMap.set(type, t); continue; }
    t.commission += fx.commission; t.payout += fx.payout; typeMap.set(type, t);

    gross[fx.m.group] += fx.gross; rawCommission += fx.commission; payout += fx.payout;

    // v44: ek kırılımlar
    if (r.payment_order_id) paidPayout += fx.payout;
    else {
      pendingPayout += fx.payout;
      const pd = ts(r.payment_date);
      if (!Number.isNaN(pd)) {
        const k = new Date(pd + 3 * 3600e3).toISOString().slice(0, 10);
        const u = upMap.get(k) || { key: k, ts: pd, payout: 0, orders: 0, _o: new Set<string>() };
        u.payout += fx.payout; u._o.add(r.order_number || r.shipment_package_id || r.id); upMap.set(k, u);
      }
    }
    const wt = ts(r.transaction_date);
    if (!Number.isNaN(wt)) { firstTx = Math.min(firstTx, wt); lastTx = Math.max(lastTx, wt); }
    if (fx.m.group === 'sale' && r.commission_rate != null) {
      const rk = Math.round(Number(r.commission_rate) * 10) / 10;
      const re = rateMap.get(rk) || { rate: rk, lines: 0, sales: 0, commission: 0 };
      re.lines++; re.sales += fx.gross; re.commission += fx.commission; rateMap.set(rk, re);
    }
    if (['sale', 'return', 'discount'].includes(fx.m.group)) {
      const pk = (r.barcode || r.description || '—').trim() || '—';
      const pe = prodMap.get(pk) || { key: pk, name: pk, lines: 0, sales: 0, returns: 0, discounts: 0, commission: 0, payout: 0, commissionPct: 0 };
      if (fx.m.group === 'sale') { pe.lines++; pe.sales += fx.gross; } else if (fx.m.group === 'return') pe.returns += fx.gross; else pe.discounts += fx.gross;
      pe.commission += fx.commission; pe.payout += fx.payout; prodMap.set(pk, pe);
    }

    const when = ts(r.transaction_date);
    const day = Number.isNaN(when) ? null : ensureDay(bizKey(when));
    if (day) { day.commission += fx.commission; day.payout += fx.payout; if (fx.m.group === 'sale') day.sales += fx.gross; }

    const key = r.order_number || r.shipment_package_id || '—';
    let o = orderMap.get(key);
    if (!o) {
      o = {
        key, orderNumber: r.order_number || '—', pkg: r.shipment_package_id || '', date: ts(r.order_date) || when,
        sales: 0, delivery: 0, returns: 0, discounts: 0, other: 0, commission: 0, payout: 0, cost: 0, profit: 0,
        returned: false, paymentOrderId: r.payment_order_id, paymentDate: ts(r.payment_date) || null,
      };
      orderMap.set(key, o);
    }
    if (Number.isNaN(o.date)) o.date = when;
    if (fx.m.group === 'sale') o.sales += fx.gross;
    else if (fx.m.group === 'delivery') o.delivery += fx.gross;
    else if (fx.m.group === 'return') { o.returns += fx.gross; o.returned = true; }
    else if (fx.m.group === 'discount') o.discounts += fx.gross;
    else o.other += fx.gross;
    o.commission += fx.commission; o.payout += fx.payout;
    if (!o.paymentOrderId && r.payment_order_id) o.paymentOrderId = r.payment_order_id;
    if (day && fx.m.group === 'sale') day._orders.add(key);
  }

  const grossFlow = Object.values(gross).reduce((a, b) => a + b, 0);
  const recon = payout - (grossFlow - rawCommission);

  // --- maliyet (sipariş bazında) ---
  const perOrderCost = (o: { sales: number; returns: number; discounts: number }) => {
    const base = Math.max(o.sales + o.returns + o.discounts, 0);
    const alive = base > 0;
    return {
      food: (base * s.foodCostPct) / 100,
      other: (base * s.otherCostPct) / 100,
      packaging: alive ? s.packagingPerOrder : 0,
      courier: alive ? s.courierPerOrder : 0,
      alive,
    };
  };
  const cost = { food: 0, packaging: 0, courier: 0, other: 0, total: 0 };
  let orders = 0, refundedOrders = 0, saleOrders = 0;
  for (const o of orderMap.values()) {
    if (o.returned) refundedOrders++;
    if (o.sales > 0) saleOrders++;
    const c = perOrderCost(o);
    o.cost = c.food + c.other + c.packaging + c.courier;
    o.profit = o.payout - o.cost;
    if (c.alive) orders++;
    cost.food += c.food; cost.other += c.other; cost.packaging += c.packaging; cost.courier += c.courier;
  }
  cost.total = cost.food + cost.other + cost.packaging + cost.courier;

  // günlük maliyet: günün satış siparişleri üzerinden
  const byDay: DayFin[] = [...dayMap.values()].sort((a, b) => a.key.localeCompare(b.key)).map((d) => {
    let c = 0; let n = 0;
    d._orders.forEach((k) => { const o = orderMap.get(k); if (o) { const pc = perOrderCost(o); c += pc.food + pc.other + pc.packaging + pc.courier; if (pc.alive) n++; } });
    return { key: d.key, sales: d.sales, commission: d.commission, payout: d.payout, cost: c, profit: d.payout - c, orders: n };
  });

  // --- diğer finansal kayıtlar (kesintiler / nakit hareketleri) ---
  const ded: Deductions = { stoppage: 0, platformFee: 0, invoices: 0, agreement: 0, other: 0, total: 0 };
  const otherMap = new Map<string, { type: string; label: string; count: number; debt: number; credit: number; net: number; kind: 'kesinti' | 'hareket' }>();
  for (const o of others) {
    const type = o.transaction_type || '?';
    const debt = Number(o.debt) || 0, credit = Number(o.credit) || 0;
    const isDed = DEDUCTION_TYPES.includes(type);
    const e = otherMap.get(type) || { type, label: OTHER_LABELS[type] || o.transaction_label || type, count: 0, debt: 0, credit: 0, net: 0, kind: isDed ? 'kesinti' as const : 'hareket' as const };
    e.count++; e.debt += debt; e.credit += credit; e.net += isDed ? debt - credit : credit - debt;
    otherMap.set(type, e);
    if (!isDed) continue;
    const v = debt - credit;
    if (type === 'Stoppage') ded.stoppage += v;
    else if (type === 'PlatformServiceFee') ded.platformFee += v;
    else if (type === 'DeductionInvoices') ded.invoices += v;
    else if (type === 'CommissionAgreementInvoice') ded.agreement += v;
    else ded.other += v;
  }
  ded.total = ded.stoppage + ded.platformFee + ded.invoices + ded.agreement + ded.other;

  const cashAfter = payout - ded.total;
  // Stopaj yıl sonunda gelir/kurumlar vergisinden mahsup edilir → gider değil, nakit çıkışıdır.
  const netProfit = payout - (ded.total - ded.stoppage) - cost.total;

  // --- KDV (tahmini) ---
  const taxable = gross.sale + gross.delivery + gross.return + gross.discount;
  const vat = {
    sales: (taxable * s.salesVatPct) / (100 + s.salesVatPct),
    commission: (rawCommission * s.commissionVatPct) / (100 + s.commissionVatPct),
    fees: ((ded.platformFee + ded.invoices + ded.agreement) * s.commissionVatPct) / (100 + s.commissionVatPct),
    cost: s.costVatPct > 0 ? (cost.total * s.costVatPct) / (100 + s.costVatPct) : 0,
    payable: 0,
  };
  vat.payable = vat.sales - vat.commission - vat.fees - vat.cost;
  const netProfitExVat = netProfit - Math.max(vat.payable, 0);
  const revenueBase = gross.sale + gross.delivery + gross.return + gross.discount;

  const byType = [...typeMap.values()].sort((a, b) => b.count - a.count);
  const otherByType = [...otherMap.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

  return {
    hasData: settlements.length > 0 || others.length > 0,
    gross, grossFlow, rawCommission,
    avgCommissionPct: gross.sale + gross.delivery > 0 ? (rawCommission / (gross.sale + gross.delivery)) * 100 : 0,
    recon, payout, deductions: ded, cashAfter, orders, cost, vat, netProfit, netProfitExVat,
    marginPct: revenueBase > 0 ? (netProfit / revenueBase) * 100 : 0,
    byOrder: [...orderMap.values()].sort((a, b) => (b.date || 0) - (a.date || 0)),
    byDay, byType, otherByType,
    avgBasket: saleOrders > 0 ? gross.sale / saleOrders : 0,
    refundedOrders, refundRate: saleOrders > 0 ? (refundedOrders / saleOrders) * 100 : 0,
    commissionPerOrder: orders > 0 ? rawCommission / orders : 0,
    payoutPerOrder: orders > 0 ? payout / orders : 0,
    profitPerOrder: orders > 0 ? netProfit / orders : 0,
    paidPayout, pendingPayout,
    byRate: [...rateMap.values()].sort((a, b) => b.sales - a.sales),
    byProduct: [...prodMap.values()].map((p) => ({ ...p, commissionPct: p.sales > 0 ? (p.commission / p.sales) * 100 : 0 })).sort((a, b) => b.sales - a.sales),
    upcoming: [...upMap.values()].sort((a, b) => a.key.localeCompare(b.key)).map((u) => ({ key: u.key, ts: u.ts, payout: u.payout, orders: u._o.size })),
    firstTx: Number.isFinite(firstTx) ? firstTx : null, lastTx: Number.isFinite(lastTx) ? lastTx : null,
  };
}

// ---------------------------------------------------------------------------
// Ödeme emri mutabakatı: bizim hesapladığımız hakediş ↔ Trendyol'un yaptığı ödeme
// ---------------------------------------------------------------------------
export interface PaymentRecon {
  id: number; payoutDate: number | null; paid: number; calcPayout: number; calcDeductions: number; calc: number; diff: number; lines: number;
}
export function reconcilePayments(pos: PaymentOrderRow[], settlements: SettlementRow[], others: OtherRow[]): PaymentRecon[] {
  const pay = new Map<number, { payout: number; lines: number }>();
  for (const r of settlements) {
    if (r.payment_order_id == null) continue;
    const fx = rowEffects(r);
    if (!fx) continue;
    const e = pay.get(r.payment_order_id) || { payout: 0, lines: 0 };
    e.payout += fx.payout; e.lines++; pay.set(r.payment_order_id, e);
  }
  const ded = new Map<number, number>();
  for (const o of others) {
    if (o.payment_order_id == null || !DEDUCTION_TYPES.includes(o.transaction_type || '')) continue;
    ded.set(o.payment_order_id, (ded.get(o.payment_order_id) || 0) + (Number(o.debt) || 0) - (Number(o.credit) || 0));
  }
  return pos.map((p) => {
    const e = pay.get(p.id);
    const d = ded.get(p.id) || 0;
    const calc = (e?.payout || 0) - d;
    const paid = Number(p.amount) || 0;
    return { id: p.id, payoutDate: ts(p.payout_date) || null, paid, calcPayout: e?.payout || 0, calcDeductions: d, calc, diff: r2(paid - calc), lines: e?.lines || 0 };
  }).sort((a, b) => (b.payoutDate || 0) - (a.payoutDate || 0));
}

// ---------------------------------------------------------------------------
// Biçimleyiciler
// ---------------------------------------------------------------------------
export const money2 = (n: number) => `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
export const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
export const fmtDay = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Istanbul' }) : '—');
