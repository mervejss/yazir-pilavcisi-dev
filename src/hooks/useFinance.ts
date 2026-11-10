import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { callPlatform } from '@/lib/platforms';
import type { DateRange } from '@/lib/analyticsData';
import {
  DEFAULT_FIN_SETTINGS, OTHER_COLUMNS, SETTLEMENT_COLUMNS, computeFinance, reconcilePayments,
  type FinResult, type FinSettings, type OtherRow, type PaymentOrderRow, type SettlementRow,
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

export interface SyncSummary { saved: number; errors: string[]; windows: number; settlements: number; other: number; notes: string[] }

export interface CargoRow { id: string; invoice_serial: string; invoice_date: string | null; order_number: string | null; package_type: string | null; amount: number; desi: number | null }
export interface PanelOrder { no: string; total: number; at: number; keys: string[] }
export interface Coverage {
  panelOrders: number; panelRevenue: number; matched: number; matchedRevenue: number;
  pending: PanelOrder[];                   // panelde teslim görünüyor ama Trendyol finansında henüz yok
  financeOnly: number;                     // finansta var, panelde karşılığı bulunamayan sipariş
  firstTx: number | null; lastTx: number | null;
}

export function useFinance(range: DateRange) {
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [others, setOthers] = useState<OtherRow[]>([]);
  const [paymentOrders, setPaymentOrders] = useState<PaymentOrderRow[]>([]);
  const [poSettlements, setPoSettlements] = useState<SettlementRow[]>([]);
  const [poOthers, setPoOthers] = useState<OtherRow[]>([]);
  const [cargo, setCargo] = useState<CargoRow[]>([]);
  const [panelOrders, setPanelOrders] = useState<PanelOrder[]>([]);
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

      // Kargo faturası kalemleri (tablo yoksa / boşsa sessizce atla)
      try {
        const c = await pageAll<any>((x, y) => supabase.from('finance_cargo_items').select('id,invoice_serial,invoice_date,order_number,package_type,amount,desi')
          .gte('invoice_date', fromIso).lt('invoice_date', toIso).order('id').range(x, y), 20);
        if (alive) setCargo(c.error ? [] : c.rows.map((r: any) => ({ ...r, amount: Number(r.amount) || 0, desi: r.desi == null ? null : Number(r.desi) })));
      } catch { if (alive) setCargo([]); }

      // Panelde teslim edilmiş Trendyol siparişleri → finans kaydıyla eşleştirme (eksik / bekleyen kontrolü)
      try {
        const po2 = await pageAll<any>((x, y) => supabase.from('orders').select('order_no,total,created_at,pin_code,ext_no:external_payload->>orderNumber,ext_pkg:external_payload->>shipmentPackageId')
          .eq('source', 'trendyol').eq('status', 'delivered').gte('created_at', fromIso).lt('created_at', toIso).order('created_at').range(x, y), 20);
        if (alive) setPanelOrders(po2.error ? [] : po2.rows.map((o: any) => ({
          no: String(o.ext_no || o.pin_code || o.order_no || ''), total: Number(o.total) || 0, at: Date.parse(o.created_at),
          keys: [o.ext_no, o.pin_code, o.order_no, o.ext_pkg].filter((v: any) => v != null && v !== '').map(String),
        })));
      } catch { if (alive) setPanelOrders([]); }

      const last = await supabase.from('finance_settlements').select('synced_at').order('synced_at', { ascending: false }).limit(1).maybeSingle();
      if (alive) { setLastSyncAt((last.data as any)?.synced_at || null); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [range.from, range.to, tick]);

  const result = useMemo(() => computeFinance(settlements, others, settings), [settlements, others, settings]);
  const recon = useMemo(() => reconcilePayments(paymentOrders, poSettlements, poOthers), [paymentOrders, poSettlements, poOthers]);

  const coverage = useMemo<Coverage>(() => {
    const keys = new Set<string>();
    result.byOrder.forEach((o) => { if (o.orderNumber && o.orderNumber !== '—') keys.add(o.orderNumber); if (o.pkg) keys.add(o.pkg); });
    const pending: PanelOrder[] = []; let matched = 0, matchedRevenue = 0, panelRevenue = 0;
    const seenFin = new Set<string>();
    for (const p of panelOrders) {
      panelRevenue += p.total;
      const hit = p.keys.find((k) => keys.has(k));
      if (hit) { matched++; matchedRevenue += p.total; seenFin.add(hit); } else pending.push(p);
    }
    const finOnly = result.byOrder.filter((o) => !seenFin.has(o.orderNumber) && !(o.pkg && seenFin.has(o.pkg))).length;
    return { panelOrders: panelOrders.length, panelRevenue, matched, matchedRevenue, pending: pending.sort((a, b) => b.at - a.at), financeOnly: panelOrders.length ? finOnly : 0, firstTx: result.firstTx, lastTx: result.lastTx };
  }, [panelOrders, result]);

  /**
   * Seçili aralığı Trendyol'dan çeker. Trendyol en çok 15 günlük aralık kabul eder → 14'er günlük pencereler.
   * v44: her pencere için "satışlar" ve "diğer kayıtlar" AYRI çağrılır (zaman aşımı riski azalır), bir adım hata verirse
   * diğerleri DEVAM eder (eskiden ilk hatada tüm çekim duruyordu → veri eksik kalıyordu). Yalnızca kimlik/yetki hatası (401/403/404) durdurur.
   * payment-order servisi hata verse bile (Trendyol HTTP 500) çekim bozulmaz; ödeme emirleri cari ekstreden türetilir.
   */
  const sync = useCallback(async (from: number, to: number, onProgress?: (msg: string) => void): Promise<SyncSummary> => {
    const end = Math.min(to, Date.now() + DAY);
    const windows: [number, number][] = [];
    for (let a = from; a < end; a += 14 * DAY) windows.push([a, Math.min(a + 14 * DAY, end)]);
    const errors: string[] = []; const notes: string[] = [];
    let settlements = 0, other = 0, stop = false;
    const fatal = (m: string) => /HTTP (401|403|404)\b/.test(m) || /kimliği .*girilmemiş/.test(m);

    const step = async (kind: 'settlements' | 'other', w: [number, number], label: string) => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = await callPlatform('trendyol', 'finance_sync', { from: w[0], to: w[1], kinds: [kind] });
        if (r.ok) {
          const part = r.result?.[kind];
          (part?.errors || []).forEach((e: string) => errors.push(`${label}: ${e}`));
          return part?.saved || 0;
        }
        const m = r.error || 'Bilinmeyen hata';
        if (fatal(m)) { errors.push(m); stop = true; return 0; }
        if (attempt === 1) errors.push(`${label}: ${m}`);
      }
      return 0;
    };

    for (let i = 0; i < windows.length && !stop; i++) {
      const lbl = `${fmtShort(windows[i][0])}–${fmtShort(windows[i][1])}`;
      onProgress?.(`Satışlar çekiliyor… ${i + 1}/${windows.length} (${lbl})`);
      settlements += await step('settlements', windows[i], lbl);
      if (stop) break;
      onProgress?.(`Kesintiler/faturalar çekiliyor… ${i + 1}/${windows.length} (${lbl})`);
      other += await step('other', windows[i], lbl);
    }

    if (!stop) {
      onProgress?.('Ödeme emirleri ve kargo faturaları…');
      const r = await callPlatform('trendyol', 'finance_sync', { kinds: ['payment_orders', 'recent_payments', 'cargo'] });
      if (r.ok) {
        const po = r.result?.payment_orders;
        if (po?.source === 'derived' || po?.error) notes.push(`Trendyol "payment-order" servisi hata veriyor (${String(po?.warning || po?.error || '').slice(0, 90)}). Ödeme emirleri cari ekstredeki "Hakediş ödemesi" kayıtlarından türetildi — hesaplar etkilenmez.`);
        if (r.result?.cargo?.errors?.length) notes.push(`Kargo faturası detayı: ${r.result.cargo.errors[0]}`);
      } else notes.push('Ödeme emirleri güncellenemedi: ' + (r.error || ''));
    }
    reload();
    return { saved: settlements + other, errors, windows: windows.length, settlements, other, notes };
  }, [reload]);

  const refreshPaymentOrder = useCallback(async (id: number) => {
    const r = await callPlatform('trendyol', 'finance_sync', { payment_order_id: id, kinds: ['settlements', 'other'] });
    if (r.ok) reload();
    return r;
  }, [reload]);

  const probe = useCallback(() => callPlatform('trendyol', 'finance_probe'), []);

  return { settlements, others, paymentOrders, settings, saveSettings, result, recon, cargo, coverage, loading, error, lastSyncAt, reload, sync, refreshPaymentOrder, probe };
}

