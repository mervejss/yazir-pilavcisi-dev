import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';
import MapNotice from '@/components/maps/MapNotice';
import { useGoogleMap } from '@/components/maps/useGoogleMap';
import {
  RESTAURANT_FALLBACK, courierIcon, distanceM, embedPlaceUrl, embedRouteUrl, fmtKm, hasCoords, mapsDirUrl, pinIcon, restaurantIcon, type LatLng,
} from '@/lib/googleMaps';

export interface LiveCourier {
  name: string | null;
  lat: number | null;
  lng: number | null;
  heading: number | null;
  speed: number | null;
  updated_at: string | null;
}
export interface LiveData {
  status: string;
  order_type: string;
  live: boolean;
  courier: LiveCourier | null;
  trail: Array<{ lat: number; lng: number; t: string }>;
  dest: { lat: number | null; lng: number | null; address: string | null; district: string | null };
  restaurant: { lat: number | null; lng: number | null; address: string | null };
}

export interface TrackSummary {
  meters: number;
  distanceText: string;
  etaMin: number | null;
  etaText: string;
  approx: boolean;
}

interface Props {
  data: LiveData;
  /** Tarayıcı oturumunda biriken canlı iz (sunucu izi seyrek olduğu için) */
  localTrail: LatLng[];
  onSummary?: (s: TrackSummary | null) => void;
  height?: string;
}

