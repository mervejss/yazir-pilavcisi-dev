export const ALERT_CHANNELS = [
  { id: 'delivery', label: 'Genel paket servis', sample: 'Yeni paket siparişi var! Paket servis siparişini kontrol edin.' },
  { id: 'phone', label: 'Telefon siparişi', sample: 'Yeni paket siparişi var! Telefon ile telefondan sipariş alındı.' },
  { id: 'trendyol', label: 'Trendyol Yemek', sample: 'Yeni sipariş var! Trendyol Yemek üzerinden paket siparişi geldi.' },
  { id: 'web', label: 'İnternet sitesi', sample: 'Yeni sipariş var! İnternet sitesinden online paket siparişi geldi.' },
  { id: 'pickup', label: 'Gel-Al', sample: 'Yeni Gel-Al siparişi! Müşteri gelip alacak, hazırlığa başlayın.' },
  { id: 'table', label: 'Restoran / Masa', sample: 'Restoran içi yeni sipariş var! Lütfen masa siparişini kontrol edin.' },
  { id: 'yemeksepeti', label: 'Yemeksepeti', sample: 'Yemeksepeti üzerinden yeni sipariş geldi.' },
  { id: 'migros', label: 'Migros Yemek', sample: 'Migros Yemek üzerinden yeni sipariş geldi.' },
  { id: 'getir', label: 'Getir Yemek', sample: 'Getir Yemek üzerinden yeni sipariş geldi.' },
  { id: 'other', label: 'Diğer platformlar', sample: 'Yeni platform siparişi geldi.' },
  { id: 'courier_assigned', label: 'Kurye: Yeni atanan paket', sample: 'Sana yeni bir paket atandı! Lütfen sipariş detaylarını kontrol et.' },
  { id: 'courier_ready', label: 'Kurye: Hazır paket', sample: 'Hazır paket bekliyor! Teslimat için siparişi yola çıkarın.' },
  { id: 'courier_open', label: 'Kurye: Atanabilir sipariş', sample: 'Yeni teslimat siparişi var. Paketi almak için kontrol et.' },
  { id: 'courier_request', label: 'Yönetici: Kurye isteği', sample: 'Bir kurye sipariş için teslimat isteği gönderdi.' },
] as const;
export type AlertChannel = typeof ALERT_CHANNELS[number]['id'];
export const DEFAULT_ALERT_CHANNEL: AlertChannel = 'web';
export function orderAlertChannel(source: string | null | undefined, type?: string | null): AlertChannel {
  if (source === 'phone') return 'phone';
  if (source === 'table' || type === 'dine_in') return 'table';
  if (source === 'counter' || type === 'pickup') return 'pickup';
  if (source === 'trendyol') return 'trendyol';
  if (source === 'yemeksepeti') return 'yemeksepeti';
  if (source === 'migros') return 'migros';
  if (source === 'getir') return 'getir';
  if (source === 'web') return 'web';
  if (source === 'other') return 'other';
  if (type === 'delivery') return 'delivery';
  return 'other';
}
