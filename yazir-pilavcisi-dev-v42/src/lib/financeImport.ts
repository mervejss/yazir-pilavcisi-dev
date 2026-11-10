// Trendyol panelinden indirilen "Cari Hesap Ekstresi" (Excel/CSV) dosyasını içe aktarır.
// API erişimi yoksa ya da geçmiş dönemi hızlıca doldurmak için YEDEK yoldur.
// Tarayıcıda çalışır; sütunlar başlık adından otomatik eşlenir, tanınmayan işlem etiketleri raporlanır.
import { supabase } from '@/lib/supabase';
import { normHeader } from '@/lib/pastOrdersImport';

type Col = 'date' | 'type' | 'desc' | 'barcode' | 'receipt' | 'order' | 'debt' | 'credit' | 'rate' | 'comm' | 'rev' | 'payNo' | 'payDate' | 'pkg' | 'orderDate';

const ALIASES: Record<Col, string[]> = {
  date: ['islem tarihi', 'islem zamani', 'tarih'],
  type: ['islem tipi', 'islem turu', 'hareket tipi', 'hareket turu', 'islem', 'tur'],
  desc: ['aciklama'],
  barcode: ['barkod'],
  receipt: ['dekont no', 'dekont numarasi', 'dekont'],
  order: ['siparis no', 'siparis numarasi', 'siparis'],
  debt: ['borc'],
  credit: ['alacak'],
  rate: ['komisyon orani', 'komisyon'],
  comm: ['komisyon tutari', 'trendyol komisyon tutari'],
  rev: ['hakedis tutari', 'satici hakedis tutari', 'satici hakedis', 'hakedis'],
  payNo: ['odeme no', 'odeme numarasi', 'odeme emri no', 'odeme emri'],
  payDate: ['odeme tarihi', 'vade tarihi'],
  pkg: ['siparis paket no', 'paket no', 'paket numarasi', 'shipment package id'],
  orderDate: ['siparis tarihi'],
};

export interface ImportPreview {
  fileName: string;
  settlements: any[];
  others: any[];
  skipped: { label: string; count: number }[];
  totalRows: number;
  missingColumns: string[];
}

// ---------- yardımcılar ----------
const pad = (n: number) => String(n).padStart(2, '0');

