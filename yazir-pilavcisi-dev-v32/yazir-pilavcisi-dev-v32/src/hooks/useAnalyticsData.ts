import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  analyze, fetchOrders, type AOrder, type Analysis, type DateRange,
} from '@/lib/analyticsData';

export interface TableUsageRow { table_id: string; table_number: number; session_count: number; order_count: number; revenue: number; avg_session_minutes: number | null }

/**
 * Seçili tarih aralığı (+ önceki eşdeğer dönem) için tüm siparişleri çeker.
 * Platform filtresi BURADA uygulanmaz: platform çipleri her zaman gerçek adetleri gösterebilsin diye
 * ham veri korunur, filtre bellekte (anında) uygulanır.
 */
export function useAnalyticsData(range: DateRange) {
  const [orders, setOrders] = useState<AOrder[]>([]);
  const [catalog, setCatalog] = useState<Map<string, string>>(new Map());
  const [warnings, setWarnings] = useState<string[]>([]);
  const [counts, setCounts] = useState({ live: 0, imported: 0 });
  const [courierNames, setCourierNames] = useState<Record<string, string>>({});
  const [tableUsage, setTableUsage] = useState<TableUsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const res = await fetchOrders(range.prevFrom, range.to);
      if (!alive) return;
      setOrders(res.orders);
      setCatalog(res.catalog);
      setWarnings(res.warnings);
      setCounts({ live: res.liveCount, imported: res.importedCount });
      setLoadedAt(Date.now());
      setLoading(false);

      // Yardımcı veriler: hata verirse sessizce atlanır (SQL henüz çalıştırılmamış olabilir)
      const names: Record<string, string> = {};
      try {
        const { data } = await supabase.from('profiles').select('id, full_name').eq('role', 'courier');
        (data || []).forEach((p: any) => { names[p.id] = p.full_name || 'Kurye'; });
      } catch { /* yok say */ }
      try {
        const { data } = await supabase.rpc('report_courier_overview' as any, { p_from: new Date(range.from).toISOString(), p_to: new Date(range.to).toISOString(), p_sla_min: 45 } as any);
        ((data as any[]) || []).forEach((c) => { if (c.courier_id && c.courier_name) names[c.courier_id] = c.courier_name; });
      } catch { /* yok say */ }
      if (alive) setCourierNames(names);

      try {
        const { data } = await supabase.rpc('report_table_usage' as any, { p_from: new Date(range.from).toISOString(), p_to: new Date(range.to).toISOString() } as any);
        if (alive) setTableUsage(((data as any[]) || []).map((t) => ({ ...t, revenue: Number(t.revenue) || 0 })));
      } catch { if (alive) setTableUsage([]); }
    })();
    return () => { alive = false; };
  }, [range.from, range.to, range.prevFrom, tick]);

  return { orders, catalog, warnings, counts, courierNames, tableUsage, loading, reload, loadedAt };
}

/** Platform filtresi + dönem ayrımı + analiz */
export function useAnalysis(orders: AOrder[], catalog: Map<string, string>, range: DateRange, platform: string, slaMin: number) {
  return useMemo(() => {
    const scoped = platform === 'all' ? orders : orders.filter((o) => o.platform === platform);
    const cur = scoped.filter((o) => o.ts >= range.from && o.ts < range.to);
    const prev = scoped.filter((o) => o.ts >= range.prevFrom && o.ts < range.prevTo);
    return { cur, prev, analysis: analyze(cur, prev, range, catalog, slaMin) as Analysis };
  }, [orders, catalog, range, platform, slaMin]);
}

/** Platform çipleri için sayaçlar (seçili dönem, tüm durumlar) */
export function usePlatformCounts(orders: AOrder[], range: DateRange) {
  return useMemo(() => {
    const out: Record<string, { orders: number; revenue: number; cancelled: number }> = { all: { orders: 0, revenue: 0, cancelled: 0 } };
    orders.forEach((o) => {
      if (o.ts < range.from || o.ts >= range.to) return;
      const rev = o.status === 'delivered' ? o.total : 0;
      const c = o.status === 'cancelled' ? 1 : 0;
      (out[o.platform] ||= { orders: 0, revenue: 0, cancelled: 0 });
      out[o.platform].orders++; out[o.platform].revenue += rev; out[o.platform].cancelled += c;
      out.all.orders++; out.all.revenue += rev; out.all.cancelled += c;
    });
    return out;
  }, [orders, range]);
}
