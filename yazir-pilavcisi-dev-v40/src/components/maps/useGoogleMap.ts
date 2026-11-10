import { useEffect, useRef, useState } from 'react';
import { DARK_MAP_STYLE, HAS_GMAPS_KEY, gmapsAuthFailed, isDarkTheme, loadGoogleMaps } from '@/lib/googleMaps';

export type MapStatus = 'nokey' | 'loading' | 'ready' | 'error' | 'authfail';

/** Bir <div> içine Google Haritası kurar; tema (koyu/açık) değişince stilini günceller. */
export function useGoogleMap(center: google.maps.LatLngLiteral, zoom: number, opts?: google.maps.MapOptions) {
  const ref = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [status, setStatus] = useState<MapStatus>(HAS_GMAPS_KEY ? 'loading' : 'nokey');

  useEffect(() => {
    if (!HAS_GMAPS_KEY) return;
    let cancelled = false;
    let m: google.maps.Map | null = null;

    loadGoogleMaps()
      .then(() => {
        if (cancelled || !ref.current) return;
        m = new google.maps.Map(ref.current, {
          center,
          zoom,
          disableDefaultUI: true,
          zoomControl: true,
          fullscreenControl: true,
          streetViewControl: false,
          mapTypeControl: false,
          clickableIcons: false,
          gestureHandling: 'greedy',
          styles: isDarkTheme() ? DARK_MAP_STYLE : [],
          ...opts,
        });
        setMap(m);
        setStatus(gmapsAuthFailed() ? 'authfail' : 'ready');
      })
      .catch(() => !cancelled && setStatus('error'));

    const onAuth = () => setStatus('authfail');
    window.addEventListener('gmaps-auth-failure', onAuth);

    // tema değişince harita stilini de değiştir
    const obs = new MutationObserver(() => m?.setOptions({ styles: isDarkTheme() ? DARK_MAP_STYLE : [] }));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      cancelled = true;
      obs.disconnect();
      window.removeEventListener('gmaps-auth-failure', onAuth);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ref, map, status };
}
