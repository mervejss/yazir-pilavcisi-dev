import { useState, useMemo } from 'react';
import { useOrders, type OrderWithItems } from '@/hooks/useOrders';
import { useCouriers } from '@/hooks/useCouriers';
import { useMenu } from '@/hooks/useMenu';
import { useTables } from '@/hooks/useTables';
import { supabase } from '@/lib/supabase';
import { tl, hhmm, businessDayStart } from '@/lib/helpers';
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@/lib/constants';
import SourceChip from '@/components/ui/SourceChip';
import Modal from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import {
  Plus,
  ShoppingBag,
  Store,
  Bike,
  UtensilsCrossed,
  Clock,
  Trash2,
  Edit2,
  XCircle,
  Truck,
  CheckCircle2,
  CreditCard,
  Banknote,
  Search,
  Sparkles,
  Zap,
} from 'lucide-react';

const COLUMNS = [
  { key: 'new', label: 'Yeni Siparişler', color: '#f59e0b' },
  { key: 'preparing', label: 'Hazırlanıyor', color: '#d97706' },
  { key: 'assigned_way', label: 'Kuryede / Yolda', color: '#3b82f6' },
  { key: 'delivered', label: 'Teslim Edildi', color: '#10b981' },
];

export default function OrdersBoard() {
  const { orders, refetch } = useOrders({ realtime: true });
  const { couriers } = useCouriers();
  const { products, categories } = useMenu();
  const { tables } = useTables();

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'quick' | 'detailed'>('quick');

  const [cancelModalOrder, setCancelModalOrder] = useState<OrderWithItems | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [editOrder, setEditOrder] = useState<OrderWithItems | null>(null);
  const [editItems, setEditItems] = useState<Array<{ variant_id: string; quantity: number }>>([]);
  const [editReason, setEditReason] = useState('');

  // Quick Order Product Filter
  const [quickCatFilter, setQuickCatFilter] = useState<string>('all');
  const [quickSearch, setQuickSearch] = useState<string>('');

  // New Order State
  const [newOrder, setNewOrder] = useState({
    source: 'phone',
    order_type: 'pickup' as 'delivery' | 'dine_in' | 'pickup',
    customer_name: '',
    customer_phone: '',
    delivery_address: '',
    district: 'Yazır',
    table_id: '',
    payment_method: 'cash_at_table',
    note: '',
    items: [] as Array<{ variant_id: string; quantity: number; name: string; price: number }>,
  });

  const todayStart = businessDayStart();

  const handleStatusChange = async (orderId: string, status: string, note?: string) => {
    try {
      const { error } = await supabase.rpc('update_order_status', {
        p_order_id: orderId,
        p_status: status as any,
        p_note: note || null,
      });
      if (error) throw error;
      toast.success(`Durum: ${ORDER_STATUS_LABELS[status] || status}`);
      refetch();
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
      toast.success(courierId ? 'Kurye başarıyla atandı' : 'Kurye ataması kaldırıldı');
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

  // Add Item to New Order
  const handleAddItem = (variantId: string, name: string, price: number) => {
    const existing = newOrder.items.find((i) => i.variant_id === variantId);
    if (existing) {
      setNewOrder({
        ...newOrder,
        items: newOrder.items.map((i) =>
          i.variant_id === variantId ? { ...i, quantity: i.quantity + 1 } : i,
        ),
      });
    } else {
      setNewOrder({
        ...newOrder,
        items: [...newOrder.items, { variant_id: variantId, quantity: 1, name, price }],
      });
    }
  };

  const handleUpdateItemQty = (variantId: string, delta: number) => {
    setNewOrder({
      ...newOrder,
      items: newOrder.items
        .map((i) => (i.variant_id === variantId ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0),
    });
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newOrder.items.length === 0) {
      toast.error('Lütfen en az bir ürün seçin');
      return;
    }

    if (newOrder.order_type === 'dine_in' && !newOrder.table_id) {
      toast.error('Lütfen oturulacak masayı seçin');
      return;
    }

    try {
      // Determine default safe customer info if left empty
      const isQuick = modalTab === 'quick';
      const custName = newOrder.customer_name.trim() ||
        (newOrder.order_type === 'pickup'
          ? 'Gel-Al Müşteri'
          : newOrder.order_type === 'dine_in'
          ? 'Masa Misafiri'
          : 'Hızlı Müşteri');

      const custPhone = newOrder.customer_phone.trim() || '05000000000';

      const paymentMethod = newOrder.order_type === 'dine_in'
        ? null
        : (newOrder.payment_method === 'cash_at_table' ? 'cash_on_delivery' : newOrder.payment_method);

      const { error } = await supabase.rpc('staff_create_order', {
        p_source: isQuick ? (newOrder.order_type === 'dine_in' ? 'table' : 'phone') : newOrder.source,
        p_type: newOrder.order_type,
        p_customer: {
          name: custName,
          phone: custPhone,
          address: newOrder.order_type === 'delivery' ? newOrder.delivery_address : '',
          district: newOrder.order_type === 'delivery' ? newOrder.district : '',
        },
        p_items: newOrder.items.map((i) => ({
          variant_id: i.variant_id,
          quantity: i.quantity,
        })),
        p_table_id: newOrder.order_type === 'dine_in' ? newOrder.table_id || null : null,
        p_payment: paymentMethod as any,
        p_note: newOrder.note || null,
        p_save_address: false,
      });

      if (error) throw error;
      toast.success('Sipariş başarıyla kaydedildi!', { icon: '⚡' });
      setAddModalOpen(false);
      setNewOrder({
        source: 'phone',
        order_type: 'pickup',
        customer_name: '',
        customer_phone: '',
        delivery_address: '',
        district: 'Yazır',
        table_id: '',
        payment_method: 'cash_at_table',
        note: '',
        items: [],
      });
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Sipariş oluşturulamadı');
    }
  };

  // Filter products for quick picker
  const filteredQuickProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = quickCatFilter === 'all' || p.category_id === quickCatFilter;
      const matchSearch =
        !quickSearch.trim() ||
        p.name.toLowerCase().includes(quickSearch.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [products, quickCatFilter, quickSearch]);

  const quickTotal = newOrder.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return (
    <>
      {/* Üst Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.8rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem' }}>Canlı Sipariş Yönetimi</h1>
          <p className="muted" style={{ margin: '0.2rem 0 0' }}>
            Bugünün siparişleri, kurye atamaları ve anlık durum takibi
          </p>
        </div>

        <button
          type="button"
          className="btn gold lg"
          onClick={() => {
            setModalTab('quick');
            setAddModalOpen(true);
          }}
        >
          <Zap size={20} />
          <span>+ Yeni Sipariş Girişi</span>
        </button>
      </div>

      {/* Kanban Sütunları */}
      <div className="kanban">
        {COLUMNS.map((col) => {
          const colOrders = orders.filter((o) => {
            if (col.key === 'assigned_way') {
              return o.status === 'assigned' || o.status === 'on_the_way';
            }
            return o.status === col.key;
          });

          return (
            <div key={col.key} className="kcol">
              <div className="khead">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: col.color }} />
                  <span>{col.label}</span>
                </div>
                <span className="count">{colOrders.length}</span>
              </div>

              <div className="kbody">
                {colOrders.length === 0 ? (
                  <div className="center muted small" style={{ padding: '2rem 1rem' }}>
                    Sipariş yok
                  </div>
                ) : (
                  colOrders.map((o) => (
                    <article key={o.id} className="kcard">
                      <div className="kcard-header">
                        <span className="kcard-num">#{o.order_no}</span>
                        <SourceChip source={o.source} />
                        <span className="kcard-time">
                          <Clock size={12} style={{ display: 'inline', marginRight: '3px' }} />
                          {hhmm(o.created_at)}
                        </span>
                      </div>

                      {/* Müşteri & Masa Bilgisi */}
                      <div>
                        <b>{o.customer_name || 'İsimsiz Müşteri'}</b>
                        {o.customer_phone && (
                          <div className="small muted">
                            <a href={`tel:${o.customer_phone}`}>{o.customer_phone}</a>
                          </div>
                        )}
                        {o.table_id && (() => {
                          const tableObj = tables.find((t) => t.id === o.table_id);
                          return (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: 'var(--gold-bg)', color: 'var(--gold)', padding: '0.15em 0.55em', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, marginTop: '3px' }}>
                              <UtensilsCrossed size={12} />
                              <span>Masa {tableObj?.number || 'Tanımsız'} {tableObj?.name ? `(${tableObj.name})` : ''}</span>
                            </div>
                          );
                        })()}
                        {o.order_type === 'pickup' && !o.table_id && (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: 'rgba(59, 130, 246, 0.12)', color: '#3B82F6', padding: '0.15em 0.55em', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, marginTop: '3px' }}>
                            <Store size={12} />
                            <span>Restorandan Gel-Al / Paket</span>
                          </div>
                        )}
                        {o.delivery_address && (
                          <div className="small" style={{ color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                            📍 {o.district ? `${o.district}, ` : ''}{o.delivery_address}
                          </div>
                        )}
                      </div>

                      {/* Ürün Listesi */}
                      <div style={{ background: 'var(--surface)', padding: '0.5rem 0.7rem', borderRadius: '8px', fontSize: '0.85rem' }}>
                        {o.items?.map((item) => (
                          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.15rem 0' }}>
                            <span>{item.quantity}x {item.product_name}</span>
                            <span style={{ fontWeight: 600 }}>{tl(item.line_total)}</span>
                          </div>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--line)', marginTop: '0.4rem', paddingTop: '0.4rem', fontWeight: 800, color: 'var(--gold)' }}>
                          <span>Toplam</span>
                          <span>{tl(o.total)}</span>
                        </div>
                      </div>

                      {/* Ödeme Bilgisi */}
                      {o.payment_method && (
                        <div className="small muted">
                          💳 {PAYMENT_METHOD_LABELS[o.payment_method] || o.payment_method}
                        </div>
                      )}

                      {/* Durum Geçiş Butonları */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.4rem' }}>
                        {o.status === 'new' && (
                          <button
                            type="button"
                            className="btn gold sm"
                            style={{ flex: 1 }}
                            onClick={() => handleStatusChange(o.id, 'preparing')}
                          >
                            <span>Hazırla</span>
                          </button>
                        )}

                        {o.status === 'preparing' && (
                          <button
                            type="button"
                            className="btn gold sm"
                            style={{ flex: 1 }}
                            onClick={() => handleStatusChange(o.id, 'ready')}
                          >
                            <span>Hazır ✓</span>
                          </button>
                        )}

                        {(o.status === 'ready' || o.status === 'assigned' || o.status === 'on_the_way') && (
                          <button
                            type="button"
                            className="btn gold sm"
                            style={{ flex: 1 }}
                            onClick={() => handleStatusChange(o.id, 'delivered')}
                          >
                            <CheckCircle2 size={14} />
                            <span>Teslim Edildi</span>
                          </button>
                        )}

                        {/* Kurye Seçimi (Teslimat ise) */}
                        {o.order_type === 'delivery' && o.status !== 'delivered' && o.status !== 'cancelled' && (
                          <select
                            value={o.courier_id || ''}
                            onChange={(e) => handleAssignCourier(o.id, e.target.value || null)}
                            style={{ padding: '0.3em 0.5em', fontSize: '0.8rem', borderRadius: '6px' }}
                          >
                            <option value="">Kurye Seç...</option>
                            {couriers.map((c) => (
                              <option key={c.courier_id} value={c.courier_id}>
                                🛵 {c.full_name || 'Kurye'} {c.is_online ? '(Çevrimiçi)' : '(Çevrimdışı)'}
                              </option>
                            ))}
                          </select>
                        )}

                        {/* İptal Butonu */}
                        {o.status !== 'delivered' && o.status !== 'cancelled' && (
                          <button
                            type="button"
                            className="btn ghost sm"
                            style={{ padding: '0.3em 0.6em', color: '#EF4444', borderColor: '#EF4444' }}
                            onClick={() => setCancelModalOrder(o)}
                            title="Siparişi İptal Et"
                          >
                            <XCircle size={15} />
                          </button>
                        )}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* =========================================================================
          YENİ SİPARİŞ MODALI — İKİ MOD: ⚡ HIZLI SİPARİŞ & 📋 DETAYLI SİPARİŞ
         ========================================================================= */}
      <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)}>
        <div style={{ maxWidth: '780px', width: '100%' }}>
          {/* Modal Başlık & Sekme Geçişi */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid var(--line)', paddingBottom: '0.8rem', marginBottom: '1.2rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Yeni Sipariş Ekle</h2>

            <div className="seg">
              <button
                type="button"
                className={modalTab === 'quick' ? 'on' : ''}
                onClick={() => setModalTab('quick')}
              >
                <Zap size={15} style={{ display: 'inline', marginRight: '4px' }} />
                ⚡ Hızlı Sipariş (Restoran / Gel-Al)
              </button>
              <button
                type="button"
                className={modalTab === 'detailed' ? 'on' : ''}
                onClick={() => setModalTab('detailed')}
              >
                📋 Detaylı / Telefon
              </button>
            </div>
          </div>

          <form onSubmit={handleCreateOrder} className="form">
            {/* 1. Sipariş Türü Seçimi (Büyük Kartlar) */}
            <div>
              <label style={{ marginBottom: '0.5rem' }}>Sipariş Türü</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.8rem' }}>
                <div
                  className={`order-type-card ${newOrder.order_type === 'pickup' ? 'selected' : ''}`}
                  onClick={() => setNewOrder({ ...newOrder, order_type: 'pickup' })}
                  style={{ padding: '0.9rem' }}
                >
                  <Store size={26} style={{ color: newOrder.order_type === 'pickup' ? 'var(--gold)' : 'var(--text-muted)' }} />
                  <b style={{ fontSize: '0.95rem' }}>Gel-Al / Paket</b>
                  <span className="small muted" style={{ fontSize: '0.75rem' }}>Oturmadan alır gider</span>
                </div>

                <div
                  className={`order-type-card ${newOrder.order_type === 'dine_in' ? 'selected' : ''}`}
                  onClick={() => setNewOrder({ ...newOrder, order_type: 'dine_in' })}
                  style={{ padding: '0.9rem' }}
                >
                  <UtensilsCrossed size={26} style={{ color: newOrder.order_type === 'dine_in' ? 'var(--gold)' : 'var(--text-muted)' }} />
                  <b style={{ fontSize: '0.95rem' }}>Masada Oturan</b>
                  <span className="small muted" style={{ fontSize: '0.75rem' }}>Masa hesabına ekle</span>
                </div>

                <div
                  className={`order-type-card ${newOrder.order_type === 'delivery' ? 'selected' : ''}`}
                  onClick={() => setNewOrder({ ...newOrder, order_type: 'delivery' })}
                  style={{ padding: '0.9rem' }}
                >
                  <Bike size={26} style={{ color: newOrder.order_type === 'delivery' ? 'var(--gold)' : 'var(--text-muted)' }} />
                  <b style={{ fontSize: '0.95rem' }}>Adrese Paket</b>
                  <span className="small muted" style={{ fontSize: '0.75rem' }}>Kurye ile teslim</span>
                </div>
              </div>
            </div>

            {/* Masada ise Masa Seçimi */}
            {newOrder.order_type === 'dine_in' && (
              <label>
                Masa Seçimi *
                <select
                  required
                  value={newOrder.table_id}
                  onChange={(e) => setNewOrder({ ...newOrder, table_id: e.target.value })}
                >
                  <option value="">Masayı seçiniz...</option>
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      Masa {t.number} {t.name ? `(${t.name})` : ''} — Kapasite: {t.capacity} Kişilik
                    </option>
                  ))}
                </select>
              </label>
            )}

            {/* Detaylı Mod veya Teslimat Modu için Müşteri Bilgileri */}
            {(modalTab === 'detailed' || newOrder.order_type === 'delivery') && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                <label>
                  Müşteri Adı {newOrder.order_type === 'delivery' ? '*' : '(İsteğe Bağlı)'}
                  <input
                    required={newOrder.order_type === 'delivery'}
                    value={newOrder.customer_name}
                    onChange={(e) => setNewOrder({ ...newOrder, customer_name: e.target.value })}
                    placeholder="Müşteri adı"
                  />
                </label>
                <label>
                  Telefon {newOrder.order_type === 'delivery' ? '*' : '(İsteğe Bağlı)'}
                  <input
                    required={newOrder.order_type === 'delivery'}
                    value={newOrder.customer_phone}
                    onChange={(e) => setNewOrder({ ...newOrder, customer_phone: e.target.value })}
                    placeholder="05xx xxx xx xx"
                  />
                </label>
              </div>
            )}

            {/* Teslimat Adresi (Yalnızca Eve Teslimat için) */}
            {newOrder.order_type === 'delivery' && (
              <>
                <label>
                  Mahalle / Semt
                  <input
                    value={newOrder.district}
                    onChange={(e) => setNewOrder({ ...newOrder, district: e.target.value })}
                    placeholder="Yazır, Bosna Hersek..."
                  />
                </label>
                <label>
                  Açık Teslimat Adresi *
                  <textarea
                    required
                    rows={2}
                    value={newOrder.delivery_address}
                    onChange={(e) => setNewOrder({ ...newOrder, delivery_address: e.target.value })}
                    placeholder="Cadde, sokak, bina, daire no..."
                  />
                </label>
              </>
            )}

            {/* ===================================================================
                HIZLI ÜRÜN SEÇİCİ (Kategorilere Göre Tıklanabilir Ürün Kartları)
               =================================================================== */}
            <div style={{ background: 'var(--surface)', padding: '1.2rem', borderRadius: 'var(--r)', border: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                <b style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <ShoppingBag size={18} style={{ color: 'var(--gold)' }} />
                  <span>Menüden Ürün Ekle</span>
                </b>

                {/* Kategori Filtresi */}
                <select
                  value={quickCatFilter}
                  onChange={(e) => setQuickCatFilter(e.target.value)}
                  style={{ padding: '0.3em 0.7em', fontSize: '0.85rem' }}
                >
                  <option value="all">Tüm Kategoriler</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Tıklanabilir Hızlı Ürünler Grid'i */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '0.6rem', maxHeight: '220px', overflowY: 'auto', padding: '4px' }}>
                {filteredQuickProducts.flatMap((p) =>
                  p.variants.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => handleAddItem(v.id, `${p.name} (${v.name})`, v.price)}
                      style={{
                        background: 'var(--card-bg)',
                        border: '1.5px solid var(--line)',
                        borderRadius: '10px',
                        padding: '0.6rem',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '0.3rem',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--gold)')}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--line)')}
                    >
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text)' }}>
                        {p.name}
                      </span>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="small muted" style={{ fontSize: '0.75rem' }}>{v.name}</span>
                        <b style={{ color: 'var(--gold)', fontSize: '0.88rem' }}>{tl(v.price)}</b>
                      </div>
                    </button>
                  )),
                )}
              </div>

              {/* Seçilen Kalemler Adisyon Listesi */}
              <div style={{ marginTop: '1rem', borderTop: '1px solid var(--line)', paddingTop: '0.8rem' }}>
                <b style={{ fontSize: '0.95rem' }}>Adisyon Kalemleri ({newOrder.items.length})</b>

                {newOrder.items.length === 0 ? (
                  <div className="muted small" style={{ padding: '0.6rem 0' }}>
                    Henüz ürün seçilmedi. Yukarıdan ürünlere tıklayarak ekleyin.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem', maxHeight: '160px', overflowY: 'auto' }}>
                    {newOrder.items.map((it) => (
                      <div
                        key={it.variant_id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: 'var(--card-bg)',
                          padding: '0.4rem 0.8rem',
                          borderRadius: '8px',
                          border: '1px solid var(--line)',
                        }}
                      >
                        <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{it.name}</span>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                          {/* Qty Controls */}
                          <div className="qty" style={{ scale: '0.85' }}>
                            <button type="button" onClick={() => handleUpdateItemQty(it.variant_id, -1)}>-</button>
                            <span className="qty-input">{it.quantity}</span>
                            <button type="button" onClick={() => handleUpdateItemQty(it.variant_id, 1)}>+</button>
                          </div>

                          <b style={{ color: 'var(--gold)', minWidth: '60px', textAlign: 'right' }}>
                            {tl(it.price * it.quantity)}
                          </b>

                          <button
                            type="button"
                            onClick={() => setNewOrder({ ...newOrder, items: newOrder.items.filter((i) => i.variant_id !== it.variant_id) })}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444' }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Ödeme Yöntemi (Dine-in değilse) */}
            {newOrder.order_type !== 'dine_in' && (
              <label>
                Ödeme Yöntemi
                <select
                  value={newOrder.payment_method}
                  onChange={(e) => setNewOrder({ ...newOrder, payment_method: e.target.value })}
                >
                  <option value="cash_at_table">Nakit</option>
                  <option value="card_at_table">Kredi / Banka Kartı (POS)</option>
                  <option value="iban">IBAN / Havale</option>
                </select>
              </label>
            )}

            {/* Not */}
            <label>
              Sipariş Notu (İsteğe Bağlı)
              <input
                value={newOrder.note}
                onChange={(e) => setNewOrder({ ...newOrder, note: e.target.value })}
                placeholder="Örn: Bol turşulu, ekmek istemiyor..."
              />
            </label>

            {/* Butonlar & Toplam Fiyat */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1.2rem', paddingTop: '1rem', borderTop: '2px solid var(--line)' }}>
              <div>
                <span className="small muted">Hesaplanan Toplam:</span>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--gold)' }}>
                  {tl(quickTotal)}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.8rem' }}>
                <button type="button" className="btn ghost" onClick={() => setAddModalOpen(false)}>
                  Vazgeç
                </button>
                <button type="submit" className="btn gold lg" disabled={newOrder.items.length === 0}>
                  <Zap size={18} />
                  <span>Siparişi Kaydet & Yazdır</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      </Modal>

      {/* İptal Modalı */}
      <Modal open={!!cancelModalOrder} onClose={() => setCancelModalOrder(null)}>
        <h2>Siparişi İptal Et #{cancelModalOrder?.order_no}</h2>
        <p className="muted">
          Bu siparişi iptal etmek istediğinizden emin misiniz? İptal gerekçesini yazınız:
        </p>
        <textarea
          rows={3}
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          placeholder="İptal sebebi (örn: Müşteri vazgeçti, telefon ulaşılamadı...)"
          style={{ width: '100%', margin: '1rem 0' }}
        />
        <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={() => setCancelModalOrder(null)}>
            Vazgeç
          </button>
          <button type="button" className="btn danger" onClick={handleCancelOrder}>
            İptali Onayla
          </button>
        </div>
      </Modal>
    </>
  );
}
