import { useEffect, useRef, useState } from 'react';
import {
  courierIcon, distanceM, embedPlaceUrl, embedRouteUrl, fmtKm, hasCoords, mapsDirUrl, pinIcon, type Destination, type LatLng,
} from '@/lib/googleMaps';
import { geocodeAddress } from '@/lib/googleMaps';
import Icon from '@/components/ui/Icon';
import { useGoogleMap } from './useGoogleMap';
import MapNotice from './MapNotice';

export interface RouteSummary {
  distance: string;
  duration: string;
  meters: number;
}

interface Props {
  /** Kuryenin canlı konumu */
  origin: LatLng | null;
  destination: Destination;
  orderLabel?: string;
  height?: string;
  /** Yol çizilsin mi (yola çıkılmışsa true; aksi halde yalnızca hedef gösterilir) */
  drawRoute?: boolean;
  onSummary?: (s: RouteSummary | null) => void;
}

const REROUTE_MIN_MS = 25_000;
const REROUTE_MIN_M = 60;

export default function RouteMap({ origin, destination, orderLabel, height = '300px', drawRoute = true, onSummary }: Props) {
  const startCenter = origin || (hasCoords(destination) ? { lat: destination.lat!, lng: destination.lng! } : { lat: 37.9575, lng: 32.5099 });
  const { ref, map, status } = useGoogleMap(startCenter, 15);
  const [follow, setFollow] = useState(true);
  const [dest, setDest] = useState<LatLng | null>(hasCoords(destination) ? { lat: destination.lat!, lng: destination.lng! } : null);

  const me = useRef<google.maps.Marker | null>(null);
  const target = useRef<google.maps.Marker | null>(null);
  const renderer = useRef<google.maps.DirectionsRenderer | null>(null);
  const lastRoute = useRef<{ t: number; p: LatLng | null }>({ t: 0, p: null });
  const followRef = useRef(true);
  followRef.current = follow;

  // Hedef koordinatı yoksa adresi çöz
  useEffect(() => {
    if (hasCoords(destination)) {
      setDest({ lat: destination.lat!, lng: destination.lng! });
      return;
    }
    if (status !== 'ready' || !destination.address) return;
    let off = false;
    geocodeAddress(destination.address).then((p) => !off && p && setDest(p));
    return () => {
      off = true;
    };
  }, [destination.lat, destination.lng, destination.address, status]);

  // Hedef işaretçisi
  useEffect(() => {
    if (!map || !dest) return;
    target.current?.setMap(null);
    target.current = new google.maps.Marker({ map, position: dest, icon: pinIcon('#ef4444', '⌂', 46), title: orderLabel || 'Teslimat adresi', zIndex: 10 });
    return () => target.current?.setMap(null);
  }, [map, dest?.lat, dest?.lng, orderLabel]);

  // Kurye işaretçisi (canlı)
  useEffect(() => {
    if (!map) return;
    if (!origin) {
      me.current?.setMap(null);
      me.current = null;
      return;
    }
    if (!me.current) me.current = new google.maps.Marker({ map, position: origin, icon: courierIcon('#e0b93a', '●', true), zIndex: 20, title: 'Konumunuz' });
    else me.current.setPosition(origin);
    if (followRef.current && !drawRoute) map.panTo(origin);
  }, [map, origin?.lat, origin?.lng, drawRoute]);

  // Yol çizimi (Directions) — konum çok değişince / belli aralıkla yenilenir
  useEffect(() => {
    if (!map || !dest) return;
    if (!drawRoute || !origin) {
      renderer.current?.setMap(null);
      onSummary?.(null);
      // yalnızca hedefi göster
      map.panTo(dest);
      return;
    }
    const now = Date.now();
    const moved = lastRoute.current.p ? distanceM(lastRoute.current.p, origin) : Infinity;
    if (now - lastRoute.current.t < REROUTE_MIN_MS && moved < REROUTE_MIN_M) return;
    lastRoute.current = { t: now, p: origin };

    new google.maps.DirectionsService().route(
      { origin, destination: dest, travelMode: google.maps.TravelMode.DRIVING, drivingOptions: { departureTime: new Date(), trafficModel: google.maps.TrafficModel.BEST_GUESS }, region: 'TR' },
      (res, st) => {
        if (st !== 'OK' || !res) {
          onSummary?.(null);
          return;
        }
        if (!renderer.current) {
          renderer.current = new google.maps.DirectionsRenderer({
            suppressMarkers: true,
            preserveViewport: true,
            polylineOptions: { strokeColor: '#e0b93a', strokeOpacity: 0.95, strokeWeight: 7, zIndex: 5 },
          });
        }
        renderer.current.setMap(map);
        renderer.current.setDirections(res);
        const leg = res.routes[0]?.legs[0];
        if (leg) onSummary?.({ distance: leg.distance?.text || '', duration: (leg.duration_in_traffic || leg.duration)?.text || '', meters: leg.distance?.value || 0 });
        if (followRef.current) {
          const b = new google.maps.LatLngBounds();
          b.extend(origin);
          b.extend(dest);
          map.fitBounds(b, { top: 60, bottom: 50, left: 40, right: 40 });
        }
      },
    );
  }, [map, origin?.lat, origin?.lng, dest?.lat, dest?.lng, drawRoute]);

  useEffect(
    () => () => {
      me.current?.setMap(null);
      target.current?.setMap(null);
      renderer.current?.setMap(null);
    },
    [],
  );

  const recenter = () => {
    if (!map) return;
    setFollow(true);
    const b = new google.maps.LatLngBounds();
    if (origin) b.extend(origin);
    if (dest) b.extend(dest);
    if (origin || dest) {
      map.fitBounds(b, { top: 60, bottom: 50, left: 40, right: 40 });
      if (!(origin && dest)) map.setZoom(16);
    }
  };

  // ---- Yedek mod ----
  if (status === 'nokey' || status === 'error' || status === 'authfail') {
    const src = origin && drawRoute ? embedRouteUrl(origin, destination) : embedPlaceUrl(destination, 16);
    return (
      <div className="map-wrap" style={{ height }}>
        <iframe key={src} title="Teslimat haritası" src={src} loading="lazy" allowFullScreen referrerPolicy="no-referrer-when-downgrade" />
        <div className="map-tools">
          <a className="map-tool on" href={mapsDirUrl(destination, origin)} target="_blank" rel="noreferrer"><Icon name="navigation" size={16} /> Google Haritalar'da aç</a>
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
        <button type="button" className={`map-tool${follow ? ' on' : ''}`} onClick={recenter}><Icon name="navigation" size={16} /> {follow ? 'Takip ediliyor' : 'Beni takip et'}</button>
        <a className="map-tool" href={mapsDirUrl(destination, origin)} target="_blank" rel="noreferrer"><Icon name="external" size={16} /> Google Haritalar</a>
      </div>
      {!origin && drawRoute && <div className="map-hint">Konumunuz bekleniyor… Yol çizimi için konum paylaşımını açın.</div>}
    </div>
  );
}
