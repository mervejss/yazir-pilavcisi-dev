// Admin "Yeni Sipariş" indirimi: saf (arayüzsüz) hesaplama. Sunucudaki
// public._apply_order_discount (sql/48 + sql/49) ile AYNI yuvarlama kuralını kullanır.
import { r2 } from '@/lib/billSplit';

export type DiscountMode = 'cart' | 'items';
/** percent = yüzde (%), amount = sabit TL */
export type DiscountUnit = 'percent' | 'amount';

export interface DiscountSpec {
  /** cart = tüm sepet tutarından, items = her ürüne ayrı */
  mode: DiscountMode;
  unit: DiscountUnit;
  /** unit=percent → 0 < değer ≤ 100 ; unit=amount → TL (> 0) */
  value: number;
  /** "Her ürüne ayrı" modunda indirimden çıkarılan satırlar (variant_id) */
  excluded: string[];
}

export interface CartLineIn { variant_id: string; name: string; price: number; qty: number }

export interface DiscountedLine {
  variant_id: string;
  name: string;
  qty: number;
  unit: number;        // indirimsiz birim fiyat
  unitAfter: number;   // indirimli birim fiyat
  lineBefore: number;
  lineAfter: number;
  saved: number;       // bu satırdan düşen tutar
  /** bu satıra uygulanan değer (0 = indirimsiz); türü result.unit belirler */
  value: number;
}

export interface DiscountResult {
  active: boolean;
  mode: DiscountMode | null;
  unit: DiscountUnit;
  value: number;
  lines: DiscountedLine[];
  subtotal: number;       // indirimsiz ara toplam
  discount: number;       // toplam indirim
  subtotalAfter: number;  // indirimli ara toplam (teslimat ücreti hariç)
}

export const validPercent = (p: number) => Number.isFinite(p) && p > 0 && p <= 100;
export const validValue = (unit: DiscountUnit, v: number) =>
  unit === 'percent' ? validPercent(v) : Number.isFinite(v) && v > 0 && v <= 1_000_000;

export function computeDiscount(lines: CartLineIn[], spec: DiscountSpec | null): DiscountResult {
  const subtotal = r2(lines.reduce((s, l) => s + l.price * l.qty, 0));
  const none = (unit: DiscountUnit = 'percent'): DiscountResult => ({
    active: false, mode: null, unit, value: 0, subtotal, discount: 0, subtotalAfter: subtotal,
    lines: lines.map((l) => ({
      variant_id: l.variant_id, name: l.name, qty: l.qty, unit: l.price, unitAfter: l.price,
      lineBefore: r2(l.price * l.qty), lineAfter: r2(l.price * l.qty), saved: 0, value: 0,
    })),
  });
  if (!spec || !validValue(spec.unit, spec.value) || lines.length === 0) return none();

  if (spec.mode === 'cart') {
    const discount = spec.unit === 'percent' ? r2(subtotal * spec.value / 100) : r2(Math.min(spec.value, subtotal));
    const base = none(spec.unit);
    return { ...base, active: discount > 0, mode: 'cart', value: spec.value, discount, subtotalAfter: r2(Math.max(subtotal - discount, 0)) };
  }

  const out: DiscountedLine[] = lines.map((l) => {
    const lineBefore = r2(l.price * l.qty);
    const off = spec.excluded.includes(l.variant_id);
    const unitAfter = off
      ? l.price
      : spec.unit === 'percent' ? r2(l.price * (1 - spec.value / 100)) : Math.max(r2(l.price - spec.value), 0);
    const lineAfter = r2(unitAfter * l.qty);
    return {
      variant_id: l.variant_id, name: l.name, qty: l.qty, unit: l.price, unitAfter,
      lineBefore, lineAfter, saved: r2(lineBefore - lineAfter), value: off ? 0 : spec.value,
    };
  });
  const subtotalAfter = r2(out.reduce((s, l) => s + l.lineAfter, 0));
  const discount = r2(subtotal - subtotalAfter);
  return { active: discount > 0, mode: 'items', unit: spec.unit, value: spec.value, lines: out, subtotal, discount, subtotalAfter };
}

/**
 * RPC (staff_create_order_discounted) için indirim parametreleri.
 *  cart+yüzde → 'cart' ; cart+TL → 'cart_amount' (p_discount_percent = TL) ; items → 'items' (satırlarda percent VEYA amount)
 */
export function discountPayload(lines: CartLineIn[], spec: DiscountSpec) {
  if (spec.mode === 'cart') {
    return { p_discount_mode: spec.unit === 'percent' ? 'cart' : 'cart_amount', p_discount_percent: spec.value, p_discount_lines: null };
  }
  return {
    p_discount_mode: 'items',
    p_discount_percent: spec.value,
    p_discount_lines: lines
      .filter((l) => !spec.excluded.includes(l.variant_id))
      .map((l) => (spec.unit === 'percent' ? { variant_id: l.variant_id, percent: spec.value } : { variant_id: l.variant_id, amount: spec.value })),
  };
}
