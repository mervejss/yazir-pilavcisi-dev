import { useCouriers } from '@/hooks/useCouriers';
import { useOrders } from '@/hooks/useOrders';
import { SOURCE_COLORS } from '@/lib/constants';
import { timeAgo } from '@/lib/helpers';

export default function LiveMap() {
  const { couriers } = useCouriers();
  const { orders } = useOrders();

  const activeOrders = orders.filter(
    (o) => o.order_type === 'delivery' && ['preparing', 'ready', 'assigned', 'on_the_way'].includes(o.status),
  );

  // Konya Yazır bölgesi koordinat projeksiyonu
  const W = 740;
  const H = 480;
  const minLng = 32.47;
  const maxLng = 32.53;
  const minLat = 37.905;
  const maxLat = 37.955;

  const px = (lng: number) => Math.max(20, Math.min(W - 20, ((lng - minLng) / (maxLng - minLng)) * W));
  const py = (lat: number) => Math.max(20, Math.min(H - 20, ((maxLat - lat) / (maxLat - minLat)) * H));

  return (
    <>
      <div className="bar">
        <div>
          <h1>Canlı Harita ve Kurye Takibi</h1>
          <p className="muted" style={{ margin: 0 }}>
            Kuryelerin anlık GPS konumları ve teslimat rotaları
          </p>
        </div>
      </div>

      <div className="two-panel">
        <div>
          <svg viewBox={`0 0 ${W} ${H}`} className="livemap" role="img" aria-label="Canlı Kurye Haritası">
            {/* Arka plan */}
            <rect width={W} height={H} fill="#e6e2d6" rx="14" />

            {/* Şehir ızgarası / sokak simülasyonu */}
            {[...Array(10)].map((_, i) => (
              <line
                key={`v${i}`}
                x1={i * 80 + 20}
                y1={0}
                x2={i * 80 + 20}
                y2={H}
                stroke="#fff"
                strokeWidth={i % 3 === 0 ? 6 : 3}
              />
            ))}
            {[...Array(7)].map((_, i) => (
              <line
                key={`h${i}`}
                x1={0}
                y1={i * 75 + 20}
                x2={W}
                y2={i * 75 + 20}
                stroke="#fff"
                strokeWidth={i % 2 === 0 ? 6 : 3}
              />
            ))}

            {/* Dükkan Konumu: Yazır Pilavcısı (37.93, 32.50) */}
            <g transform={`translate(${px(32.5)},${py(37.93)})`}>
              <circle r="18" fill="#14110c" />
              <text textAnchor="middle" y="6" fontSize="16">
                🍚
              </text>
              <text textAnchor="middle" y="30" fontSize="11" fontWeight="800" fill="#14110c">
                Yazır Pilavcısı (Dükkan)
              </text>
            </g>

            {/* Aktif Sipariş Noktaları */}
            {activeOrders.map((o) => {
              if (!o.lat || !o.lng) return null;
              const ox = px(o.lng);
              const oy = py(o.lat);
              const c = couriers.find((x) => x.courier_id === o.courier_id);

              return (
                <g key={o.id}>
                  {/* Kuryeden sipariş noktasına kesikli çizgi */}
                  {c && c.lat && c.lng && o.status === 'on_the_way' && (
                    <line
                      x1={px(c.lng)}
                      y1={py(c.lat)}
                      x2={ox}
                      y2={oy}
                      stroke="#14110c"
                      strokeDasharray="4 4"
                      strokeWidth="2"
                      opacity="0.6"
                    />
                  )}
                  <rect
                    x={ox - 8}
                    y={oy - 8}
                    width="16"
                    height="16"
                    rx="4"
                    fill={SOURCE_COLORS[o.source.toLowerCase()] || '#fa0050'}
                  />
                  <text x={ox + 12} y={oy + 4} fontSize="11" fontWeight="700" fill="#14110c">
                    #{o.order_no} ({o.district || 'Yazır'})
                  </text>
                </g>
              );
            })}

            {/* Çevrimiçi Kuryeler */}
            {couriers
              .filter((c) => c.is_online && c.lat && c.lng)
              .map((c) => {
                const cx = px(c.lng!);
                const cy = py(c.lat!);

                return (
                  <g key={c.courier_id} transform={`translate(${cx},${cy})`}>
                    <circle r="22" className="pulse" fill="#f2b705" opacity="0.4" />
                    <circle r="13" fill="#f2b705" stroke="#14110c" strokeWidth="2.5" />
                    <text textAnchor="middle" y="4" fontSize="11" fontWeight="800" fill="#14110c">
                      {c.full_name.charAt(0)}
                    </text>
                    <text textAnchor="middle" y="-18" fontSize="11" fontWeight="700" fill="#14110c">
                      🛵 {c.full_name}
                    </text>
                  </g>
                );
              })}
          </svg>
        </div>

        {/* Yan Panel */}
        <aside className="card" style={{ padding: '1.2rem' }}>
          <h3>Kurye Durumları</h3>
          <div style={{ display: 'grid', gap: '0.8rem', marginTop: '0.8rem' }}>
            {couriers.map((c) => {
              const activeDelivery = activeOrders.find((o) => o.courier_id === c.courier_id);

              return (
                <div key={c.courier_id} className="citem">
                  <b>
                    <i className={`dot${c.is_online ? ' on' : ''}`} />
                    {c.full_name}
                  </b>
                  <small className="muted">
                    {!c.is_online
                      ? 'Çevrimdışı'
                      : activeDelivery
                      ? `Yolda · #${activeDelivery.order_no} → ${activeDelivery.district || 'Yazır'}`
                      : 'Boşta · Dükkanda bekliyor'}
                  </small>
                  {c.is_online && c.location_updated_at && (
                    <small className="muted">Konum: {timeAgo(c.location_updated_at)}</small>
                  )}
                  {c.battery && <small className="muted">Pil: %{c.battery}</small>}
                </div>
              );
            })}
            {couriers.length === 0 && <p className="muted small">Kayıtlı kurye yok.</p>}
          </div>

          <div style={{ marginTop: '1.5rem', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
            <h4>Aktif Teslimatlar ({activeOrders.length})</h4>
            <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.5rem' }}>
              {activeOrders.map((o) => (
                <div key={o.id} className="small">
                  <b>#{o.order_no}</b> · {o.customer_name} ({o.district})
                </div>
              ))}
              {activeOrders.length === 0 && (
                <p className="muted small">Şu an yolda olan teslimat yok.</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
