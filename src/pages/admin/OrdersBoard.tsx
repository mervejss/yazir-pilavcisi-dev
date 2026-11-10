import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { printOrderTicket } from '@/lib/printTicket';
import OrderSplits from '@/components/admin/OrderSplits';
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
import NewOrderModal, { type OrderPrefill } from '@/components/admin/NewOrderModal';
import AddressMap from '@/components/maps/AddressMap';
import { orderMapsUrl } from '@/lib/googleMaps';
import toast from 'react-hot-toast';

const COLUMNS = [
  { key: 'new', label: 'Yeni' },
  { key: 'preparing', label: 'Hazırlanıyor' },
  { key: 'assigned_way', label: 'Kuryede / Yolda' },
  { key: 'delivered', label: 'Teslim Edildi' },
  { key: 'cancelled', label: 'İptal Edildi' },
];

export default function OrdersBoard() {
  // İş günü 03:00'te başlar. Pano: açık siparişler + BUGÜN teslim edilen/iptal edilenler. Öncekiler "Geçmiş Siparişler"e geçer.
  const todayStart = businessDayStart();
  const { orders, refetch } = useOrders({ realtime: true, boardSince: todayStart.toISOString() });
  const profile = useAuthStore((s) => s.profile);
  const [syncing, setSyncing] = useState(false);
  const { couriers } = useCouriers();
  const { requests: courierRequests, resolve: resolveRequest } = useCourierRequests();
  const { products } = useMenu();
  const { tables } = useTables();

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [prefill, setPrefill] = useState<OrderPrefill | null>(null);
  const [mapOrder, setMapOrder] = useState<OrderWithItems | null>(null);
  const [cancelModalOrder, setCancelModalOrder] = useState<OrderWithItems | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [editOrder, setEditOrder] = useState<OrderWithItems | null>(null);
  const [editItems, setEditItems] = useState<Array<{ variant_id: string; quantity: number }>>([]);
  const [editReason, setEditReason] = useState('');

  // Masa siparişinden doğrudan hesap kapatma
  const [billOrder, setBillOrder] = useState<OrderWithItems | null>(null);
  const [billPayment, setBillPayment] = useState<'cash_at_table' | 'card_at_table' | 'iban'>('cash_at_table');
  const [closingBill, setClosingBill] = useState(false);

  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  // Kart üzerindeki "kaç dakikadır bekliyor" rozeti dakikada iki kez tazelenir
  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(iv);
  }, []);
  const ageMin = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));

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
          if (!r.ok) { toast.error(`${SOURCE_LABELS[ord.source] || ord.source} bildirilemedi: ${r.error}`, { duration: 7000 }); return; }
          const res = r.result || {};
          if (res.skipped) toast(res.skipped, { icon: 'ℹ️', duration: 6000 });
          else if (res.warning) toast(res.warning, { icon: '⚠️', duration: 9000 });
          refetch();
        });
      }
    } catch (err: any) {
      toast.error(err.message || 'Durum değiştirilemedi');
    }
  };

  /** Trendyol'daki güncel durumları şimdi çek ve siteye yansıt (otomatik eşitleme zaten 30 sn'de bir çalışır) */
  const handleSyncNow = async () => {
    setSyncing(true);
    const r = await callPlatform('trendyol', 'sync_orders');
    setSyncing(false);
    if (!r.ok) return void toast.error(r.error || 'Trendyol ile eşitlenemedi');
    const x = r.result || {};
    toast.success(`Trendyol eşitlendi · ${x.created || 0} yeni · ${x.status_updated || 0} durum güncellendi${x.failed ? ` · ${x.failed} hata` : ''}`);
    if (x.missing_count) {
      toast(`${x.missing_count} açık sipariş Trendyol listesinde yok: ${(x.missing || []).map((m: any) => '#' + m.order_no).join(', ')}. Bunları elle kapatabilirsiniz.`, { icon: '⚠️', duration: 12000 });
    }
    refetch();
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

  const colOfStatus = (st: string) =>
    st === 'new' ? 'new' : st === 'preparing' ? 'preparing' : ['ready', 'assigned', 'on_the_way'].includes(st) ? 'assigned_way' : st === 'delivered' ? 'delivered' : st === 'cancelled' ? 'cancelled' : '';

  /** Kartı sütuna bırakınca durumu ilerlet (geri alma yok; sunucu geçişi ayrıca doğrular) */
  const handleDropOnColumn = (colKey: string) => {
    const o = orders.find((x) => x.id === dragId);
    setDragId(null);
    setOverCol(null);
    if (!o || colOfStatus(o.status) === colKey) return;
    if (colKey === 'new') return void toast.error('Sipariş "Yeni" aşamasına geri alınamaz');
    if (colKey === 'cancelled') return void toast.error('İptal için kartın üzerindeki "İptal" düğmesini kullanın (gerekçe gerekir)');
    if (colKey === 'preparing') {
      if (o.status === 'new') return void handleStatusChange(o.id, 'preparing');
      return void toast.error('Sipariş geri alınamaz');
    }
    if (colKey === 'assigned_way') {
      if (o.status === 'new') return void toast.error('Önce "Hazırlanıyor"a alın');
      if (o.status === 'preparing') return void handleStatusChange(o.id, o.courier_id ? 'assigned' : 'ready');
      return;
    }
    if (colKey === 'delivered') {
      // Kurye zorunlu değil: hazır / kuryeye atandı / yolda olan sipariş doğrudan teslim edilebilir
      if (o.status === 'new' || o.status === 'preparing') return void toast.error('Önce "Hazır" yapılmalı');
      if (isTableBill(o)) return void openBillModal(o);
      handleStatusChange(o.id, 'delivered');
    }
  };

  // Masa (restoranda servis) siparişi mi? Açık hesaba bağlıysa "Servis edildi" yerine "Hesabı Kapat" gösterilir
  const isTableBill = (o: OrderWithItems) => o.order_type === 'dine_in' && !!o.table_id && !!o.table_session_id;

  // Aynı masa hesabındaki (iptal edilmemiş) siparişler ve toplamı
  const sessionOrders = (o: OrderWithItems) =>
    orders.filter((x) => x.table_session_id === o.table_session_id && x.status !== 'cancelled');
  const sessionTotal = (o: OrderWithItems) => sessionOrders(o).reduce((sum, x) => sum + Number(x.total || 0), 0);

  const openBillModal = (o: OrderWithItems) => {
    setBillPayment('cash_at_table');
    setBillOrder(o);
  };

  const handleCloseBill = async () => {
    if (!billOrder) return;
    setClosingBill(true);
    try {
      const { data, error } = await supabase.rpc('close_table_from_order', {
        p_order_id: billOrder.id,
        p_payment: billPayment,
      });
      if (error) throw error;
      toast.success(`Hesap kapatıldı: ${tl((data as any)?.total || 0)}`);
      setBillOrder(null);
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Hesap kapatılamadı');
    } finally {
      setClosingBill(false);
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
            Canlı sipariş panosu: açık siparişler ve BUGÜN biten siparişler. Gün (05:00) bittiğinde teslim edilen/iptal edilen siparişler otomatik olarak "Geçmiş Siparişler"e geçer. Trendyol siparişlerinin durumu Trendyol ile otomatik eşitlenir; kurye girmek zorunlu değildir, sonradan da girilebilir.
          </p>
        </div>
        <div className="prow" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
          <Link to="/admin/gecmis-siparisler" className="btn ghost">🗂️ Geçmiş Siparişler</Link>
          {profile?.role === 'owner' && (
            <button type="button" className="btn ghost" disabled={syncing} onClick={handleSyncNow} title="Trendyol'daki güncel durumları şimdi çek">
              {syncing ? 'Eşitleniyor…' : '🟠 Trendyol ile eşitle'}
            </button>
          )}
          <button
            type="button"
            className="btn gold"
            onClick={() => { setPrefill(null); setAddModalOpen(true); }}
          >
            <Icon name="plus" size={18} /> Yeni Sipariş
          </button>
        </div>
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

      <div className="kanban-wrap">
      <div className="kanban kb5">
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
              (o) => o.status === 'delivered' && new Date(o.delivered_at || o.created_at) >= todayStart,
            );
          } else if (col.key === 'cancelled') {
            list = visibleOrders.filter(
              (o) => o.status === 'cancelled' && new Date(o.cancelled_at || o.created_at) >= todayStart,
            );
          }

          return (
            <div
              key={col.key}
              data-col={col.key}
              className={`col${overCol === col.key && dragId ? ' drop-over' : ''}`}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                setOverCol(col.key);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDropOnColumn(col.key);
              }}
            >
              <h3>
                <span>{col.label}</span> <i>{list.length}</i>
              </h3>
              {list.length === 0 && <div className="col-empty">Sipariş yok</div>}
              {list.map((o) => {
                const assignedCourier = couriers.find((c) => c.courier_id === o.courier_id);

                return (
                  <div
                    key={o.id}
                    className={`ocard${o.status === 'new' ? ' hot' : ''}${dragId === o.id ? ' dragging' : ''}`}
                    draggable={!['delivered', 'cancelled'].includes(o.status)}
                    onDragStart={(e) => {
                      setDragId(o.id);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', o.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverCol(null);
                    }}
                  >
                    <div className="orow ocard-top">
                      <span className="ocard-no">
                        <b>#{o.order_no}</b>
                        <span className="muted small">
                          {hhmm(o.created_at)}
                          {!['delivered', 'cancelled'].includes(o.status) && (
                            new Date(o.created_at) < todayStart
                              ? <em className="ocard-age late" title="Önceki iş gününden kalan açık sipariş">Dünden kalan</em>
                              : <em className={`ocard-age${ageMin(o.created_at) >= 30 ? ' late' : ageMin(o.created_at) >= 15 ? ' warn' : ''}`}>{ageMin(o.created_at)} dk</em>
                          )}
                        </span>
                      </span>
                      <span className="ocard-src"><SourceChip source={o.source} compact /></span>
                    </div>
                    <div className="orow ocard-sub">
                      <span className="chip typechip">{ORDER_TYPE_LABELS[o.order_type] || o.order_type}</span>
                      {o.external_ref && <span className="muted small" title="Platform sipariş numarası">{o.external_ref}</span>}
                      {o.platform_status && isPlatformSource(o.source) && (
                        <span className="chip po-pstatus" title="Platformdaki güncel durum">{SOURCE_EMOJI[o.source] || '•'} {o.platform_status}</span>
                      )}
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
                        {' '}
                        <button type="button" className="linklike" onClick={() => setMapOrder(o)}>🗺️ Harita</button>
                        {' · '}
                        <a href={orderMapsUrl(o)} target="_blank" rel="noreferrer">Google Haritalar</a>
                        {o.lat != null && o.lng != null && <span title="Konum işaretli"> ✓</span>}
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

                    <div className="orow ocard-pay">
                      <span className="chip">
                        {PAYMENT_METHOD_LABELS[o.payment_method || ''] || o.payment_method || '—'}
                      </span>
                      <b className="price ocard-price">{tl(o.total)}</b>
                    </div>

                    {o.note && <div className="note small">{o.note}</div>}
                    {['on_the_way', 'delivered'].includes(o.status) && <OrderSplits orderId={o.id} />}
                    {(o as any).courier_note && <div className="note small" style={{ borderLeftColor: 'var(--danger)' }}>🛵 Kurye notu: {(o as any).courier_note}</div>}
                    {o.status === 'cancelled' && o.cancel_reason && <div className="note small">İptal: {o.cancel_reason}</div>}

                    {/* Kurye Seçimi */}
                    {o.order_type === 'delivery' && o.status !== 'cancelled' && (
                      <div className="ocard-courier">
                        <select
                          value={o.courier_id || ''}
                          onChange={(e) =>
                            handleAssignCourier(o.id, e.target.value ? e.target.value : null)
                          }
                        >
                          <option value="">{o.status === 'delivered' || o.status === 'on_the_way' ? 'Kurye (isteğe bağlı)' : 'Kurye Seç (isteğe bağlı)'}</option>
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
                    <div className="ocard-actions">
                      {['delivery', 'pickup'].includes(o.order_type) && (
                        <button
                          type="button"
                          className="btn ghost sm"
                          title="Aynı siparişi (kalemler + adres) yeni sipariş olarak aç"
                          onClick={() => {
                            setPrefill({
                              customer: { id: o.customer_id, name: o.customer_name, phone: o.customer_phone },
                              repeat: { orderId: o.id, type: o.order_type as any, address: o.delivery_address, district: o.district, lat: o.lat, lng: o.lng, note: o.note, payment: o.payment_method },
                            });
                            setAddModalOpen(true);
                          }}
                        >
                          🔁 Tekrarla
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn ghost sm"
                        title="Mutfak / kurye fişi yazdır"
                        onClick={async () => {
                          // Kuryenin aldığı ayrı ödemeler varsa fişe de yazılır (SQL 31 yoksa atlanır)
                          const { data: sp } = await supabase.from('order_split_payments').select('label,method,amount').eq('order_id', o.id).order('seq');
                          printOrderTicket(
                            { ...(o as any), items: o.items },
                            {
                              courierName: assignedCourier?.full_name,
                              tableNo: o.table_id ? String(tables.find((t) => t.id === o.table_id)?.number || '') : null,
                              splits: (sp as any) || undefined,
                            },
                          );
                        }}
                      >
                        🖨️ Fiş
                      </button>
                      {o.status === 'new' && (
                        <button
                          type="button"
                          className="btn dark sm"
                          onClick={() => handleStatusChange(o.id, 'preparing')}
                        >
                          Hazırlanıyor'a al
                        </button>
                      )}

                      {o.status === 'preparing' && (
                        <button
                          type="button"
                          className="btn dark sm"
                          onClick={() =>
                            handleStatusChange(o.id, o.courier_id ? 'assigned' : 'ready')
                          }
                        >
                          {o.courier_id ? 'Kuryeye ata' : 'Hazır'}
                        </button>
                      )}

                      {['ready', 'assigned'].includes(o.status) &&
                        (o.order_type === 'delivery' ? (
                          <>
                            <button
                              type="button"
                              className="btn dark sm"
                              title="Kurye seçmeden de yola çıkabilirsiniz; kuryeyi sonradan girebilirsiniz"
                              onClick={() => handleStatusChange(o.id, 'on_the_way')}
                            >
                              Yola çıktı
                            </button>
                            <button
                              type="button"
                              className="btn gold sm"
                              onClick={() => handleStatusChange(o.id, 'delivered')}
                            >
                              Teslim edildi
                            </button>
                          </>
                        ) : (
                          isTableBill(o) ? (
                            <button
                              type="button"
                              className="btn gold sm"
                              title="Masadaki siparişleri servis edilmiş yapar, ödemeyi alır ve hesabı kapatır"
                              onClick={() => openBillModal(o)}
                            >
                              💳 HESABI KAPAT
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn gold sm"
                              onClick={() => handleStatusChange(o.id, 'delivered')}
                            >
                              {o.order_type === 'dine_in' ? 'Servis edildi' : 'Teslim edildi'}
                            </button>
                          )
                        ))}

                      {o.status === 'on_the_way' && (
                        <button
                          type="button"
                          className="btn gold sm"
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
                            className="btn sm oc-cancel"
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

      <NewOrderModal open={addModalOpen} onClose={() => { setAddModalOpen(false); setPrefill(null); }} onCreated={refetch} prefill={prefill} />

      <Modal open={!!mapOrder} onClose={() => setMapOrder(null)} size="wide">
        {mapOrder && (
          <>
            <div className="pe-head">
              <div>
                <h2>🗺️ #{mapOrder.order_no} · {mapOrder.customer_name || 'Misafir'}</h2>
                <p className="muted small">{mapOrder.district ? `${mapOrder.district} · ` : ''}{mapOrder.delivery_address}</p>
              </div>
              <button type="button" className="icon-circle" onClick={() => setMapOrder(null)} aria-label="Kapat">✕</button>
            </div>
            <AddressMap lat={mapOrder.lat} lng={mapOrder.lng} address={[mapOrder.delivery_address, mapOrder.district].filter(Boolean).join(', ')} label={`#${mapOrder.order_no}`} height="360px" />
            {mapOrder.lat == null && <p className="small muted" style={{ marginTop: '0.5rem' }}>Bu siparişte işaretli konum yok; harita yazılı adrese göre çözülür.</p>}
          </>
        )}
      </Modal>

      {/* MASA HESABINI KAPAT (sipariş kartından) */}
      <Modal open={!!billOrder} onClose={() => !closingBill && setBillOrder(null)}>
        <h2>
          {billOrder ? `Masa ${tables.find((t) => t.id === billOrder.table_id)?.number || ''}` : ''} · Hesabı Kapat
        </h2>
        {billOrder && (
          <>
            <p className="muted">
              {sessionOrders(billOrder).length} sipariş · Tahsil edilecek tutar:{' '}
              <b className="price">{tl(sessionTotal(billOrder))}</b>
            </p>
            <ul className="small" style={{ margin: '0.4rem 0 0.8rem', paddingLeft: '1.1rem' }}>
              {sessionOrders(billOrder).flatMap((x) =>
                x.items.map((i) => (
                  <li key={`${x.id}-${i.id}`}>
                    {i.quantity}× {i.product_name}
                    {i.variant_name && ` (${i.variant_name})`}
                  </li>
                )),
              )}
            </ul>

            <fieldset style={{ margin: '1rem 0' }}>
              <legend>Tahsilat Şekli</legend>
              <label className="radio">
                <input type="radio" name="boardBillPay" checked={billPayment === 'cash_at_table'} onChange={() => setBillPayment('cash_at_table')} />
                Nakit
              </label>
              <label className="radio">
                <input type="radio" name="boardBillPay" checked={billPayment === 'card_at_table'} onChange={() => setBillPayment('card_at_table')} />
                Kredi / Banka Kartı (POS)
              </label>
              <label className="radio">
                <input type="radio" name="boardBillPay" checked={billPayment === 'iban'} onChange={() => setBillPayment('iban')} />
                IBAN / Havale
              </label>
            </fieldset>

            <div className="prow">
              <button type="button" className="btn gold sm" disabled={closingBill} onClick={handleCloseBill}>
                {closingBill ? 'Kapatılıyor...' : 'Tahsilatı Onayla ve Hesabı Kapat'}
              </button>
              <button type="button" className="btn ghost sm" disabled={closingBill} onClick={() => setBillOrder(null)}>
                Vazgeç
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
