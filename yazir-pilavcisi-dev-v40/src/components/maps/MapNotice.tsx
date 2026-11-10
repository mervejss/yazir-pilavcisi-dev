import { HAS_GMAPS_KEY } from '@/lib/googleMaps';
import type { MapStatus } from './useGoogleMap';

/** Anahtar yoksa / hata varsa kısa açıklama (yönetici için) */
export default function MapNotice({ status, admin = true }: { status: MapStatus; admin?: boolean }) {
  if (status === 'ready' || status === 'loading') return null;
  let text = '';
  if (status === 'nokey' || !HAS_GMAPS_KEY)
    text = admin
      ? 'Canlı kurye işaretçileri ve yol çizimi için Google Maps API anahtarı gerekir (VITE_GOOGLE_MAPS_API_KEY). Şimdilik temel Google haritası gösteriliyor.'
      : 'Temel harita gösteriliyor.';
  else if (status === 'authfail')
    text = 'Google Maps API anahtarı reddedildi. Anahtarın alan adı kısıtlamasını ve “Maps JavaScript API” etkinliğini kontrol edin.';
  else text = 'Google Haritalar yüklenemedi. İnternet bağlantısını kontrol edin.';
  return <div className="map-notice">{text}</div>;
}
