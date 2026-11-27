// Geçmiş sipariş Excel içe aktarma (Trendyol Go "Siparişleriniz" dosyaları ve benzerleri).
// Tarayıcıda çalışır; dosya sunucuya gönderilmez. Sütunlar başlık adından otomatik eşlenir,
// yanlış eşleşen sütun ekranda elle düzeltilebilir.
import { supabase } from '@/lib/supabase';

export type FieldKey =
    | 'order_no' | 'order_code' | 'restaurant_id' | 'city' | 'district' | 'delivery_model' | 'payment_method'
    | 'platform_type' | 'ordered_at' | 'handed_to_courier_at' | 'delivered_at' | 'product_name' | 'status'
    | 'qty' | 'unit_price' | 'line_total';

export interface FieldDef { key: FieldKey; label: string; required?: boolean; aliases: string[] }

// aliases: başlık normalize edilmiş halde (küçük harf, Türkçe karakter yok, noktalama yok)
// Yemeksepeti başlıkları (sipariş id, sipariş zamanı vb.) aliases içine dahil edildi.
export const FIELD_DEFS: FieldDef[] = [
  { key: 'order_no', label: 'Sipariş No', required: true, aliases: ['siparis no', 'siparis numarasi', 'siparis numara', 'paket no', 'order no', 'order number', 'siparis id', 'siparis kodu'] },
  { key: 'order_code', label: 'Sipariş Kodu', aliases: ['siparis kodu', 'order code', 'kod'] },
  { key: 'restaurant_id', label: 'Restoran ID', aliases: ['restoran id', 'restoran no', 'restoran kodu', 'magaza id', 'magaza no', 'restaurant id', 'store id'] },
  { key: 'city', label: 'Şehir', aliases: ['sehir', 'il'] },
  { key: 'district', label: 'İlçe', aliases: ['ilce', 'semt', 'bolge'] },
  { key: 'delivery_model', label: 'Teslimat Modeli', aliases: ['teslimat modeli', 'teslimat tipi', 'teslimat sekli', 'kurye tipi', 'teslimat yontemi'] },
  { key: 'payment_method', label: 'Ödeme Yöntemi', aliases: ['odeme yontemi', 'odeme tipi', 'odeme sekli', 'odeme turu', 'odeme'] },
  { key: 'platform_type', label: 'Platform', aliases: ['platform', 'uygulama', 'kanal', 'siparis kanali'] },
  { key: 'ordered_at', label: 'Sipariş Tarihi', required: true, aliases: ['siparis tarihi', 'siparis zamani', 'siparis olusturma', 'olusturma tarihi', 'siparis saati', 'tarih'] },
  { key: 'handed_to_courier_at', label: 'Kuryeye Teslim', aliases: ['kuryeye teslim', 'kurye teslim', 'kuryeye verilis', 'yola cikis', 'hazir olma', 'kurye alis'] },
  { key: 'delivered_at', label: 'Teslim Tarihi', aliases: ['teslim tarihi', 'teslim zamani', 'teslim edilme', 'musteriye teslim', 'teslimat tarihi', 'teslim edildigi'] },
  { key: 'product_name', label: 'Ürün Adı', required: true, aliases: ['urun adi', 'urun ismi', 'urun', 'yemek adi', 'kalem', 'menu adi', 'icerik'] },
  { key: 'status', label: 'Durum', aliases: ['siparis durumu', 'durum', 'statu', 'paket durumu'] },
  { key: 'qty', label: 'Adet', aliases: ['adet', 'miktar', 'urun adedi'] },
  { key: 'unit_price', label: 'Birim Fiyat', aliases: ['birim fiyat', 'birim tutar', 'urun fiyati', 'fiyat', 'satis fiyati'] },
  { key: 'line_total', label: 'Satır Toplamı', aliases: ['satir toplami', 'urun toplami', 'toplam tutar', 'toplam', 'tutar', 'ara toplam', 'sepet'] },
];

export type Mapping = Partial<Record<FieldKey, number>>; // alan → sütun indeksi

export interface PastItemRow {
  platform: string; batch_key: string; restaurant_id: string | null; city: string | null; district: string | null;
  delivery_model: string | null; payment_method: string | null; platform_type: string | null; order_code: string | null;
  order_no: string; ordered_at: string | null; handed_to_courier_at: string | null; delivered_at: string | null;
  product_name: string; status: string | null; qty: number; unit_price: number; line_total: number; line_no: number;
}

export interface ParsedSheet { sheetName: string; headers: string[]; rows: any[][]; sheets: string[] }

