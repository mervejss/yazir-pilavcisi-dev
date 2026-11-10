import { create } from 'zustand';
import type { AlertChannel } from '@/lib/alertChannels';

export interface AlertItem {
  /** Aynı kimlikle gelen uyarı tekrar eklenmez */
  id: string;
  kind: 'order' | 'courier_request' | 'assigned' | 'open_order' | 'info';
  channel: AlertChannel;
  title: string;
  body?: string;
  link?: string;
  at: number;
}

interface AlertState {
  alerts: AlertItem[];
  /** Ses susturuldu mu (uyarı kartı duruyor ama ses çalmıyor) */
  silenced: boolean;
  push: (a: Omit<AlertItem, 'at'>) => void;
  silence: () => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
  /** Koşula uyan uyarıları kaldırır (sipariş artık beklemiyorsa her cihazda zil susar) */
  dismissWhere: (pred: (a: AlertItem) => boolean) => void;
}

export const useAlertStore = create<AlertState>((set, get) => ({
  alerts: [],
  silenced: false,
  push: (a) => {
    if (get().alerts.some((x) => x.id === a.id)) return;
    set((s) => ({ alerts: [{ ...a, at: Date.now() }, ...s.alerts].slice(0, 30), silenced: false }));
  },
  silence: () => set({ silenced: true }),
  dismiss: (id) => set((s) => ({ alerts: s.alerts.filter((x) => x.id !== id), silenced: s.alerts.length <= 1 ? false : s.silenced })),
  dismissAll: () => set({ alerts: [], silenced: false }),
  dismissWhere: (pred) =>
    set((s) => {
      const left = s.alerts.filter((a) => !pred(a));
      return left.length === s.alerts.length ? s : { alerts: left, silenced: left.length === 0 ? false : s.silenced };
    }),
}));
