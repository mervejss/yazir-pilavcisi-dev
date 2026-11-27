// Hesap bölme: saf (arayüzsüz) mantık. BillSplitter bileşeni ve testler kullanır.
export interface SplitLine { key: string; name: string; variant?: string | null; unit: number; qty: number; note?: string | null }
export interface SplitRef { k: string; n: number }
export interface SplitPayment { label: string; method: string; amount: number; lines: SplitRef[] }
export interface SplitMethodOpt { value: string; label: string }

/** Kuruşa yuvarlar. (+ 0: "-0" çıkmasın — ekranda "−0,00 ₺" görünmesini önler) */
export const r2 = (n: number) => Math.round(n * 100) / 100 + 0;

/** Eski kayıtlar ("itemId#0" dizeleri) ve yeni biçim ({k,n}) → {k,n}[] */
export function normalizeRefs(raw: unknown): SplitRef[] {
  if (!Array.isArray(raw)) return [];
  const m = new Map<string, number>();
  for (const x of raw as any[]) {
    if (typeof x === 'string') { const k = x.split('#')[0]; m.set(k, (m.get(k) || 0) + 1); }
    else if (x && typeof x === 'object' && 'k' in x) { const k = String(x.k); m.set(k, (m.get(k) || 0) + Math.max(1, Number(x.n) || 1)); }
  }
  return [...m].map(([k, n]) => ({ k, n }));
}

export const splitRemaining = (payments: SplitPayment[], total: number) => r2(total - payments.reduce((a, p) => a + p.amount, 0));
