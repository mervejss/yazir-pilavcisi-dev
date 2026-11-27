import { useEffect, useRef, useState } from 'react';
import { HAS_GMAPS_KEY, RESTAURANT_FALLBACK, embedPlaceUrl, geocodeAddress, hasCoords, mapsDirUrl, mapsPlaceUrl, pinIcon, restaurantIcon, type LatLng } from '@/lib/googleMaps';
import Icon from '@/components/ui/Icon';
import { useGoogleMap } from './useGoogleMap';
import MapNotice from './MapNotice';

interface Props {
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  label?: string;
  height?: string;
  /** Restoran konumunu da göster */
  showRestaurant?: boolean;
}

/** Tek bir teslimat adresini Google haritada gösterir (koordinat yoksa yazılı adresi çözer) + Google Haritalar bağlantıları. */
export default function AddressMap({ lat, lng, address, label, height = '240px', showRestaurant = true }: Props) {
  const dest = { lat, lng, address };
  const startCenter = hasCoords(dest) ? { lat: lat!, lng: lng! } : RESTAURANT_FALLBACK;
  const { ref, map, status } = useGoogleMap(startCenter, 16);
  const [pt, setPt] = useState<LatLng | null>(hasCoords(dest) ? { lat: lat!, lng: lng! } : null);
  const target = useRef<google.maps.Marker | null>(null);
  const home = useRef<google.maps.Marker | null>(null);

  useEffect(() => {
    if (hasCoords(dest)) {
      setPt({ lat: lat!, lng: lng! });
      return;
    }
    if (status !== 'ready' || !address) return;
    let off = false;
    geocodeAddress(address).then((p) => !off && p && setPt(p));
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, address, status]);

  useEffect(() => {
    if (!map || !pt) return;
    target.current?.setMap(null);
    target.current = new google.maps.Marker({ map, position: pt, icon: pinIcon('#ef4444', '⌂', 46), title: label || 'Teslimat adresi', zIndex: 10 });
    if (showRestaurant && !home.current) home.current = new google.maps.Marker({ map, position: RESTAURANT_FALLBACK, icon: restaurantIcon(), title: 'Restoran', zIndex: 5 });
    if (showRestaurant) {
      const b = new google.maps.LatLngBounds();
      b.extend(pt);
      b.extend(RESTAURANT_FALLBACK);
      map.fitBounds(b, 50);
      google.maps.event.addListenerOnce(map, 'idle', () => (map.getZoom() || 0) > 17 && map.setZoom(17));
    } else {
      map.panTo(pt);
    }
    return () => target.current?.setMap(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pt?.lat, pt?.lng]);

  useEffect(() => () => { home.current?.setMap(null); }, []);

  const links = (
    <div className="map-tools">
      <a className="map-tool on" href={mapsPlaceUrl(dest)} target="_blank" rel="noreferrer"><Icon name="external" size={15} /> Google Haritalar</a>
      <a className="map-tool" href={mapsDirUrl(dest, showRestaurant ? RESTAURANT_FALLBACK : null)} target="_blank" rel="noreferrer"><Icon name="navigation" size={15} /> Yol tarifi</a>
    </div>
  );

  if (!HAS_GMAPS_KEY || status === 'error' || status === 'authfail' || status === 'nokey') {
    return (
      <div className="map-wrap" style={{ height }}>
        <iframe title="Adres haritası" src={embedPlaceUrl(dest, 16)} loading="lazy" allowFullScreen referrerPolicy="no-referrer-when-downgrade" />
        {links}
        <MapNotice status={status} admin={false} />
      </div>
    );
  }

  return (
    <div className="map-wrap" style={{ height }}>
      <div ref={ref} className="map-canvas" />
      {status === 'loading' && <div className="map-loading"><div className="gold-spinner" /><span>Harita yükleniyor…</span></div>}
      {links}
    </div>
  );
}
