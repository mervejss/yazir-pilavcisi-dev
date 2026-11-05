/// <reference types="google.maps" />

/**
 * Google Maps yardımcıları.
 *  - Anahtar VARSA  : Maps JavaScript API yüklenir → canlı kurye işaretçileri, yol çizimi, yakınlaştırma.
 *  - Anahtar YOKSA  : anahtarsız Google "embed" haritası + "Google Haritalar'da aç" bağlantıları kullanılır (yedek mod).
 */

export const GMAPS_KEY: string = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
export const HAS_GMAPS_KEY = GMAPS_KEY.length > 10;

/** Yazır Pilavcısı — Şht. Erkan Özbalcı Sk. No:20/b, Selçuklu / Konya (Google Haritalar pini) */
export const RESTAURANT_FALLBACK = { lat: 37.9575, lng: 32.509867 };
export const RESTAURANT_NAME = 'Yazır Pilavcısı';

export interface LatLng {
  lat: number;
  lng: number;
}

/** Hedef: koordinat varsa onu, yoksa yazılı adresi kullan */
export interface Destination {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
}

export const hasCoords = (d?: { lat?: number | null; lng?: number | null } | null): boolean =>
  !!d && typeof d.lat === 'number' && typeof d.lng === 'number' && !Number.isNaN(d.lat) && !Number.isNaN(d.lng);

const destQuery = (d: Destination) => (hasCoords(d) ? `${d.lat},${d.lng}` : `${d.address || ''}, Selçuklu, Konya`);

/** Google Haritalar uygulamasında/sitesinde yol tarifi aç (telefonda uygulamayı açar) */
export function mapsDirUrl(dest: Destination, origin?: LatLng | null): string {
  const o = origin ? `&origin=${origin.lat},${origin.lng}` : '';
  return `https://www.google.com/maps/dir/?api=1${o}&destination=${encodeURIComponent(destQuery(dest))}&travelmode=driving`;
}

export function mapsPlaceUrl(dest: Destination): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destQuery(dest))}`;
}

/** Anahtarsız gömülü harita (yedek mod) */
export function embedPlaceUrl(dest: Destination, zoom = 16): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(destQuery(dest))}&z=${zoom}&hl=tr&output=embed`;
}
export function embedRouteUrl(origin: LatLng, dest: Destination): string {
  return `https://www.google.com/maps?saddr=${origin.lat},${origin.lng}&daddr=${encodeURIComponent(destQuery(dest))}&hl=tr&output=embed`;
}

/* ------------------------------------------------------------------ */
/* Script yükleyici (tek sefer)                                        */
/* ------------------------------------------------------------------ */
let loader: Promise<typeof google> | null = null;
let authFailed = false;

export const gmapsAuthFailed = () => authFailed;

export function loadGoogleMaps(): Promise<typeof google> {
  if (!HAS_GMAPS_KEY) return Promise.reject(new Error('NO_KEY'));
  if (typeof window !== 'undefined' && (window as any).google?.maps?.Map) return Promise.resolve((window as any).google);
  if (loader) return loader;

  loader = new Promise((resolve, reject) => {
    (window as any).gm_authFailure = () => {
      authFailed = true;
      window.dispatchEvent(new Event('gmaps-auth-failure'));
    };
    (window as any).__gmapsReady = () => resolve((window as any).google);
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GMAPS_KEY)}&v=weekly&language=tr&region=TR&libraries=geometry&callback=__gmapsReady&loading=async`;
    s.async = true;
    s.defer = true;
    s.onerror = () => {
      loader = null;
      reject(new Error('LOAD_FAILED'));
    };
    document.head.appendChild(s);
  });
  return loader;
}

/* ------------------------------------------------------------------ */
/* Harita temaları                                                     */
/* ------------------------------------------------------------------ */
export const DARK_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#1a1915' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1915' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#a29b84' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#e0b93a' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#8a846f' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#1f2a1c' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2f2c24' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1a1915' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#a29b84' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#4a4228' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#e6c24d' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2a2820' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d1417' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4a5a60' }] },
];

export const isDarkTheme = () => document.documentElement.getAttribute('data-theme') === 'dark';

/* ------------------------------------------------------------------ */
/* SVG işaretçi ikonları                                               */
/* ------------------------------------------------------------------ */
const svgUrl = (svg: string) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

export function pinIcon(color: string, glyph: string, size = 44): google.maps.Icon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="54" viewBox="0 0 44 54">
    <ellipse cx="22" cy="50" rx="9" ry="3" fill="rgba(0,0,0,.28)"/>
    <path d="M22 2C11.5 2 3.5 10 3.5 20.2 3.5 33.5 22 49 22 49s18.5-15.5 18.5-28.8C40.5 10 32.5 2 22 2z" fill="${color}" stroke="#14110c" stroke-width="2.5"/>
    <circle cx="22" cy="20" r="12.5" fill="#14110c"/>
    <text x="22" y="26" text-anchor="middle" font-size="16" font-family="Arial,sans-serif" fill="${color}" font-weight="800">${glyph}</text></svg>`;
  return { url: svgUrl(svg), scaledSize: new google.maps.Size(size, (size * 54) / 44), anchor: new google.maps.Point(size / 2, (size * 54) / 44 - 4) };
}

