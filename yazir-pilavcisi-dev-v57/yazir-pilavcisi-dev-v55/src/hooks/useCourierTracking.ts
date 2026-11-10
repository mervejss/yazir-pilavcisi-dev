import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { LatLng } from '@/lib/googleMaps';
import { distanceM } from '@/lib/googleMaps';

export type TrackStatus = 'off' | 'starting' | 'sharing' | 'denied' | 'unsupported' | 'error';

const MIN_INTERVAL_MS = 8000; // en sık 8 sn'de bir gönder (egress/log tasarrufu)
const MAX_INTERVAL_MS = 30000; // hareketsiz olsa bile 30 sn'de bir "buradayım" gönder
const MIN_MOVE_M = 20;

/**
 * Kurye konum paylaşımı:
 *  - enabled=true iken GPS izlenir ve update_courier_location RPC'sine gönderilir
 *  - Ekran kilitlenmesini önlemek için Wake Lock istenir (arka planda en sağlam yöntem: ekran açık + uygulama önde)
 *  - Sekme tekrar öne gelince anında konum yenilenir
 */
export function useCourierTracking(enabled: boolean) {
  const [status, setStatus] = useState<TrackStatus>('off');
  const [position, setPosition] = useState<LatLng | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [lastSent, setLastSent] = useState<Date | null>(null);
  const [wakeLock, setWakeLock] = useState(false);

  const lastRef = useRef<{ t: number; p: LatLng | null }>({ t: 0, p: null });
  const latest = useRef<GeolocationPosition | null>(null);
  const batteryRef = useRef<number | null>(null);

  const send = useCallback(async (pos: GeolocationPosition, force = false) => {
    const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const now = Date.now();
    const since = now - lastRef.current.t;
    const moved = lastRef.current.p ? distanceM(lastRef.current.p, p) : Infinity;
    if (!force && since < MIN_INTERVAL_MS) return;
    if (!force && moved < MIN_MOVE_M && since < MAX_INTERVAL_MS) return;
    lastRef.current = { t: now, p };
    const { error } = await supabase.rpc('update_courier_location', {
      p_lat: p.lat,
      p_lng: p.lng,
      p_accuracy: pos.coords.accuracy ?? null,
      p_speed: pos.coords.speed ?? null,
      p_heading: pos.coords.heading ?? null,
      p_battery: batteryRef.current,
    });
    if (error) {
      console.warn('Konum gönderilemedi:', error.message);
      setStatus('error');
    } else {
      setLastSent(new Date());
      setStatus('sharing');
    }
  }, []);

  // GPS izleme
  useEffect(() => {
    if (!enabled) {
      setStatus('off');
      return;
    }
    if (!('geolocation' in navigator)) {
      setStatus('unsupported');
      return;
    }
    setStatus('starting');

    // İzin zaten reddedilmişse GPS API'sini tekrar çağırıp sürekli izin penceresi oluşturmaya çalışma.
    // 'granted' ve 'prompt' durumunda normal şekilde tek bir watch başlatılır.
    let permissionCancelled = false;
    const checkPermission = async () => {
      try {
        if ('permissions' in navigator && (navigator as any).permissions?.query) {
          const permission = await (navigator as any).permissions.query({ name: 'geolocation' });
          if (permission.state === 'denied') { setStatus('denied'); permissionCancelled = true; }
        }
      } catch { /* Permissions API her tarayıcıda desteklenmez */ }
    };

    (navigator as any).getBattery?.().then((b: any) => {
      batteryRef.current = Math.round(b.level * 100);
      b.addEventListener?.('levelchange', () => (batteryRef.current = Math.round(b.level * 100)));
    }).catch(() => {});

    let watchId: number | null = null;
    let hb: number | null = null;
    let disposed = false;
    void (async () => {
      await checkPermission();
      if (disposed || permissionCancelled) return;
      // Tek bir watchPosition açılır; online durumu değişmedikçe yeniden izin istenmez.
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          latest.current = pos;
          setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setAccuracy(pos.coords.accuracy ?? null);
          send(pos);
        },
        (err) => {
          console.warn('GPS hatası', err);
          setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'error');
        },
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
      );
      hb = window.setInterval(() => { if (latest.current) send(latest.current); }, MAX_INTERVAL_MS);
    })();

    return () => {
      disposed = true;
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      if (hb != null) clearInterval(hb);
    };
  }, [enabled, send]);

  // Ekran kapanmasın (Wake Lock) + sekme öne gelince konumu hemen gönder
  useEffect(() => {
    if (!enabled) return;
    let lock: any = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') {
          lock = await (navigator as any).wakeLock.request('screen');
          if (!cancelled) setWakeLock(true);
          lock.addEventListener?.('release', () => setWakeLock(false));
        }
      } catch {
        setWakeLock(false);
      }
    };
    acquire();

    const onVis = () => {
      if (document.visibilityState === 'visible') {
        acquire();
        if (latest.current) send(latest.current, true);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      lock?.release?.().catch?.(() => {});
      setWakeLock(false);
    };
  }, [enabled, send]);

  return { status, position, accuracy, lastSent, wakeLock };
}
