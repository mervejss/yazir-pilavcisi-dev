import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { coalesce, visiblePoll } from '@/lib/polling';
import type { Order, OrderItem } from '@/types/database';

export interface OrderWithItems extends Order {
    items: OrderItem[];
}

const ACTIVE_STATUSES = ['new', 'preparing', 'ready', 'assigned', 'on_the_way'];

/**
 * v59 (egress): `orders.*` ham platform JSON'unu (external_payload, sipariş başına onlarca KB) da indiriyordu ve
 * her Realtime olayında tüm liste baştan iniyordu. Panoda bu alana ihtiyaç yok → açık sütun listesi.
 * Veritabanınızda listedeki bir sütun yoksa sorgu hata verir; o durumda otomatik olarak '*' ile yeniden denenir.
 */
const ORDER_COLS =
    'id,order_no,source,order_type,status,customer_id,customer_name,customer_phone,delivery_address,address_description,district,lat,lng,note,' +
    'payment_method,customer_payment_method,payment_status,subtotal,delivery_fee,discount,total,table_id,table_session_id,courier_id,courier_note,' +
    'external_ref,pin_code,order_code,call_center_phone,platform_app,platform_status,created_by,cancel_reason,' +
    'scheduled_for,created_at,accepted_at,ready_at,assigned_at,picked_up_at,delivered_at,cancelled_at,updated_at';
let slimColsBroken = false;
const orderSelect = () => `${slimColsBroken ? '*' : ORDER_COLS}, order_items(*)`;

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
            const run = () => Promise.all([
                supabase.from('orders').select(orderSelect()).in('status', ACTIVE_STATUSES)
                    .order('created_at', { ascending: false }).limit(300),
                supabase.from('orders').select(orderSelect()).in('status', ['delivered', 'cancelled'])
                    .or(`delivered_at.gte.${boardSince},cancelled_at.gte.${boardSince}`)
                    .order('created_at', { ascending: false }).limit(300),
            ]);
            let [open, finished] = await run();
            if ((open.error || finished.error) && !slimColsBroken) { slimColsBroken = true; [open, finished] = await run(); }
            if (!open.error && !finished.error) {
                const merged = [...((open.data as any[]) || []), ...((finished.data as any[]) || [])];
                merged.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
                setOrders(withItems(merged));
            }
            setLoading(false);
            return;
        }

        const build = () => {
            let q = supabase
                .from('orders')
                .select(light ? 'id,order_no,status,created_at' : orderSelect())
                .order('created_at', { ascending: false })
                .limit(100);
            if (filterKey) q = q.in('status', filterKey.split(','));
            return q;
        };
        let { data, error } = await build();
        if (error && !light && !slimColsBroken) { slimColsBroken = true; ({ data, error } = await build()); }
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
