import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import type { Order, OrderItem } from '@/types/database';

export interface CustomerOrderWithItems extends Order {
  order_items: OrderItem[];
}

export function useCustomerOrders() {
  const { user } = useAuthStore();
  const [orders, setOrders] = useState<CustomerOrderWithItems[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    if (!user) {
      setOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: custData } = await supabase
          .from('customers')
          .select('id')
          .eq('user_id', user.id)
          .single();

      if (custData) {
        const { data: orderData } = await supabase
            .from('orders')
            .select('*, order_items(*)')
            .eq('customer_id', (custData as any).id)
            .order('created_at', { ascending: false });

        if (orderData) {
          setOrders(orderData as unknown as CustomerOrderWithItems[]);
        }
      }
    } catch (e) {
      console.error('Error fetching customer orders:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchOrders();

    const channelName = `my-orders-realtime-${Math.random()}`;
    const channel = supabase.channel(channelName);

    channel
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'orders' },
            () => {
              fetchOrders();
            },
        )
        .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOrders]);

  return { orders, loading, refetch: fetchOrders };
}