/** Hücreyi ISO'ya çevirir; duvar saati İstanbul (UTC+3) kabul edilir. */
function toIso(v: unknown, XLSX: any): string | null {
  if (v == null || v === '') return null;
  let y = 0, mo = 0, d = 0, h = 0, mi = 0, s = 0;
  if (v instanceof Date && !isNaN(v.getTime())) { y = v.getFullYear(); mo = v.getMonth() + 1; d = v.getDate(); h = v.getHours(); mi = v.getMinutes(); s = v.getSeconds(); }
  else if (typeof v === 'number' && isFinite(v) && XLSX?.SSF?.parse_date_code) {
    const p = XLSX.SSF.parse_date_code(v);
    if (!p || p.y < 1990) return null;
    y = p.y; mo = p.m; d = p.d; h = p.H || 0; mi = p.M || 0; s = Math.floor(p.S || 0);
  } else {
    const t = String(v).trim();
    let m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) { d = +m[1]; mo = +m[2]; y = +m[3]; h = +(m[4] || 0); mi = +(m[5] || 0); s = +(m[6] || 0); }
    else {
      m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
      if (!m) return null;
      y = +m[1]; mo = +m[2]; d = +m[3]; h = +(m[4] || 0); mi = +(m[5] || 0); s = +(m[6] || 0);
    }
  }
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(s)}+03:00`;
}

/** "1.234,56" · "1234.56" · 12 → sayı */
function toNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let t = String(v).replace(/[₺\sTLtl]/g, '');
  if (!t) return null;
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.');
  else if (t.includes(',')) t = t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** cyrb53: kısa, kararlı karma (aynı satır tekrar içe aktarılınca üzerine yazılsın) */
function hash(str: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// ---------- işlem etiketi → tür ----------
type Cls = { kind: 'settlement' | 'other'; type: string } | null;

export function classify(rawLabel: string, credit: number, debt: number): Cls {
  const raw = String(rawLabel || '');
  const n = normHeader(raw);
  if (!n) return null;
  const cancel = /iptal/.test(n);
  const S = (type: string): Cls => ({ kind: 'settlement', type });
  const O = (type: string): Cls => ({ kind: 'other', type });

  // --- diğer finansal ---
  if (/stopaj/.test(n)) return O('Stoppage');
  if (/platform hizmet/.test(n)) return O('PlatformServiceFee');
  if (/komisyon mutabakat/.test(n)) return O('CommissionAgreementInvoice');
  if (/iade fatura/.test(n)) return O('ReturnInvoice');
  if (/erken odeme|avans/.test(n)) return O('CashAdvance');
  if (/virman/.test(n)) return O('WireTransfer');
  if (/havale/.test(n)) return O('IncomingTransfer');
  if (n === 'odeme' || /^odeme (emri|tutari)/.test(n) || /hakedis odeme/.test(n)) return O('PaymentOrder');

  // --- settlements ---
  if (/kurumsal fatura|ty promosyon|ty kupon|ty indirim/.test(n)) {
    const coupon = /kupon/.test(n);
    return S(coupon ? (cancel ? 'TyCouponCancel' : 'TyCoupon') : (cancel ? 'TyDiscountCancel' : 'TyDiscount'));
  }
  if (/hakedis (pozitif|negatif) duzeltme/.test(n)) return S(`SellerRevenue${/pozitif/.test(n) ? 'Positive' : 'Negative'}${cancel ? 'Cancel' : ''}`);
  if (/komisyon (pozitif|negatif) duzeltme/.test(n)) return S(`Commission${/pozitif/.test(n) ? 'Positive' : 'Negative'}${cancel ? 'Cancel' : ''}`);
  if (/provizyon/.test(n)) return S(/provizyon\s*[+]/i.test(raw) ? 'ProvisionPositive' : /provizyon\s*[-−–]/i.test(raw) ? 'ProvisionNegative' : (credit > debt ? 'ProvisionPositive' : 'ProvisionNegative'));
  if (/kismi iade/.test(n)) return S(cancel ? 'ManualRefundCancel' : 'ManualRefund');
  if (/teslimat ucreti/.test(n)) return S(cancel ? 'DeliveryFeeCancel' : 'DeliveryFee');
  if (/^indirim/.test(n)) return S(cancel ? 'DiscountCancel' : 'Discount');
  if (/^kupon/.test(n)) return S(cancel ? 'CouponCancel' : 'Coupon');
  if (/^iade/.test(n)) return S('Return');
  if (/^satis/.test(n)) return S('Sale');
  if (/duzeltme/.test(n)) return O('FinancialItem');
  if (/fatura/.test(n)) return O('DeductionInvoices');
  return null;
}

// ---------- dosya oku ----------
export async function parseStatement(file: File): Promise<ImportPreview> {
  const XLSX: any = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const all: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });

  // Başlık satırı: ilk 20 satırda en çok sütun adı eşleşen
  const colOf = (h: unknown): Col | null => {
    const n = normHeader(h);
    if (!n) return null;
    for (const [k, list] of Object.entries(ALIASES) as [Col, string[]][]) if (list.includes(n)) return k;
    return null;
  };
  let hdr = -1, best = 0;
  for (let i = 0; i < Math.min(all.length, 20); i++) {
    const score = new Set((all[i] || []).map(colOf).filter(Boolean)).size;
    if (score > best) { best = score; hdr = i; }
  }
  if (hdr < 0 || best < 3) throw new Error('Başlık satırı bulunamadı. Dosyada en az "İşlem Tarihi", "İşlem Tipi", "Alacak/Borç" sütunları olmalı.');

  const idx: Partial<Record<Col, number>> = {};
  (all[hdr] || []).forEach((h: unknown, i: number) => { const c = colOf(h); if (c && idx[c] == null) idx[c] = i; });
  const missingColumns = (['date', 'type', 'credit', 'debt'] as Col[]).filter((c) => idx[c] == null).map((c) => ({ date: 'İşlem Tarihi', type: 'İşlem Tipi', credit: 'Alacak', debt: 'Borç' } as any)[c]);
  const g = (row: any[], c: Col) => (idx[c] == null ? null : row[idx[c]!]);

  const settlements: any[] = [], others: any[] = [];
  const skipped = new Map<string, number>();
  const dup = new Map<string, number>();
  let total = 0;

  for (let i = hdr + 1; i < all.length; i++) {
    const row = all[i];
    if (!row || row.every((x) => x == null || x === '')) continue;
    total++;
    const label = String(g(row, 'type') ?? '').trim();
    const credit = Math.abs(toNum(g(row, 'credit')) || 0), debt = Math.abs(toNum(g(row, 'debt')) || 0);
    const cls = classify(label, credit, debt);
    if (!cls) { skipped.set(label || '(boş)', (skipped.get(label || '(boş)') || 0) + 1); continue; }

    const dateIso = toIso(g(row, 'date'), XLSX);
    const order = String(g(row, 'order') ?? '').trim() || null;
    const payNo = toNum(g(row, 'payNo'));
    const base = [dateIso, cls.type, order, g(row, 'barcode'), credit, debt, payNo, g(row, 'receipt')].join('|');
    const n = (dup.get(base) || 0) + 1; dup.set(base, n);
    const id = `imp:${hash(base)}:${n}`;
    const common = {
      id, platform: 'trendyol', transaction_date: dateIso, transaction_type: cls.type, transaction_label: label,
      description: (g(row, 'desc') as string) || null, receipt_id: toNum(g(row, 'receipt')), debt, credit,
      payment_order_id: payNo, source: 'import', synced_at: new Date().toISOString(),
    };
    if (cls.kind === 'other') { others.push(common); continue; }

    const comm = toNum(g(row, 'comm'));
    const rev = toNum(g(row, 'rev'));
    settlements.push({
      ...common,
      barcode: g(row, 'barcode') != null ? String(g(row, 'barcode')) : null,
      order_number: order,
      shipment_package_id: g(row, 'pkg') != null ? String(g(row, 'pkg')) : null,
      order_date: toIso(g(row, 'orderDate'), XLSX),
      commission_rate: toNum(g(row, 'rate')),
      commission_amount: comm,
      seller_revenue: rev != null ? rev : (cls.type === 'Sale' && comm != null ? credit - Math.abs(comm) : null),
      payment_date: toIso(g(row, 'payDate'), XLSX),
    });
  }

  return {
    fileName: file.name, settlements, others, totalRows: total, missingColumns,
    skipped: [...skipped.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
  };
}

export async function commitImport(p: ImportPreview): Promise<string | null> {
  for (const [table, rows] of [['finance_settlements', p.settlements], ['finance_other', p.others]] as const) {
    for (let i = 0; i < rows.length; i += 400) {
      const { error } = await supabase.from(table).upsert(rows.slice(i, i + 400), { onConflict: 'id' });
      if (error) return `${table}: ${error.message}`;
    }
  }
  return null;
}