const REROUTE_MIN_MS = 20_000;
const REROUTE_MIN_M = 50;
const AVG_KMH = 28; // Directions yoksa şehir içi ortalama hız
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Müşteri takip haritası: restoran → kurye (canlı, hareketli) → teslimat adresi, kalan yol + tahmini süre */
export default function TrackMap({ data, localTrail, onSummary, height = '380px' }: Props) {
  const rest: LatLng = hasCoords(data.restaurant) ? { lat: data.restaurant.lat!, lng: data.restaurant.lng! } : RESTAURANT_FALLBACK;
  const dest: LatLng | null = hasCoords(data.dest) ? { lat: data.dest.lat!, lng: data.dest.lng! } : null;
  const courier: LatLng | null = data.live && hasCoords(data.courier) ? { lat: data.courier!.lat!, lng: data.courier!.lng! } : null;

  const { ref, map, status } = useGoogleMap(courier || dest || rest, 14);
  const [follow, setFollow] = useState(true);
  const followRef = useRef(true);
  followRef.current = follow;

  const mRest = useRef<google.maps.Marker | null>(null);
  const mDest = useRef<google.maps.Marker | null>(null);
  const mCour = useRef<google.maps.Marker | null>(null);
  const route = useRef<google.maps.DirectionsRenderer | null>(null);
  const line = useRef<google.maps.Polyline | null>(null);
  const trailLine = useRef<google.maps.Polyline | null>(null);
  const lastRoute = useRef<{ t: number; p: LatLng | null }>({ t: 0, p: null });
  const anim = useRef<number | null>(null);
  const curPos = useRef<LatLng | null>(null);

  // sunucu izi + yerel iz birleşimi (zaman sırasına göre, tekrarsız)
  const fullTrail = useMemo<LatLng[]>(() => {
    const pts = data.trail.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }));
    for (const p of localTrail) {
      const last = pts[pts.length - 1];
      if (!last || distanceM(last, p) > 8) pts.push(p);
    }
    return pts;
  }, [data.trail, localTrail]);

  const fitAll = () => {
    if (!map) return;
    const b = new google.maps.LatLngBounds();
    if (courier) b.extend(courier);
    if (dest) b.extend(dest);
    if (!courier && !dest) b.extend(rest);
    map.fitBounds(b, { top: 70, bottom: 50, left: 40, right: 40 });
    if (!courier && !dest) map.setZoom(16);
  };

  // Restoran + teslimat işaretçileri
  useEffect(() => {
    if (!map) return;
    mRest.current?.setMap(null);
    mRest.current = new google.maps.Marker({ map, position: rest, icon: restaurantIcon(), title: 'Yazır Pilavcısı', zIndex: 5 });
    return () => mRest.current?.setMap(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, rest.lat, rest.lng]);

  useEffect(() => {
    if (!map || !dest) return;
    mDest.current?.setMap(null);
    mDest.current = new google.maps.Marker({ map, position: dest, icon: pinIcon('#ef4444', '⌂', 46), title: 'Teslimat adresiniz', zIndex: 10 });
    return () => mDest.current?.setMap(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, dest?.lat, dest?.lng]);

  // Kurye işaretçisi: konum değişince yumuşakça kayar
  useEffect(() => {
    if (!map) return;
    if (!courier) {
      mCour.current?.setMap(null);
      mCour.current = null;
      curPos.current = null;
      return;
    }
    if (!mCour.current) {
      mCour.current = new google.maps.Marker({ map, position: courier, icon: courierIcon('#e0b93a', '🛵', true), zIndex: 20, title: data.courier?.name ? `Kurye ${data.courier.name}` : 'Kurye' });
      curPos.current = courier;
      return;
    }
    const from = curPos.current || courier;
    const to = courier;
    if (anim.current) cancelAnimationFrame(anim.current);
    const t0 = performance.now();
    const dur = 2500;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      const p = { lat: lerp(from.lat, to.lat, k), lng: lerp(from.lng, to.lng, k) };
      mCour.current?.setPosition(p);
      curPos.current = p;
      if (k < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
    if (followRef.current && dest) fitAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, courier?.lat, courier?.lng]);

  // Gidilen yol (iz)
  useEffect(() => {
    if (!map) return;
    if (!trailLine.current) trailLine.current = new google.maps.Polyline({ strokeColor: '#3b82f6', strokeOpacity: 0.75, strokeWeight: 4, zIndex: 3 });
    trailLine.current.setPath(fullTrail);
    trailLine.current.setMap(fullTrail.length > 1 ? map : null);
  }, [map, fullTrail]);

  // Kalan yol + tahmini süre
  useEffect(() => {
    if (!map || !dest) return;
    if (!courier) {
      route.current?.setMap(null);
      line.current?.setMap(null);
      onSummary?.(null);
      if (followRef.current) {
        const b = new google.maps.LatLngBounds();
        b.extend(rest);
        b.extend(dest);
        map.fitBounds(b, { top: 70, bottom: 50, left: 40, right: 40 });
      }
      return;
    }
    const now = Date.now();
    const moved = lastRoute.current.p ? distanceM(lastRoute.current.p, courier) : Infinity;
    if (now - lastRoute.current.t < REROUTE_MIN_MS && moved < REROUTE_MIN_M) return;
    lastRoute.current = { t: now, p: courier };

    const fallback = () => {
      route.current?.setMap(null);
      if (!line.current) line.current = new google.maps.Polyline({ strokeColor: '#e0b93a', strokeOpacity: 0.9, strokeWeight: 4, zIndex: 4, geodesic: true });
      line.current.setPath([courier, dest]);
      line.current.setMap(map);
      const m = distanceM(courier, dest);
      const road = m * 1.3; // kuş uçuşu → yaklaşık yol
      const mins = Math.max(1, Math.round((road / 1000 / AVG_KMH) * 60));
      onSummary?.({ meters: road, distanceText: `≈ ${fmtKm(road)}`, etaMin: mins, etaText: `≈ ${mins} dk`, approx: true });
      if (followRef.current) fitAll();
    };

    new google.maps.DirectionsService().route(
      { origin: courier, destination: dest, travelMode: google.maps.TravelMode.DRIVING, drivingOptions: { departureTime: new Date(), trafficModel: google.maps.TrafficModel.BEST_GUESS }, region: 'TR' },
      (res, st) => {
        if (st !== 'OK' || !res) return fallback();
        line.current?.setMap(null);
        if (!route.current) {
          route.current = new google.maps.DirectionsRenderer({
            suppressMarkers: true,
            preserveViewport: true,
            polylineOptions: { strokeColor: '#e0b93a', strokeOpacity: 0.95, strokeWeight: 7, zIndex: 4 },
          });
        }
        route.current.setMap(map);
        route.current.setDirections(res);
        const leg = res.routes[0]?.legs[0];
        if (leg) {
          const sec = (leg.duration_in_traffic || leg.duration)?.value || 0;
          const mins = Math.max(1, Math.round(sec / 60));
          onSummary?.({ meters: leg.distance?.value || 0, distanceText: leg.distance?.text || '', etaMin: mins, etaText: `${mins} dk`, approx: false });
        }
        if (followRef.current) fitAll();
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, courier?.lat, courier?.lng, dest?.lat, dest?.lng]);

  useEffect(
    () => () => {
      if (anim.current) cancelAnimationFrame(anim.current);
      [mRest, mDest, mCour].forEach((m) => m.current?.setMap(null));
      route.current?.setMap(null);
      line.current?.setMap(null);
      trailLine.current?.setMap(null);
    },
    [],
  );

  // Harita yüklenemediğinde (anahtar yok / reddedildi) kuş uçuşu tahmin
  const fb = status === 'nokey' || status === 'error' || status === 'authfail';
  useEffect(() => {
    if (!fb) return;
    if (courier && dest) {
      const m = distanceM(courier, dest) * 1.3;
      const mins = Math.max(1, Math.round((m / 1000 / AVG_KMH) * 60));
      onSummary?.({ meters: m, distanceText: `≈ ${fmtKm(m)}`, etaMin: mins, etaText: `≈ ${mins} dk`, approx: true });
    } else onSummary?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fb, courier?.lat, courier?.lng, dest?.lat, dest?.lng]);

  const destForLinks = { lat: dest?.lat, lng: dest?.lng, address: data.dest.address };

  // ---- Anahtar yoksa / hata: gömülü Google haritası ----
  if (status === 'nokey' || status === 'error' || status === 'authfail') {
    const src = courier ? embedRouteUrl(courier, destForLinks) : embedPlaceUrl(dest ? destForLinks : { lat: rest.lat, lng: rest.lng }, 15);
    return (
      <div className="map-wrap" style={{ height }}>
        <iframe key={src} title="Sipariş takip haritası" src={src} loading="lazy" allowFullScreen referrerPolicy="no-referrer-when-downgrade" />
        <div className="map-tools">
          <a className="map-tool on" href={mapsDirUrl(destForLinks, courier)} target="_blank" rel="noreferrer"><Icon name="external" size={16} /> Google Haritalar</a>
        </div>
        <MapNotice status={status} admin={false} />
      </div>
    );
  }

  return (
    <div className="map-wrap" style={{ height }}>
      <div ref={ref} className="map-canvas" onTouchStart={() => setFollow(false)} onMouseDown={() => setFollow(false)} />
      {status === 'loading' && <div className="map-loading"><div className="gold-spinner" /><span>Harita yükleniyor…</span></div>}
      <div className="map-tools">
        <button type="button" className={`map-tool${follow ? ' on' : ''}`} onClick={() => { setFollow(true); fitAll(); }}>
          <Icon name="navigation" size={16} /> {follow ? 'Otomatik takip' : 'Kuryeyi takip et'}
        </button>
        <a className="map-tool" href={mapsDirUrl(destForLinks, courier)} target="_blank" rel="noreferrer"><Icon name="external" size={16} /> Google Haritalar</a>
      </div>
      <div className="map-legend" aria-hidden="true">
        <span><i style={{ background: '#e0b93a' }} /> Kalan yol</span>
        <span><i style={{ background: '#3b82f6' }} /> Gidilen yol</span>
      </div>
    </div>
  );
}
