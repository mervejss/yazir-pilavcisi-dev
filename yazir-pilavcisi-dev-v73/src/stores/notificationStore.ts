import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { Notification } from '@/types/database';

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;

  fetch: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  subscribe: (userId: string) => () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,

  fetch: async () => {
    set({ loading: true });
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) {
      const notifs = data as unknown as Notification[];
      set({
        notifications: notifs,
        unreadCount: notifs.filter((n) => !n.is_read).length,
      });
    }
    set({ loading: false });
  },

  markRead: async (id) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, is_read: true } : n,
      ),
      unreadCount: state.notifications.filter((n) => !n.is_read && n.id !== id).length,
    }));
  },

  markAllRead: async () => {
    const unread = get().notifications.filter((n) => !n.is_read);
    if (unread.length === 0) return;
    for (const n of unread) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', n.id);
    }
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, is_read: true })),
      unreadCount: 0,
    }));
  },

  subscribe: (userId) => {
    const channel = supabase
      .channel('notifications-' + userId)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const notif = payload.new as unknown as Notification;
          set((state) => ({
            notifications: [notif, ...state.notifications],
            unreadCount: state.unreadCount + 1,
          }));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
}));
