import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { Profile, AppRole } from '@/types/database';
import type { User, Session } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  initialized: boolean;

  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string, phone?: string) => Promise<void>;
  signOut: () => Promise<void>;
  fetchProfile: () => Promise<void>;
  updateProfile: (fullName: string, phone: string) => Promise<void>;

  // Helpers
  isStaff: () => boolean;
  isOwner: () => boolean;
  isCourier: () => boolean;
  isCustomer: () => boolean;
  hasRole: (...roles: AppRole[]) => boolean;
}

const PROFILE_CACHE = 'yz_profile_cache';
const readProfileCache = (uid: string): Profile | null => {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_CACHE) || 'null');
    return p && p.id === uid ? (p as Profile) : null;
  } catch {
    return null;
  }
};
const writeProfileCache = (p: Profile | null) => {
  try {
    if (p) localStorage.setItem(PROFILE_CACHE, JSON.stringify(p));
    else localStorage.removeItem(PROFILE_CACHE);
  } catch {
    /* yoksay */
  }
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  loading: false,
  initialized: false,

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        // Önbellekteki profille anında aç (internet yavaş/yok olsa bile oturum düşmez), arkadan tazele
        const cached = readProfileCache(session.user.id);
        set({ user: session.user, session, ...(cached ? { profile: cached } : {}) });
        await get().fetchProfile();
      }
    } catch (err) {
      console.error('Auth init error:', err);
    } finally {
      set({ initialized: true });
    }

    // Auth state listener
    // Oturum YALNIZCA kullanıcı çıkış yapınca kapanır: geçici ağ hatası / boş oturum olayları kullanıcıyı atmaz
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        set({ user: null, session: null, profile: null });
        writeProfileCache(null);
        return;
      }
      if (session?.user) {
        set({ user: session.user, session });
        // Supabase iç kilidiyle çakışmamak için profil okumayı olay döngüsünün dışında yap
        setTimeout(() => get().fetchProfile(), 0);
      }
    });

    // Uygulamaya/sekmeye dönünce oturumu sessizce tazele (telefon uzun süre arka plandaysa)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') supabase.auth.getSession().catch(() => undefined);
    });
  },

  signIn: async (email, password) => {
    set({ loading: true });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      set({ user: data.user, session: data.session });
      await get().fetchProfile();
    } finally {
      set({ loading: false });
    }
  },

  signUp: async (email, password, fullName, phone) => {
    set({ loading: true });
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, phone },
        },
      });
      if (error) throw error;
      if (data.user) {
        set({ user: data.user, session: data.session });
        await get().fetchProfile();
      }
    } finally {
      set({ loading: false });
    }
  },

  signOut: async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Signout warning:', e);
    }
    set({ user: null, session: null, profile: null });
    writeProfileCache(null);
  },

  fetchProfile: async () => {
    const user = get().user;
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      if (error) {
        console.error('Fetch profile query error:', error);
      }
      if (data) {
        set({ profile: data as unknown as Profile });
        writeProfileCache(data as unknown as Profile);
      }
    } catch (e) {
      console.error('Fetch profile error:', e);
    }
  },

  updateProfile: async (fullName: string, phone: string) => {
    const user = get().user;
    if (!user) return;
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName, phone })
      .eq('id', user.id);
    if (error) throw error;
    // sync to customers table as well
    await supabase
      .from('customers')
      .update({ full_name: fullName, phone })
      .eq('user_id', user.id);
    await get().fetchProfile();
  },

  isStaff: () => {
    const role = get().profile?.role;
    return role === 'owner' || role === 'sub_admin' || role === 'operator';
  },

  isOwner: () => get().profile?.role === 'owner',

  isCourier: () => get().profile?.role === 'courier',

  isCustomer: () => {
    const role = get().profile?.role;
    return !role || role === 'customer';
  },

  hasRole: (...roles) => {
    const role = get().profile?.role;
    return role ? roles.includes(role) : false;
  },
}));
