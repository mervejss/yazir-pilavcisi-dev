import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
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
    const interval = setInterval(fetchCouriers, 10000);

    const channelName = `couriers-realtime-${Math.random()}`;
    const channel = supabase.channel(channelName);

    channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'courier_locations' }, () => fetchCouriers())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'courier_profiles' }, () => fetchCouriers())
        .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [fetchCouriers]);

  return { couriers, loading, refetch: fetchCouriers };
}