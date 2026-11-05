import { useEffect, useRef } from 'react';
import { PLATFORMS, callPlatform } from '@/lib/platforms';
import { supabase } from '@/lib/supabase';

/**
 * Yönetim paneli açıkken, AÇIK ve HAZIR platformlardan siparişleri çeker.
 * Her platform kendi try/catch'inde, bağımsız zamanlayıcıyla çalışır → biri takılırsa diğerleri etkilenmez.
 * (7/24 çalışma için sunucu zamanlayıcısı önerilir: README → "Zamanlayıcı".)
 */
export function usePlatformPolling(enabled: boolean) {
  const busy = useRef<Record<string, boolean>>({});

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    const timers: number[] = [];

    (async () => {
      const { data } = await supabase.from('integrations').select('platform,is_enabled,config');
      if (stopped || !data) return;
      for (const row of data as any[]) {
        const meta = PLATFORMS.find((p) => p.code === row.platform);
        if (!meta?.implemented || !row.is_enabled) continue;
        const every = Math.max(15, Number(row.config?.poll_seconds) || 30) * 1000;
        const tick = async () => {
          if (busy.current[meta.code] || document.hidden) return;
          busy.current[meta.code] = true;
          try { await callPlatform(meta.code, 'sync_orders'); } catch { /* izole */ }
          finally { busy.current[meta.code] = false; }
        };
        timers.push(window.setInterval(tick, every));
        tick();
      }
    })();

    return () => { stopped = true; timers.forEach((t) => window.clearInterval(t)); };
  }, [enabled]);
}
