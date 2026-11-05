import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { ORDER_STATUS_LABELS } from '@/lib/constants';
import { tl, formatDateTime } from '@/lib/helpers';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

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

export default function TrackPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [data, setData] = useState<TrackData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!orderId) return;

    const fetchOrder = async () => {
      const { data: res, error: err } = await supabase.rpc('track_order', { p_order_id: orderId });
      if (err) {
        setError(err.message);
      } else {
        setData(res as unknown as TrackData);
      }
      setLoading(false);
    };

    fetchOrder();
    const interval = setInterval(fetchOrder, 10000);
    return () => clearInterval(interval);
  }, [orderId]);

  if (loading) return <LoadingSpinner text="Sipariş yükleniyor..." />;
  if (error) {
    return (
      <main className="page narrow center">
        <h1>Sipariş bulunamadı</h1>
        <p className="muted">{error}</p>
        <Link className="btn gold" to="/">Ana sayfaya dön</Link>
      </main>
    );
  }
  if (!data) return null;

  const steps = [
    { key: 'new', label: 'Alındı', time: data.created_at },
    { key: 'preparing', label: 'Hazırlanıyor', time: data.accepted_at },
    { key: 'ready', label: 'Hazır', time: data.ready_at },
    { key: 'on_the_way', label: 'Yolda', time: data.picked_up_at },
    { key: 'delivered', label: 'Teslim edildi', time: data.delivered_at },
  ];

  const statusIdx = steps.findIndex((s) => s.key === data.status);

  return (
    <main className="page narrow">
      <h1>Sipariş #{data.order_no}</h1>
      <div className="note big">
        {ORDER_STATUS_LABELS[data.status] || data.status_label}
        {data.courier_first_name && ` · Kurye: ${data.courier_first_name}`}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', margin: '1.5rem 0', flexWrap: 'wrap' }}>
        {steps.map((s, i) => (
          <div
            key={s.key}
            style={{
              flex: 1,
              minWidth: '80px',
              padding: '0.5rem',
              borderRadius: '8px',
              background: i <= statusIdx ? '#f2b705' : '#3a3325',
              color: i <= statusIdx ? '#14110c' : '#a79f8a',
              textAlign: 'center',
              fontSize: '0.8rem',
              fontWeight: i <= statusIdx ? 700 : 400,
            }}
          >
            {s.label}
            {s.time && <div style={{ fontSize: '0.7rem' }}>{formatDateTime(s.time)}</div>}
          </div>
        ))}
      </div>

      {data.status === 'cancelled' && data.cancelled_at && (
        <div className="note" style={{ borderLeftColor: '#ff4444', marginBottom: '1rem' }}>
          İptal edildi · {formatDateTime(data.cancelled_at)}
        </div>
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