export function courierIcon(color = '#e0b93a', letter = 'K', pulse = false): google.maps.Icon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56">
    ${pulse ? `<circle cx="28" cy="28" r="26" fill="${color}" opacity=".25"/>` : ''}
    <circle cx="28" cy="28" r="17" fill="${color}" stroke="#14110c" stroke-width="3.5"/>
    <text x="28" y="34" text-anchor="middle" font-size="17" font-family="Arial,sans-serif" font-weight="800" fill="#14110c">${letter}</text></svg>`;
  return { url: svgUrl(svg), scaledSize: new google.maps.Size(52, 52), anchor: new google.maps.Point(26, 26) };
}

export function restaurantIcon(): google.maps.Icon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="76" viewBox="0 0 64 76">
    <ellipse cx="32" cy="71" rx="12" ry="4" fill="rgba(0,0,0,.3)"/>
    <path d="M32 3C17 3 5 14.5 5 29c0 19 27 40 27 40s27-21 27-40C59 14.5 47 3 32 3z" fill="#e0b93a" stroke="#14110c" stroke-width="3"/>
    <circle cx="32" cy="28" r="18" fill="#14110c"/>
    <text x="32" y="36" text-anchor="middle" font-size="22" font-family="Arial,sans-serif">🍚</text></svg>`;
  return { url: svgUrl(svg), scaledSize: new google.maps.Size(54, 64), anchor: new google.maps.Point(27, 60) };
}

/* ------------------------------------------------------------------ */
/* Adres → koordinat (önbellekli)                                      */
/* ------------------------------------------------------------------ */
const geoCache = new Map<string, LatLng | null>();

export async function geocodeAddress(address: string): Promise<LatLng | null> {
  const key = address.trim().toLocaleLowerCase('tr-TR');
  if (!key) return null;
  if (geoCache.has(key)) return geoCache.get(key)!;
  try {
    const raw = localStorage.getItem(`yz-geo:${key}`);
    if (raw) {
      const v = JSON.parse(raw) as LatLng | null;
      geoCache.set(key, v);
      return v;
    }
  } catch {
    /* yoksay */
  }
  try {
    await loadGoogleMaps();
    const geocoder = new google.maps.Geocoder();
    const res = await geocoder.geocode({ address: `${address}, Selçuklu, Konya, Türkiye`, region: 'TR' });
    const loc = res.results[0]?.geometry.location;
    const v = loc ? { lat: loc.lat(), lng: loc.lng() } : null;
    geoCache.set(key, v);
    try {
      localStorage.setItem(`yz-geo:${key}`, JSON.stringify(v));
    } catch {
      /* yoksay */
    }
    return v;
  } catch {
    return null;
  }
}

/** İki nokta arası kuş uçuşu mesafe (metre) */
export function distanceM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export const fmtKm = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
