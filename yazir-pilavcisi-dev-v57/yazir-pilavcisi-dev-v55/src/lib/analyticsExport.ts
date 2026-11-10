/** Analiz dışa aktarma: CSV (Excel uyumlu, UTF-8 BOM + ;) ve çok sayfalı .xlsx */
import { downloadCsv } from '@/lib/analytics';
import { HOURS_ORDER, WD_LONG, fmtDateTimeIst, platformLabel, type AOrder, type Analysis, type AnalyticsSettings } from '@/lib/analyticsData';

const r2 = (n: number | null | undefined) => (n == null ? '' : Math.round(n * 100) / 100);

export function stamp(a: Analysis, platform: string): string {
  return `${a.range.fromKey}_${a.range.toKey}_${platform}`;
}

/** Filtrelenmiş ham sipariş listesi */
export function ordersRows(orders: AOrder[]): (string | number)[][] {
  return [
    ['Sipariş No', 'Tarih (İstanbul)', 'Kanal', 'Durum', 'Tutar', 'Ara toplam', 'Teslimat ücreti', 'İndirim', 'Ödeme', 'Mahalle', 'Müşteri', 'Telefon', 'Masa', 'Kaynak', 'Ürünler'],
    ...orders.map((o) => [
      o.no, fmtDateTimeIst(o.ts), platformLabel(o.platform), o.status === 'delivered' ? 'Teslim' : 'İptal', r2(o.total), r2(o.subtotal), r2(o.deliveryFee), r2(o.discount),
      o.payment, o.district, o.customerName, o.customerPhone, o.tableNo ?? '', o.live ? 'Canlı sistem' : 'Excel aktarımı',
      o.items.map((i) => `${i.qty}x ${i.name}`).join(' | '),
    ]),
  ];
}

export function exportOrdersCsv(orders: AOrder[], a: Analysis, platform: string) {
  downloadCsv(`siparisler_${stamp(a, platform)}.csv`, ordersRows(orders));
}

export function summaryRows(a: Analysis, platform: string): (string | number)[][] {
  const t = a.totals, p = a.prevTotals;
  return [
    ['Rapor', 'Yazır Pilavcısı — Analiz Özeti'],
    ['Dönem', a.range.label],
    ['Platform', platform === 'all' ? 'Tüm platformlar' : platform === 'inside' ? 'Restoran İçi' : platform === 'outside' ? 'Restoran Dışı' : platformLabel(platform)],
    ['Zaman dilimi', 'Europe/Istanbul · iş günü 03:00'],
    [],
    ['Gösterge', 'Bu dönem', 'Önceki dönem'],
    ['Toplam sipariş', t.orders, p.orders],
    ['Teslim edilen', t.delivered, p.delivered],
    ['İptal', t.cancelled, p.cancelled],
    ['Ciro (₺)', r2(t.revenue), r2(p.revenue)],
    ['Ortalama sepet (₺)', r2(t.avgBasket), r2(p.avgBasket)],
    ['İptal oranı (%)', r2(t.cancelRate), r2(p.cancelRate)],
    ['Satılan ürün adedi', t.itemsQty, p.itemsQty],
    ['Tanınan müşteri', t.customers, p.customers],
  ];
}

export function exportSummaryCsv(a: Analysis, platform: string) {
  downloadCsv(`ozet_${stamp(a, platform)}.csv`, summaryRows(a, platform));
}

