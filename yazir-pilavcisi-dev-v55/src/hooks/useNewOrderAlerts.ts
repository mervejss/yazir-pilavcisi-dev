import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAlertStore } from '@/stores/alertStore';
import { loadAlertSettings, userAlertKey } from '@/lib/alertSound';
import { useAuthStore } from '@/stores/authStore';
import { printOrderTicket } from '@/lib/printTicket';
import { tl } from '@/lib/helpers';
import { SOURCE_LABELS } from '@/lib/constants';
import { orderAlertChannel } from '@/lib/alertChannels';

export const ADMIN_ALERT_KEY = 'yz_alert_admin';

/**
 * Yönetici panelinin HER sayfasında yeni sipariş gelince:
 *  - sesli + görsel uyarı (AlertHost)
 *  - isteğe bağlı otomatik mutfak fişi
 */
export function useNewOrderAlerts(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const ch = supabase
      .channel(`new-order-alerts-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, async (payload) => {
        const o: any = payload.new;
        if (!o) return;
        // Zaten onaylanmış/hazırlanan (ör. panelden girilen) siparişte zil çalma
        if (o.status && o.status !== 'new') return;
        useAlertStore.getState().push({
          id: `order-${o.id}`,
          kind: 'order',
          channel: orderAlertChannel(o.source, o.order_type),
          title: `🛎️ Yeni sipariş #${o.order_no}`,
          body: [SOURCE_LABELS[o.source] || o.source, o.customer_name, o.district, tl(o.total)].filter(Boolean).join(' · '),
          link: '/admin/siparisler',
        });

        if (loadAlertSettings(`${userAlertKey(ADMIN_ALERT_KEY, useAuthStore.getState().user?.id)}:${orderAlertChannel(o.source, o.order_type)}`, userAlertKey(ADMIN_ALERT_KEY, useAuthStore.getState().user?.id)).autoPrint) {
          // Kalemler siparişten hemen sonra eklenir; kısa bekleyip tam siparişi çek
          setTimeout(async () => {
            const { data } = await supabase.from('orders').select('*, order_items(*)').eq('id', o.id).single();
            if (data) {
              const full: any = data;
              printOrderTicket({ ...full, items: full.order_items || [] });
            }
          }, 2000);
        }
      })
      // Sipariş herhangi bir cihazdan onaylandı / iptal edildi → bu cihazda da zil SUSAR
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
        const o: any = payload.new;
        if (!o || o.status === 'new') return;
        useAlertStore.getState().dismissWhere((a) => a.kind === 'order' && a.id === `order-${o.id}`);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [enabled]);
}
