import type { BusinessSettings } from '@/types/database';

export const DEFAULT_ADDRESS = 'Yazır, Şht. Erkan Özbalcı Sk. No:20/b, 42310 Selçuklu/Konya (Reyhan İş Merkezi arkası)';
export const DEFAULT_INSTAGRAM = 'https://www.instagram.com/yazir.pilavcisi/';

/** WhatsApp bağlantısı: 0540... → 90540... (wa.me ülke kodu ister) */
export function whatsappLink(raw?: string | null): string | null {
  if (!raw) return null;
  let n = raw.replace(/[^\d+]/g, '').replace(/^\+/, '');
  if (n.startsWith('0')) n = '90' + n.slice(1);
  return `https://wa.me/${n}`;
}

/** Adres, Instagram ve Google Harita bağlantılarını tek yerde üretir (footer + iletişim sayfası) */
export function contactLinks(settings: BusinessSettings | null) {
  const address = settings?.address || DEFAULT_ADDRESS;
  const instagramUrl = settings?.instagram_url || DEFAULT_INSTAGRAM;
  const handle = instagramUrl.split('?')[0].replace(/\/+$/, '').split('/').pop() || 'yazir.pilavcisi';
  // Koordinat girildiyse onu, yoksa adresi kullan. API anahtarı gerekmez; harita yakınlaştırılıp uzaklaştırılabilir.
  const q = settings?.lat && settings?.lng ? `${settings.lat},${settings.lng}` : `${address}, Konya`;
  return {
    address,
    instagramUrl,
    instagramHandle: '@' + handle,
    mapEmbedUrl: `https://www.google.com/maps?q=${encodeURIComponent(q)}&z=16&hl=tr&output=embed`,
    mapOpenUrl: settings?.google_maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`,
    mapDirUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`,
  };
}
