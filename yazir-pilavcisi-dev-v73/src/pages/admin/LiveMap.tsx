import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCouriers } from '@/hooks/useCouriers';
import { useOrders } from '@/hooks/useOrders';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { useCourierRequests } from '@/hooks/useCourierRequests';
import { supabase } from '@/lib/supabase';
import { RESTAURANT_FALLBACK, HAS_GMAPS_KEY, mapsPlaceUrl } from '@/lib/googleMaps';
import { timeAgo, tl } from '@/lib/helpers';

import LiveOpsMap, { type MapFocus, type MapOrder } from '@/components/maps/LiveOpsMap';
import Icon from '@/components/ui/Icon';
import StatusBadge from '@/components/ui/StatusBadge';
import toast from 'react-hot-toast';

const STALE_MS = 2 * 60 * 1000;

export default function LiveMap() {
  const { couriers, refetch: refetchCouriers } = useCouriers();
  const { orders, refetch: refetchOrders } = useOrders({ realtime: true });
  const { settings } = useBusinessSettings();
  const { requests, resolve } = useCourierRequests({ notify: false });
  const [focus, setFocus] = useState<MapFocus>(null);
  const [panel, setPanel] = useState<'couriers' | 'orders'>('couriers');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  const restaurant = useMemo(
    () => ({
      lat: Number(settings?.lat) || RESTAURANT_FALLBACK.lat,
      lng: Number(settings?.lng) || RESTAURANT_FALLBACK.lng,
    }),
    [settings?.lat, settings?.lng],
  );

  const activeOrders = useMemo(
    () => orders.filter((o) => o.order_type === 'delivery' && ['new', 'preparing', 'ready', 'assigned', 'on_the_way'].includes(o.status)),
    [orders],
  );
  const mapOrders: MapOrder[] = useMemo(
    () =>
      activeOrders.map((o) => ({
        id: o.id,
        order_no: o.order_no,
        status: o.status,
        courier_id: o.courier_id,
        customer_name: o.customer_name,
        district: o.district,
        delivery_address: o.delivery_address,
        lat: o.lat != null ? Number(o.lat) : null,
        lng: o.lng != null ? Number(o.lng) : null,
      })),
    [activeOrders],
  );

  const onlineCouriers = couriers.filter((c) => c.is_online && c.is_active);
  const sortedCouriers = [...couriers].sort((a, b) => Number(b.is_online) - Number(a.is_online));
  const reqByOrder = (id: string) => requests.filter((r) => r.order_id === id);
  const courierName = (id: string) => couriers.find((c) => c.courier_id === id)?.full_name || 'Kurye';

  const assign = async (orderId: string, courierId: string) => {
    const { error } = await supabase.rpc('assign_courier', { p_order_id: orderId, p_courier_id: courierId || null });
    if (error) return toast.error(error.message || 'Atanamadı');
    toast.success(courierId ? 'Kurye atandı' : 'Atama kaldırıldı');
    refetchOrders();
    refetchCouriers();
  };

  const decide = async (id: string, ok: boolean) => {
    if (await resolve(id, ok)) {
      refetchOrders();
      refetchCouriers();
    }
  };

  const tick = () => ({ tick: Date.now() });

  return (
    <>
      <div className="bar">
        <div>
          <h1>Canlı Harita ve Kurye Takibi</h1>
          <p className="muted" style={{ margin: 0 }}>
            Restoran, çevrimiçi kuryeler ve aktif sipariş konumları anlık görünür.
          </p>
        </div>
        <div className="row-gap">
          <span className="chip gold"><Icon name="truck" size={13} /> {onlineCouriers.length} çevrimiçi kurye</span>
          <span className="chip"><Icon name="clipboard" size={13} /> {activeOrders.length} aktif teslimat</span>
          <a className="btn ghost sm" href={mapsPlaceUrl({ lat: restaurant.lat, lng: restaurant.lng })} target="_blank" rel="noreferrer"><Icon name="external" size={15} /> Google Haritalar</a>
        </div>
      </div>

      {requests.length > 0 && (
        <section className="req-banner">
          <div className="req-title"><Icon name="bell" size={18} /> Kurye istekleri <span className="badge">{requests.length}</span></div>
          <div className="req-list">
            {requests.map((r) => (
              <div key={r.id} className="req-item">
                <div>
                  <b>{courierName(r.courier_id)}</b> <span className="muted">→</span> <b>#{r.orders?.order_no}</b>
                  <div className="small muted">{r.orders?.district || r.orders?.delivery_address || ''} · {timeAgo(r.created_at)}</div>
                </div>
                <div className="row-gap">
                  <button type="button" className="btn gold sm" onClick={() => decide(r.id, true)}><Icon name="check" size={15} /> Onayla & ata</button>
                  <button type="button" className="btn ghost sm" onClick={() => decide(r.id, false)}><Icon name="x" size={15} /> Reddet</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="two-panel live-grid">
        <div>
          <LiveOpsMap
            restaurant={restaurant}
            couriers={couriers}
            orders={mapOrders}
            focus={focus}
            onSelectCourier={(id) => setFocus({ type: 'courier', id, ...tick() })}
            onSelectOrder={(id) => setFocus({ type: 'order', id, ...tick() })}
            height="clamp(420px, 72vh, 760px)"
          />
          {!HAS_GMAPS_KEY && (
            <div className="map-setup">
              <b><Icon name="info" size={16} /> Canlı işaretçiler için Google Maps anahtarı ekleyin</b>
              <ol>
                <li>Google Cloud Console → <b>Maps JavaScript API</b>, <b>Directions API</b> ve <b>Geocoding API</b>'yi etkinleştirin.</li>
                <li>Bir <b>API anahtarı</b> oluşturun ve “HTTP referrer” kısıtlamasına alan adınızı ekleyin.</li>
                <li>Projeye <code>VITE_GOOGLE_MAPS_API_KEY=anahtarınız</code> değişkenini ekleyin (.env ve Cloudflare Pages → Environment variables) ve yeniden yayınlayın.</li>
              </ol>
            </div>
          )}
        </div>

        <aside className="card live-side">
          <div className="seg" style={{ marginBottom: '0.8rem' }}>
            <button type="button" className={panel === 'couriers' ? 'on' : ''} onClick={() => setPanel('couriers')}>Kuryeler ({couriers.length})</button>
            <button type="button" className={panel === 'orders' ? 'on' : ''} onClick={() => setPanel('orders')}>Teslimatlar ({activeOrders.length})</button>
          </div>

          {panel === 'couriers' && (
            <div className="live-list">
              <button type="button" className="live-row" onClick={() => setFocus({ type: 'restaurant', ...tick() })}>
                <span className="live-ico gold"><Icon name="home" size={16} /></span>
                <div><b>Yazır Pilavcısı</b><small className="muted">Restoran konumu</small></div>
              </button>
              {sortedCouriers.map((c) => {
                const stale = !c.location_updated_at || now - new Date(c.location_updated_at).getTime() > STALE_MS;
                const mineOrders = activeOrders.filter((o) => o.courier_id === c.courier_id);
                return (
                  <button type="button" key={c.courier_id} className={`live-row${focus?.id === c.courier_id ? ' sel' : ''}`} disabled={!c.is_online || c.lat == null} onClick={() => setFocus({ type: 'courier', id: c.courier_id, ...tick() })}>
                    <span className={`live-ico${c.is_online ? (stale ? ' stale' : ' on') : ''}`}>{c.full_name.charAt(0)}</span>
                    <div>
                      <b>{c.full_name}</b>
                      <small className="muted">
                        {!c.is_online ? 'Konum paylaşımı kapalı' : mineOrders.length ? `${mineOrders.length} paket · ${mineOrders.map((o) => '#' + o.order_no).join(', ')}` : 'Boşta'}
                      </small>
                      {c.is_online && (
                        <small className={stale ? 'warn' : 'muted'}>
                          {c.location_updated_at ? `Konum: ${timeAgo(c.location_updated_at)}` : 'Konum bekleniyor'}
                          {c.speed != null && Number(c.speed) > 0.5 ? ` · ${Math.round(Number(c.speed) * 3.6)} km/s` : ''}
                          {c.battery ? ` · Pil %${c.battery}` : ''}
                        </small>
                      )}
                    </div>
                  </button>
                );
              })}
              {couriers.length === 0 && <p className="muted small">Kayıtlı kurye yok. <Link to="/admin/kullanicilar">Personel</Link> sayfasından kurye ekleyin.</p>}
            </div>
          )}

          {panel === 'orders' && (
            <div className="live-list">
              {activeOrders.length === 0 && <p className="muted small">Şu an aktif teslimat yok.</p>}
              {activeOrders.map((o) => {
                const reqs = reqByOrder(o.id);
                return (
                  <div key={o.id} className={`live-order${focus?.id === o.id ? ' sel' : ''}`}>
                    <button type="button" className="live-order-head" onClick={() => setFocus({ type: 'order', id: o.id, ...tick() })}>
                      <b>#{o.order_no}</b> <StatusBadge status={o.status} />
                      <span className="muted small">{tl(o.total)}</span>
                    </button>
                    <div className="small">{o.customer_name || 'Misafir'} · {o.district || ''}</div>
                    <div className="small muted">{o.delivery_address}</div>
                    {['new', 'preparing', 'ready', 'assigned'].includes(o.status) ? (
                      <select value={o.courier_id || ''} onChange={(e) => assign(o.id, e.target.value)}>
                        <option value="">{o.status === 'new' ? 'Önce “Hazırlanıyor”a alın' : 'Kurye ata…'}</option>
                        {couriers.filter((c) => c.is_active).map((c) => (
                          <option key={c.courier_id} value={c.courier_id} disabled={o.status === 'new'}>
                            {c.full_name} {c.is_online ? '● çevrimiçi' : '○ çevrimdışı'} ({c.active_order_count} paket)
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="small"><Icon name="truck" size={13} /> {o.courier_id ? courierName(o.courier_id) : '—'}</div>
                    )}
                    {reqs.map((r) => (
                      <div key={r.id} className="req-mini">
                        <span><b>{courierName(r.courier_id)}</b> istiyor</span>
                        <button type="button" className="btn gold sm" onClick={() => decide(r.id, true)}>Onayla</button>
                        <button type="button" className="btn ghost sm" onClick={() => decide(r.id, false)}>Reddet</button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
