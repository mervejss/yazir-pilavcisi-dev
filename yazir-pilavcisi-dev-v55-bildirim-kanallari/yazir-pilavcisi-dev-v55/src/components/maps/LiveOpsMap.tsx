import { useEffect, useMemo, useRef, useState } from 'react';
import type { CourierLive } from '@/types/database';
import {
  RESTAURANT_NAME, courierIcon, embedPlaceUrl, geocodeAddress, hasCoords, pinIcon, restaurantIcon, type LatLng,
} from '@/lib/googleMaps';
import { timeAgo } from '@/lib/helpers';
import Icon from '@/components/ui/Icon';
import { useGoogleMap } from './useGoogleMap';
import MapNotice from './MapNotice';

export interface MapOrder {
  id: string;
  order_no: number;
  status: string;
  courier_id: string | null;
  customer_name: string | null;
  district: string | null;
  delivery_address: string | null;
  lat: number | null;
  lng: number | null;
}

export type MapFocus = { type: 'courier' | 'order' | 'restaurant'; id?: string; tick?: number } | null;

interface Props {
  restaurant: LatLng;
  couriers: CourierLive[];
  orders: MapOrder[];
  focus?: MapFocus;
  onSelectCourier?: (id: string) => void;
  onSelectOrder?: (id: string) => void;
  height?: string;
}

const STATUS_COLOR: Record<string, string> = {
  new: '#f59e0b',
  preparing: '#f08a1c',
  ready: '#3b82f6',
  assigned: '#8b5cf6',
  on_the_way: '#22c55e',
};
const STATUS_LABEL: Record<string, string> = {
  new: 'Yeni',
  preparing: 'Hazırlanıyor',
  ready: 'Hazır',
  assigned: 'Kuryeye atandı',
  on_the_way: 'Yolda',
};

const STALE_MS = 2 * 60 * 1000;