// ---------- yardımcılar ----------
export function normHeader(s: unknown): string {
  return String(s ?? '')
      .toLocaleLowerCase('tr')
      .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
      .replace(/[^a-z0-9]+/g, ' ').trim();
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Excel hücresini "YYYY-MM-DD HH:MM:SS" (saat dilimi dönüşümü YOK, duvar saati) metnine çevirir. */
export function toDateStr(v: unknown, XLSX?: any): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())} ${pad(v.getHours())}:${pad(v.getMinutes())}:${pad(v.getSeconds())}`;
  }
  if (typeof v === 'number' && isFinite(v) && XLSX?.SSF?.parse_date_code) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d && d.y > 1990) return `${d.y}-${pad(d.m)}-${pad(d.d)} ${pad(d.H || 0)}:${pad(d.M || 0)}:${pad(Math.floor(d.S || 0))}`;
    return null;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])} ${pad(+(m[4] || 0))}:${m[5] || '00'}:${m[6] || '00'}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${pad(+(m[4] || 0))}:${m[5] || '00'}:${m[6] || '00'}`;
  return null;
}

export function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v).replace(/[^\d,.\-]/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

const toText = (v: unknown, max: number): string | null => {
  if (v === null || v === undefined) return null;
  const s = (typeof v === 'number' ? String(v) : String(v)).trim();
  return s ? s.slice(0, max) : null;
};

const toOrderNo = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null;
  const s = typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(v)) : String(v).trim();
  return s.replace(/\.0+$/, '').slice(0, 30) || null;
};

// ---------- dosya okuma ----------
export async function readWorkbook(file: File, sheetName?: string): Promise<ParsedSheet> {
  const XLSX: any = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: false });
  const name = sheetName && wb.SheetNames.includes(sheetName) ? sheetName : wb.SheetNames[0];
  const ws = wb.Sheets[name];
  const all: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });

  // Yemeksepeti formatında ilk satırda birleştirilmiş "Sipariş meta verileri" gibi gereksiz hücreler olabilir.
  // Asıl başlık satırını bulmak için:
  // İlk 10 satırı incele ve en çok dolu hücre içeren, hücrelerin metin olduğu satırı (genelde 2. satır) başlık kabul et.
  let maxCols = 0;
  let headerIndex = 0;

  for (let i = 0; i < Math.min(all.length, 10); i++) {
    const row = all[i];
    if (!row) continue;

    const validTextCells = row.filter(c => typeof c === 'string' && c.trim().length > 1).length;

    // Eğer bu satırda bir öncekinden çok daha fazla metin hücresi varsa (örn: 10 sütunluk asıl başlık satırı)
    // veya "siparis", "urun", "tutar" gibi kelimeler içeriyorsa burası başlık satırıdır.
    if (validTextCells > maxCols) {
      maxCols = validTextCells;
      headerIndex = i;
    }

    const rowString = row.join(' ').toLowerCase();
    if ((rowString.includes('siparis') || rowString.includes('sipariş')) &&
        (rowString.includes('urun') || rowString.includes('ürün') || rowString.includes('tutar'))) {
      headerIndex = i;
      break; // Kesin bulduk
    }
  }

  const headers = (all[headerIndex] || []).map((h) => String(h ?? '').trim());

  // Başlıkların okunduğu satırdan sonrasını veri satırı olarak döndür
  return { sheetName: name, headers, rows: all.slice(headerIndex + 1), sheets: wb.SheetNames as string[] };
}

export function autoMap(headers: string[]): Mapping {
  const norm = headers.map(normHeader);
  const used = new Set<number>();
  const map: Mapping = {};
  // 1. geçiş: tam eşleşme · 2. geçiş: başlık takma adı İÇERİYORSA
  for (const pass of [1, 2]) {
    for (const f of FIELD_DEFS) {
      if (map[f.key] !== undefined) continue;
      let idx = -1;
      for (const a of f.aliases) {
        idx = norm.findIndex((h, i) => !used.has(i) && (pass === 1 ? h === a : h.includes(a)));
        if (idx >= 0) break;
      }
      if (idx >= 0) { map[f.key] = idx; used.add(idx); }
    }
  }
  return map;
}

export interface BuildResult {
  items: Omit<PastItemRow, 'platform' | 'batch_key' | 'line_no'>[];
  skipped: number;
  orderCount: number;
  total: number;
  minDate: string | null;
  maxDate: string | null;
}

