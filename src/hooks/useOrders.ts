import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Order, OrderItem } from '@/types/database';

export interface OrderWithItems extends Order {
    items: OrderItem[];
}

export function useOrders(options?: { realtime?: boolean; statusFilter?: string[] }) {
    // Her render'da yeni dizi gelse bile sonsuz yenileme döngüsü olmasın diye değer anahtarı kullanılır
    const filterKey = (options?.statusFilter || []).join(',');
    const [orders, setOrders] = useState<OrderWithItems[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchOrders = useCallback(async () => {
        let query = supabase
            .from('orders')
            .select('*, order_items(*)')
            .order('created_at', { ascending: false })
            .limit(100);

        if (filterKey) {
            query = query.in('status', filterKey.split(','));
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
    }, [filterKey]);

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
                        // Sesli uyarı yalnızca panel kökündeki (AdminLayout) tek abonelikte çalar; çift bip olmasın
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