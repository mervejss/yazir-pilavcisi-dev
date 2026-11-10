import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { coalesce, visiblePoll } from '@/lib/polling';
import type { CourierLive } from '@/types/database';

export function useCouriers() {
  const [couriers, setCouriers] = useState<CourierLive[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCouriers = useCallback(async () => {
    const { data } = await supabase.from('v_couriers_live').select('*');
    if (data) setCouriers(data as unknown as CourierLive[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCouriers();
    // Kurye konumu çok sık yazılır: olaylar 5 sn'de TEK sorguda birleşir; yedek yenileme 45 sn ve yalnızca sekme görünürken
    const co = coalesce(fetchCouriers, 5000);
    const stopPoll = visiblePoll(fetchCouriers, 45_000);

    const channelName = `couriers-realtime-${Math.random()}`;
    const channel = supabase.channel(channelName);

    channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'courier_locations' }, () => co.call())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'courier_profiles' }, () => co.call())
        .subscribe();

    return () => {
      stopPoll();
      co.cancel();
      supabase.removeChannel(channel);
    };
  }, [fetchCouriers]);

  return { couriers, loading, refetch: fetchCouriers };
}