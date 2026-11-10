import { useEffect, useRef } from 'react';
import { PLATFORMS, callPlatform } from '@/lib/platforms';
import { supabase } from '@/lib/supabase';
import { isHidden } from '@/lib/polling';

/**
 * Yedek (fallback) senkron: yönetim paneli AÇIKKEN ve sekme GÖRÜNÜRKEN, AÇIK platformlardan siparişleri çeker.
 * Asıl 7/24 çekim sunucudaki zamanlayıcıdır (sql/18 + sql/34). Bu yüzden:
 *  - en az 60 sn, varsayılan 120 sn (eskiden 15/30 sn)
 *  - açılışta ANINDA çağrı yok (sunucu zaten çekiyor)
 *  - birden çok sekme/cihaz açıksa yalnızca BİRİ çeker (localStorage kilidi)
 *  - sekme gizliyken hiç çağrı yok
 */
const LOCK_KEY = 'yz_poll_lock';
const MIN_SECONDS = 60;
const DEFAULT_SECONDS = 120;

export function usePlatformPolling(enabled: boolean) {
  const busy = useRef<Record<string, boolean>>({});
  const tabId = useRef(Math.random().toString(36).slice(2));

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    const timers: number[] = [];

    // Aynı tarayıcıdaki diğer sekmelerle çakışmayı önle: kilit sahibi çeker, diğerleri bekler
    const iHoldLock = (platform: string, every: number): boolean => {
      const key = `${LOCK_KEY}_${platform}`;
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const [owner, ts] = raw.split('|');
          if (owner !== tabId.current && Date.now() - Number(ts) < every * 1.6) return false;
        }
        localStorage.setItem(key, `${tabId.current}|${Date.now()}`);
      } catch {
        /* localStorage yoksa kilitsiz devam */
      }
      return true;
    };

    (async () => {
      const { data } = await supabase.from('integrations').select('platform,is_enabled,config');
      if (stopped || !data) return;
      for (const row of data as any[]) {
        const meta = PLATFORMS.find((p) => p.code === row.platform);
        if (!meta?.implemented || !row.is_enabled) continue;
        const every = Math.max(MIN_SECONDS, Number(row.config?.poll_seconds) || DEFAULT_SECONDS) * 1000;
        const tick = async () => {
          if (busy.current[meta.code] || isHidden() || !iHoldLock(meta.code, every)) return;
          busy.current[meta.code] = true;
          try { await callPlatform(meta.code, 'sync_orders'); } catch { /* izole */ }
          finally { busy.current[meta.code] = false; }
        };
        timers.push(window.setInterval(tick, every));
      }
    })();

    return () => { stopped = true; timers.forEach((t) => window.clearInterval(t)); };
  }, [enabled]);
}
