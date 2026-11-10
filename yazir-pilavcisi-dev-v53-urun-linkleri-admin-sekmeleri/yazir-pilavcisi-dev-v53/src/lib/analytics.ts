/** Kurye & müşteri analiz sayfaları için ortak yardımcılar (İstanbul saati) */

export type RangeKey = 'today' | '7' | '30' | '90' | 'month' | '365' | 'custom';

export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Bugün' },
  { key: '7', label: '7 gün' },
  { key: '30', label: '30 gün' },
  { key: 'month', label: 'Bu ay' },
  { key: '90', label: '90 gün' },
  { key: '365', label: '12 ay' },
  { key: 'custom', label: 'Özel' },
];

export const WEEKDAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
export const WEEKDAYS_LONG = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

/** Yerel (cihaz) saatine göre iş günü başlangıcı: 03:00 */
function dayStart(offsetDays = 0): Date {
  const d = new Date();
  if (d.getHours() < 3) d.setDate(d.getDate() - 1);
  d.setDate(d.getDate() + offsetDays);
  d.setHours(3, 0, 0, 0);
  return d;
}

export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Seçili aralık → [başlangıç (dahil), bitiş (hariç)] ISO zaman damgası */
export function resolveRange(key: RangeKey, customFrom?: string, customTo?: string): { from: string; to: string; days: number } {
  const end = dayStart(1);
  let start: Date;
  if (key === 'today') start = dayStart(0);
  else if (key === '7') start = dayStart(-6);
  else if (key === '30') start = dayStart(-29);
  else if (key === '90') start = dayStart(-89);
  else if (key === '365') start = dayStart(-364);
  else if (key === 'month') {
    start = dayStart(0);
    start.setDate(1);
  } else {
    const f = customFrom ? new Date(customFrom + 'T03:00:00') : dayStart(-29);
    const t = customTo ? new Date(customTo + 'T03:00:00') : dayStart(0);
    t.setDate(t.getDate() + 1);
    start = f;
    return { from: f.toISOString(), to: t.toISOString(), days: Math.max(1, Math.round((t.getTime() - f.getTime()) / 864e5)) };
  }
  return { from: start.toISOString(), to: end.toISOString(), days: Math.max(1, Math.round((end.getTime() - start.getTime()) / 864e5)) };
}

/** 95 → "1 sa 35 dk" · 42 → "42 dk" · null → "—" */
export function fmtMin(m: number | null | undefined, opts?: { short?: boolean }): string {
  if (m == null || Number.isNaN(Number(m))) return '—';
  const v = Math.round(Number(m));
  if (v < 60) return `${v} dk`;
  const h = Math.floor(v / 60);
  const r = v % 60;
  if (opts?.short) return r ? `${h}s ${r}dk` : `${h}s`;
  return r ? `${h} sa ${r} dk` : `${h} sa`;
}

export function fmtDec(m: number | null | undefined, digits = 1): string {
  if (m == null || Number.isNaN(Number(m))) return '—';
  return Number(m).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

export function fmtPct(p: number | null | undefined): string {
  if (p == null || Number.isNaN(Number(p))) return '—';
  return `%${Number(p).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`;
}

export function hourLabel(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

export function hourRangeLabel(h: number | null | undefined): string {
  if (h == null) return '—';
  return `${String(h).padStart(2, '0')}:00–${String((h + 1) % 24).padStart(2, '0')}:00`;
}

export function initials(name: string | null | undefined): string {
  const p = (name || '?').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toLocaleUpperCase('tr') || '?';
}

/** Günlük seriyi aralıktaki boş günlerle doldurur */
export function fillDaily<T extends { day: string }>(rows: T[], fromISO: string, toISO: string, zero: (day: string) => T): T[] {
  const map = new Map(rows.map((r) => [String(r.day).slice(0, 10), r]));
  const out: T[] = [];
  const cur = new Date(fromISO);
  cur.setHours(12, 0, 0, 0);
  const end = new Date(toISO);
  let guard = 0;
  while (cur < end && guard++ < 400) {
    const key = isoDate(cur);
    out.push(map.get(key) || zero(key));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function shortDay(dayISO: string): string {
  const [, m, d] = dayISO.slice(0, 10).split('-');
  return `${d}.${m}`;
}

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const blob = new Blob(['\ufeff' + rows.map((r) => r.map(esc).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
