import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { ORDER_STATUS_LABELS } from '@/lib/constants';
import { tl, formatDateTime } from '@/lib/helpers';
import { distanceM, fmtKm, type LatLng } from '@/lib/googleMaps';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Icon from '@/components/ui/Icon';
import TrackMap, { type LiveData, type TrackSummary } from '@/components/track/TrackMap';

interface TrackData {
  order_no: number;
  status: string;
  status_label: string;
  order_type: string;
  total: number;
  payment_method: string | null;
  created_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  estimated_min: number;
  estimated_max: number;
  courier_first_name: string | null;
  items: Array<{ name: string; variant: string | null; quantity: number; price: number }>;
}

const hm = (d: Date) => d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
const ago = (iso: string | null) => {
  if (!iso) return null;
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 10) return 'şimdi';
  if (s < 60) return `${s} sn önce`;
  if (s < 3600) return `${Math.round(s / 60)} dk önce`;
  return `${Math.round(s / 3600)} sa önce`;
};

export default function TrackPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [data, setData] = useState<TrackData | null>(null);
  const [live, setLive] = useState<LiveData | null>(null);
  const [summary, setSummary] = useState<TrackSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [trailVer, setTrailVer] = useState(0);
  const [, tick] = useState(0);
  const trail = useRef<LatLng[]>([]);
  const liveMissing = useRef(false);

  const fetchOrder = useCallback(async () => {
    if (!orderId) return;
    const { data: res, error: err } = await supabase.rpc('track_order', { p_order_id: orderId });
    if (err) setError(err.message);
    else {
      setError('');
      setData(res as unknown as TrackData);
    }
    setLoading(false);
  }, [orderId]);

  const fetchLive = useCallback(async () => {
    if (!orderId || liveMissing.current) return;
    const { data: res, error: err } = await supabase.rpc('track_order_live', { p_order_id: orderId });
    if (err) {
      // SQL 29 çalıştırılmadıysa harita özelliği sessizce kapalı kalır
      if (err.code === 'PGRST202' || err.code === '42883' || /could not find|does not exist/i.test(err.message || '')) liveMissing.current = true;
      return;
    }
    const d = res as unknown as LiveData;
    setLive(d);
    const c = d?.courier;
    if (d?.live && c && c.lat != null && c.lng != null) {
      const p = { lat: Number(c.lat), lng: Number(c.lng) };
      const last = trail.current[trail.current.length - 1];
      if (!last || distanceM(last, p) > 8) {
        trail.current = [...trail.current, p].slice(-400);
        setTrailVer((v) => v + 1);
      }
    }
  }, [orderId]);

  useEffect(() => {
    fetchOrder();
    const a = setInterval(fetchOrder, 10000);
    return () => clearInterval(a);
  }, [fetchOrder]);

  const isLive = !!live?.live;
  useEffect(() => {
    fetchLive();
    const b = setInterval(fetchLive, isLive ? 5000 : 15000);
    const t = setInterval(() => tick((n) => n + 1), 1000);
    const onVis = () => document.visibilityState === 'visible' && (fetchOrder(), fetchLive());
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(b);
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [fetchLive, fetchOrder, isLive]);

  const localTrail = useMemo(() => trail.current.slice(), [trailVer]); // eslint-disable-line react-hooks/exhaustive-deps
  const travelled = useMemo(() => {
    const pts = [...(live?.trail || []).map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) })), ...localTrail];
    let m = 0;
    for (let i = 1; i < pts.length; i++) m += distanceM(pts[i - 1], pts[i]);
    return m;
  }, [live?.trail, localTrail]);

  if (loading) return <LoadingSpinner text="Sipariş yükleniyor..." />;
  if (error && !data) {
    return (
      <main className="page narrow center">
        <h1>Sipariş bulunamadı</h1>
        <p className="muted">{error}</p>
        <Link className="btn gold" to="/">Ana sayfaya dön</Link>
      </main>
    );
  }
  if (!data) return null;

  const isDelivery = data.order_type === 'delivery';
  const steps = [
    { key: 'new', label: 'Alındı', time: data.created_at },
    { key: 'preparing', label: 'Hazırlanıyor', time: data.accepted_at },
    { key: 'ready', label: 'Hazır', time: data.ready_at },
    { key: 'on_the_way', label: isDelivery ? 'Yolda' : 'Teslime hazır', time: data.picked_up_at },
    { key: 'delivered', label: 'Teslim edildi', time: data.delivered_at },
  ];
  // "assigned" durumu "Hazır" ile "Yolda" arasındadır
  const order = ['new', 'preparing', 'ready', 'assigned', 'on_the_way', 'delivered'];
  const cur = order.indexOf(data.status);
  const stepIdx = (k: string) => order.indexOf(k);
  const done = (k: string) => data.status !== 'cancelled' && cur >= stepIdx(k);

  const done_ = data.status === 'delivered' || data.status === 'cancelled';
  const showMap = isDelivery && !done_ && !!live && (live.dest.lat != null || live.dest.address);
  const c = live?.courier;
  const stale = c?.updated_at ? Date.now() - new Date(c.updated_at).getTime() > 120000 : false;
  const eta = summary?.etaMin != null && isLive ? new Date(Date.now() + summary.etaMin * 60000) : null;

  return (
    <main className="page narrow track-page">
      <h1>Sipariş #{data.order_no}</h1>
      <div className={`note big tk-status${data.status === 'cancelled' ? ' bad' : ''}`}>
        {ORDER_STATUS_LABELS[data.status] || data.status_label}
        {data.courier_first_name && ` · Kurye: ${data.courier_first_name}`}
      </div>

      <ol className="tk-steps" aria-label="Sipariş durumu">
        {steps.map((s) => (
          <li key={s.key} className={done(s.key) ? 'done' : ''} aria-current={data.status === s.key ? 'step' : undefined}>
            <b>{s.label}</b>
            {s.time && <small>{formatDateTime(s.time)}</small>}
          </li>
        ))}
      </ol>

      {data.status === 'cancelled' && data.cancelled_at && (
        <div className="note" style={{ borderLeftColor: '#ff4444', marginBottom: '1rem' }}>
          İptal edildi · {formatDateTime(data.cancelled_at)}
        </div>
      )}

      {data.status === 'delivered' && <div className="note tk-ok">✅ Siparişiniz teslim edildi. Afiyet olsun!</div>}

      {showMap && live && (
        <section className="tk-live" aria-label="Canlı kurye takibi">
          <div className="tk-cards">
            <div className="tk-card">
              <small><Icon name="clock" size={14} /> Tahmini varış</small>
              <b>{isLive && summary?.etaMin != null ? `${summary.etaText}` : isLive ? 'Hesaplanıyor…' : `${data.estimated_min}–${data.estimated_max} dk`}</b>
              {eta && <em>≈ {hm(eta)}</em>}
            </div>
            <div className="tk-card">
              <small><Icon name="navigation" size={14} /> Kalan mesafe</small>
              <b>{isLive && summary ? summary.distanceText : '—'}</b>
              {summary?.approx && isLive && <em>kuş uçuşu tahmini</em>}
            </div>
            <div className="tk-card">
              <small><Icon name="mapPin" size={14} /> Kat edilen</small>
              <b>{isLive && travelled > 0 ? fmtKm(travelled) : '—'}</b>
            </div>
            <div className="tk-card">
              <small><Icon name="zap" size={14} /> Kurye hızı</small>
              <b>{isLive && c?.speed != null && Number(c.speed) > 0.5 ? `${Math.round(Number(c.speed) * 3.6)} km/sa` : isLive ? 'duruyor' : '—'}</b>
            </div>
          </div>

          {isLive && !c && <p className="note small">Kuryenin konumu bekleniyor… Kurye yola çıktığında harita canlı güncellenecek.</p>}
          {isLive && c && stale && <p className="note small">Kurye konumu {ago(c.updated_at)} güncellendi (sinyal zayıf olabilir).</p>}
          {!isLive && <p className="note small">Kurye yola çıkınca konumu burada canlı görünecek. Harita teslimat adresinizi gösteriyor.</p>}

          <TrackMap data={live} localTrail={localTrail} onSummary={setSummary} height="min(62vh, 440px)" />

          {isLive && c?.updated_at && <p className="muted small tk-upd"><span className="live-dot" /> Son konum: {ago(c.updated_at)} · otomatik yenilenir</p>}
        </section>
      )}

      {live?.dest.address && isDelivery && (
        <p className="small tk-addr"><Icon name="mapPin" size={14} /> {live.dest.address}{live.dest.district ? ` · ${live.dest.district}` : ''}</p>
      )}

      <h3>Sipariş detayı</h3>
      {data.items.map((item, i) => (
        <div key={i} className="crow">
          <span>{item.quantity}× {item.name}{item.variant && ` (${item.variant})`}</span>
          <span />
          <span>{tl(item.price * item.quantity)}</span>
        </div>
      ))}
      <div className="crow total">
        <span>Toplam</span>
        <b>{tl(data.total)}</b>
      </div>

      <p className="muted small" style={{ marginTop: '1.5rem' }}>
        Tahmini teslimat: {data.estimated_min}–{data.estimated_max} dakika. Bu sayfa otomatik güncellenir.
      </p>
      <Link className="btn ghost" to="/" style={{ display: 'inline-block', marginTop: '1rem' }}>
        Ana sayfaya dön
      </Link>
    </main>
  );
}
