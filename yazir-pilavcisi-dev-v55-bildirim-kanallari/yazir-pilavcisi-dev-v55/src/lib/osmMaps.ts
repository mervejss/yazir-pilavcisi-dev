import L from 'leaflet';


export type LatLng = { lat: number; lng: number };

export type Destination = {
  lat: number | null;
  lng: number | null;
  address: string | null;
};

export const hasCoords = (
    p: { lat?: number | null; lng?: number | null } | null | undefined
): boolean =>
    p?.lat != null &&
    p?.lng != null &&
    Number.isFinite(Number(p.lat)) &&
    Number.isFinite(Number(p.lng));

export const distanceM = (a: LatLng, b: LatLng) => {
  const R = 6371000;
  const rad = (n: number) => (n * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

export const fmtKm = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);

export const osmDirectionsUrl = (dest: Destination, origin: LatLng | null) => {
  if (origin && hasCoords(dest)) {
    return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${origin.lat}%2C${origin.lng}%3B${dest.lat}%2C${dest.lng}`;
  }
  if (hasCoords(dest)) return `https://www.openstreetmap.org/?mlat=${dest.lat}&mlon=${dest.lng}#map=16/${dest.lat}/${dest.lng}`;
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(dest.address || '')}`;
};

export const makePin = (color: string, label: string, kind = 'pin') =>
  L.divIcon({
    className: 'osm-marker-shell',
    html: `<div class="osm-marker osm-marker-${kind}" style="--marker-color:${color}">${label}</div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -17],
  });

export const restaurantPin = () => makePin('#e0b93a', '⌂', 'restaurant');
export const courierPin = (color: string, label: string) => makePin(color, label, 'courier');
export const orderPin = (color: string, label: string) => makePin(color, label, 'order');

export async function geocodeAddress(address: string): Promise<LatLng | null> {
  const q = address.trim();
  if (!q) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=tr&q=${encodeURIComponent(q)}`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const rows = await response.json();
    if (!rows?.length) return null;
    return { lat: Number(rows[0].lat), lng: Number(rows[0].lon) };
  } catch {
    return null;
  }
}

export interface OsrmRoute {
  coordinates: LatLng[];
  distance: number;
  duration: number;
}

export async function getDrivingRoute(origin: LatLng, destination: LatLng): Promise<OsrmRoute | null> {
  try {
    const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
    const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`);
    if (!response.ok) return null;
    const data = await response.json();
    const route = data?.routes?.[0];
    if (!route) return null;
    return {
      coordinates: route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng })),
      distance: Number(route.distance) || 0,
      duration: Number(route.duration) || 0,
    };
  } catch {
    return null;
  }
}

export const formatDuration = (seconds: number) => {
  const mins = Math.max(1, Math.round(seconds / 60));
  return mins >= 60 ? `${Math.floor(mins / 60)} sa ${mins % 60} dk` : `${mins} dk`;
};

export function createOsmMap(container: HTMLElement, center: LatLng, zoom = 14) {
  const map = L.map(container, { zoomControl: true }).setView([center.lat, center.lng], zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> katkıda bulunanlar',
  }).addTo(map);
  return map;
}
