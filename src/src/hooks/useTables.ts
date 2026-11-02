import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { DiningTable, TableSession, TableQrCode } from '@/types/database';

export interface TableWithSession extends DiningTable {
  activeSession: TableSession | null;
  qrCode: TableQrCode | null;
}

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

    setTables(
        tbs.map((t) => ({
          ...t,
          activeSession: sessions.find((s) => s.table_id === t.id) || null,
          qrCode: qrs.find((q) => q.table_id === t.id) || null,
        })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTables();

    const channelName = `tables-realtime-${Math.random()}`;
    const channel = supabase.channel(channelName);

    channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'dining_tables' }, () => fetchTables())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'table_sessions' }, () => fetchTables())
        .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchTables]);

  return { tables, loading, refetch: fetchTables };
}