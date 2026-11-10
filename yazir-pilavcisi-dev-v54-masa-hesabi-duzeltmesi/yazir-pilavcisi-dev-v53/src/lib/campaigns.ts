import { tl } from '@/lib/helpers';

const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export interface CouponLike {
  discount_type: string;
  discount_value: number | string;
  max_discount?: number | string | null;
  min_order_amount?: number | string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  daily_start?: string | null;
  daily_end?: string | null;
  weekdays?: number[] | null;
  audience?: string;
  remaining?: number | null;
  usage_limit?: number | null;
}

export function discountLabel(c: CouponLike): string {
  if (c.discount_type === 'percent') return `%${Number(c.discount_value)} indirim`;
  if (c.discount_type === 'fixed') return `${tl(Number(c.discount_value))} indirim`;
  return 'Ücretsiz teslimat';
}

export const AUDIENCE_LABELS: Record<string, string> = {
  all: 'Herkes',
  members: 'Yalnızca üyeler',
  new_customers: 'İlk sipariş',
  specific: 'Seçili müşteriler',
};

/** Kampanya koşullarını okunur cümlelere çevirir */
export function conditionLines(c: CouponLike): string[] {
  const out: string[] = [];
  if (Number(c.min_order_amount) > 0) out.push(`Minimum sepet ${tl(Number(c.min_order_amount))}`);
  if (c.discount_type === 'percent' && c.max_discount) out.push(`En fazla ${tl(Number(c.max_discount))} indirim`);
  if (c.daily_start && c.daily_end) out.push(`Her gün ${c.daily_start.slice(0, 5)} – ${c.daily_end.slice(0, 5)} arası`);
  if (c.weekdays && c.weekdays.length > 0 && c.weekdays.length < 7) out.push(`Geçerli günler: ${c.weekdays.map((d) => DAYS[d - 1]).join(', ')}`);
  if (c.audience && c.audience !== 'all') out.push(AUDIENCE_LABELS[c.audience] || c.audience);
  if (c.ends_at) out.push(`Son gün: ${new Date(c.ends_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}`);
  if (c.remaining != null) out.push(`Kalan kontenjan: ${c.remaining}`);
  return out;
}

export function isoToLocalInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

export function randomCode(len = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