const fmtShort = (ms: number) => new Date(ms).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Istanbul' });

function numify(r: any): SettlementRow {
  const n = (v: any) => (v == null ? null : Number(v));
  return { ...r, debt: Number(r.debt) || 0, credit: Number(r.credit) || 0, commission_rate: n(r.commission_rate), commission_amount: n(r.commission_amount), seller_revenue: n(r.seller_revenue) };
}

/**
 * Analiz sayfası için: Trendyol'un GERÇEK cari hesap rakamları (komisyon, iade, kesinti) + maliyet ayarları.
 * Yetki yoksa / tablo yoksa `fin` null döner ve analiz tahmini oranlarla devam eder.
 */
export function useFinanceActuals(range: DateRange) {
  const [state, setState] = useState<{ fin: FinResult | null; settings: FinSettings; loading: boolean; error: string | null }>({
    fin: null, settings: DEFAULT_FIN_SETTINGS, loading: true, error: null,
  });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    (async () => {
      const fromIso = new Date(range.from).toISOString(), toIso = new Date(range.to).toISOString();
      let settings = DEFAULT_FIN_SETTINGS;
      try {
        const { data } = await supabase.from('finance_settings').select('settings').eq('id', 1).maybeSingle();
        if (data?.settings) settings = { ...DEFAULT_FIN_SETTINGS, ...(data.settings as any) };
      } catch { /* varsayılan */ }
      const [a, b] = await Promise.all([
        pageAll<SettlementRow>((x, y) => supabase.from('finance_settlements').select(SETTLEMENT_COLUMNS)
          .gte('transaction_date', fromIso).lt('transaction_date', toIso).order('id').range(x, y)),
        pageAll<OtherRow>((x, y) => supabase.from('finance_other').select(OTHER_COLUMNS)
          .gte('transaction_date', fromIso).lt('transaction_date', toIso).order('id').range(x, y)),
      ]);
      if (!alive) return;
      const err = a.error || b.error;
      if (err) { setState({ fin: null, settings, loading: false, error: err }); return; }
      const fin = computeFinance(a.rows.map(numify), b.rows.map((r) => ({ ...r, debt: Number(r.debt) || 0, credit: Number(r.credit) || 0 })), settings);
      setState({ fin: fin.hasData ? fin : null, settings, loading: false, error: null });
    })();
    return () => { alive = false; };
  }, [range.from, range.to]);
  return state;
}
