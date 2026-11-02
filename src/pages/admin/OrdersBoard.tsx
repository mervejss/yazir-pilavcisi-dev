import { useState } from 'react';
import { useOrders, type OrderWithItems } from '@/hooks/useOrders';
import { useCouriers } from '@/hooks/useCouriers';
import { useCourierRequests } from '@/hooks/useCourierRequests';
import { useMenu } from '@/hooks/useMenu';
import { useTables } from '@/hooks/useTables';
import { supabase } from '@/lib/supabase';
import { tl, hhmm, businessDayStart } from '@/lib/helpers';
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, ORDER_TYPE_LABELS, SOURCE_LABELS, SOURCE_EMOJI } from '@/lib/constants';
import { callPlatform, isPlatformSource } from '@/lib/platforms';
import SourceChip from '@/components/ui/SourceChip';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import NewOrderModal from '@/components/admin/NewOrderModal';
import toast from 'react-hot-toast';

const COLUMNS = [
  { key: 'new', label: 'Yeni' },
  { key: 'preparing', label: 'Hazırlanıyor' },
  { key: 'assigned_way', label: 'Kuryede / Yolda' },
  { key: 'delivered', label: 'Teslim Edildi' },
];

export default function OrdersBoard() {
  const { orders, refetch } = useOrders({ realtime: true });
  const { couriers } = useCouriers();
  const { requests: courierRequests, resolve: resolveRequest } = useCourierRequests();
  const { products } = useMenu();
  const { tables } = useTables();

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [cancelModalOrder, setCancelModalOrder] = useState<OrderWithItems | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [editOrder, setEditOrder] = useState<OrderWithItems | null>(null);
  const [editItems, setEditItems] = useState<Array<{ variant_id: string; quantity: number }>>([]);
  const [editReason, setEditReason] = useState('');

  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const todayStart = businessDayStart();

  const sourceCounts = orders.reduce<Record<string, number>>((m, o) => { m[o.source] = (m[o.source] || 0) + 1; return m; }, {});
  const visibleOrders = sourceFilter === 'all' ? orders : orders.filter((o) => o.source === sourceFilter);

  const handleStatusChange = async (orderId: string, status: string, note?: string) => {
    try {
      const { error } = await supabase.rpc('update_order_status', {
        p_order_id: orderId,
        p_status: status as any,
        p_note: note || null,
      });
      if (error) throw error;
      toast.success(`Durum güncellendi: ${ORDER_STATUS_LABELS[status] || status}`);
      refetch();
      // Platform siparişi ise durumu platforma da bildir. Hata siparişi bozmaz; yalnızca uyarı verir.
      const ord = orders.find((x) => x.id === orderId);
      if (ord && isPlatformSource(ord.source)) {
        callPlatform(ord.source, 'order_status', { order_id: orderId, status, note }).then((r) => {
          if (!r.ok) toast.error(`${SOURCE_LABELS[ord.source] || ord.source} bildirilemedi: ${r.error}`, { duration: 7000 });
        });
      }
    } catch (err: any) {
      toast.error(err.message || 'Durum değiştirilemedi');
    }
  };

  const handleAssignCourier = async (orderId: string, courierId: string | null) => {
    try {
      const { error } = await supabase.rpc('assign_courier', {
        p_order_id: orderId,
        p_courier_id: courierId || null,
      });
      if (error) throw error;
      toast.success(courierId ? 'Kurye atandı' : 'Kurye ataması kaldırıldı');
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Kurye atanamadı');
    }
  };

  const handleCancelOrder = async () => {
    if (!cancelModalOrder || !cancelReason.trim()) {
      toast.error('Lütfen iptal gerekçesini belirtin');
      return;
    }
    await handleStatusChange(cancelModalOrder.id, 'cancelled', cancelReason);
    setCancelModalOrder(null);
    setCancelReason('');
  };

  const handleSaveEditItems = async () => {
    if (!editOrder) return;
    try {
      const { error } = await supabase.rpc('staff_replace_order_items', {
        p_order_id: editOrder.id,
        p_items: editItems,
        p_reason: editReason || null,
      });
      if (error) throw error;
      toast.success('Sipariş kalemleri güncellendi');
      setEditOrder(null);
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Kalemler güncellenemedi');
    }
  };

  return (
    <>
      <div className="bar">
        <div>
          <h1>Siparişler</h1>
          <p className="muted" style={{ margin: 0 }}>
            Gerçek zamanlı canlı sipariş panosu. Sesli uyarı aktiftir.
          </p>
        </div>
        <button
          type="button"
          className="btn gold"
          onClick={() => setAddModalOpen(true)}
        >
          <Icon name="plus" size={18} /> Yeni Sipariş
        </button>
      </div>

      <div className="src-filter" role="tablist" aria-label="Sipariş kaynağı">
        <button type="button" className={sourceFilter === 'all' ? 'on' : ''} onClick={() => setSourceFilter('all')}>
          Tümü <i>{orders.length}</i>
        </button>
        {Object.keys(sourceCounts).map((c) => (
          <button key={c} type="button" className={sourceFilter === c ? 'on' : ''} onClick={() => setSourceFilter(c)}>
            {SOURCE_EMOJI[c] || '•'} {SOURCE_LABELS[c] || c} <i>{sourceCounts[c]}</i>
          </button>
        ))}
      </div>

      <div className="kanban">
        {COLUMNS.map((col) => {
          let list: OrderWithItems[] = [];
          if (col.key === 'new') {
            list = visibleOrders.filter((o) => o.status === 'new');
          } else if (col.key === 'preparing') {
            list = visibleOrders.filter((o) => o.status === 'preparing');
          } else if (col.key === 'assigned_way') {
            list = visibleOrders.filter((o) => ['ready', 'assigned', 'on_the_way'].includes(o.status));
          } else if (col.key === 'delivered') {
            list = visibleOrders.filter(
              (o) => o.status === 'delivered' && new Date(o.created_at) >= todayStart,
            );
          }

          return (
            <div key={col.key} className="col">
              <h3>
                {col.label} <i>{list.length}</i>
              </h3>
              {list.map((o) => {
                const assignedCourier = couriers.find((c) => c.courier_id === o.courier_id);

                return (
                  <div key={o.id} className={`ocard${o.status === 'new' ? ' hot' : ''}`}>
                    <div className="orow ocard-top">
                      <span className="ocard-no">
                        <b>#{o.order_no}</b>
                        <span className="muted small">{hhmm(o.created_at)}</span>
                      </span>
                      <span className="ocard-src"><SourceChip source={o.source} compact /></span>
                    </div>
                    <div className="orow ocard-sub">
                      <span className="chip typechip">{ORDER_TYPE_LABELS[o.order_type] || o.order_type}</span>
                      {o.external_ref && <span className="muted small" title="Platform sipariş numarası">{o.external_ref}</span>}
                    </div>

                    {(o.pin_code || o.order_code || o.call_center_phone || o.platform_app) && (
                      <div className="plat-info small">
                        {o.order_code && <span>Kod: <b>{o.order_code}</b></span>}
                        {o.pin_code && <span>PIN: <b>{o.pin_code}</b></span>}
                        {o.call_center_phone && <span>Çağrı merkezi: <b>{o.call_center_phone}</b></span>}
                        {o.platform_app && <span className="muted">{o.platform_app}</span>}
                      </div>
                    )}

                    <div>
                      <b>{o.customer_name || 'Misafir'}</b>
                      {o.customer_phone && (
                        <span className="muted small"> · {o.customer_phone}</span>
                      )}
                    </div>

                    {o.delivery_address && (
                      <div className="small muted">
                        📍 {o.district ? `${o.district} · ` : ''}{o.delivery_address}
                      </div>
                    )}

                    {o.table_id && (
                      <div className="small">
                        🪑 Masa: {tables.find((t) => t.id === o.table_id)?.number || '—'}
                      </div>
                    )}

                    <ul>
                      {o.items.map((i) => (
                        <li key={i.id}>
                          {i.quantity}× {i.product_name}
                          {i.variant_name && ` (${i.variant_name})`}
                        </li>
                      ))}
                    </ul>

                    <div className="orow">
                      <span className="chip">
                        {PAYMENT_METHOD_LABELS[o.payment_method || ''] || o.payment_method || '—'}
                      </span>
                      <b className="price" style={{ fontSize: '1.1rem' }}>
                        {tl(o.total)}
                      </b>
                    </div>

                    {o.note && <div className="note small">{o.note}</div>}

                    {/* Kurye Seçimi */}
                    {o.order_type === 'delivery' && !['delivered', 'cancelled'].includes(o.status) && (
                      <div style={{ marginTop: '0.4rem' }}>
                        <select
                          value={o.courier_id || ''}
                          onChange={(e) =>
                            handleAssignCourier(o.id, e.target.value ? e.target.value : null)
                          }
                          style={{ fontSize: '0.85rem', padding: '0.4em' }}
                        >
                          <option value="">Kurye Seç</option>
                          {couriers.map((c) => (
                            <option key={c.courier_id} value={c.courier_id}>
                              {c.full_name} {c.is_online ? '(Çevrimiçi)' : '(Çevrimdışı)'}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Kuryelerin "paketi ben alıyorum" istekleri */}
                    {courierRequests
                      .filter((r) => r.order_id === o.id)
                      .map((r) => (
                        <div key={r.id} className="req-mini">
                          <span>
                            🛵 <b>{couriers.find((c) => c.courier_id === r.courier_id)?.full_name || 'Kurye'}</b> götürmek istiyor
                          </span>
                          <button
                            type="button"
                            className="btn gold sm"
                            onClick={async () => {
                              if (await resolveRequest(r.id, true)) refetch();
                            }}
                          >
                            Onayla
                          </button>
                          <button type="button" className="btn ghost sm" onClick={() => resolveRequest(r.id, false)}>
                            Reddet
                          </button>
                        </div>
                      ))}

                    {assignedCourier && (
                      <div className="small muted">
                        🛵 Kurye: <b>{assignedCourier.full_name}</b> ({assignedCourier.vehicle_type})
                      </div>
                    )}

                    {/* Aksiyon Butonları */}
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                      {o.status === 'new' && (
                        <button
                          type="button"
                          className="btn dark sm"
                          style={{ flex: 1 }}
                          onClick={() => handleStatusChange(o.id, 'preparing')}
                        >
                          Hazırlanıyor'a al
                        </button>
                      )}

                      {o.status === 'preparing' && (
                        <button
                          type="button"
                          className="btn dark sm"
                          style={{ flex: 1 }}
                          onClick={() =>
                            handleStatusChange(o.id, o.courier_id ? 'assigned' : 'ready')
                          }
                        >
                          {o.courier_id ? 'Kuryeye ata' : 'Hazır'}
                        </button>
                      )}

                      {['ready', 'assigned'].includes(o.status) &&
                        (o.order_type === 'delivery' ? (
                          <button
                            type="button"
                            className="btn dark sm"
                            style={{ flex: 1 }}
                            disabled={!o.courier_id}
                            title={o.courier_id ? '' : 'Önce kurye atayın'}
                            onClick={() => handleStatusChange(o.id, 'on_the_way')}
                          >
                            {o.courier_id ? 'Yola çıktı' : 'Önce kurye ata'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn gold sm"
                            style={{ flex: 1 }}
                            onClick={() => handleStatusChange(o.id, 'delivered')}
                          >
                            {o.order_type === 'dine_in' ? 'Servis edildi' : 'Teslim edildi'}
                          </button>
                        ))}

                      {o.status === 'on_the_way' && (
                        <button
                          type="button"
                          className="btn gold sm"
                          style={{ flex: 1 }}
                          onClick={() => handleStatusChange(o.id, 'delivered')}
                        >
                          Teslim edildi
                        </button>
                      )}

                      {!['delivered', 'cancelled'].includes(o.status) && (
                        <>
                          <button
                            type="button"
                            className="btn ghost sm"
                            style={{ padding: '0.4em 0.8em', fontSize: '0.8rem' }}
                            onClick={() => {
                              setEditOrder(o);
                              setEditItems(
                                o.items.map((i) => ({
                                  variant_id: i.variant_id || '',
                                  quantity: i.quantity,
                                })),
                              );
                            }}
                          >
                            Düzenle
                          </button>
                          <button
                            type="button"
                            className="btn sm"
                            style={{ background: '#43221c', color: '#ff9c8a', padding: '0.4em 0.8em', fontSize: '0.8rem' }}
                            onClick={() => setCancelModalOrder(o)}
                          >
                            İptal
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* İptal Modal */}
      <Modal open={!!cancelModalOrder} onClose={() => setCancelModalOrder(null)}>
        <h2>Siparişi İptal Et #{cancelModalOrder?.order_no}</h2>
        <p className="muted">Lütfen iptal gerekçesini belirtin (müşteriye bildirilecek ve raporda saklanacaktır).</p>
        <label>
          İptal Gerekçesi
          <input
            required
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Müşteri iptal etti / adres bulunamadı / ürün bitti..."
          />
        </label>
        <div className="prow" style={{ marginTop: '1rem' }}>
          <button type="button" className="btn danger sm" onClick={handleCancelOrder}>
            İptali Onayla
          </button>
          <button type="button" className="btn ghost sm" onClick={() => setCancelModalOrder(null)}>
            Vazgeç
          </button>
        </div>
      </Modal>

      {/* Sipariş Düzenle (staff_replace_order_items) Modal */}
      <Modal open={!!editOrder} onClose={() => setEditOrder(null)}>
        <h2>Sipariş Kalemlerini Düzenle #{editOrder?.order_no}</h2>
        <p className="muted small">Değişiklik yapıldığında denetim kaydı (audit log) tutulacaktır.</p>

        <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '1rem' }}>
          {editItems.map((item, idx) => {
            const p = products.find((pr) => pr.variants.some((v) => v.id === item.variant_id));
            const v = p?.variants.find((vr) => vr.id === item.variant_id);
            return (
              <div key={idx} className="crow">
                <span>{p?.name} ({v?.name})</span>
                <div className="qty">
                  <button
                    type="button"
                    onClick={() => {
                      const updated = [...editItems];
                      if (updated[idx].quantity > 1) {
                        updated[idx].quantity -= 1;
                        setEditItems(updated);
                      } else {
                        setEditItems(updated.filter((_, i) => i !== idx));
                      }
                    }}
                  >
                    −
                  </button>
                  <b>{item.quantity}</b>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = [...editItems];
                      updated[idx].quantity += 1;
                      setEditItems(updated);
                    }}
                  >
                    +
                  </button>
                </div>
                <span>{tl((v?.price || 0) * item.quantity)}</span>
              </div>
            );
          })}
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label>
            Ürün Ekle:
            <select
              onChange={(e) => {
                if (!e.target.value) return;
                const vId = e.target.value;
                setEditItems([...editItems, { variant_id: vId, quantity: 1 }]);
                e.target.value = '';
              }}
            >
              <option value="">Ürün seçin...</option>
              {products.flatMap((p) =>
                p.variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {p.name} - {v.name} ({tl(v.price)})
                  </option>
                )),
              )}
            </select>
          </label>
        </div>

        <label>
          Düzenleme Nedeni:
          <input
            value={editReason}
            onChange={(e) => setEditReason(e.target.value)}
            placeholder="Müşteri tavuk pilav yerine etli istedi vb."
          />
        </label>

        <div className="prow" style={{ marginTop: '1rem' }}>
          <button type="button" className="btn gold sm" onClick={handleSaveEditItems}>
            Kaydet
          </button>
          <button type="button" className="btn ghost sm" onClick={() => setEditOrder(null)}>
            Vazgeç
          </button>
        </div>
      </Modal>

      <NewOrderModal open={addModalOpen} onClose={() => setAddModalOpen(false)} onCreated={refetch} />
    </>
  );
}
