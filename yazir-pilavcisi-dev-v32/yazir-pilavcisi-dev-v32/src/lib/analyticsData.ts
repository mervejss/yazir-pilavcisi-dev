/**
 * Analiz modülü — veri katmanı
 * -------------------------------------------------------------
 *  • Canlı siparişler (orders) + Excel'den aktarılan geçmiş siparişler (past_import_orders_v) tek modelde birleşir.
 *  • Tüm zaman hesapları cihaz saatinden BAĞIMSIZ: İstanbul saati (UTC+3) ve iş günü başlangıcı 03:00.
 *    (03:00 İstanbul = 00:00 UTC olduğundan iş günü anahtarı = UTC takvim günüdür; sabitler yine de açıkça tutulur.)
 *  • Saf fonksiyonlar (analyze, seriesBy, buildTrend…) UI'dan bağımsızdır; dışa aktarma da bunları kullanır.
 */
import { supabase } from '@/lib/supabase';
import { PAYMENT_METHOD_LABELS, SOURCE_LABELS, ORDER_TYPE_LABELS } from '@/lib/constants';

// ---------------------------------------------------------------------------
// Zaman yardımcıları (İstanbul + 03:00 iş günü)
// ---------------------------------------------------------------------------
export const IST_OFFSET_H = 3;
export const DAY_START_H = 3;
const HOUR = 3600e3;
const DAY = 24 * HOUR;
const SHIFT_MS = (IST_OFFSET_H - DAY_START_H) * HOUR;

export const WD_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
export const WD_LONG = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

/** Saat dilimleri iş günü sırasıyla: 03,04,…,23,00,01,02 */
export const HOURS_ORDER: number[] = Array.from({ length: 24 }, (_, i) => (i + DAY_START_H) % 24);

export const pad2 = (n: number) => String(n).padStart(2, '0');
export const hh = (h: number) => `${pad2(h)}:00`;

