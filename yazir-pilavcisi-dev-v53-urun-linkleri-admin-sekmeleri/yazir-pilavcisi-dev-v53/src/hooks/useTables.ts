import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { coalesce } from '@/lib/polling';
import type { DiningTable, TableSession, TableQrCode } from '@/types/database';

export interface TableWithSession extends DiningTable {
  activeSession: TableSession | null;
  qrCode: TableQrCode | null;
  /** Açık hesaptaki (iptal edilmemiş) siparişlerin toplamı */
  sessionTotal: number;
  /** Açık hesaptaki sipariş sayısı */
  sessionOrders: number;
  /** Henüz servis edilmemiş sipariş sayısı */
  unserved: number;
}

const UNSERVED = ['new', 'preparing', 'ready', 'assigned', 'on_the_way'];

export function useTables() {
  const [tables, setTables] = useState<TableWithSession[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTables = useCallback(async () => {
    const [tableRes, sessionRes, qrRes] = await Promise.all([
      supabase.from('dining_tables').select('*').eq('is_active', true).order('number'),
      supabase.from('table_sessions').select('*').eq('status', 'open'),
      supabase.from('table_qr_codes').select('*').eq('is_active', true),
    ]);

    const tbs = (tableRes.data || []) as unknown as DiningTable[];
    const sessions = (sessionRes.data || []) as unknown as TableSession[];
    const qrs = (qrRes.data || []) as unknown as TableQrCode[];

    // Açık hesapların sipariş toplamları
    const totals = new Map<string, { total: number; count: number; unserved: number }>();
    if (sessions.length) {
      const { data: ords } = await supabase
        .from('orders')
        .select('table_session_id,total,status')
        .in('table_session_id', sessions.map((s) => s.id))
        .neq('status', 'cancelled');
      ((ords || []) as any[]).forEach((o) => {
        const cur = totals.get(o.table_session_id) || { total: 0, count: 0, unserved: 0 };
        cur.total += Number(o.total) || 0;
        cur.count += 1;
        if (UNSERVED.includes(o.status)) cur.unserved += 1;
        totals.set(o.table_session_id, cur);
      });
    }

    setTables(
      tbs.map((t) => {
        const session = sessions.find((s) => s.table_id === t.id) || null;
        const agg = session ? totals.get(session.id) : undefined;
        return {
          ...t,
          activeSession: session,
          qrCode: qrs.find((q) => q.table_id === t.id) || null,
          sessionTotal: agg?.total || 0,
          sessionOrders: agg?.count || 0,
          unserved: agg?.unserved || 0,
        };
      }),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchTables();

    const co = coalesce(fetchTables, 1500);
    const schedule = () => co.call();

    const channel = supabase
      .channel(`tables-realtime-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dining_tables' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_sessions' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_qr_codes' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, schedule)
      .subscribe();

    return () => {
      co.cancel();
      void supabase.removeChannel(channel);
    };
  }, [fetchTables]);

  return { tables, loading, refetch: fetchTables };
}
