import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HAS_GMAPS_KEY, RESTAURANT_FALLBACK, embedPlaceUrl, geocodeFull, hasCoords, isShortMapsLink, mapsPlaceUrl, newPlacesToken, parseMapsLink,
  pinIcon, reverseGeocode, suggestPlaces, type GeoResult, type LatLng, type PlaceSuggestion,
} from '@/lib/googleMaps';
import Icon from '@/components/ui/Icon';
import { useGoogleMap } from './useGoogleMap';
import MapNotice from './MapNotice';

interface Props {
  /** Seçili konum (yoksa null) */
  value: LatLng | null;
  onChange: (p: LatLng | null) => void;
  /** Formdaki yazılı açık adres (haritada bulmak için kullanılır) */
  address: string;
  district?: string;
  /** Harita/arama bir adres önerdiğinde çağrılır. Form boşsa kendiliğinden, doluysa kullanıcı "Adrese yaz" deyince */
  onAddress?: (a: { address: string; district?: string }) => void;
  height?: string;
  /** Adres yazılınca (konum elle seçilmediyse) kendiliğinden haritada bul */
  autoLocate?: boolean;
}

/**
 * Müşteri / personel için konum seçici.
 *  - Google anahtarı varsa: arama kutusu (Places), haritaya dokunarak / pini sürükleyerek konum, GPS, adresten bulma.
 *  - Anahtar yoksa: GPS + Google Haritalar bağlantısı yapıştırma + gömülü önizleme (yedek mod).
 */
