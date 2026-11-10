import type { CartItem } from '@/stores/cartStore';
import { tl } from '@/lib/helpers';

export const DEFAULT_WA_NUMBER = '905403314142';

export const DEFAULT_WA_MESSAGES: string[] = [
  'Merhaba, şu an açık mısınız?',
  'Merhaba, sipariş verebilir miyim?',
  'Merhaba, menüyü alabilir miyim?',
  'Merhaba, siparişim kaç dakikada gelir?',
  'Merhaba, adresime paket servis yapıyor musunuz?',
  'Merhaba, toplu / catering siparişi vermek istiyorum.',
];

/** Numarayı wa.me biçimine getirir: 0540… → 90540… */
export function waNumber(raw?: string | null): string {
  let n = (raw || '').replace(/\D/g, '');
  if (!n) return DEFAULT_WA_NUMBER;
  if (n.startsWith('00')) n = n.slice(2);
  if (n.startsWith('0')) n = '90' + n.slice(1);
  if (n.length === 10 && n.startsWith('5')) n = '90' + n;
  return n;
}

export const waUrl = (raw: string | null | undefined, text?: string) =>
  `https://wa.me/${waNumber(raw)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

/** Ayarlardan gelen hazır mesajlar (jsonb dizi). Boşsa varsayılanlar. */
export function quickMessages(v: unknown): string[] {
  if (Array.isArray(v)) {
    const l = v.map((x) => String(x || '').trim()).filter(Boolean);
    if (l.length) return l;
  }
  return DEFAULT_WA_MESSAGES;
}

export function cartMessage(items: CartItem[], total: number): string {
  const lines = items.map((i) => `• ${i.quantity}× ${i.productName}${i.variantName ? ` (${i.variantName})` : ''} — ${tl(i.price * i.quantity)}`);
  return `Merhaba, sipariş vermek istiyorum:\n${lines.join('\n')}\nToplam: ${tl(total)}\n\nAdresim: `;
}
