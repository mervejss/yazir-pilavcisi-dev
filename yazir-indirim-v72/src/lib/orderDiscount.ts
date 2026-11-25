// Admin "Yeni Sipariş" indirimi: saf (arayüzsüz) hesaplama. Sunucudaki
// public._apply_order_discount (sql/48_admin_order_discount.sql) ile AYNI yuvarlama kuralını kullanır.
import { r2 } from '@/lib/billSplit';

export type DiscountMode = 'cart' | 'items';

export interface DiscountSpec {
  mode: DiscountMode;
  /** 0 < yüzde ≤ 100 */
  percent: number;
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
  percent: number;     // bu satıra uygulanan yüzde (0 = indirimsiz)
}

export interface DiscountResult {
  active: boolean;
  mode: DiscountMode | null;
  percent: number;
  lines: DiscountedLine[];
  subtotal: number;       // indirimsiz ara toplam
  discount: number;       // toplam indirim
  subtotalAfter: number;  // indirimli ara toplam (teslimat ücreti hariç)
}

export const validPercent = (p: number) => Number.isFinite(p) && p > 0 && p <= 100;

export function computeDiscount(lines: CartLineIn[], spec: DiscountSpec | null): DiscountResult {
  const subtotal = r2(lines.reduce((s, l) => s + l.price * l.qty, 0));
  const none = (): DiscountResult => ({
    active: false, mode: null, percent: 0, subtotal, discount: 0, subtotalAfter: subtotal,
    lines: lines.map((l) => ({
      variant_id: l.variant_id, name: l.name, qty: l.qty, unit: l.price, unitAfter: l.price,
      lineBefore: r2(l.price * l.qty), lineAfter: r2(l.price * l.qty), saved: 0, percent: 0,
    })),
  });
  if (!spec || !validPercent(spec.percent) || lines.length === 0) return none();

  if (spec.mode === 'cart') {
    const discount = r2(subtotal * spec.percent / 100);
    const base = none();
    return { ...base, active: discount > 0, mode: 'cart', percent: spec.percent, discount, subtotalAfter: r2(Math.max(subtotal - discount, 0)) };
  }

  const out: DiscountedLine[] = lines.map((l) => {
    const lineBefore = r2(l.price * l.qty);
    const off = spec.excluded.includes(l.variant_id);
    const unitAfter = off ? l.price : r2(l.price * (1 - spec.percent / 100));
    const lineAfter = r2(unitAfter * l.qty);
    return {
      variant_id: l.variant_id, name: l.name, qty: l.qty, unit: l.price, unitAfter,
      lineBefore, lineAfter, saved: r2(lineBefore - lineAfter), percent: off ? 0 : spec.percent,
    };
  });
  const subtotalAfter = r2(out.reduce((s, l) => s + l.lineAfter, 0));
  const discount = r2(subtotal - subtotalAfter);
  return { active: discount > 0, mode: 'items', percent: spec.percent, lines: out, subtotal, discount, subtotalAfter };
}

/** RPC (staff_create_order_discounted) için indirim parametreleri */
export function discountPayload(lines: CartLineIn[], spec: DiscountSpec) {
  if (spec.mode === 'cart') {
    return { p_discount_mode: 'cart', p_discount_percent: spec.percent, p_discount_lines: null };
  }
  return {
    p_discount_mode: 'items',
    p_discount_percent: spec.percent,
    p_discount_lines: lines
      .filter((l) => !spec.excluded.includes(l.variant_id))
      .map((l) => ({ variant_id: l.variant_id, percent: spec.percent })),
  };
}
