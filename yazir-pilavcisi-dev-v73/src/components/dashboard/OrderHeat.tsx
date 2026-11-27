import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { tl } from '@/lib/helpers';
import { RESTAURANT_FALLBACK } from '@/lib/googleMaps';
import { useGoogleMap } from '@/components/maps/useGoogleMap';

interface Heat {
  points: Array<{ lat: number; lng: number; n: number }>;
  districts: Array<{ district: string; n: number; revenue: number }>;
}

const RANGES = [7, 30, 90];

/** Hangi mahalleden / noktadan ne kadar sipariş geldiği (konum işaretli paket siparişler) */
export default function OrderHeat() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Heat | null>(null);
  const [missing, setMissing] = useState(false);
  const { ref, map, status } = useGoogleMap(RESTAURANT_FALLBACK, 13);
  const circles = useRef<google.maps.Circle[]>([]);

  useEffect(() => {
    let off = false;
    supabase.rpc('admin_order_heat', { p_days: days }).then(({ data: d, error }) => {
      if (off) return;
      if (error) return setMissing(true);
      setMissing(false);
      setData(d as unknown as Heat);
    });
    return () => {
      off = true;
    };
  }, [days]);

  useEffect(() => {
    circles.current.forEach((c) => c.setMap(null));
    circles.current = [];
    if (!map || !data || !data.points.length) return;
    const max = Math.max(...data.points.map((p) => Number(p.n)), 1);
    const b = new google.maps.LatLngBounds();
    data.points.forEach((p) => {
      const k = Number(p.n) / max;
      const c = new google.maps.Circle({
        map,
        center: { lat: Number(p.lat), lng: Number(p.lng) },
        radius: 90 + 160 * k,
        strokeWeight: 0,
        fillColor: k > 0.66 ? '#ef4444' : k > 0.33 ? '#f59e0b' : '#3b82f6',
        fillOpacity: 0.35 + 0.35 * k,
      });
      circles.current.push(c);
      b.extend(c.getCenter()!);
    });
    map.fitBounds(b, 40);
    return () => circles.current.forEach((c) => c.setMap(null));
  }, [map, data]);

  if (missing) return null;
  const maxD = Math.max(...(data?.districts || []).map((d) => Number(d.n)), 1);
  const noMap = status === 'nokey' || status === 'error' || status === 'authfail';

  return (
    <section className="card heat">
      <div className="heat-head">
        <h2>🔥 Sipariş yoğunluğu</h2>
        <div className="seg">
          {RANGES.map((r) => (
            <button key={r} type="button" className={days === r ? 'on' : ''} onClick={() => setDays(r)}>{r} gün</button>
          ))}
        </div>
      </div>
      {!noMap && (
        <div className="map-wrap" style={{ height: '320px' }}>
          <div ref={ref} className="map-canvas" />
        </div>
      )}
      <h3>Mahalleye göre paket siparişi</h3>
      <div className="heat-bars">
        {(data?.districts || []).map((d) => (
          <div key={d.district} className="heat-row">
            <span>{d.district}</span>
            <div className="pn-bar"><i style={{ width: `${(Number(d.n) / maxD) * 100}%` }} /></div>
            <b>{d.n} · {tl(Number(d.revenue))}</b>
          </div>
        ))}
        {data && data.districts.length === 0 && <p className="muted small">Bu aralıkta paket siparişi yok.</p>}
      </div>
    </section>
  );
}
