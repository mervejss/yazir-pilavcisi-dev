import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { callPlatform } from '@/lib/platforms';
import type { DateRange } from '@/lib/analyticsData';
import {
  DEFAULT_FIN_SETTINGS, OTHER_COLUMNS, SETTLEMENT_COLUMNS, computeFinance, reconcilePayments,
  type FinSettings, type OtherRow, type PaymentOrderRow, type SettlementRow,
} from '@/lib/finance';

const DAY = 24 * 3600 * 1000;
const LS_KEY = 'yp.finance.settings.v1';

export const isMissingTable = (m: string | null | undefined) => !!m && /does not exist|schema cache|42P01|PGRST205/i.test(m);

async function pageAll<T>(build: (a: number, b: number) => PromiseLike<{ data: any[] | null; error: any }>, maxPages = 120) {
  const rows: T[] = [];
  for (let p = 0; p < maxPages; p++) {
    const { data, error } = await build(p * 1000, p * 1000 + 999);
    if (error) return { rows, error: (error.message || String(error)) as string };
    if (!data) break;
    rows.push(...(data as T[]));
    if (data.length < 1000) break;
  }
  return { rows, error: null as string | null };
}

export interface SyncSummary { saved: number; errors: string[]; windows: number }

export function useFinance(range: DateRange) {
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [others, setOthers] = useState<OtherRow[]>([]);
  const [paymentOrders, setPaymentOrders] = useState<PaymentOrderRow[]>([]);
  const [poSettlements, setPoSettlements] = useState<SettlementRow[]>([]);
  const [poOthers, setPoOthers] = useState<OtherRow[]>([]);
  const [settings, setSettingsState] = useState<FinSettings>(() => {
    try { return { ...DEFAULT_FIN_SETTINGS, ...JSON.parse(localStorage.getItem(LS_KEY) || '{}') }; } catch { return DEFAULT_FIN_SETTINGS; }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  // Ayarlar
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('finance_settings').select('settings').eq('id', 1).maybeSingle();
      if (data?.settings) setSettingsState({ ...DEFAULT_FIN_SETTINGS, ...(data.settings as any) });
    })();
  }, []);

  const saveSettings = useCallback(async (s: FinSettings) => {
    setSettingsState(s);
    try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* yok say */ }
    const { error: e } = await supabase.from('finance_settings').upsert({ id: 1, settings: s, updated_at: new Date().toISOString() });
    return e ? e.message : null;
  }, []);

  // Veri
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    (async () => {
      const fromIso = new Date(range.from).toISOString(), toIso = new Date(range.to).toISOString();
      const [a, b] = await Promise.all([
        pageAll<SettlementRow>((x, y) => supabase.from('finance_settlements').select(SETTLEMENT_COLUMNS)
          .gte('transaction_date', fromIso).lt('transaction_date', toIso).order('id').range(x, y)),
        pageAll<OtherRow>((x, y) => supabase.from('finance_other').select(OTHER_COLUMNS)
          .gte('transaction_date', fromIso).lt('transaction_date', toIso).order('id').range(x, y)),
      ]);
      if (!alive) return;
      const err = a.error || b.error;
      setError(err);
      setSettlements(a.rows.map(numify)); setOthers(b.rows.map((r) => ({ ...r, debt: Number(r.debt) || 0, credit: Number(r.credit) || 0 })));

      // Ödeme emirleri (aralığın ±14 günü) + o emirlere bağlı TÜM kayıtlar (mutabakat için aralıktan bağımsız)
      const po = await supabase.from('finance_payment_orders').select('id,status,amount,payout_date,payment_type')
        .gte('payout_date', new Date(range.from - 14 * DAY).toISOString()).lt('payout_date', new Date(range.to + 14 * DAY).toISOString())
        .order('payout_date', { ascending: false }).limit(80);
      if (!alive) return;
      const pos = ((po.data as any[]) || []).map((p) => ({ ...p, amount: p.amount == null ? null : Number(p.amount) })) as PaymentOrderRow[];
      setPaymentOrders(pos);
      const ids = pos.map((p) => p.id);
      const ps: SettlementRow[] = [], pOth: OtherRow[] = [];
      for (let i = 0; i < ids.length; i += 15) {
        const chunk = ids.slice(i, i + 15);
        const s1 = await pageAll<SettlementRow>((x, y) => supabase.from('finance_settlements').select(SETTLEMENT_COLUMNS).in('payment_order_id', chunk).order('id').range(x, y));
        const o1 = await pageAll<OtherRow>((x, y) => supabase.from('finance_other').select(OTHER_COLUMNS).in('payment_order_id', chunk).order('id').range(x, y));
        ps.push(...s1.rows.map(numify)); pOth.push(...o1.rows.map((r) => ({ ...r, debt: Number(r.debt) || 0, credit: Number(r.credit) || 0 })));
      }
      if (!alive) return;
      setPoSettlements(ps); setPoOthers(pOth);

      const last = await supabase.from('finance_settlements').select('synced_at').order('synced_at', { ascending: false }).limit(1).maybeSingle();
      if (alive) { setLastSyncAt((last.data as any)?.synced_at || null); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [range.from, range.to, tick]);

  const result = useMemo(() => computeFinance(settlements, others, settings), [settlements, others, settings]);
  const recon = useMemo(() => reconcilePayments(paymentOrders, poSettlements, poOthers), [paymentOrders, poSettlements, poOthers]);

  /** Seçili aralığı Trendyol'dan çeker. Trendyol en çok 15 günlük aralık kabul ettiği için 14'er günlük pencerelere bölünür. */
  const sync = useCallback(async (from: number, to: number, onProgress?: (msg: string) => void): Promise<SyncSummary> => {
    const end = Math.min(to, Date.now() + DAY);
    const windows: [number, number][] = [];
    for (let a = from; a < end; a += 14 * DAY) windows.push([a, Math.min(a + 14 * DAY, end)]);
    const errors: string[] = []; let saved = 0;
    for (let i = 0; i < windows.length; i++) {
      onProgress?.(`Trendyol'dan çekiliyor… ${i + 1}/${windows.length}`);
      const r = await callPlatform('trendyol', 'finance_sync', {
        from: windows[i][0], to: windows[i][1], kinds: i === 0 ? ['settlements', 'other', 'payment_orders'] : ['settlements', 'other'],
      });
      if (!r.ok) { errors.push(r.error || 'Bilinmeyen hata'); break; }   // kimlik/yetki hatası → diğer pencereleri deneme
      saved += (r.result?.settlements?.saved || 0) + (r.result?.other?.saved || 0);
      ['settlements', 'other'].forEach((k) => (r.result?.[k]?.errors || []).forEach((e: string) => errors.push(e)));
    }
    reload();
    return { saved, errors, windows: windows.length };
  }, [reload]);

  const refreshPaymentOrder = useCallback(async (id: number) => {
    const r = await callPlatform('trendyol', 'finance_sync', { payment_order_id: id, kinds: ['settlements', 'other'] });
    if (r.ok) reload();
    return r;
  }, [reload]);

  const probe = useCallback(() => callPlatform('trendyol', 'finance_probe'), []);

  return { settlements, others, paymentOrders, settings, saveSettings, result, recon, loading, error, lastSyncAt, reload, sync, refreshPaymentOrder, probe };
}

function numify(r: any): SettlementRow {
  const n = (v: any) => (v == null ? null : Number(v));
  return { ...r, debt: Number(r.debt) || 0, credit: Number(r.credit) || 0, commission_rate: n(r.commission_rate), commission_amount: n(r.commission_amount), seller_revenue: n(r.seller_revenue) };
}
