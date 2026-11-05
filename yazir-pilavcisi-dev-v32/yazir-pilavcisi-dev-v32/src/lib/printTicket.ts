import { tl } from '@/lib/helpers';
import { ORDER_TYPE_LABELS, PAYMENT_METHOD_LABELS, SOURCE_LABELS } from '@/lib/constants';

const esc = (s: any) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export interface TicketOrder {
  order_no: number;
  created_at: string;
  source: string;
  order_type: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  delivery_address?: string | null;
  district?: string | null;
  note?: string | null;
  payment_method?: string | null;
  subtotal?: number;
  delivery_fee?: number;
  discount?: number;
  total: number;
  external_ref?: string | null;
  items: Array<{ quantity: number; product_name: string; variant_name?: string | null; note?: string | null }>;
}

/**
 * 80 mm fiş yazıcılara uygun mutfak/kurye fişi. Gizli bir iframe ile yazdırır (açılır pencere engeline takılmaz).
 */
export function printOrderTicket(o: TicketOrder, opts?: { businessName?: string; courierName?: string | null; tableNo?: string | null }) {
  const name = opts?.businessName || 'Yazır Pilavcısı';
  const date = new Date(o.created_at);
  const itemsHtml = o.items
    .map(
      (i) =>
        `<div class="it"><span class="q">${i.quantity}×</span><span class="n">${esc(i.product_name)}${i.variant_name ? ` <small>(${esc(i.variant_name)})</small>` : ''}${i.note ? `<em>↳ ${esc(i.note)}</em>` : ''}</span></div>`,
    )
    .join('');

  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Fiş #${o.order_no}</title>
<style>
  @page { size: 80mm auto; margin: 3mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Arial', sans-serif; width: 74mm; margin: 0 auto; color: #000; font-size: 13px; }
  h1 { text-align: center; font-size: 16px; margin: 0 0 2px; }
  .c { text-align: center; }
  .no { text-align: center; font-size: 30px; font-weight: 900; margin: 4px 0; }
  .tag { display: inline-block; border: 2px solid #000; padding: 1px 8px; font-weight: 800; margin: 2px; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  .it { display: flex; gap: 6px; font-size: 15px; font-weight: 700; margin: 3px 0; }
  .it .q { min-width: 30px; font-size: 18px; }
  .it em { display: block; font-weight: 400; font-size: 12px; }
  .note { border: 2px solid #000; padding: 4px; font-weight: 800; margin: 6px 0; }
  .tot { font-size: 18px; font-weight: 900; }
  small { font-weight: 400; }
</style></head><body>
<h1>${esc(name)}</h1>
<div class="c">${esc(date.toLocaleString('tr-TR'))}</div>
<div class="no">#${o.order_no}</div>
<div class="c"><span class="tag">${esc(ORDER_TYPE_LABELS[o.order_type] || o.order_type)}</span><span class="tag">${esc(SOURCE_LABELS[o.source] || o.source)}</span>${opts?.tableNo ? `<span class="tag">MASA ${esc(opts.tableNo)}</span>` : ''}</div>
${o.external_ref ? `<div class="c"><small>Platform no: ${esc(o.external_ref)}</small></div>` : ''}
<hr>
${itemsHtml}
<hr>
${o.note ? `<div class="note">NOT: ${esc(o.note)}</div>` : ''}
${o.customer_name ? `<div><b>${esc(o.customer_name)}</b></div>` : ''}
${o.customer_phone ? `<div>Tel: ${esc(o.customer_phone)}</div>` : ''}
${o.delivery_address ? `<div>${o.district ? esc(o.district) + ' · ' : ''}${esc(o.delivery_address)}</div>` : ''}
<hr>
<div class="row"><span>Ödeme</span><b>${esc(PAYMENT_METHOD_LABELS[o.payment_method || ''] || o.payment_method || '—')}</b></div>
${o.delivery_fee ? `<div class="row"><span>Teslimat</span><span>${tl(o.delivery_fee)}</span></div>` : ''}
${o.discount ? `<div class="row"><span>İndirim</span><span>-${tl(o.discount)}</span></div>` : ''}
<div class="row tot"><span>TOPLAM</span><span>${tl(o.total)}</span></div>
${opts?.courierName ? `<div>Kurye: <b>${esc(opts.courierName)}</b></div>` : ''}
<hr><div class="c"><small>Afiyet olsun!</small></div>
</body></html>`;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 2000);
  }, 300);
}
