import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { coalesce, visiblePoll } from '@/lib/polling';
import { useAlertStore } from '@/stores/alertStore';
import toast from 'react-hot-toast';

export interface CourierRequest {
  id: string;
  order_id: string;
  courier_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  created_at: string;
  orders: {
    order_no: number;
    status: string;
    district: string | null;
    delivery_address: string | null;
    customer_name: string | null;
  } | null;
}

/** Kuryelerin "bu paketi ben alıyorum" istekleri (yönetici tarafı, canlı) */
export function useCourierRequests(opts?: { notify?: boolean }) {
  const [requests, setRequests] = useState<CourierRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const seen = useRef<Set<string> | null>(null);
  const notify = opts?.notify ?? false;

  const fetchRequests = useCallback(async () => {
    const { data, error } = await supabase
      .from('courier_order_requests')
      .select('id,order_id,courier_id,status,created_at,orders(order_no,status,district,delivery_address,customer_name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (!error && data) {
      const rows = data as unknown as CourierRequest[];
      if (notify && seen.current) {
        const fresh = rows.filter((r) => !seen.current!.has(r.id));
        if (fresh.length) {
          fresh.forEach((r) =>
            useAlertStore.getState().push({
              id: `req-${r.id}`,
              kind: 'courier_request',
              title: `🛵 Kurye isteği${r.orders ? ` · #${r.orders.order_no}` : ''}`,
              body: 'Bir kurye paketi götürmek istiyor — onay bekliyor',
              link: '/admin/siparisler',
            }),
          );
        }
      }
      // Onaylanan / reddedilen isteklerin zili her cihazda susar
      const pending = new Set(rows.map((r) => r.id));
      useAlertStore.getState().dismissWhere((a) => a.kind === 'courier_request' && !pending.has(a.id.replace(/^req-/, '')));
      seen.current = new Set(rows.map((r) => r.id));
      setRequests(rows);
    }
    setLoading(false);
  }, [notify]);

  useEffect(() => {
    fetchRequests();
    const co = coalesce(fetchRequests, 1000);
    const ch = supabase
      .channel(`courier-req-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courier_order_requests' }, () => co.call())
      .subscribe();
    const stopPoll = visiblePoll(fetchRequests, 60_000);
    return () => {
      stopPoll();
      co.cancel();
      supabase.removeChannel(ch);
    };
  }, [fetchRequests]);

  const resolve = async (id: string, approve: boolean) => {
    const { error } = await supabase.rpc('resolve_courier_request', { p_request_id: id, p_approve: approve });
    if (error) {
      toast.error(error.message || 'İşlem yapılamadı');
      fetchRequests();
      return false;
    }
    toast.success(approve ? 'Kurye onaylandı ve atandı' : 'İstek reddedildi');
    fetchRequests();
    return true;
  };

  return { requests, loading, refetch: fetchRequests, resolve };
}