export async function exportWorkbook(a: Analysis, cur: AOrder[], platform: string, courierNames: Record<string, string>, settings: AnalyticsSettings) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: (string | number | null)[][], widths?: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  };
  add('Özet', summaryRows(a, platform), [26, 22, 22]);
  add('Günlük', [['Gün', 'Sipariş', 'Ciro (₺)', 'İptal'], ...a.days.map((d) => [d.key, d.orders, r2(d.revenue), d.cancelled])], [14, 10, 14, 10]);
  add('Saatlik', [['Saat', 'Sipariş', 'Ciro (₺)', 'İptal'], ...a.hours.map((h) => [`${String(h.hour).padStart(2, '0')}:00`, h.orders, r2(h.revenue), h.cancelled])], [10, 10, 14, 10]);
  add('Gün-Saat', [['Gün / Saat', ...HOURS_ORDER.map((h) => `${String(h).padStart(2, '0')}:00`)], ...a.heat.map((row, i) => [WD_LONG[i], ...row])], [14]);
  add('Haftanın Günleri', [['Gün', 'Sipariş', 'Ciro (₺)', 'Gün sayısı', 'Günlük ort. sipariş', 'Günlük ort. ciro'], ...a.weekdays.map((w) => [WD_LONG[w.wd], w.orders, r2(w.revenue), w.occurrences, r2(w.avgOrders), r2(w.avgRevenue)])], [14, 10, 14, 12, 18, 16]);
  add('Platformlar', [['Kanal', 'Sipariş', 'Teslim', 'İptal', 'Ciro (₺)', 'Ort. sepet (₺)', 'İptal %', 'Ciro payı %', 'Önceki ciro (₺)', 'Komisyon % (varsayım)'],
    ...a.platforms.map((p) => [p.label, p.orders, p.delivered, p.cancelled, r2(p.revenue), r2(p.avgBasket), r2(p.cancelRate), r2(p.revenueShare), r2(p.prevRevenue), p.external ? settings.commission[p.key] ?? 20 : 0])], [20, 10, 10, 10, 14, 14, 10, 12, 16, 20]);
  add('Ürünler', [['Ürün', 'Kategori', 'Adet', 'Ciro (₺)', 'Ort. fiyat (₺)', 'Sipariş', 'Önceki adet', 'Ciro payı %'], ...a.products.map((p) => [p.name, p.category, p.qty, r2(p.revenue), r2(p.avgPrice), p.orders, p.prevQty, r2(p.share)])], [32, 18, 8, 14, 14, 10, 12, 12]);
  add('Kategoriler', [['Kategori', 'Ürün çeşidi', 'Adet', 'Ciro (₺)', 'Pay %'], ...a.categories.map((c) => [c.name, c.products, c.qty, r2(c.revenue), r2(c.share)])], [22, 12, 8, 14, 10]);
  add('Kuryeler', [['Kurye', 'Teslimat', 'Taşınan ciro (₺)', 'Nakit (₺)', 'Ort. toplam dk', 'Ort. yolda dk', 'Zamanında %', 'Aktif gün'],
    ...a.couriers.map((c) => [courierNames[c.id] || c.id.slice(0, 8), c.deliveries, r2(c.revenue), r2(c.cash), r2(c.avgTotalMin), r2(c.avgDeliveryMin), r2(c.onTimePct), c.activeDays])], [22, 10, 16, 12, 14, 14, 12, 10]);
  add('Müşteriler', [['Müşteri', 'Telefon', 'Sipariş', 'Harcama (₺)', 'Ort. sepet (₺)', 'Son sipariş'], ...a.customers.list.map((c) => [c.name, c.phone, c.orders, r2(c.spent), r2(c.avgBasket), fmtDateTimeIst(c.last)])], [26, 16, 10, 14, 14, 18]);
  add('Ödeme', [['Yöntem', 'Sipariş', 'Ciro (₺)'], ...a.payments.map((p) => [p.label, p.orders, r2(p.revenue)])], [26, 10, 14]);
  add('Mahalle', [['Mahalle', 'Sipariş', 'Ciro (₺)', 'Ort. sepet (₺)'], ...a.districts.map((d) => [d.label, d.orders, r2(d.revenue), r2(d.avgBasket)])], [28, 10, 14, 14]);
  add('Masalar', [['Masa', 'Sipariş', 'Ciro (₺)', 'Ort. sepet (₺)'], ...a.tables.map((t) => [`Masa ${t.no}`, t.orders, r2(t.revenue), r2(t.avgBasket)])], [12, 10, 14, 14]);
  add('Siparişler', ordersRows(cur) as (string | number)[][], [10, 18, 16, 8, 10, 10, 10, 10, 18, 20, 20, 16, 8, 14, 60]);
  XLSX.writeFile(wb, `analiz_${stamp(a, platform)}.xlsx`);
}
