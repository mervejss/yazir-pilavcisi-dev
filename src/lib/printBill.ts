import { tl } from '@/lib/helpers';
import type { SplitLine, SplitPayment } from '@/components/ui/BillSplitter';

const esc = (s: any) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const METHOD: Record<string, string> = { cash_at_table: 'Nakit', card_at_table: 'Kart (POS)', iban: 'IBAN / Havale', cash_on_delivery: 'Nakit', card_on_delivery: 'Kart', };

export interface BillPrintInput {
  businessName?: string;
  tableName: string;
  lines: SplitLine[];
  total: number;
  /** Toplu ödeme yöntemi (bölünmüş değilse) */
  method?: string;
  /** Bölünmüş ödemeler */
  payments?: SplitPayment[];
  /** 'all' = tek hesap dökümü, 'persons' = yalnızca kişi başı fişler, 'both' = döküm + kişi başı fişler */
  mode?: 'all' | 'persons' | 'both';
}

const CSS = `
  @page { size: 80mm auto; margin: 3mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; width: 74mm; margin: 0 auto; color: #000; font-size: 13px; }
  .rc { page-break-after: always; padding-bottom: 6px; }
  .rc:last-child { page-break-after: auto; }
  h1 { text-align: center; font-size: 16px; margin: 0 0 2px; }
  h2 { text-align: center; font-size: 14px; margin: 2px 0; }
  .c { text-align: center; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 6px; }
  .it { display: flex; gap: 6px; margin: 3px 0; }
  .it .q { min-width: 30px; font-weight: 800; }
  .it .n { flex: 1; }
  .it em { display: block; font-size: 11px; font-style: normal; }
  .tot { font-size: 17px; font-weight: 900; }
  small { font-weight: 400; }
`;

const itemRow = (name: string, variant: string | null | undefined, n: number, unit: number) =>
  `<div class="it"><span class="q">${n}×</span><span class="n">${esc(name)}${variant ? ` <small>(${esc(variant)})</small>` : ''}${n > 1 ? `<em>${n} adet × ${tl(unit)}</em>` : ''}</span><b>${tl(unit * n)}</b></div>`;

/** 80 mm fiş: masa hesap dökümü ve/veya kişi başı fişler (tek yazdırma işi, her fiş ayrı sayfa) */
export function printBill(inp: BillPrintInput) {
  const name = inp.businessName || 'Yazır Pilavcısı';
  const now = new Date().toLocaleString('tr-TR');
  const mode = inp.mode || (inp.payments && inp.payments.length > 0 ? 'both' : 'all');
  const byKey = new Map(inp.lines.map((l) => [l.key, l]));
  const head = (title: string) => `<h1>${esc(name)}</h1><div class="c">${esc(now)}</div><h2>${esc(inp.tableName)}</h2><div class="c"><b>${esc(title)}</b></div><hr>`;
  const foot = `<hr><div class="c"><small>Afiyet olsun! · Mali değeri yoktur</small></div>`;
  const pages: string[] = [];

  if (mode === 'all' || mode === 'both') {
    const items = inp.lines.filter((l) => l.key !== 'adj').map((l) => itemRow(l.name, l.variant, l.qty, l.unit)).join('');
    const adj = byKey.get('adj');
    const pay = inp.payments && inp.payments.length > 0
      ? `<hr><div><b>Ödemeler</b></div>${inp.payments.map((p, i) => `<div class="row"><span>${esc(p.label || `${i + 1}. kişi`)} · ${esc(METHOD[p.method] || p.method)}</span><span>${tl(p.amount)}</span></div>`).join('')}`
      : inp.method ? `<hr><div class="row"><span>Ödeme</span><b>${esc(METHOD[inp.method] || inp.method)}</b></div>` : '';
    pages.push(`<div class="rc">${head('HESAP DÖKÜMÜ')}${items}${adj ? `<div class="row"><span>${esc(adj.name)}</span><span>${tl(adj.unit)}</span></div>` : ''}<hr><div class="row tot"><span>TOPLAM</span><span>${tl(inp.total)}</span></div>${pay}${foot}</div>`);
  }

  if ((mode === 'persons' || mode === 'both') && inp.payments) {
    inp.payments.forEach((p, i) => {
      const rows = p.lines.map((r) => { const l = byKey.get(r.k); return l ? itemRow(l.name, l.variant, r.n, l.unit) : ''; }).join('');
      const body = rows || `<div class="c"><small>${p.lines.length === 0 ? 'Eşit pay / tutar bazlı ödeme' : ''}</small></div>`;
      pages.push(`<div class="rc">${head(`${p.label || `${i + 1}. kişi`} · KİŞİ FİŞİ`)}${body}<hr><div class="row tot"><span>ÖDENEN</span><span>${tl(p.amount)}</span></div><div class="row"><span>Yöntem</span><b>${esc(METHOD[p.method] || p.method)}</b></div>${foot}</div>`);
    });
  }

  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Hesap — ${esc(inp.tableName)}</title><style>${CSS}</style></head><body>${pages.join('')}</body></html>`;
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) return;
  doc.open(); doc.write(html); doc.close();
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 2000);
  }, 300);
}
