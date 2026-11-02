import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Order, OrderItem } from '@/types/database';
import { beep } from '@/lib/helpers';

export interface OrderWithItems extends Order {
    items: OrderItem[];
}

export function useOrders(options?: { realtime?: boolean; statusFilter?: string[] }) {
    const [orders, setOrders] = useState<OrderWithItems[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchOrders = useCallback(async () => {
        let query = supabase
            .from('orders')
            .select('*, order_items(*)')
            .order('created_at', { ascending: false })
            .limit(100);

        if (options?.statusFilter?.length) {
            query = query.in('status', options.statusFilter);
        }

        const { data } = await query;
        if (data) {
            setOrders(
                (data as any[]).map((o) => ({
                    ...o,
                    items: o.order_items || [],
                })),
            );
        }
        setLoading(false);
    }, [options?.statusFilter]);

    useEffect(() => {
        fetchOrders();

        if (options?.realtime !== false) {
            const channelName = `orders-realtime-${Math.random()}`;
            const channel = supabase.channel(channelName);

            channel
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'orders' },
                    (payload) => {
                        if (payload.eventType === 'INSERT') {
                            beep();
                        }
                        fetchOrders();
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, [fetchOrders, options?.realtime]);

    return { orders, loading, refetch: fetchOrders };
}