export async function buildItems(sheet: ParsedSheet, map: Mapping): Promise<BuildResult> {
  const XLSX: any = await import('xlsx');
  const g = (row: any[], k: FieldKey) => (map[k] === undefined ? null : row[map[k] as number] ?? null);
  const items: BuildResult['items'] = [];
  let skipped = 0;
  for (const row of sheet.rows) {
    const order_no = toOrderNo(g(row, 'order_no'));
    const product_name = toText(g(row, 'product_name'), 200);
    if (!order_no || !product_name) { skipped++; continue; }
    const qty = Math.max(1, Math.round(toNum(g(row, 'qty')) ?? 1));
    let unit = toNum(g(row, 'unit_price'));
    let total = toNum(g(row, 'line_total'));
    if (unit === null && total !== null) unit = Math.round((total / qty) * 100) / 100;
    if (total === null && unit !== null) total = Math.round(unit * qty * 100) / 100;
    items.push({
      restaurant_id: toText(g(row, 'restaurant_id'), 20), city: toText(g(row, 'city'), 50), district: toText(g(row, 'district'), 80),
      delivery_model: toText(g(row, 'delivery_model'), 80), payment_method: toText(g(row, 'payment_method'), 80),
      platform_type: toText(g(row, 'platform_type'), 30), order_code: toText(g(row, 'order_code'), 30), order_no,
      ordered_at: toDateStr(g(row, 'ordered_at'), XLSX), handed_to_courier_at: toDateStr(g(row, 'handed_to_courier_at'), XLSX),
      delivered_at: toDateStr(g(row, 'delivered_at'), XLSX), product_name, status: toText(g(row, 'status'), 60),
      qty, unit_price: unit ?? 0, line_total: total ?? 0,
    });
  }
  const dates = items.map((i) => i.ordered_at).filter(Boolean).map((d) => (d as string).slice(0, 10)).sort();
  return {
    items, skipped,
    orderCount: new Set(items.map((i) => i.order_no)).size,
    total: Math.round(items.reduce((t, i) => t + i.line_total, 0) * 100) / 100,
    minDate: dates[0] || null, maxDate: dates[dates.length - 1] || null,
  };
}

// ---------- veritabanına yazma ----------
export interface ImportSummary { batchKey: string; inserted: number; skippedDuplicates: number; orders: number }

async function existingOrderNos(platform: string, exceptBatch: string): Promise<Set<string>> {
  const set = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('past_order_items').select('order_no')
        .eq('platform', platform).neq('batch_key', exceptBatch).range(from, from + 999);
    if (error) throw error;
    (data || []).forEach((r: any) => set.add(String(r.order_no)));
    if (!data || data.length < 1000) break;
  }
  return set;
}

export async function importItems(platform: string, fileName: string, built: BuildResult): Promise<ImportSummary> {
  if (!built.items.length || !built.minDate || !built.maxDate) throw new Error('İçe aktarılacak geçerli satır yok (sipariş tarihi okunamadı?)');
  const batchKey = `${platform}-${built.minDate}_${built.maxDate}`;
  const dup = await existingOrderNos(platform, batchKey);
  const fresh = built.items.filter((i) => !dup.has(i.order_no));
  const skippedDuplicates = built.items.length - fresh.length;

  // aynı parti tekrar yüklenirse önce eskisi silinir (güvenli yeniden yükleme)
  await supabase.from('past_order_items').delete().eq('batch_key', batchKey);
  await supabase.from('past_order_batches').delete().eq('batch_key', batchKey);

  const counters = new Map<string, number>();
  const rows: PastItemRow[] = fresh.map((i) => {
    const n = (counters.get(i.order_no) || 0) + 1;
    counters.set(i.order_no, n);
    return { ...i, platform, batch_key: batchKey, line_no: n };
  });
  const orders = counters.size;

  const { error: be } = await supabase.from('past_order_batches').insert({
    batch_key: batchKey, platform, source_file: fileName.slice(0, 300), period_start: built.minDate, period_end: built.maxDate,
    order_count: orders, item_count: rows.length, total_amount: Math.round(rows.reduce((t, r) => t + r.line_total, 0) * 100) / 100,
  });
  if (be) throw be;
  try {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from('past_order_items').insert(rows.slice(i, i + 500));
      if (error) throw error;
    }
  } catch (e) {
    await supabase.from('past_order_items').delete().eq('batch_key', batchKey);
    await supabase.from('past_order_batches').delete().eq('batch_key', batchKey);
    throw e;
  }
  return { batchKey, inserted: rows.length, skippedDuplicates, orders };
}

export async function deleteBatch(batchKey: string): Promise<void> {
  const a = await supabase.from('past_order_items').delete().eq('batch_key', batchKey);
  if (a.error) throw a.error;
  const b = await supabase.from('past_order_batches').delete().eq('batch_key', batchKey);
  if (b.error) throw b.error;
}