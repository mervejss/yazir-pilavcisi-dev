import { useState, useEffect, useMemo } from 'react';
import { useTables, type TableWithSession } from '@/hooks/useTables';
import { useMenu } from '@/hooks/useMenu';
import { supabase } from '@/lib/supabase';
import { TABLE_STATUS_LABELS, TABLE_STATUS_COLORS } from '@/lib/constants';
import { tl, timeAgo, hhmm } from '@/lib/helpers';
import Modal from '@/components/ui/Modal';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';
import {
  Plus,
  QrCode,
  Users,
  CreditCard,
  Banknote,
  Send,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Edit,
  UtensilsCrossed,
  Sparkles,
} from 'lucide-react';

export default function TablesAdmin() {
  const { tables, refetch } = useTables();
  const { products } = useMenu();

  const [filter, setFilter] = useState<'all' | 'occupied' | 'empty' | 'bill'>('all');
  const [selectedTable, setSelectedTable] = useState<TableWithSession | null>(null);
  const [tableQrSvg, setTableQrSvg] = useState<string>('');
  const [tableOrders, setTableOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Quick Add Order to Table Modal
  const [quickOrderModal, setQuickOrderModal] = useState(false);
  const [quickOrderItems, setQuickOrderItems] = useState<
    Array<{ variant_id: string; product_name: string; variant_name: string; price: number; quantity: number }>
  >([]);

  // Bill Modals
  const [billModalOpen, setBillModalOpen] = useState(false);
  const [billPayment, setBillPayment] = useState<'cash_at_table' | 'card_at_table' | 'iban'>('cash_at_table');
  const [autoDeliverOnClose, setAutoDeliverOnClose] = useState(true);
  const [closingBill, setClosingBill] = useState(false);

  // Add / Edit Table Modals
  const [addTableModal, setAddTableModal] = useState(false);
  const [newTableNum, setNewTableNum] = useState<number>(1);
  const [newTableName, setNewTableName] = useState<string>('');
  const [newTableCap, setNewTableCap] = useState<number>(4);
  const [newTableShape, setNewTableShape] = useState<'square' | 'rect' | 'round'>('square');

  const [editTableModal, setEditTableModal] = useState(false);
  const [editTableData, setEditTableData] = useState({
    id: '',
    number: 1,
    name: '',
    capacity: 4,
    shape: 'square' as 'square' | 'rect' | 'round',
  });

  // Calculate stats
  const stats = useMemo(() => {
    const totalTables = tables.length;
    const occupiedTables = tables.filter((t) => t.status !== 'empty').length;
    const emptyTables = totalTables - occupiedTables;
    const billWaiting = tables.filter((t) => t.status === 'awaiting_bill').length;
    const occupancyRate = totalTables > 0 ? Math.round((occupiedTables / totalTables) * 100) : 0;
    const totalRevenueOnTables = tables.reduce((sum, t) => sum + (t.activeSession?.total || 0), 0);

    return { totalTables, occupiedTables, emptyTables, billWaiting, occupancyRate, totalRevenueOnTables };
  }, [tables]);

  // Filtered tables
  const filteredTables = useMemo(() => {
    return tables.filter((t) => {
      if (filter === 'occupied') return t.status !== 'empty';
      if (filter === 'empty') return t.status === 'empty';
      if (filter === 'bill') return t.status === 'awaiting_bill';
      return true;
    });
  }, [tables, filter]);

  // Load orders and generate QR for selected table
  useEffect(() => {
    if (!selectedTable) {
      setTableQrSvg('');
      setTableOrders([]);
      return;
    }

    if (selectedTable.qrCode?.token) {
      const url = `${window.location.origin}/qr/${selectedTable.qrCode.token}`;
      QRCode.toString(url, { type: 'svg', margin: 2 }, (err, svg) => {
        if (!err && svg) setTableQrSvg(svg);
      });
    }

    const fetchOrders = async () => {
      setLoadingOrders(true);
      const { data } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('table_id', selectedTable.id)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(20);
      if (data) setTableOrders(data);
      setLoadingOrders(false);
    };
    fetchOrders();
  }, [selectedTable]);

  // Status Change
  const handleStatusChange = async (tableId: string, newStatus: string) => {
    try {
      const { error } = await supabase.rpc('set_table_status', {
        p_table_id: tableId,
        p_status: newStatus as any,
      });
      if (error) throw error;
      toast.success(`Masa Durumu: ${TABLE_STATUS_LABELS[newStatus] || newStatus}`);
      refetch();
      if (selectedTable && selectedTable.id === tableId) {
        setSelectedTable({ ...selectedTable, status: newStatus as any });
      }
    } catch (err: any) {
      toast.error(err.message || 'Durum değiştirilemedi');
    }
  };

  // Close Bill safely
  const handleCloseBill = async () => {
    if (!selectedTable) return;
    setClosingBill(true);

    try {
      const unserved = tableOrders.filter(
        (o) =>
          o.table_session_id === selectedTable.activeSession?.id &&
          ['new', 'preparing', 'ready', 'assigned', 'on_the_way'].includes(o.status),
      );

      if (unserved.length > 0) {
        if (!autoDeliverOnClose) {
          throw new Error('Hazırlanan siparişler var. Lütfen önce servis edildi yapınız.');
        }

        for (const o of unserved) {
          await supabase.rpc('update_order_status', {
            p_order_id: o.id,
            p_status: 'delivered',
            p_note: 'Hesap kapatılırken otomatik tamamlandı',
          });
        }
      }

      const { error } = await supabase.rpc('close_table_bill', {
        p_table_id: selectedTable.id,
        p_payment: billPayment,
      });

      if (error) throw error;
      toast.success('Masa hesabı başarıyla kapatıldı ve tahsil edildi!', { icon: '💰' });
      setBillModalOpen(false);
      setSelectedTable(null);
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Hesap kapatılamadı');
    } finally {
      setClosingBill(false);
    }
  };

  // Add Item to Quick Table Order
  const handleAddQuickItem = (variantId: string, productName: string, variantName: string, price: number) => {
    const existing = quickOrderItems.find((i) => i.variant_id === variantId);
    if (existing) {
      setQuickOrderItems(
        quickOrderItems.map((i) =>
          i.variant_id === variantId ? { ...i, quantity: i.quantity + 1 } : i,
        ),
      );
    } else {
      setQuickOrderItems([
        ...quickOrderItems,
        { variant_id: variantId, product_name: productName, variant_name: variantName, price, quantity: 1 },
      ]);
    }
  };

  // Submit Quick Table Order
  const handleSubmitQuickTableOrder = async () => {
    if (!selectedTable || quickOrderItems.length === 0) return;

    try {
      const { error } = await supabase.rpc('staff_create_order', {
        p_source: 'table',
        p_type: 'dine_in',
        p_customer: {
          name: `Masa ${selectedTable.number} Misafiri`,
          phone: '05000000000',
        },
        p_items: quickOrderItems.map((i) => ({
          variant_id: i.variant_id,
          quantity: i.quantity,
        })),
        p_table_id: selectedTable.id,
        p_payment: null,
        p_note: 'Masadan hızlı sipariş eklendi',
        p_save_address: false,
      });

      if (error) throw error;
      toast.success('Sipariş masaya eklendi!', { icon: '🍽️' });
      setQuickOrderItems([]);
      setQuickOrderModal(false);
      refetch();

      // Refresh orders
      const { data } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('table_id', selectedTable.id)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false });
      if (data) setTableOrders(data);
    } catch (err: any) {
      toast.error(err.message || 'Sipariş eklenemedi');
    }
  };

  // Add Table
  const handleAddTable = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('dining_tables').insert({
        number: newTableNum,
        name: newTableName.trim() || null,
        capacity: newTableCap,
        shape: newTableShape,
      });
      if (error) throw error;
      toast.success(`Masa ${newTableNum} başarıyla oluşturuldu`);
      setAddTableModal(false);
      setNewTableNum(newTableNum + 1);
      setNewTableName('');
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Masa eklenemedi');
    }
  };

  // Save Edit Table
  const handleSaveEditTable = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('dining_tables')
        .update({
          number: editTableData.number,
          name: editTableData.name.trim() || null,
          capacity: editTableData.capacity,
          shape: editTableData.shape,
        })
        .eq('id', editTableData.id);

      if (error) throw error;
      toast.success('Masa bilgileri güncellendi');
      setEditTableModal(false);
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Masa güncellenemedi');
    }
  };

  const currentBillTotal = selectedTable?.activeSession?.total || 0;

  return (
    <>
      {/* Üst Başlık & Ekleme Butonu */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.8rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem' }}>Masa & Restoran Düzeni</h1>
          <p className="muted" style={{ margin: '0.2rem 0 0' }}>
            Canlı salon yerleşimi, masadaki siparişler ve anlık hesap takibi
          </p>
        </div>

        <button
          type="button"
          className="btn gold lg"
          onClick={() => {
            const maxNum = tables.reduce((m, t) => Math.max(m, t.number), 0);
            setNewTableNum(maxNum + 1);
            setAddTableModal(true);
          }}
        >
          <Plus size={20} />
          <span>+ Yeni Masa Ekle</span>
        </button>
      </div>

      {/* KPI Kartları (Altın Sarısı & Şık İstatistikler) */}
      <div className="kpi-row">
        <div className="kpi">
          <span>Toplam Masa</span>
          <b>{stats.totalTables}</b>
        </div>
        <div className="kpi">
          <span>Dolu Masalar</span>
          <b style={{ color: 'var(--gold)' }}>{stats.occupiedTables}</b>
        </div>
        <div className="kpi">
          <span>Boş Masalar</span>
          <b style={{ color: '#10B981' }}>{stats.emptyTables}</b>
        </div>
        <div className="kpi">
          <span>Doluluk Oranı</span>
          <b style={{ color: stats.occupancyRate > 75 ? '#EF4444' : 'var(--text)' }}>
            %{stats.occupancyRate}
          </b>
        </div>
        <div className="kpi">
          <span>Masalardaki Tutar</span>
          <b className="gold-text">{tl(stats.totalRevenueOnTables)}</b>
        </div>
      </div>

      {/* Filtre Sekmeleri */}
      <div className="seg" style={{ marginBottom: '1.8rem' }}>
        <button
          type="button"
          className={filter === 'all' ? 'on' : ''}
          onClick={() => setFilter('all')}
        >
          Tüm Masalar ({tables.length})
        </button>
        <button
          type="button"
          className={filter === 'occupied' ? 'on' : ''}
          onClick={() => setFilter('occupied')}
        >
          Dolu Masalar ({stats.occupiedTables})
        </button>
        <button
          type="button"
          className={filter === 'empty' ? 'on' : ''}
          onClick={() => setFilter('empty')}
        >
          Boş Masalar ({stats.emptyTables})
        </button>
        <button
          type="button"
          className={filter === 'bill' ? 'on' : ''}
          onClick={() => setFilter('bill')}
        >
          Hesap İsteyenler ({stats.billWaiting})
        </button>
      </div>

      {/* Görsel Masa Düzeni (Şekilli ve Renkli Masalar) */}
      <div className="table-grid">
        {filteredTables.map((t) => {
          const isOccupied = t.status !== 'empty';
          const isAwaitingBill = t.status === 'awaiting_bill';
          const statusClass = isAwaitingBill
            ? 'status-bill'
            : isOccupied
            ? 'status-occupied'
            : 'status-empty';

          return (
            <article
              key={t.id}
              className={`table-card shape-${t.shape} ${statusClass}`}
              onClick={() => setSelectedTable(t)}
            >
              {/* Üst: Masa No & Şekil & Düzenle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="table-num-badge">#{t.number}</span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--line)',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '0.2em 0.6em',
                      borderRadius: '999px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                    }}
                  >
                    <Users size={12} />
                    {t.capacity} Kişilik
                  </span>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditTableData({
                        id: t.id,
                        number: t.number,
                        name: t.name || '',
                        capacity: t.capacity,
                        shape: t.shape,
                      });
                      setEditTableModal(true);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      padding: '4px',
                    }}
                    title="Masayı Düzenle"
                  >
                    <Edit size={14} />
                  </button>
                </div>
              </div>

              {/* Masa İsmi (Örn: Teras 1, Bahçe 4) */}
              {t.name && (
                <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1rem' }}>
                  {t.name}
                </div>
              )}

              {/* Durum Göstergesi */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 'auto' }}>
                <div
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: TABLE_STATUS_COLORS[t.status] || '#10B981',
                    boxShadow: isOccupied ? `0 0 10px ${TABLE_STATUS_COLORS[t.status]}` : 'none',
                  }}
                />
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: TABLE_STATUS_COLORS[t.status] || 'var(--text)' }}>
                  {TABLE_STATUS_LABELS[t.status] || t.status}
                </span>
              </div>

              {/* Dolu ise Süre & Tutar */}
              {isOccupied && t.activeSession && (
                <div style={{ background: 'var(--surface)', padding: '0.6rem 0.8rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="small muted">
                    <Clock size={12} style={{ display: 'inline', marginRight: '3px' }} />
                    {timeAgo(t.activeSession.opened_at)}
                  </span>
                  <b style={{ color: 'var(--gold)', fontSize: '1.05rem' }}>
                    {tl(t.activeSession.total || 0)}
                  </b>
                </div>
              )}

              {/* Hızlı İşlem Butonları */}
              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn gold sm"
                  style={{ flex: 1, padding: '0.35em 0.6em', fontSize: '0.8rem' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedTable(t);
                    setQuickOrderItems([]);
                    setQuickOrderModal(true);
                  }}
                >
                  <Plus size={13} />
                  <span>Sipariş Ekle</span>
                </button>

                {isOccupied && (
                  <button
                    type="button"
                    className="btn ghost sm"
                    style={{ padding: '0.35em 0.6em', fontSize: '0.8rem', borderColor: 'var(--gold)', color: 'var(--gold)' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedTable(t);
                      setBillModalOpen(true);
                    }}
                  >
                    <span>Hesap</span>
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* =========================================================================
          SEÇİLİ MASA DETAY / ADİSYON MODALI
         ========================================================================= */}
      <Modal open={!!selectedTable && !quickOrderModal && !billModalOpen} onClose={() => setSelectedTable(null)}>
        {selectedTable && (
          <div style={{ maxWidth: '640px', width: '100%' }}>
            {/* Başlık */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--line)', paddingBottom: '0.8rem', marginBottom: '1.2rem' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.6rem' }}>
                  Masa {selectedTable.number} {selectedTable.name ? `— ${selectedTable.name}` : ''}
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.3rem' }}>
                  <span style={{ fontWeight: 700, color: TABLE_STATUS_COLORS[selectedTable.status] }}>
                    ● {TABLE_STATUS_LABELS[selectedTable.status] || selectedTable.status}
                  </span>
                  <span className="muted">•</span>
                  <span className="muted small">{selectedTable.capacity} Sandalye</span>
                </div>
              </div>

              {/* QR Kod Çıktısı */}
              {tableQrSvg && (
                <div
                  style={{ width: '60px', height: '60px', cursor: 'pointer' }}
                  dangerouslySetInnerHTML={{ __html: tableQrSvg }}
                  title="Masa Menü QR Kodu"
                />
              )}
            </div>

            {/* Masa Durumu Hızlı Değiştir */}
            <div style={{ marginBottom: '1.2rem' }}>
              <span className="small muted" style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 700 }}>
                Durum Değiştir:
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {Object.entries(TABLE_STATUS_LABELS).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    className={`btn sm ${selectedTable.status === k ? 'gold' : 'ghost'}`}
                    style={{ fontSize: '0.78rem', padding: '0.3em 0.7em' }}
                    onClick={() => handleStatusChange(selectedTable.id, k)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Masadaki Siparişler */}
            <div style={{ background: 'var(--surface)', padding: '1.2rem', borderRadius: 'var(--r)', border: '1px solid var(--line)', marginBottom: '1.2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                <b style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <UtensilsCrossed size={18} style={{ color: 'var(--gold)' }} />
                  <span>Adisyon Siparişleri</span>
                </b>
                <b style={{ fontSize: '1.3rem', color: 'var(--gold)' }}>
                  {tl(currentBillTotal)}
                </b>
              </div>

              {loadingOrders ? (
                <div className="muted small center" style={{ padding: '1.5rem' }}>Siparişler yükleniyor...</div>
              ) : tableOrders.length === 0 ? (
                <div className="muted small center" style={{ padding: '1.5rem' }}>Masaya henüz sipariş girilmedi.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '240px', overflowY: 'auto' }}>
                  {tableOrders.map((o) => (
                    <div
                      key={o.id}
                      style={{
                        background: 'var(--card-bg)',
                        border: '1px solid var(--line)',
                        borderRadius: '8px',
                        padding: '0.7rem 0.9rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Sipariş #{o.order_no}</span>
                        <span className="small muted">{hhmm(o.created_at)}</span>
                      </div>
                      {o.order_items?.map((it: any) => (
                        <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                          <span>{it.quantity}x {it.product_name}</span>
                          <span>{tl(it.line_total)}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Alt Butonlar */}
            <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn gold"
                onClick={() => {
                  setQuickOrderItems([]);
                  setQuickOrderModal(true);
                }}
              >
                <Plus size={16} />
                <span>+ Masaya Sipariş Ekle</span>
              </button>

              {selectedTable.status !== 'empty' && (
                <button
                  type="button"
                  className="btn ghost"
                  style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}
                  onClick={() => setBillModalOpen(true)}
                >
                  <CreditCard size={16} />
                  <span>Hesap Kapat & Tahsilat ({tl(currentBillTotal)})</span>
                </button>
              )}

              <button type="button" className="btn ghost" onClick={() => setSelectedTable(null)}>
                Kapat
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* =========================================================================
          MASAYA HIZLI SİPARİŞ EKLE MODALI
         ========================================================================= */}
      <Modal open={quickOrderModal} onClose={() => setQuickOrderModal(false)}>
        {selectedTable && (
          <div style={{ maxWidth: '680px', width: '100%' }}>
            <h2>Masa {selectedTable.number} — Hızlı Sipariş Girişi</h2>
            <p className="muted" style={{ marginBottom: '1rem' }}>
              Ürünlere tıklayarak masanın adisyonuna ekleyin:
            </p>

            {/* Ürün Listesi */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.6rem', maxHeight: '240px', overflowY: 'auto', background: 'var(--surface)', borderRadius: '10px', padding: '0.8rem' }}>
              {products.flatMap((p) =>
                p.variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => handleAddQuickItem(v.id, p.name, v.name, v.price)}
                    style={{
                      background: 'var(--card-bg)',
                      border: '1.5px solid var(--line)',
                      borderRadius: '8px',
                      padding: '0.6rem',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <b style={{ display: 'block', fontSize: '0.9rem' }}>{p.name}</b>
                    <span className="small muted">{v.name} — <b style={{ color: 'var(--gold)' }}>{tl(v.price)}</b></span>
                  </button>
                )),
              )}
            </div>

            {/* Seçilen Kalemler */}
            <div style={{ marginTop: '1.2rem' }}>
              <b>Eklenecek Ürünler ({quickOrderItems.length})</b>
              {quickOrderItems.map((it) => (
                <div key={it.variant_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid var(--line)' }}>
                  <span>{it.quantity}x {it.product_name} ({it.variant_name})</span>
                  <b>{tl(it.price * it.quantity)}</b>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '2px solid var(--line)' }}>
              <div>
                <span className="small muted">Eklenecek Tutar:</span>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--gold)' }}>
                  {tl(quickOrderItems.reduce((s, i) => s + i.price * i.quantity, 0))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.8rem' }}>
                <button type="button" className="btn ghost" onClick={() => setQuickOrderModal(false)}>
                  Vazgeç
                </button>
                <button
                  type="button"
                  className="btn gold"
                  disabled={quickOrderItems.length === 0}
                  onClick={handleSubmitQuickTableOrder}
                >
                  Masaya Kaydet
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* =========================================================================
          HESAP KAPATMA & TAHSİLAT MODALI
         ========================================================================= */}
      <Modal open={billModalOpen} onClose={() => setBillModalOpen(false)}>
        {selectedTable && (
          <div style={{ maxWidth: '500px', width: '100%' }}>
            <h2>Hesap Kapat: Masa {selectedTable.number}</h2>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--gold)', margin: '0.6rem 0 1.2rem' }}>
              Toplam: {tl(currentBillTotal)}
            </div>

            <fieldset>
              <legend>Tahsilat Yöntemi</legend>
              <label className="radio">
                <input
                  type="radio"
                  name="billPay"
                  checked={billPayment === 'cash_at_table'}
                  onChange={() => setBillPayment('cash_at_table')}
                />
                <Banknote size={18} style={{ color: 'var(--gold)' }} />
                <span>Nakit Tahsilat</span>
              </label>

              <label className="radio">
                <input
                  type="radio"
                  name="billPay"
                  checked={billPayment === 'card_at_table'}
                  onChange={() => setBillPayment('card_at_table')}
                />
                <CreditCard size={18} style={{ color: 'var(--gold)' }} />
                <span>Kredi / Banka Kartı (POS)</span>
              </label>

              <label className="radio">
                <input
                  type="radio"
                  name="billPay"
                  checked={billPayment === 'iban'}
                  onChange={() => setBillPayment('iban')}
                />
                <Send size={18} style={{ color: 'var(--gold)' }} />
                <span>IBAN / Havale</span>
              </label>
            </fieldset>

            <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button type="button" className="btn ghost" disabled={closingBill} onClick={() => setBillModalOpen(false)}>
                Vazgeç
              </button>
              <button type="button" className="btn gold" disabled={closingBill} onClick={handleCloseBill}>
                {closingBill ? 'Kapatılıyor...' : 'Tahsilatı Onayla & Masayı Boşalt'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* =========================================================================
          YENİ MASA TANIMLA MODALI
         ========================================================================= */}
      <Modal open={addTableModal} onClose={() => setAddTableModal(false)}>
        <h2>Yeni Masa Tanımla</h2>
        <form onSubmit={handleAddTable} className="form">
          <label>
            Masa Numarası *
            <input
              type="number"
              required
              min={1}
              value={newTableNum}
              onChange={(e) => setNewTableNum(Number(e.target.value))}
            />
          </label>

          <label>
            Masa Adı / Tanımı (İsteğe Bağlı)
            <input
              value={newTableName}
              onChange={(e) => setNewTableName(e.target.value)}
              placeholder="Örn: Bahçe 1, Teras 4, VIP Loca..."
            />
          </label>

          <label>
            Masa Geometrisi (Şekil)
            <select
              value={newTableShape}
              onChange={(e) => setNewTableShape(e.target.value as any)}
            >
              <option value="square">Kare (■)</option>
              <option value="rect">Dikdörtgen (▬)</option>
              <option value="round">Yuvarlak (●)</option>
            </select>
          </label>

          <label>
            Kapasite (Sandalye Sayısı)
            <input
              type="number"
              required
              min={1}
              max={30}
              value={newTableCap}
              onChange={(e) => setNewTableCap(Number(e.target.value))}
            />
          </label>

          <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="button" className="btn ghost" onClick={() => setAddTableModal(false)}>
              Vazgeç
            </button>
            <button type="submit" className="btn gold">
              Masayı Oluştur
            </button>
          </div>
        </form>
      </Modal>

      {/* =========================================================================
          MASAYI DÜZENLE MODALI
         ========================================================================= */}
      <Modal open={editTableModal} onClose={() => setEditTableModal(false)}>
        <h2>Masayı Düzenle #{editTableData.number}</h2>
        <form onSubmit={handleSaveEditTable} className="form">
          <label>
            Masa Numarası *
            <input
              type="number"
              required
              min={1}
              value={editTableData.number}
              onChange={(e) => setEditTableData({ ...editTableData, number: Number(e.target.value) })}
            />
          </label>

          <label>
            Masa Adı / Tanımı
            <input
              value={editTableData.name}
              onChange={(e) => setEditTableData({ ...editTableData, name: e.target.value })}
              placeholder="Örn: Teras 2"
            />
          </label>

          <label>
            Masa Şekli
            <select
              value={editTableData.shape}
              onChange={(e) => setEditTableData({ ...editTableData, shape: e.target.value as any })}
            >
              <option value="square">Kare (■)</option>
              <option value="rect">Dikdörtgen (▬)</option>
              <option value="round">Yuvarlak (●)</option>
            </select>
          </label>

          <label>
            Kapasite (Sandalye Sayısı)
            <input
              type="number"
              required
              min={1}
              max={30}
              value={editTableData.capacity}
              onChange={(e) => setEditTableData({ ...editTableData, capacity: Number(e.target.value) })}
            />
          </label>

          <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="button" className="btn ghost" onClick={() => setEditTableModal(false)}>
              Vazgeç
            </button>
            <button type="submit" className="btn gold">
              Değişiklikleri Kaydet
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