export function istHour(ts: number): number {
  return new Date(ts + IST_OFFSET_H * HOUR).getUTCHours();
}
/** 0..23 — iş günü sırasındaki saat dilimi indeksi */
export function hourSlot(ts: number): number {
  return (istHour(ts) - DAY_START_H + 24) % 24;
}
/** İş günü anahtarı (YYYY-MM-DD). 00:00–02:59 arası siparişler bir önceki iş gününe yazılır. */
export function bizKey(ts: number): string {
  return new Date(ts + SHIFT_MS).toISOString().slice(0, 10);
}
export function dayStartMs(key: string): number {
  return Date.parse(key + 'T00:00:00Z') - SHIFT_MS;
}
export function addDaysKey(key: string, n: number): string {
  const d = new Date(key + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function weekdayOfKey(key: string): number {
  return (new Date(key + 'T00:00:00Z').getUTCDay() + 6) % 7; // 0 = Pazartesi
}
export function diffDaysKey(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY);
}
export function shortKey(key: string): string {
  return `${key.slice(8, 10)}.${key.slice(5, 7)}`;
}
export function longKey(key: string): string {
  return `${key.slice(8, 10)}.${key.slice(5, 7)}.${key.slice(0, 4)} ${WD_SHORT[weekdayOfKey(key)]}`;
}
export function istWallString(ms: number): string {
  return new Date(ms + IST_OFFSET_H * HOUR).toISOString().slice(0, 19).replace('T', ' ');
}
export function fmtDateTimeIst(ms: number): string {
  const s = new Date(ms + IST_OFFSET_H * HOUR).toISOString();
  return `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)} ${s.slice(11, 16)}`;
}

// ---------------------------------------------------------------------------
// Tarih aralığı
// ---------------------------------------------------------------------------
export type Preset = 'today' | 'yesterday' | '7' | '14' | '30' | 'month' | 'lastmonth' | '90' | '365' | 'custom';

export const PRESETS: { key: Preset; label: string }[] = [
  { key: 'today', label: 'Bugün' },
  { key: 'yesterday', label: 'Dün' },
  { key: '7', label: '7 gün' },
  { key: '14', label: '14 gün' },
  { key: '30', label: '30 gün' },
  { key: 'month', label: 'Bu ay' },
  { key: 'lastmonth', label: 'Geçen ay' },
  { key: '90', label: '3 ay' },
  { key: '365', label: '12 ay' },
  { key: 'custom', label: 'Özel aralık' },
];

export interface DateRange {
  preset: Preset;
  fromKey: string;
  toKey: string; // dahil
  from: number;
  to: number; // hariç
  prevFrom: number;
  prevTo: number;
  prevFromKey: string;
  prevToKey: string;
  days: number;
  label: string;
}

export function todayKey(): string {
  return bizKey(Date.now());
}

export function resolveDateRange(preset: Preset, customFrom?: string, customTo?: string): DateRange {
  const today = todayKey();
  let fromKey = today;
  let toKey = today;
  if (preset === 'yesterday') {
    fromKey = toKey = addDaysKey(today, -1);
  } else if (['7', '14', '30', '90', '365'].includes(preset)) {
    fromKey = addDaysKey(today, -(Number(preset) - 1));
  } else if (preset === 'month') {
    fromKey = today.slice(0, 8) + '01';
  } else if (preset === 'lastmonth') {
    const first = today.slice(0, 8) + '01';
    toKey = addDaysKey(first, -1);
    fromKey = toKey.slice(0, 8) + '01';
  } else if (preset === 'custom') {
    fromKey = customFrom || addDaysKey(today, -29);
    toKey = customTo || today;
    if (fromKey > toKey) [fromKey, toKey] = [toKey, fromKey];
    if (diffDaysKey(fromKey, toKey) > 800) fromKey = addDaysKey(toKey, -800);
  }
  const days = diffDaysKey(fromKey, toKey) + 1;
  const from = dayStartMs(fromKey);
  const to = dayStartMs(addDaysKey(toKey, 1));
  const len = to - from;
  const prevFrom = from - len;
  const label = days === 1 ? longKey(fromKey) : `${longKey(fromKey)} → ${longKey(toKey)}`;
  return {
    preset, fromKey, toKey, from, to, prevFrom, prevTo: from, days, label,
    prevFromKey: bizKey(prevFrom), prevToKey: bizKey(from - 1),
  };
}

export function dayKeysBetween(fromMs: number, toMs: number): string[] {
  const out: string[] = [];
  let k = bizKey(fromMs);
  const end = bizKey(toMs - 1);
  let guard = 0;
  while (k <= end && guard++ < 1000) {
    out.push(k);
    k = addDaysKey(k, 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------
export interface AItem { name: string; qty: number; price: number; total: number }

export interface AOrder {
  id: string;
  no: string;
  live: boolean;
  platform: string;
  status: 'delivered' | 'cancelled';
  ts: number;
  total: number;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  payment: string;
  district: string;
  orderType: string;
  customerKey: string | null;
  customerName: string;
  customerPhone: string;
  courierId: string | null;
  tableNo: number | null;
  acceptedAt: number | null;
  readyAt: number | null;
  pickedUpAt: number | null;
  deliveredAt: number | null;
  items: AItem[];
}

export const OWN_CHANNELS = ['web', 'phone', 'table', 'counter'];
export const EXTERNAL_PLATFORMS = ['trendyol', 'yemeksepeti', 'getir', 'migros'];
export const PLATFORM_KEYS = ['web', 'phone', 'table', 'counter', 'trendyol', 'yemeksepeti', 'getir', 'migros'];

/** Koyu temada da görünen grafik renkleri */
export const PLATFORM_COLORS: Record<string, string> = {
  web: '#d4af37', phone: '#0ea5e9', table: '#14b8a6', counter: '#a16207',
  trendyol: '#f27a1a', yemeksepeti: '#fa0050', getir: '#7c4dff', migros: '#2e9e45', other: '#6b7280',
};
export const platformLabel = (k: string) => SOURCE_LABELS[k] || k;
export const platformColor = (k: string) => PLATFORM_COLORS[k] || '#6b7280';
export const isExternal = (k: string) => EXTERNAL_PLATFORMS.includes(k) || k === 'other';

const normPlatform = (raw: string): string => {
  const s = (raw || '').toLocaleLowerCase('tr').trim();
  if (!s) return 'other';
  if (s.includes('trendyol')) return 'trendyol';
  if (s.includes('yemeksepeti') || s.includes('yemek sepeti')) return 'yemeksepeti';
  if (s.includes('getir')) return 'getir';
  if (s.includes('migros')) return 'migros';
  if (PLATFORM_KEYS.includes(s)) return s;
  return s;
};

export function paymentLabel(raw: string | null | undefined): string {
  const s = (raw || '').trim();
  if (!s) return 'Belirtilmemiş';
  return PAYMENT_METHOD_LABELS[s] || s;
}
export const isCashPayment = (label: string) => /nakit/i.test(label);

// ---------------------------------------------------------------------------
// Veri çekme
// ---------------------------------------------------------------------------
async function pageAll<T>(build: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: any }>, maxPages = 80): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  for (let p = 0; p < maxPages; p++) {
    const { data, error } = await build(p * 1000, p * 1000 + 999);
    if (error) return { rows, error: error.message || String(error) };
    if (!data) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return { rows, error: null };
}

const LIVE_SELECT_FULL =
  'id, order_no, source, order_type, status, created_at, accepted_at, ready_at, picked_up_at, delivered_at, total, subtotal, delivery_fee, discount, payment_method, district, customer_id, customer_name, customer_phone, courier_id, table_id, pin_code, external_payload, dining_tables(number), order_items(product_name, quantity, unit_price)';
const LIVE_SELECT_SAFE =
  'id, order_no, source, order_type, status, created_at, accepted_at, ready_at, picked_up_at, delivered_at, total, subtotal, delivery_fee, discount, payment_method, district, customer_id, customer_name, customer_phone, courier_id, table_id, pin_code, external_payload, order_items(product_name, quantity, unit_price)';

const num = (v: any) => Number(v) || 0;
const msOrNull = (v: any) => (v ? Date.parse(v) : null);

export interface FetchResult {
  orders: AOrder[];
  warnings: string[];
  liveCount: number;
  importedCount: number;
  catalog: Map<string, string>;
}

export async function fetchOrders(fromMs: number, toMs: number): Promise<FetchResult> {
  const warnings: string[] = [];
  const fromIso = new Date(fromMs).toISOString();
  const toIso = new Date(toMs).toISOString();

  const liveQuery = (sel: string) => pageAll<any>((a, b) =>
    supabase.from('orders').select(sel)
      .in('status', ['delivered', 'cancelled'])
      .gte('created_at', fromIso).lt('created_at', toIso)
      .order('created_at', { ascending: true }).range(a, b));

  let live = await liveQuery(LIVE_SELECT_FULL);
  if (live.error) live = await liveQuery(LIVE_SELECT_SAFE);
  if (live.error) warnings.push('Canlı siparişler okunamadı: ' + live.error);

  const imp = await pageAll<any>((a, b) =>
    supabase.from('past_import_orders_v').select('*')
      .gte('ordered_at', istWallString(fromMs)).lt('ordered_at', istWallString(toMs))
      .order('ordered_at', { ascending: true }).range(a, b));
  if (imp.error && !/does not exist|schema cache/i.test(imp.error)) warnings.push('Geçmiş (Excel) siparişler okunamadı: ' + imp.error);

  // Ürün → kategori eşlemesi (kategori analizi için)
  const catalog = new Map<string, string>();
  try {
    const [pr, ct] = await Promise.all([
      supabase.from('products').select('name, category_id'),
      supabase.from('categories').select('id, name'),
    ]);
    const cats = new Map<string, string>((ct.data || []).map((c: any) => [c.id, c.name]));
    (pr.data || []).forEach((p: any) => catalog.set(String(p.name).toLocaleLowerCase('tr').trim(), cats.get(p.category_id) || 'Kategorisiz'));
  } catch { /* kategori olmadan da çalışır */ }

  const knownNos = new Set<string>();
  const liveOrders: AOrder[] = live.rows.map((o: any) => {
    if (o.pin_code) knownNos.add(String(o.pin_code));
    if (o.external_payload?.orderNumber) knownNos.add(String(o.external_payload.orderNumber));
    if (o.order_no != null) knownNos.add(String(o.order_no));
    const items: AItem[] = (o.order_items || []).map((i: any) => {
      const qty = num(i.quantity) || 1, price = num(i.unit_price);
      return { name: String(i.product_name || 'Ürün'), qty, price, total: qty * price };
    });
    const phone = String(o.customer_phone || '').replace(/\D/g, '');
    const key = o.customer_id ? String(o.customer_id) : phone.length >= 10 ? 'tel:' + phone.slice(-10) : null;
    const tableNo = o.dining_tables?.number ?? (Array.isArray(o.dining_tables) ? o.dining_tables[0]?.number : null);
    return {
      id: String(o.id), no: String(o.order_no ?? ''), live: true,
      platform: normPlatform(o.source || 'web'),
      status: o.status === 'cancelled' ? 'cancelled' : 'delivered',
      ts: Date.parse(o.created_at),
      total: num(o.total), subtotal: num(o.subtotal), deliveryFee: num(o.delivery_fee), discount: num(o.discount),
      payment: paymentLabel(o.payment_method),
      district: (o.district || '').trim() || 'Belirtilmemiş',
      orderType: o.order_type || '',
      customerKey: key, customerName: o.customer_name || '', customerPhone: o.customer_phone || '',
      courierId: o.courier_id || null,
      tableNo: tableNo != null ? Number(tableNo) : null,
      acceptedAt: msOrNull(o.accepted_at), readyAt: msOrNull(o.ready_at),
      pickedUpAt: msOrNull(o.picked_up_at), deliveredAt: msOrNull(o.delivered_at),
      items,
    };
  });

  const stateOf = (t: string): 'delivered' | 'cancelled' => {
    const s = (t || '').toLocaleLowerCase('tr');
    return s.includes('iptal') || s.includes('cancel') || s.includes('unsupplied') ? 'cancelled' : 'delivered';
  };
  const parseWall = (s: string) => {
    const t = String(s);
    return /[zZ]|[+-]\d\d:?\d\d$/.test(t) ? Date.parse(t) : Date.parse(t.replace(' ', 'T') + '+03:00');
  };

  const importedOrders: AOrder[] = imp.rows
    .filter((o: any) => !knownNos.has(String(o.order_no)))
    .map((o: any) => {
      const items: AItem[] = (o.items || []).map((i: any) => {
        const qty = num(i.qty) || 1, price = num(i.unit_price);
        return { name: String(i.name || 'Ürün'), qty, price, total: i.line_total != null ? num(i.line_total) : qty * price };
      });
      return {
        id: `imp-${o.platform}-${o.order_no}`, no: String(o.order_no ?? ''), live: false,
        platform: normPlatform(o.platform || 'other'),
        status: stateOf(o.status),
        ts: parseWall(o.ordered_at),
        total: num(o.total), subtotal: num(o.total), deliveryFee: 0, discount: 0,
        payment: paymentLabel(o.payment_method),
        district: (o.district || '').trim() || 'Belirtilmemiş',
        orderType: '',
        customerKey: null, customerName: '', customerPhone: '',
        courierId: null, tableNo: null,
        acceptedAt: null, readyAt: null, pickedUpAt: null, deliveredAt: o.delivered_at ? parseWall(o.delivered_at) : null,
        items,
      } as AOrder;
    })
    .filter((o) => Number.isFinite(o.ts));

  const orders = [...liveOrders, ...importedOrders].sort((a, b) => a.ts - b.ts);
  return { orders, warnings, liveCount: liveOrders.length, importedCount: importedOrders.length, catalog };
}

// ---------------------------------------------------------------------------
// Ayarlar (tarayıcıda saklanır)
// ---------------------------------------------------------------------------
export interface AnalyticsSettings {
  commission: Record<string, number>;
  foodCostPct: number;
  slaMin: number;
  compare: boolean;
}
export const DEFAULT_SETTINGS: AnalyticsSettings = {
  commission: { trendyol: 20, yemeksepeti: 22, getir: 22, migros: 20, other: 20 },
  foodCostPct: 35,
  slaMin: 45,
  compare: true,
};
const SETTINGS_KEY = 'yp.analytics.settings.v2';
export function loadSettings(): AnalyticsSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const p = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...p, commission: { ...DEFAULT_SETTINGS.commission, ...(p.commission || {}) } };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
export function saveSettings(s: AnalyticsSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* yok say */ }
}

// ---------------------------------------------------------------------------
// Toplama yardımcıları
// ---------------------------------------------------------------------------
export const isValid = (o: AOrder) => o.status === 'delivered';
const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const minutes = (a: number | null, b: number | null) => (a != null && b != null && b >= a ? (b - a) / 60000 : null);
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

export interface Totals {
  orders: number; delivered: number; cancelled: number; revenue: number; avgBasket: number;
  cancelRate: number; itemsQty: number; deliveryFees: number; discounts: number; customers: number;
}
export function totalsOf(list: AOrder[]): Totals {
  const valid = list.filter(isValid);
  const revenue = sum(valid.map((o) => o.total));
  const cust = new Set(valid.map((o) => o.customerKey).filter(Boolean) as string[]);
  return {
    orders: list.length, delivered: valid.length, cancelled: list.length - valid.length, revenue,
    avgBasket: valid.length ? revenue / valid.length : 0,
    cancelRate: list.length ? ((list.length - valid.length) / list.length) * 100 : 0,
    itemsQty: sum(valid.flatMap((o) => o.items.map((i) => i.qty))),
    deliveryFees: sum(valid.map((o) => o.deliveryFee)),
    discounts: sum(valid.map((o) => o.discount)),
    customers: cust.size,
  };
}

export type Gran = 'hour' | 'day' | 'week' | 'month';
export const GRAN_LABELS: Record<Gran, string> = { hour: 'Saatlik', day: 'Günlük', week: 'Haftalık', month: 'Aylık' };
export function autoGran(days: number): Gran {
  return days <= 1 ? 'hour' : days <= 62 ? 'day' : days <= 240 ? 'week' : 'month';
}

function bucketKeyOf(ts: number, gran: Gran): string {
  if (gran === 'hour') return String(hourSlot(ts));
  const k = bizKey(ts);
  if (gran === 'day') return k;
  if (gran === 'week') return addDaysKey(k, -weekdayOfKey(k));
  return k.slice(0, 7);
}
function bucketLabel(key: string, gran: Gran): { short: string; long: string } {
  if (gran === 'hour') { const h = HOURS_ORDER[Number(key)]; return { short: pad2(h), long: `${hh(h)} – ${hh((h + 1) % 24)}` }; }
  if (gran === 'day') return { short: shortKey(key), long: longKey(key) };
  if (gran === 'week') return { short: shortKey(key), long: `${shortKey(key)} haftası` };
  const m = Number(key.slice(5, 7)) - 1;
  return { short: `${MONTHS_SHORT[m]} ${key.slice(2, 4)}`, long: `${MONTHS_SHORT[m]} ${key.slice(0, 4)}` };
}
function bucketKeysBetween(fromMs: number, toMs: number, gran: Gran): string[] {
  if (gran === 'hour') return Array.from({ length: 24 }, (_, i) => String(i));
  const keys: string[] = [];
  const seen = new Set<string>();
  dayKeysBetween(fromMs, toMs).forEach((d) => {
    const k = gran === 'day' ? d : gran === 'week' ? addDaysKey(d, -weekdayOfKey(d)) : d.slice(0, 7);
    if (!seen.has(k)) { seen.add(k); keys.push(k); }
  });
  return keys;
}

export interface TrendData {
  gran: Gran;
  labels: string[];
  longLabels: string[];
  prevLongLabels: string[];
  orders: number[]; revenue: number[]; cancelled: number[];
  prevOrders: number[]; prevRevenue: number[];
}

export function buildTrend(cur: AOrder[], prev: AOrder[], r: DateRange, gran: Gran): TrendData {
  const mk = (list: AOrder[], from: number, to: number) => {
    const keys = bucketKeysBetween(from, to, gran);
    const idx = new Map(keys.map((k, i) => [k, i]));
    const o = keys.map(() => 0), rev = keys.map(() => 0), c = keys.map(() => 0);
    list.forEach((x) => {
      const i = idx.get(bucketKeyOf(x.ts, gran));
      if (i == null) return;
      if (isValid(x)) { o[i]++; rev[i] += x.total; } else c[i]++;
    });
    return { keys, o, rev, c };
  };
  const a = mk(cur, r.from, r.to);
  const b = mk(prev, r.prevFrom, r.prevTo);
  const fit = (arr: number[]) => a.keys.map((_, i) => arr[i] ?? 0);
  return {
    gran,
    labels: a.keys.map((k) => bucketLabel(k, gran).short),
    longLabels: a.keys.map((k) => bucketLabel(k, gran).long),
    prevLongLabels: a.keys.map((_, i) => (b.keys[i] != null ? bucketLabel(b.keys[i], gran).long : '—')),
    orders: a.o, revenue: a.rev, cancelled: a.c,
    prevOrders: fit(b.o), prevRevenue: fit(b.rev),
  };
}

/** Gruplara (platform, ürün, kurye…) göre zaman serisi */
export function seriesBy(
  list: AOrder[], r: DateRange, gran: Gran,
  groupOf: (o: AOrder) => string | null,
  metric: (o: AOrder) => number = () => 1,
): { labels: string[]; longLabels: string[]; groups: Record<string, number[]> } {
  const keys = bucketKeysBetween(r.from, r.to, gran);
  const idx = new Map(keys.map((k, i) => [k, i]));
  const groups: Record<string, number[]> = {};
  list.forEach((o) => {
    const g = groupOf(o);
    if (g == null) return;
    const i = idx.get(bucketKeyOf(o.ts, gran));
    if (i == null) return;
    (groups[g] ||= keys.map(() => 0))[i] += metric(o);
  });
  return { labels: keys.map((k) => bucketLabel(k, gran).short), longLabels: keys.map((k) => bucketLabel(k, gran).long), groups };
}

// ---------------------------------------------------------------------------
// Ana analiz
// ---------------------------------------------------------------------------
export interface HourStat { slot: number; hour: number; orders: number; revenue: number; cancelled: number }
export interface WeekdayStat { wd: number; label: string; orders: number; revenue: number; occurrences: number; avgOrders: number; avgRevenue: number }
export interface DayStat { key: string; orders: number; revenue: number; cancelled: number; wd: number }
export interface PlatformStat {
  key: string; label: string; color: string; external: boolean;
  orders: number; delivered: number; cancelled: number; revenue: number; avgBasket: number;
  cancelRate: number; revenueShare: number; orderShare: number;
  prevOrders: number; prevRevenue: number; peakSlot: number | null; hours: number[];
}
export interface ProductStat { name: string; category: string; qty: number; revenue: number; orders: number; prevQty: number; avgPrice: number; share: number }
export interface CategoryStat { name: string; qty: number; revenue: number; share: number; products: number; prevRevenue: number }
export interface CourierStat {
  id: string; deliveries: number; revenue: number; cash: number;
  avgTotalMin: number | null; avgDeliveryMin: number | null; avgWaitMin: number | null;
  fastestMin: number | null; slowestMin: number | null; onTimePct: number | null;
  activeDays: number; peakSlot: number | null; hours: number[]; weekdays: number[]; districts: Record<string, number>;
  prevDeliveries: number; perDay: number;
}
export interface CustomerStat { key: string; name: string; phone: string; orders: number; spent: number; first: number; last: number; avgBasket: number; platforms: Record<string, number>; intervalDays: number | null }
export interface TableStat { no: number; orders: number; revenue: number; avgBasket: number; peakSlot: number | null }

export interface Analysis {
  range: DateRange;
  totals: Totals; prevTotals: Totals;
  hours: HourStat[]; weekdays: WeekdayStat[];
  heat: number[][]; heatRev: number[][];
  days: DayStat[];
  platforms: PlatformStat[];
  products: ProductStat[]; categories: CategoryStat[];
  couriers: CourierStat[]; courierTimings: { prepare: number | null; waitCourier: number | null; delivery: number | null; total: number | null; accept: number | null };
  customers: {
    list: CustomerStat[]; identified: number; anonymousOrders: number; repeat: number; repeatRate: number;
    returningFromPrev: number; newCustomers: number; avgOrdersPerCustomer: number; avgLifetime: number; avgInterval: number | null;
    freq: { label: string; count: number; revenue: number }[]; segments: { key: string; label: string; count: number; revenue: number; color: string }[];
    bands: { label: string; count: number }[];
  };
  payments: { label: string; orders: number; revenue: number }[];
  districts: { label: string; orders: number; revenue: number; avgBasket: number }[];
  orderTypes: { label: string; orders: number; revenue: number }[];
  tables: TableStat[];
}

const blankHours = () => Array(24).fill(0) as number[];
const peakOf = (a: number[]): number | null => {
  const m = Math.max(...a);
  return m > 0 ? a.indexOf(m) : null;
};

export function analyze(cur: AOrder[], prev: AOrder[], r: DateRange, catalog: Map<string, string>, slaMin: number): Analysis {
  const validCur = cur.filter(isValid);
  const validPrev = prev.filter(isValid);

  // saat / gün
  const hours: HourStat[] = HOURS_ORDER.map((h, slot) => ({ slot, hour: h, orders: 0, revenue: 0, cancelled: 0 }));
  const heat = Array.from({ length: 7 }, blankHours);
  const heatRev = Array.from({ length: 7 }, blankHours);
  const dayMap = new Map<string, DayStat>();
  dayKeysBetween(r.from, r.to).forEach((k) => dayMap.set(k, { key: k, orders: 0, revenue: 0, cancelled: 0, wd: weekdayOfKey(k) }));
  cur.forEach((o) => {
    const slot = hourSlot(o.ts);
    const key = bizKey(o.ts);
    const wd = weekdayOfKey(key);
    const d = dayMap.get(key);
    if (!isValid(o)) { hours[slot].cancelled++; if (d) d.cancelled++; return; }
    hours[slot].orders++; hours[slot].revenue += o.total;
    heat[wd][slot]++; heatRev[wd][slot] += o.total;
    if (d) { d.orders++; d.revenue += o.total; }
  });
  const days = [...dayMap.values()];
  const weekdays: WeekdayStat[] = WD_SHORT.map((label, wd) => {
    const occ = days.filter((d) => d.wd === wd).length;
    const orders = sum(heat[wd]);
    const revenue = sum(heatRev[wd]);
    return { wd, label, orders, revenue, occurrences: occ, avgOrders: occ ? orders / occ : 0, avgRevenue: occ ? revenue / occ : 0 };
  });

  // platform
  const platKeys = new Set<string>([...cur, ...prev].map((o) => o.platform));
  const totalRevenue = sum(validCur.map((o) => o.total));
  const platforms: PlatformStat[] = [...platKeys].map((key) => {
    const all = cur.filter((o) => o.platform === key);
    const val = all.filter(isValid);
    const pv = prev.filter((o) => o.platform === key);
    const rev = sum(val.map((o) => o.total));
    const hrs = blankHours();
    val.forEach((o) => hrs[hourSlot(o.ts)]++);
    return {
      key, label: platformLabel(key), color: platformColor(key), external: isExternal(key),
      orders: all.length, delivered: val.length, cancelled: all.length - val.length, revenue: rev,
      avgBasket: val.length ? rev / val.length : 0,
      cancelRate: all.length ? ((all.length - val.length) / all.length) * 100 : 0,
      revenueShare: totalRevenue ? (rev / totalRevenue) * 100 : 0,
      orderShare: validCur.length ? (val.length / validCur.length) * 100 : 0,
      prevOrders: pv.length, prevRevenue: sum(pv.filter(isValid).map((o) => o.total)),
      peakSlot: peakOf(hrs), hours: hrs,
    };
  }).sort((a, b) => b.revenue - a.revenue);

  // ürün & kategori
  const prodMap = new Map<string, ProductStat>();
  const catOf = (n: string) => catalog.get(n.toLocaleLowerCase('tr').trim()) || 'Kategorisiz';
  validCur.forEach((o) => o.items.forEach((i) => {
    const p = prodMap.get(i.name) || { name: i.name, category: catOf(i.name), qty: 0, revenue: 0, orders: 0, prevQty: 0, avgPrice: 0, share: 0 };
    p.qty += i.qty; p.revenue += i.total; p.orders++;
    prodMap.set(i.name, p);
  }));
  const prevQty = new Map<string, number>();
  validPrev.forEach((o) => o.items.forEach((i) => prevQty.set(i.name, (prevQty.get(i.name) || 0) + i.qty)));
  const itemsRevenue = sum([...prodMap.values()].map((p) => p.revenue));
  const products = [...prodMap.values()].map((p) => ({
    ...p, prevQty: prevQty.get(p.name) || 0, avgPrice: p.qty ? p.revenue / p.qty : 0, share: itemsRevenue ? (p.revenue / itemsRevenue) * 100 : 0,
  })).sort((a, b) => b.qty - a.qty);

  const catMap = new Map<string, CategoryStat>();
  products.forEach((p) => {
    const c = catMap.get(p.category) || { name: p.category, qty: 0, revenue: 0, share: 0, products: 0, prevRevenue: 0 };
    c.qty += p.qty; c.revenue += p.revenue; c.products++;
    catMap.set(p.category, c);
  });
  validPrev.forEach((o) => o.items.forEach((i) => {
    const c = catMap.get(catOf(i.name));
    if (c) c.prevRevenue += i.total;
  }));
  const categories = [...catMap.values()].map((c) => ({ ...c, share: itemsRevenue ? (c.revenue / itemsRevenue) * 100 : 0 })).sort((a, b) => b.revenue - a.revenue);

  // kurye
  const cMap = new Map<string, AOrder[]>();
  validCur.forEach((o) => { if (o.courierId) (cMap.get(o.courierId) || cMap.set(o.courierId, []).get(o.courierId)!).push(o); });
  const prevCour = new Map<string, number>();
  validPrev.forEach((o) => { if (o.courierId) prevCour.set(o.courierId, (prevCour.get(o.courierId) || 0) + 1); });
  const couriers: CourierStat[] = [...cMap.entries()].map(([id, list]) => {
    const totalMin = list.map((o) => minutes(o.ts, o.deliveredAt)).filter((x): x is number => x != null && x < 600);
    const delMin = list.map((o) => minutes(o.pickedUpAt, o.deliveredAt)).filter((x): x is number => x != null && x < 600);
    const waitMin = list.map((o) => minutes(o.readyAt, o.pickedUpAt)).filter((x): x is number => x != null && x < 600);
    const hrs = blankHours(); const wds = Array(7).fill(0); const dist: Record<string, number> = {};
    const dset = new Set<string>();
    list.forEach((o) => { hrs[hourSlot(o.ts)]++; const k = bizKey(o.ts); wds[weekdayOfKey(k)]++; dset.add(k); dist[o.district] = (dist[o.district] || 0) + 1; });
    return {
      id, deliveries: list.length, revenue: sum(list.map((o) => o.total)),
      cash: sum(list.filter((o) => isCashPayment(o.payment)).map((o) => o.total)),
      avgTotalMin: avg(totalMin), avgDeliveryMin: avg(delMin), avgWaitMin: avg(waitMin),
      fastestMin: totalMin.length ? Math.min(...totalMin) : null, slowestMin: totalMin.length ? Math.max(...totalMin) : null,
      onTimePct: totalMin.length ? (totalMin.filter((m) => m <= slaMin).length / totalMin.length) * 100 : null,
      activeDays: dset.size, peakSlot: peakOf(hrs), hours: hrs, weekdays: wds, districts: dist,
      prevDeliveries: prevCour.get(id) || 0, perDay: dset.size ? list.length / dset.size : 0,
    };
  }).sort((a, b) => b.deliveries - a.deliveries);

  const liveDelivered = validCur.filter((o) => o.live);
  const courierTimings = {
    accept: avg(liveDelivered.map((o) => minutes(o.ts, o.acceptedAt)).filter((x): x is number => x != null && x < 600)),
    prepare: avg(liveDelivered.map((o) => minutes(o.acceptedAt, o.readyAt)).filter((x): x is number => x != null && x < 600)),
    waitCourier: avg(liveDelivered.map((o) => minutes(o.readyAt, o.pickedUpAt)).filter((x): x is number => x != null && x < 600)),
    delivery: avg(liveDelivered.map((o) => minutes(o.pickedUpAt, o.deliveredAt)).filter((x): x is number => x != null && x < 600)),
    total: avg(liveDelivered.map((o) => minutes(o.ts, o.deliveredAt)).filter((x): x is number => x != null && x < 600)),
  };

  // müşteri
  const custMap = new Map<string, CustomerStat>();
  const orderTimes = new Map<string, number[]>();
  validCur.forEach((o) => {
    if (!o.customerKey) return;
    const c = custMap.get(o.customerKey) || { key: o.customerKey, name: '', phone: '', orders: 0, spent: 0, first: o.ts, last: o.ts, avgBasket: 0, platforms: {}, intervalDays: null };
    c.orders++; c.spent += o.total; c.first = Math.min(c.first, o.ts); c.last = Math.max(c.last, o.ts);
    if (o.customerName) c.name = o.customerName;
    if (o.customerPhone) c.phone = o.customerPhone;
    c.platforms[o.platform] = (c.platforms[o.platform] || 0) + 1;
    custMap.set(o.customerKey, c);
    (orderTimes.get(o.customerKey) || orderTimes.set(o.customerKey, []).get(o.customerKey)!).push(o.ts);
  });
  const custList = [...custMap.values()].map((c) => {
    const t = (orderTimes.get(c.key) || []).sort((a, b) => a - b);
    const gaps = t.slice(1).map((x, i) => (x - t[i]) / DAY);
    return { ...c, name: c.name || 'İsimsiz müşteri', avgBasket: c.orders ? c.spent / c.orders : 0, intervalDays: avg(gaps) };
  }).sort((a, b) => b.spent - a.spent);
  const prevKeys = new Set(validPrev.map((o) => o.customerKey).filter(Boolean) as string[]);
  const repeat = custList.filter((c) => c.orders >= 2).length;
  const seg = (f: (c: CustomerStat) => boolean) => { const l = custList.filter(f); return { count: l.length, revenue: sum(l.map((c) => c.spent)) }; };
  const intervals = custList.map((c) => c.intervalDays).filter((x): x is number => x != null);
  const customers = {
    list: custList, identified: custList.length,
    anonymousOrders: validCur.filter((o) => !o.customerKey).length,
    repeat, repeatRate: custList.length ? (repeat / custList.length) * 100 : 0,
    returningFromPrev: custList.filter((c) => prevKeys.has(c.key)).length,
    newCustomers: custList.filter((c) => !prevKeys.has(c.key)).length,
    avgOrdersPerCustomer: custList.length ? sum(custList.map((c) => c.orders)) / custList.length : 0,
    avgLifetime: custList.length ? sum(custList.map((c) => c.spent)) / custList.length : 0,
    avgInterval: avg(intervals),
    freq: [
      { label: '1 sipariş', ...seg((c) => c.orders === 1) },
      { label: '2 sipariş', ...seg((c) => c.orders === 2) },
      { label: '3–5 sipariş', ...seg((c) => c.orders >= 3 && c.orders <= 5) },
      { label: '6+ sipariş', ...seg((c) => c.orders >= 6) },
    ],
    segments: [
      { key: 'vip', label: '👑 VIP (6+ sipariş)', color: '#d4af37', ...seg((c) => c.orders >= 6) },
      { key: 'loyal', label: '💛 Sadık (3–5)', color: '#16a34a', ...seg((c) => c.orders >= 3 && c.orders <= 5) },
      { key: 'regular', label: '🔁 Düzenli (2)', color: '#0ea5e9', ...seg((c) => c.orders === 2) },
      { key: 'once', label: '🌱 Tek seferlik', color: '#9ca3af', ...seg((c) => c.orders === 1) },
    ],
    bands: [
      { label: '0–499 ₺', count: custList.filter((c) => c.spent < 500).length },
      { label: '500–1.499 ₺', count: custList.filter((c) => c.spent >= 500 && c.spent < 1500).length },
      { label: '1.500–2.999 ₺', count: custList.filter((c) => c.spent >= 1500 && c.spent < 3000).length },
      { label: '3.000 ₺+', count: custList.filter((c) => c.spent >= 3000).length },
    ],
  };

  // işletme
  const group = (key: (o: AOrder) => string) => {
    const m = new Map<string, { label: string; orders: number; revenue: number }>();
    validCur.forEach((o) => {
      const k = key(o); const g = m.get(k) || { label: k, orders: 0, revenue: 0 };
      g.orders++; g.revenue += o.total; m.set(k, g);
    });
    return [...m.values()].sort((a, b) => b.orders - a.orders);
  };
  const payments = group((o) => o.payment);
  const districts = group((o) => o.district).map((d) => ({ ...d, avgBasket: d.orders ? d.revenue / d.orders : 0 }));
  const orderTypes = group((o) => (o.orderType ? ORDER_TYPE_LABELS[o.orderType] || o.orderType : 'Belirtilmemiş'));

  const tMap = new Map<number, { o: AOrder[] }>();
  validCur.forEach((o) => { if (o.tableNo != null) (tMap.get(o.tableNo) || tMap.set(o.tableNo, { o: [] }).get(o.tableNo)!).o.push(o); });
  const tables: TableStat[] = [...tMap.entries()].map(([no, { o }]) => {
    const hrs = blankHours(); o.forEach((x) => hrs[hourSlot(x.ts)]++);
    const rev = sum(o.map((x) => x.total));
    return { no, orders: o.length, revenue: rev, avgBasket: o.length ? rev / o.length : 0, peakSlot: peakOf(hrs) };
  }).sort((a, b) => a.no - b.no);

  return {
    range: r, totals: totalsOf(cur), prevTotals: totalsOf(prev),
    hours, weekdays, heat, heatRev, days, platforms, products, categories,
    couriers, courierTimings, customers, payments, districts, orderTypes, tables,
  };
}

// ---------------------------------------------------------------------------
// Otomatik içgörüler
// ---------------------------------------------------------------------------
export interface Insight { icon: string; title: string; text: string; tone: 'gold' | 'ok' | 'warn' | 'info' }

const fmtTL = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' ₺';

export function buildInsights(a: Analysis): Insight[] {
  const out: Insight[] = [];
  if (!a.totals.delivered) return out;
  const hoursSorted = [...a.hours].sort((x, y) => y.orders - x.orders);
  const top = hoursSorted[0];
  const active = a.hours.filter((h) => h.orders > 0);
  const quiet = [...active].sort((x, y) => x.orders - y.orders)[0];
  if (top?.orders) out.push({ icon: '🔥', tone: 'gold', title: 'En yoğun saat', text: `${hh(top.hour)}–${hh((top.hour + 1) % 24)} arası ${top.orders} sipariş ile günün zirvesi (toplamın %${((top.orders / a.totals.delivered) * 100).toFixed(0)}'i).` });
  if (quiet && quiet.slot !== top.slot) out.push({ icon: '🧊', tone: 'info', title: 'En sakin saat', text: `${hh(quiet.hour)}–${hh((quiet.hour + 1) % 24)} arası yalnızca ${quiet.orders} sipariş. Kampanya veya vardiya planlaması için fırsat.` });
  const wd = [...a.weekdays].filter((w) => w.occurrences > 0);
  const bestWd = [...wd].sort((x, y) => y.avgOrders - x.avgOrders)[0];
  const worstWd = [...wd].sort((x, y) => x.avgOrders - y.avgOrders)[0];
  if (bestWd) out.push({ icon: '📅', tone: 'ok', title: 'En güçlü gün', text: `${WD_LONG[bestWd.wd]} günleri ortalama ${bestWd.avgOrders.toFixed(1)} sipariş / ${fmtTL(bestWd.avgRevenue)} ciro ile lider.` });
  if (worstWd && worstWd.wd !== bestWd?.wd) out.push({ icon: '📉', tone: 'warn', title: 'En zayıf gün', text: `${WD_LONG[worstWd.wd]} günleri ortalama ${worstWd.avgOrders.toFixed(1)} sipariş ile en düşük seviyede.` });
  const activeDays = a.days.filter((d) => d.orders > 0);
  if (activeDays.length) {
    const bd = [...activeDays].sort((x, y) => y.revenue - x.revenue)[0];
    const wd2 = [...activeDays].sort((x, y) => x.revenue - y.revenue)[0];
    out.push({ icon: '🏆', tone: 'gold', title: 'Rekor gün', text: `${longKey(bd.key)} — ${bd.orders} sipariş, ${fmtTL(bd.revenue)} ciro.` });
    if (wd2.key !== bd.key) out.push({ icon: '🌧️', tone: 'info', title: 'En düşük gün', text: `${longKey(wd2.key)} — ${wd2.orders} sipariş, ${fmtTL(wd2.revenue)} ciro.` });
  }
  const p = a.platforms[0];
  if (p) out.push({ icon: '🛵', tone: 'info', title: 'Lider kanal', text: `${p.label} cironun %${p.revenueShare.toFixed(0)}'ini üretiyor (${fmtTL(p.revenue)}).` });
  const ext = sum(a.platforms.filter((x) => x.external).map((x) => x.revenue));
  const extShare = a.totals.revenue ? (ext / a.totals.revenue) * 100 : 0;
  if (ext > 0) out.push({ icon: '💸', tone: extShare > 50 ? 'warn' : 'info', title: 'Platform bağımlılığı', text: `Ciroun %${extShare.toFixed(0)}'i komisyonlu dış platformlardan geliyor.` });
  if (a.totals.cancelRate >= 5) out.push({ icon: '⚠️', tone: 'warn', title: 'İptal oranı yüksek', text: `Siparişlerin %${a.totals.cancelRate.toFixed(1)}'i iptal edildi (${a.totals.cancelled} adet).` });
  const tp = a.products[0];
  if (tp) out.push({ icon: '🍛', tone: 'ok', title: 'Yıldız ürün', text: `${tp.name}: ${tp.qty} adet, ${fmtTL(tp.revenue)} ciro.` });
  const rising = a.products.filter((x) => x.prevQty >= 5 && x.qty > x.prevQty * 1.3).sort((x, y) => y.qty / y.prevQty - x.qty / x.prevQty)[0];
  if (rising) out.push({ icon: '🚀', tone: 'ok', title: 'Yükselen ürün', text: `${rising.name} önceki döneme göre %${(((rising.qty - rising.prevQty) / rising.prevQty) * 100).toFixed(0)} arttı.` });
  return out;
}

export const cmpDelta = (cur: number, prev: number): { pct: number | null; up: boolean } => {
  if (!prev) return { pct: cur ? null : 0, up: cur >= 0 };
  const d = ((cur - prev) / prev) * 100;
  return { pct: d, up: d >= 0 };
};
