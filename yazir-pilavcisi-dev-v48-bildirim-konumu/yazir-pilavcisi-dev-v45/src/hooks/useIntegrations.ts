import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface IntegrationRow {
  platform: string;
  is_enabled: boolean;
  status: 'not_connected' | 'pending_approval' | 'connected' | 'error';
  config: Record<string, any>;
  last_sync_at: string | null;
  last_order_sync_at: string | null;
  last_menu_sync_at: string | null;
  last_ok_at: string | null;
  last_error: string | null;
  error_count: number;
  updated_at: string;
}

export interface IntegrationEvent {
  id: number;
  platform: string;
  direction: 'in' | 'out';
  event_type: string;
  external_ref: string | null;
  status: 'ok' | 'error';
  error: string | null;
  created_at: string;
}

export function useIntegrations() {
  const [rows, setRows] = useState<IntegrationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const { data } = await supabase.from('integrations').select('*');
    setRows((data as IntegrationRow[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refetch();
    const ch = supabase
      .channel('integrations-' + Math.random())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'integrations' }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  return { rows, loading, refetch, get: (p: string) => rows.find((r) => r.platform === p) };
}

export function usePlatformEvents(platform: string, onlyErrors = true) {
  const [events, setEvents] = useState<IntegrationEvent[]>([]);
  const refetch = useCallback(async () => {
    let q = supabase.from('integration_events').select('id,platform,direction,event_type,external_ref,status,error,created_at')
      .eq('platform', platform).order('created_at', { ascending: false }).limit(50);
    if (onlyErrors) q = q.eq('status', 'error');
    const { data } = await q;
    setEvents((data as IntegrationEvent[]) || []);
  }, [platform, onlyErrors]);

  useEffect(() => {
    refetch();
    const ch = supabase
      .channel(`integ-events-${platform}-${Math.random()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'integration_events', filter: `platform=eq.${platform}` }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [platform, refetch]);

  return { events, refetch };
}