export default function LiveOpsMap({ restaurant, couriers, orders, focus, onSelectCourier, onSelectOrder, height = '620px' }: Props) {
  const { ref, map, status } = useGoogleMap(restaurant, 14);
  const [traffic, setTraffic] = useState(false);
  const [geo, setGeo] = useState<Record<string, LatLng>>({});

  const restMarker = useRef<google.maps.Marker | null>(null);
  const courierMarkers = useRef(new Map<string, google.maps.Marker>());
  const orderMarkers = useRef(new Map<string, google.maps.Marker>());
  const lines = useRef(new Map<string, google.maps.Polyline>());
  const trafficLayer = useRef<google.maps.TrafficLayer | null>(null);
  const info = useRef<google.maps.InfoWindow | null>(null);
  const fittedOnce = useRef(false);
  const anim = useRef(new Map<string, number>());

  // Koordinatı olmayan siparişlerin adresini çöz
  const needGeo = useMemo(
    () => orders.filter((o) => !hasCoords(o) && o.delivery_address && !geo[o.id]),
    [orders, geo],
  );
  useEffect(() => {
    if (status !== 'ready' || needGeo.length === 0) return;
    let stop = false;
    (async () => {
      for (const o of needGeo.slice(0, 8)) {
        const p = await geocodeAddress(o.delivery_address!);
        if (stop) return;
        if (p) setGeo((g) => ({ ...g, [o.id]: p }));
      }
    })();
    return () => {
      stop = true;
    };
  }, [needGeo, status]);

  const orderPos = (o: MapOrder): LatLng | null => (hasCoords(o) ? { lat: o.lat!, lng: o.lng! } : geo[o.id] || null);

  const openInfo = (marker: google.maps.Marker, html: string) => {
    if (!map) return;
    info.current?.close();
    info.current = new google.maps.InfoWindow({ content: `<div style="font:600 13px/1.4 system-ui,sans-serif;color:#14110c;min-width:150px">${html}</div>` });
    info.current.open({ map, anchor: marker });
  };

  // Restoran işaretçisi
  useEffect(() => {
    if (!map) return;
    restMarker.current?.setMap(null);
    restMarker.current = new google.maps.Marker({
      map,
      position: restaurant,
      icon: restaurantIcon(),
      title: RESTAURANT_NAME,
      zIndex: 5,
    });
    restMarker.current.addListener('click', () => openInfo(restMarker.current!, `<b>${RESTAURANT_NAME}</b><br/>Restoran (çıkış noktası)`));
    return () => restMarker.current?.setMap(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, restaurant.lat, restaurant.lng]);

  // Kurye işaretçileri (çevrimiçi + konumu olan)
  useEffect(() => {
    if (!map) return;
    const live = couriers.filter((c) => c.is_online && c.is_active && c.lat != null && c.lng != null);
    const ids = new Set(live.map((c) => c.courier_id));

    courierMarkers.current.forEach((m, id) => {
      if (!ids.has(id)) {
        m.setMap(null);
        courierMarkers.current.delete(id);
      }
    });

    live.forEach((c) => {
      const pos = { lat: Number(c.lat), lng: Number(c.lng) };
      const stale = !c.location_updated_at || Date.now() - new Date(c.location_updated_at).getTime() > STALE_MS;
      const busy = c.active_order_count > 0;
      const color = stale ? '#9ca3af' : busy ? '#22c55e' : '#e0b93a';
      const letter = (c.full_name || 'K').charAt(0).toLocaleUpperCase('tr-TR');
      let m = courierMarkers.current.get(c.courier_id);
      if (!m) {
        m = new google.maps.Marker({ map, position: pos, icon: courierIcon(color, letter, !stale), title: c.full_name, zIndex: 20, label: undefined });
        m.addListener('click', () => {
          onSelectCourier?.(c.courier_id);
        });
        courierMarkers.current.set(c.courier_id, m);
      } else {
        m.setIcon(courierIcon(color, letter, !stale));
        // yumuşak hareket
        const from = m.getPosition()!;
        const start = performance.now();
        const prev = anim.current.get(c.courier_id);
        if (prev) cancelAnimationFrame(prev);
        const step = (t: number) => {
          const k = Math.min(1, (t - start) / 1200);
          m!.setPosition({ lat: from.lat() + (pos.lat - from.lat()) * k, lng: from.lng() + (pos.lng - from.lng()) * k });
          if (k < 1) anim.current.set(c.courier_id, requestAnimationFrame(step));
        };
        anim.current.set(c.courier_id, requestAnimationFrame(step));
      }
      (m as any).__html = `<b>${c.full_name}</b><br/>${busy ? `🟢 ${c.active_order_count} aktif paket` : '🟡 Boşta'}<br/>${
        c.location_updated_at ? `Konum: ${timeAgo(c.location_updated_at)}` : ''
      }${c.speed != null ? `<br/>Hız: ${Math.round(Number(c.speed) * 3.6)} km/s` : ''}${c.battery ? `<br/>Pil: %${c.battery}` : ''}`;
      google.maps.event.clearListeners(m, 'click');
      m.addListener('click', () => {
        onSelectCourier?.(c.courier_id);
        openInfo(m!, (m as any).__html);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, couriers]);

  // Sipariş işaretçileri + kurye→sipariş çizgileri
  useEffect(() => {
    if (!map) return;
    const active = orders.filter((o) => ['new', 'preparing', 'ready', 'assigned', 'on_the_way'].includes(o.status));
    const ids = new Set<string>();

    active.forEach((o) => {
      const p = orderPos(o);
      if (!p) return;
      ids.add(o.id);
      const color = STATUS_COLOR[o.status] || '#f59e0b';
      let m = orderMarkers.current.get(o.id);
      const icon = pinIcon(color, String(o.order_no).slice(-2), 40);
      if (!m) {
        m = new google.maps.Marker({ map, position: p, icon, title: `#${o.order_no}`, zIndex: 10 });
        orderMarkers.current.set(o.id, m);
      } else {
        m.setPosition(p);
        m.setIcon(icon);
      }
      google.maps.event.clearListeners(m, 'click');
      const courier = couriers.find((c) => c.courier_id === o.courier_id);
      m.addListener('click', () => {
        onSelectOrder?.(o.id);
        openInfo(
          m!,
          `<b>#${o.order_no}</b> · ${STATUS_LABEL[o.status] || o.status}<br/>${o.customer_name || 'Misafir'}<br/>${o.delivery_address || o.district || ''}${
            courier ? `<br/>🛵 ${courier.full_name}` : '<br/><i>Kurye atanmadı</i>'
          }`,
        );
      });

      // çizgi
      const c = courier && courier.lat != null && courier.lng != null && courier.is_online ? { lat: Number(courier.lat), lng: Number(courier.lng) } : null;
      const wantLine = !!c && ['assigned', 'on_the_way'].includes(o.status);
      const existing = lines.current.get(o.id);
      if (wantLine && c) {
        const path = [c, p];
        if (existing) existing.setPath(path);
        else
          lines.current.set(
            o.id,
            new google.maps.Polyline({
              map,
              path,
              strokeColor: '#e0b93a',
              strokeOpacity: 0,
              icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, scale: 3 }, offset: '0', repeat: '14px' }],
              zIndex: 2,
            }),
          );
      } else if (existing) {
        existing.setMap(null);
        lines.current.delete(o.id);
      }
    });

    orderMarkers.current.forEach((m, id) => {
      if (!ids.has(id)) {
        m.setMap(null);
        orderMarkers.current.delete(id);
        lines.current.get(id)?.setMap(null);
        lines.current.delete(id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, orders, couriers, geo]);

  // İlk açılışta hepsini kapsayacak şekilde yakınlaştır
  const fitAll = () => {
    if (!map) return;
    const b = new google.maps.LatLngBounds();
    b.extend(restaurant);
    courierMarkers.current.forEach((m) => m.getPosition() && b.extend(m.getPosition()!));
    orderMarkers.current.forEach((m) => m.getPosition() && b.extend(m.getPosition()!));
    map.fitBounds(b, 70);
    const z = map.getZoom();
    if (z && z > 17) map.setZoom(17);
  };
  useEffect(() => {
    if (!map || fittedOnce.current) return;
    if (courierMarkers.current.size + orderMarkers.current.size > 0) {
      fitAll();
      fittedOnce.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, couriers, orders, geo]);

  // Trafik katmanı
  useEffect(() => {
    if (!map) return;
    if (!trafficLayer.current) trafficLayer.current = new google.maps.TrafficLayer();
    trafficLayer.current.setMap(traffic ? map : null);
  }, [map, traffic]);

  // Dışarıdan odaklanma
  useEffect(() => {
    if (!map || !focus) return;
    if (focus.type === 'restaurant') {
      map.panTo(restaurant);
      map.setZoom(16);
    } else if (focus.type === 'courier' && focus.id) {
      const m = courierMarkers.current.get(focus.id);
      if (m?.getPosition()) {
        map.panTo(m.getPosition()!);
        map.setZoom(16);
        openInfo(m, (m as any).__html || '');
      }
    } else if (focus.type === 'order' && focus.id) {
      const m = orderMarkers.current.get(focus.id);
      if (m?.getPosition()) {
        map.panTo(m.getPosition()!);
        map.setZoom(16);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.type, focus?.id, focus?.tick, map]);

  // Temizlik
  useEffect(
    () => () => {
      courierMarkers.current.forEach((m) => m.setMap(null));
      orderMarkers.current.forEach((m) => m.setMap(null));
      lines.current.forEach((l) => l.setMap(null));
      anim.current.forEach((id) => cancelAnimationFrame(id));
    },
    [],
  );

  // ---- Yedek mod (API anahtarı yok / hata) ----
  if (status === 'nokey' || status === 'error' || status === 'authfail') {
    let dest: { lat?: number; lng?: number; address?: string } = { lat: restaurant.lat, lng: restaurant.lng };
    if (focus?.type === 'courier') {
      const c = couriers.find((x) => x.courier_id === focus.id);
      if (c?.lat != null) dest = { lat: Number(c.lat), lng: Number(c.lng) };
    } else if (focus?.type === 'order') {
      const o = orders.find((x) => x.id === focus.id);
      if (o) dest = hasCoords(o) ? { lat: o.lat!, lng: o.lng! } : { address: o.delivery_address || '' };
    }
    return (
      <div className="map-wrap" style={{ height }}>
        <iframe key={JSON.stringify(dest)} title="Google Harita" src={embedPlaceUrl(dest, 16)} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
        <MapNotice status={status} />
      </div>
    );
  }

  return (
    <div className="map-wrap" style={{ height }}>
      <div ref={ref} className="map-canvas" />
      {status === 'loading' && <div className="map-loading"><div className="gold-spinner" /><span>Harita yükleniyor…</span></div>}
      <div className="map-tools">
        <button type="button" className="map-tool" onClick={fitAll} title="Hepsini göster"><Icon name="map" size={16} /> Hepsini göster</button>
        <button type="button" className="map-tool" onClick={() => map && (map.panTo(restaurant), map.setZoom(16))} title="Restoran"><Icon name="home" size={16} /> Restoran</button>
        <button type="button" className={`map-tool${traffic ? ' on' : ''}`} onClick={() => setTraffic((t) => !t)} title="Trafik durumu"><Icon name="navigation" size={16} /> Trafik</button>
      </div>
      <div className="map-legend">
        <span><i style={{ background: '#e0b93a' }} /> Boşta kurye</span>
        <span><i style={{ background: '#22c55e' }} /> Paketli kurye</span>
        <span><i style={{ background: '#9ca3af' }} /> Konum eski</span>
        <span><i style={{ background: '#f59e0b' }} /> Sipariş</span>
      </div>
    </div>
  );
}