export default function LocationPicker({ value, onChange, address, district, onAddress, height = '280px', autoLocate = true }: Props) {
  const start = value || RESTAURANT_FALLBACK;
  const { ref, map, status } = useGoogleMap(start, value ? 17 : 14);
  const marker = useRef<google.maps.Marker | null>(null);
  const manual = useRef(false);
  const lastAuto = useRef('');
  const autoPlaced = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;
  const tokenRef = useRef<unknown>(undefined);

  const [q, setQ] = useState('');
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [placesOk, setPlacesOk] = useState(true);
  const [openList, setOpenList] = useState(false);
  const [suggested, setSuggested] = useState<GeoResult | null>(null);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);

  const onAddressRef = useRef(onAddress);
  onAddressRef.current = onAddress;
  const addressRef = useRef(address);
  addressRef.current = address;

  const mapsOn = HAS_GMAPS_KEY && (status === 'ready' || status === 'loading');

  /** Konumu ayarla: pin + (isteğe bağlı) adres önerisi */
  const apply = useCallback(
    async (p: LatLng, opts: { reverse?: boolean; known?: GeoResult | null; pan?: boolean } = {}) => {
      manual.current = true;
      onChange({ lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)) });
      if (map && opts.pan !== false) {
        map.panTo(p);
        if ((map.getZoom() || 0) < 16) map.setZoom(17);
      }
      let g: GeoResult | null = opts.known || null;
      if (!g && opts.reverse !== false && HAS_GMAPS_KEY) g = await reverseGeocode(p);
      if (g) {
        setSuggested(g);
        if (!addressRef.current.trim()) onAddressRef.current?.({ address: g.address, district: g.district });
      }
    },
    [map, onChange],
  );

  // Pin: değer değişince işaretçiyi güncelle
  useEffect(() => {
    if (!map) return;
    if (!value) {
      marker.current?.setMap(null);
      marker.current = null;
      return;
    }
    if (!marker.current) {
      const m = new google.maps.Marker({ map, position: value, draggable: true, icon: pinIcon('#ef4444', '⌂', 46), title: 'Teslimat noktası', zIndex: 10 });
      m.addListener('dragend', () => {
        const pos = m.getPosition();
        if (pos) apply({ lat: pos.lat(), lng: pos.lng() }, { pan: false });
      });
      marker.current = m;
    } else {
      marker.current.setPosition(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, value?.lat, value?.lng]);

  // Haritaya dokununca pin koy
  useEffect(() => {
    if (!map) return;
    const l = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (e.latLng) apply({ lat: e.latLng.lat(), lng: e.latLng.lng() }, { pan: false });
    });
    return () => l.remove();
  }, [map, apply]);

  // Dışarıdan (kayıtlı adres seçimi vb.) değer değişirse haritayı oraya götür
  useEffect(() => {
    if (map && value) map.panTo(value);
    if (!value) {
      manual.current = false;
      autoPlaced.current = false;
      setSuggested(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, value?.lat, value?.lng]);

  // Arama kutusu: Places önerileri
  useEffect(() => {
    if (!mapsOn || !placesOk) return;
    const t = q.trim();
    if (t.length < 3) {
      setItems([]);
      return;
    }
    const h = setTimeout(async () => {
      if (!tokenRef.current) tokenRef.current = await newPlacesToken();
      const r = await suggestPlaces(t, tokenRef.current);
      if (!r.ok) setPlacesOk(false);
      setItems(r.items);
      setOpenList(true);
    }, 280);
    return () => clearTimeout(h);
  }, [q, mapsOn, placesOk]);

  // Yazılı adres değişince (konum elle seçilmediyse) kendiliğinden haritada bul
  useEffect(() => {
    if (!autoLocate || !HAS_GMAPS_KEY || manual.current) return;
    // Hazır (kayıtlı) bir konum varsa ve bunu biz otomatik koymadıysak dokunma
    if (valueRef.current && !autoPlaced.current) return;
    const a = [address, district].filter(Boolean).join(', ').trim();
    if (a.length < 10 || a === lastAuto.current) return;
    const h = setTimeout(async () => {
      lastAuto.current = a;
      const g = await geocodeFull(a);
      if (g && !manual.current) {
        autoPlaced.current = true;
        onChange({ lat: Number(g.lat.toFixed(6)), lng: Number(g.lng.toFixed(6)) });
        map?.panTo({ lat: g.lat, lng: g.lng });
        map?.setZoom(17);
      }
    }, 1400);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, district, autoLocate, map]);

  const pickSuggestion = async (s: PlaceSuggestion) => {
    setOpenList(false);
    setBusy(true);
    const g = await s.resolve();
    setBusy(false);
    tokenRef.current = undefined; // oturum bitti
    if (!g) return void toast.error('Yer bulunamadı');
    setQ('');
    setItems([]);
    apply({ lat: g.lat, lng: g.lng }, { known: g });
  };

  const searchByText = async () => {
    const t = (q.trim() || [address, district].filter(Boolean).join(', ')).trim();
    if (!t) return void toast.error('Aranacak adresi yazın');
    if (!HAS_GMAPS_KEY) return void toast.error('Adresten konum bulmak için Google Maps API anahtarı gerekir');
    setBusy(true);
    const g = await geocodeFull(t);
    setBusy(false);
    if (!g) return void toast.error('Adres haritada bulunamadı. Haritaya dokunarak işaretleyebilirsiniz.');
    setOpenList(false);
    apply({ lat: g.lat, lng: g.lng }, { known: g });
  };

  const useGps = () => {
    if (!navigator.geolocation) return void toast.error('Bu cihaz konumu desteklemiyor');
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        apply({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        toast.success('Konumunuz eklendi');
      },
      () => {
        setBusy(false);
        toast.error('Konum alınamadı, lütfen izin verin');
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  const applyLink = async () => {
    if (isShortMapsLink(link)) return void toast.error('Kısa bağlantı (maps.app.goo.gl) çözülemez. Haritada paylaşılan tam bağlantıyı veya "37.95,32.50" koordinatını yapıştırın.');
    const p = parseMapsLink(link);
    if (!p) return void toast.error('Bağlantıdan koordinat okunamadı');
    setLink('');
    await apply(p);
    toast.success('Konum bağlantıdan alındı');
  };

  const clear = () => {
    manual.current = false;
    autoPlaced.current = false;
    lastAuto.current = '';
    setSuggested(null);
    onChange(null);
  };

  const url = value ? mapsPlaceUrl({ lat: value.lat, lng: value.lng }) : '';

  return (
    <div className="locpick">
      {mapsOn && (
        <div className="locpick-search">
          <div className="locpick-input">
            <Icon name="search" size={16} />
            <input
              value={q}
              placeholder="Adres, mahalle veya işletme ara (Google)…"
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => items.length && setOpenList(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (items[0] && placesOk) pickSuggestion(items[0]);
                  else searchByText();
                }
              }}
              autoComplete="off"
            />
            {q && <button type="button" className="locpick-x" onClick={() => { setQ(''); setItems([]); }} aria-label="Temizle">×</button>}
          </div>
          {openList && items.length > 0 && (
            <ul className="locpick-list">
              {items.map((s) => (
                <li key={s.id}>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pickSuggestion(s)}>
                    <Icon name="mapPin" size={15} />
                    <span><b>{s.main}</b>{s.secondary && <small>{s.secondary}</small>}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="locpick-btns">
        <button type="button" className="btn ghost sm" onClick={useGps} disabled={busy}><Icon name="navigation" size={14} /> Konumum</button>
        {HAS_GMAPS_KEY && (
          <button type="button" className="btn ghost sm" onClick={searchByText} disabled={busy}><Icon name="search" size={14} /> Yazdığım adresi haritada bul</button>
        )}
        {value && <button type="button" className="btn ghost sm" onClick={clear}>Konumu sil</button>}
      </div>

      {HAS_GMAPS_KEY ? (
        <div className="map-wrap locpick-map" style={{ height }}>
          <div ref={ref} className="map-canvas" />
          {status === 'loading' && <div className="map-loading"><div className="gold-spinner" /><span>Harita yükleniyor…</span></div>}
          {!value && status === 'ready' && <div className="map-hint">Haritaya dokunarak teslimat noktasını işaretleyin. Pini sürükleyerek ince ayar yapabilirsiniz.</div>}
          <MapNotice status={status} admin />
        </div>
      ) : (
        <div className="map-wrap locpick-map" style={{ height }}>
          <iframe
            key={value ? `${value.lat},${value.lng}` : address || 'x'}
            title="Konum önizleme"
            loading="lazy"
            src={embedPlaceUrl(value ? { lat: value.lat, lng: value.lng } : { address: [address, district].filter(Boolean).join(', ') || 'Konya' }, value ? 17 : 14)}
          />
        </div>
      )}

      {suggested && (
        <div className="locpick-sugg">
          <span><Icon name="mapPin" size={14} /> Haritadaki adres: <b>{suggested.address}</b></span>
          {onAddress && address.trim() !== suggested.address && (
            <button type="button" className="btn gold sm" onClick={() => onAddress({ address: suggested.address, district: suggested.district })}>Adrese yaz</button>
          )}
        </div>
      )}

      <div className="locpick-foot">
        {hasCoords(value) ? (
          <>
            <span className="small ok-txt">✓ Konum işaretlendi ({value!.lat.toFixed(5)}, {value!.lng.toFixed(5)})</span>
            <a className="small" href={url} target="_blank" rel="noreferrer"><Icon name="external" size={13} /> Google Haritalar'da aç</a>
            <button type="button" className="linklike small" onClick={() => navigator.clipboard?.writeText(url).then(() => toast.success('Bağlantı kopyalandı'))}>
              <Icon name="copy" size={13} /> Bağlantıyı kopyala
            </button>
          </>
        ) : (
          <span className="small muted">Konum işaretlenmedi — kurye adresi yazıdan bulur; işaretlerseniz birebir nokta gider.</span>
        )}
      </div>

      <details className="locpick-link">
        <summary>Google Haritalar bağlantısı / koordinat yapıştır</summary>
        <div className="locpick-linkrow">
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://www.google.com/maps/…@37.95,32.51…  veya  37.9575, 32.5099" />
          <button type="button" className="btn ghost sm" onClick={applyLink} disabled={!link.trim()}>Uygula</button>
        </div>
      </details>
    </div>
  );
}
