import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { coalesce, visiblePoll } from '@/lib/polling';
import type { Order, OrderItem } from '@/types/database';

export interface OrderWithItems extends Order {
    items: OrderItem[];
}

const ACTIVE_STATUSES = ['new', 'preparing', 'ready', 'assigned', 'on_the_way'];

/**
 * options.boardSince (ISO): "Siparişler panosu" modu. Açık siparişlerin TAMAMI + bu andan sonra teslim edilen / iptal edilen
 * siparişler gelir. Önceki iş günlerinin biten siparişleri panoya gelmez (→ Geçmiş Siparişler sayfasında listelenir).
 */
export function useOrders(options?: { realtime?: boolean; statusFilter?: string[]; boardSince?: string; light?: boolean }) {
    // Her render'da yeni dizi gelse bile sonsuz yenileme döngüsü olmasın diye değer anahtarı kullanılır
    const filterKey = (options?.statusFilter || []).join(',');
    const boardSince = options?.boardSince || '';
    const light = !!options?.light; // yalnızca sayaç/rozet için: kalemler çekilmez (egress ↓↓)
    const [orders, setOrders] = useState<OrderWithItems[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchOrders = useCallback(async () => {
        const withItems = (rows: any[]) => rows.map((o) => ({ ...o, items: o.order_items || [] })) as OrderWithItems[];

        if (boardSince) {
            const [open, finished] = await Promise.all([
                supabase.from('orders').select('*, order_items(*)').in('status', ACTIVE_STATUSES)
                    .order('created_at', { ascending: false }).limit(300),
                supabase.from('orders').select('*, order_items(*)').in('status', ['delivered', 'cancelled'])
                    .or(`delivered_at.gte.${boardSince},cancelled_at.gte.${boardSince}`)
                    .order('created_at', { ascending: false }).limit(300),
            ]);
            if (!open.error && !finished.error) {
                const merged = [...((open.data as any[]) || []), ...((finished.data as any[]) || [])];
                merged.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
                setOrders(withItems(merged));
            }
            setLoading(false);
            return;
        }

        let query = supabase
            .from('orders')
            .select(light ? 'id,order_no,status,created_at' : '*, order_items(*)')
            .order('created_at', { ascending: false })
            .limit(100);

        if (filterKey) {
            query = query.in('status', filterKey.split(','));
        }

        const { data } = await query;
        if (data) setOrders(withItems(data as any[]));
        setLoading(false);
    }, [filterKey, boardSince, light]);

    useEffect(() => {
        fetchOrders();

        if (options?.realtime !== false) {
            // Sipariş olayları 1,5 sn içinde TEK sorguda birleşir (eskiden her olayda 2 büyük sorgu); gizli sekmede ertelenir
            const co = coalesce(fetchOrders, 1500);
            // Gerçek zamanlı bağlantı kopsa bile pano en geç 90 sn'de tazelenir (yalnızca sekme görünürken)
            const stopPoll = visiblePoll(fetchOrders, 90_000);
            const channelName = `orders-realtime-${Math.random()}`;
            const channel = supabase.channel(channelName);

            channel
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'orders' },
                    // Sesli uyarı yalnızca panel kökündeki (AdminLayout) tek abonelikte çalar; çift bip olmasın
                    () => co.call()
                )
                .subscribe();

            return () => {
                stopPoll();
                co.cancel();
                supabase.removeChannel(channel);
            };
        }
    }, [fetchOrders, options?.realtime]);

    return { orders, loading, refetch: fetchOrders };
}
