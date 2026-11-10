import { useState, useEffect, useMemo } from 'react';
import { useTables, type TableWithSession } from '@/hooks/useTables';
import { useMenu } from '@/hooks/useMenu';
import { supabase } from '@/lib/supabase';
import { TABLE_STATUS_LABELS, ORDER_STATUS_LABELS } from '@/lib/constants';
import { tl, timeAgo } from '@/lib/helpers';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import NewOrderModal from '@/components/admin/NewOrderModal';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';

/** Masa şekline göre sandalyeleri masanın etrafına yerleştirir (konumlar % olarak) */
function chairLayout(shape: string, n: number): { x: number; y: number }[] {
  const count = Math.max(1, Math.min(20, n));
  const along = (k: number, a: number, b: number) => Array.from({ length: k }, (_, i) => a + ((b - a) * (i + 1)) / (k + 1));
  if (shape === 'round') {
    return Array.from({ length: count }, (_, i) => {
      const ang = (i / count) * Math.PI * 2 - Math.PI / 2;
      return { x: 50 + 40 * Math.cos(ang), y: 50 + 40 * Math.sin(ang) };
    });
  }
  if (shape === 'rect') {
    const top = Math.ceil(count / 2);
    const bottom = count - top;
    return [...along(top, 14, 86).map((x) => ({ x, y: 18 })), ...along(bottom, 14, 86).map((x) => ({ x, y: 82 }))];
  }
  // kare: dört kenara dağıt
  const sides = [0, 0, 0, 0];
  for (let i = 0; i < count; i++) sides[i % 4]++;
  return [
    ...along(sides[0], 22, 78).map((x) => ({ x, y: 16 })),
    ...along(sides[1], 22, 78).map((x) => ({ x, y: 84 })),
    ...along(sides[2], 22, 78).map((y) => ({ x: 16, y })),
    ...along(sides[3], 22, 78).map((y) => ({ x: 84, y })),
  ];
}

export default function TablesAdmin() {
  const { tables, refetch } = useTables();
  const { products } = useMenu();

  // Seçili masa her zaman güncel listeden türetilir (canlı güncellemeler panele yansır)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedTable: TableWithSession | null = useMemo(
    () => tables.find((t) => t.id === selectedId) || null,
    [tables, selectedId],
  );
  const setSelectedTable = (v: any) => {
    const val = typeof v === 'function' ? v(selectedTable) : v;
    setSelectedId(val ? val.id : null);
  };
  const [filter, setFilter] = useState<'all' | 'empty' | 'busy' | 'bill' | 'clean'>('all');
  const [quickOpen, setQuickOpen] = useState(false);
  const [tableQrSvg, setTableQrSvg] = useState<string>('');
  const [tableOrders, setTableOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Chair and Order Modal
  const [chairOrderModal, setChairOrderModal] = useState(false);
  const [selectedChair, setSelectedChair] = useState<number>(1);
  const [chairItems, setChairItems] = useState<
    Array<{ chair: number; variant_id: string; product_name: string; variant_name: string; price: number; quantity: number }>
  >([]);

  // Bill & Add & Edit Table Modals
  const [billModalOpen, setBillModalOpen] = useState(false);
  const [billPayment, setBillPayment] = useState<'cash_at_table' | 'card_at_table' | 'iban'>('cash_at_table');
  const [autoDeliverOnClose, setAutoDeliverOnClose] = useState(true);
  const [closingBill, setClosingBill] = useState(false);

  const [addTableModal, setAddTableModal] = useState(false);
  const [newTableNum, setNewTableNum] = useState<number>(1);
  const [newTableName, setNewTableName] = useState<string>('');
  const [newTableCap, setNewTableCap] = useState<number>(4);
  const [newTableShape, setNewTableShape] = useState<'square' | 'rect' | 'round'>('square');

  const [editTableModal, setEditTableModal] = useState(false);
  const [editTableData, setEditTableData] = useState({
    number: 1,
    name: '',
    capacity: 4,
    shape: 'square' as 'square' | 'rect' | 'round',
  });

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
      // Yalnızca seçili AÇIK OTURUMUN siparişlerini getir.
      // Masa ID'sine göre son 20 kaydı almak, uzun oturumlarda eski/yeni
      // oturumları karıştırıp hesap dökümünü eksik gösterebiliyordu.
      if (!selectedTable.activeSession?.id) {
        setTableOrders([]);
        setLoadingOrders(false);
        return;
      }
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('table_session_id', selectedTable.activeSession.id)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: true });
      if (error) {
        toast.error(`Masa siparişleri yüklenemedi: ${error.message}`);
        setTableOrders([]);
      } else {
        setTableOrders(data || []);
      }
      setLoadingOrders(false);
    };
    void fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTable?.id, selectedTable?.qrCode?.token, selectedTable?.activeSession?.id, selectedTable?.status, selectedTable?.sessionTotal]);

  // Status Change with validation
  const handleStatusChange = async (tableId: string, newStatus: string) => {
    try {
      const { error } = await supabase.rpc('set_table_status', {
        p_table_id: tableId,
        p_status: newStatus as any,
      });
      if (error) throw error;
      toast.success(`Masa durumu: ${TABLE_STATUS_LABELS[newStatus] || newStatus}`);
      refetch();
      if (selectedTable && selectedTable.id === tableId) {
        setSelectedTable({ ...selectedTable, status: newStatus as any });
      }
    } catch (err: any) {
      toast.error(err.message || 'Durum değiştirilemedi');
    }
  };

  // Mark single order as delivered (so bill can be closed)
  const handleDeliverOrder = async (orderId: string) => {
    try {
      const { error } = await supabase.rpc('update_order_status', {
        p_order_id: orderId,
        p_status: 'delivered',
        p_note: 'Masaya servis edildi',
      });
      if (error) throw error;
      toast.success('Sipariş servis edildi');
      refetch();
      // Update local orders
      setTableOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: 'delivered' } : o)),
      );
    } catch (err: any) {
      toast.error(err.message || 'Sipariş güncellenemedi');
    }
  };

  // Close Bill safely without errors
  const handleCloseBill = async () => {
    if (!selectedTable) return;
    setClosingBill(true);

    try {
      const sessionId = selectedTable.activeSession?.id;
      if (!sessionId) throw new Error('Bu masada açık oturum bulunamadı. Masayı yenileyip tekrar deneyin.');

      // Kapatma anında veritabanından oturumun TÜM siparişlerini tekrar oku.
      // Böylece hızlı sipariş ve masa düzeninden eklenen kayıtlar aynı hesaba girer;
      // ekranda kalmış eski/stale state ile kapatma yapılmaz.
      const { data: currentOrders, error: ordersError } = await supabase
        .from('orders')
        .select('id,status')
        .eq('table_session_id', sessionId)
        .neq('status', 'cancelled');
      if (ordersError) throw ordersError;

      const unserved = (currentOrders || []).filter((o: any) =>
        ['new', 'preparing', 'ready', 'assigned', 'on_the_way'].includes(o.status),
      );

      if (unserved.length > 0) {
        if (!autoDeliverOnClose) {
          throw new Error(`Bu masada servis edilmemiş ${unserved.length} sipariş var. Önce servis edin veya otomatik servis seçeneğini açın.`);
        }

        // Her durum güncellemesinin hatasını kontrol et; sessizce devam etme.
        for (const order of unserved) {
          const { error: statusError } = await supabase.rpc('update_order_status', {
            p_order_id: order.id,
            p_status: 'delivered',
            p_note: 'Hesap kapatılırken otomatik servis edildi',
          });
          if (statusError) throw statusError;
        }
      }

      // Hızlı sipariş ve Masa Düzeni aynı atomik veritabanı kapatma fonksiyonunu kullanır.
      const { data, error } = await supabase.rpc('close_table_bill', {
        p_table_id: selectedTable.id,
        p_payment: billPayment,
      });

      if (error) throw error;
      const res = data as any;
      toast.success(`Hesap başarıyla kapatıldı: ${tl(res.total || 0)}`);
      setBillModalOpen(false);
      refetch();
      setSelectedTable((prev) => (prev ? { ...prev, status: 'bill_closed', activeSession: null } : null));
    } catch (err: any) {
      toast.error(err.message || 'Hesap kapatılamadı');
    } finally {
      setClosingBill(false);
    }
  };

  // Clear / Empty table after bill closed or cleaned
  const handleClearTable = async () => {
    if (!selectedTable) return;
    try {
      await handleStatusChange(selectedTable.id, 'empty');
      setSelectedTable(null);
    } catch (err: any) {
      toast.error(err.message || 'Masa boşaltılamadı');
    }
  };

  // Update Chairs
  const handleUpdateChairs = async (delta: number) => {
    if (!selectedTable) return;
    const nextCap = Math.max(1, Math.min(20, selectedTable.capacity + delta));
    try {
      const { error } = await supabase
        .from('dining_tables')
        .update({ capacity: nextCap })
        .eq('id', selectedTable.id);
      if (error) throw error;
      setSelectedTable({ ...selectedTable, capacity: nextCap });
      toast.success(`Sandalye sayısı güncellendi: ${nextCap}`);
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Sandalye güncellenemedi');
    }
  };

  // Regenerate Table QR
  const handleRegenerateQr = async () => {
    if (!selectedTable) return;
    try {
      const { data, error } = await supabase.rpc('regenerate_table_qr', {
        p_table_id: selectedTable.id,
      });
      if (error) throw error;
      toast.success('Masa QR kodu yenilendi');
      refetch();
      const newToken = data as string;
      const url = `${window.location.origin}/qr/${newToken}`;
      QRCode.toString(url, { type: 'svg', margin: 2 }, (err, svg) => {
        if (!err && svg) setTableQrSvg(svg);
      });
    } catch (err: any) {
      toast.error(err.message || 'QR yenilenemedi');
    }
  };

  // Add Table
  const handleAddTable = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('dining_tables').insert({
        number: Number(newTableNum),
        name: newTableName.trim() || `Masa ${newTableNum}`,
        capacity: Number(newTableCap),
        shape: newTableShape,
      });
      if (error) throw error;
      toast.success(`Masa ${newTableNum} başarıyla eklendi`);
      setAddTableModal(false);
      setNewTableName('');
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Masa eklenemedi');
    }
  };

  // Open Edit Table Modal
  const handleOpenEditTable = () => {
    if (!selectedTable) return;
    setEditTableData({
      number: selectedTable.number,
      name: selectedTable.name || `Masa ${selectedTable.number}`,
      capacity: selectedTable.capacity,
      shape: selectedTable.shape,
    });
    setEditTableModal(true);
  };

  // Save Edit Table
  const handleSaveEditTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTable) return;

    try {
      const { error } = await supabase
        .from('dining_tables')
        .update({
          number: Number(editTableData.number),
          name: editTableData.name.trim(),
          capacity: Number(editTableData.capacity),
          shape: editTableData.shape,
        })
        .eq('id', selectedTable.id);

      if (error) throw error;
      toast.success('Masa bilgileri güncellendi');
      setEditTableModal(false);
      refetch();
      setSelectedTable((prev) =>
        prev
          ? {
              ...prev,
              number: Number(editTableData.number),
              name: editTableData.name.trim(),
              capacity: Number(editTableData.capacity),
              shape: editTableData.shape,
            }
          : null,
      );
    } catch (err: any) {
      toast.error(err.message || 'Masa güncellenemedi');
    }
  };

  // Delete Table (soft delete)
  const handleDeleteTable = async (tableId: string) => {
    if (!window.confirm('Bu masayı silmek (pasifleştirmek) istediğinize emin misiniz?')) return;
    try {
      const { error } = await supabase
        .from('dining_tables')
        .update({ is_active: false })
        .eq('id', tableId);
      if (error) throw error;
      toast.success('Masa pasifleştirildi');
      setSelectedTable(null);
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Masa silinemedi (Açık hesabı olan masa silinemez)');
    }
  };

  // Submit Chair-based Order
  const handleSubmitChairOrder = async () => {
    if (!selectedTable || chairItems.length === 0) {
      toast.error('Lütfen en az bir sandalyeye sipariş ekleyin');
      return;
    }

    try {
      const itemsPayload = chairItems.map((item) => ({
        variant_id: item.variant_id,
        quantity: item.quantity,
        note: `Sandalye ${item.chair}`,
      }));

      const { error } = await supabase.rpc('staff_create_order', {
        p_source: 'table',
        p_type: 'dine_in',
        p_customer: {
          name: selectedTable.name || `Masa ${selectedTable.number}`,
          phone: '',
          address: '',
        },
        p_items: itemsPayload,
        p_table_id: selectedTable.id,
        p_payment: null,
        p_note: `Masaya sipariş (${chairItems.length} kalem)`,
        p_save_address: false,
      });

      if (error) throw error;
      toast.success(`${selectedTable.name || `Masa ${selectedTable.number}`} siparişi iletildi!`);
      setChairItems([]);
      setChairOrderModal(false);
      refetch();

      // Refresh orders for this table
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

  // Calculate table total
  const activeOrders = tableOrders.filter(
    (o) => o.table_session_id === selectedTable?.activeSession?.id && o.status !== 'cancelled',
  );
  const tableTotal = activeOrders.reduce((sum, o) => sum + Number(o.total), 0);
  const unservedCount = activeOrders.filter((o) =>
    ['new', 'preparing', 'ready', 'assigned', 'on_the_way'].includes(o.status),
  ).length;

  const stats = useMemo(
    () => ({
      empty: tables.filter((t) => t.status === 'empty').length,
      busy: tables.filter((t) => !['empty', 'awaiting_cleaning', 'cleaning', 'bill_closed'].includes(t.status)).length,
      bill: tables.filter((t) => t.status === 'awaiting_bill').length,
      openTotal: tables.reduce((s, t) => s + (t.sessionTotal || 0), 0),
    }),
    [tables],
  );
  const visibleTables = useMemo(
    () =>
      tables.filter((t) => {
        if (filter === 'empty') return t.status === 'empty';
        if (filter === 'busy') return !['empty', 'awaiting_cleaning', 'cleaning', 'bill_closed'].includes(t.status);
        if (filter === 'bill') return t.status === 'awaiting_bill';
        if (filter === 'clean') return ['awaiting_cleaning', 'cleaning', 'bill_closed'].includes(t.status);
        return true;
      }),
    [tables, filter],
  );

  return (
    <>
      <div className="bar">
        <div>
          <h1>Masa ve Restoran Düzeni</h1>
          <p className="muted" style={{ margin: 0 }}>
            Masaların yerleşimi, şekilleri, sandalye bazlı siparişler ve hatasız hesap kapatma
          </p>
        </div>
        <button
          type="button"
          className="btn gold sm"
          onClick={() => {
            const maxNum = tables.reduce((max, t) => Math.max(max, t.number), 0);
            setNewTableNum(maxNum + 1);
            setNewTableName(`Masa ${maxNum + 1}`);
            setAddTableModal(true);
          }}
        >
          <Icon name="plus" size={16} /> Yeni Masa Ekle
        </button>
      </div>

      <div className="tstats">
        <div><Icon name="grid" size={20} /><b>{tables.length}</b><span>Toplam masa</span></div>
        <div className="ok"><Icon name="check" size={20} /><b>{stats.empty}</b><span>Boş</span></div>
        <div className="busy"><Icon name="utensils" size={20} /><b>{stats.busy}</b><span>Dolu</span></div>
        <div className="bill"><Icon name="receipt" size={20} /><b>{stats.bill}</b><span>Hesap bekliyor</span></div>
        <div className="sum"><Icon name="wallet" size={20} /><b>{tl(stats.openTotal)}</b><span>Açık hesaplar</span></div>
      </div>

      <div className="tfilters">
        {([
          ['all', 'Tümü'],
          ['empty', 'Boş'],
          ['busy', 'Dolu'],
          ['bill', 'Hesap'],
          ['clean', 'Temizlik'],
        ] as const).map(([k, label]) => (
          <button key={k} type="button" className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
            {label}
          </button>
        ))}
        <span className="tlegend">
          {['empty', 'awaiting_order', 'preparing', 'served', 'awaiting_bill', 'awaiting_cleaning'].map((k) => (
            <span key={k} className={`lg s-${k}`}>{TABLE_STATUS_LABELS[k]}</span>
          ))}
        </span>
      </div>

      <div className="two-panel tpanel">
        <div>
          {tables.length === 0 && (
            <div className="empty-state">
              <Icon name="grid" size={34} />
              <h3>Henüz masa yok</h3>
              <p className="muted">“Yeni Masa Ekle” ile restoran düzeninizi oluşturun.</p>
            </div>
          )}
          <div className="floor">
            {visibleTables.map((t) => {
              const isSelected = selectedTable?.id === t.id;
              const chairs = chairLayout(t.shape, t.capacity || 4);
              const occupied = t.status !== 'empty';
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`ftable ${t.shape} s-${t.status}${isSelected ? ' selected' : ''}${t.unserved > 0 ? ' alert' : ''}`}
                  onClick={() => setSelectedTable(t)}
                  aria-label={`${t.name || 'Masa ' + t.number}, ${TABLE_STATUS_LABELS[t.status]}`}
                >
                  <span className="fplan">
                    {chairs.map((c, i) => (
                      <i key={i} className={`fchair${occupied ? ' on' : ''}`} style={{ left: `${c.x}%`, top: `${c.y}%` }} />
                    ))}
                    <span className="fbody">
                      <b className="fnum">{t.number}</b>
                      {t.unserved > 0 && <em className="fbell"><Icon name="bell" size={13} />{t.unserved}</em>}
                    </span>
                  </span>
                  <span className="fname">{t.name && t.name !== `Masa ${t.number}` ? t.name : `Masa ${t.number}`}</span>
                  <span className="fstat">{TABLE_STATUS_LABELS[t.status] || t.status}</span>
                  <span className="finfo">
                    {t.activeSession ? (
                      <>
                        <b>{tl(t.sessionTotal)}</b>
                        <small><Icon name="clock" size={12} /> {timeAgo(t.activeSession.opened_at)}</small>
                      </>
                    ) : (
                      <small><Icon name="users" size={12} /> {t.capacity} kişilik</small>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          {tables.length > 0 && visibleTables.length === 0 && <p className="muted center" style={{ padding: '2rem 0' }}>Bu filtrede masa yok.</p>}
        </div>

        {/* Masa Yönetim ve Sipariş Detay Paneli */}
        <aside className="card" style={{ padding: '1.4rem' }}>
          {selectedTable ? (
            <div>
              <div className="orow" style={{ alignItems: 'baseline' }}>
                <h3 style={{ margin: 0 }}>{selectedTable.name || `Masa ${selectedTable.number}`}</h3>
                <button
                  type="button"
                  className="btn ghost sm"
                  style={{ padding: '0.2em 0.5em', fontSize: '0.75rem' }}
                  onClick={handleOpenEditTable}
                >
                  ✏️ Düzenle
                </button>
              </div>

              {/* Sandalye Arttır / Azalt */}
              <div
                style={{
                  background: 'var(--surface)',
                  padding: '0.8rem',
                  borderRadius: '10px',
                  margin: '0.8rem 0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <b>Sandalyeler: {selectedTable.capacity}</b>
                  <div className="small muted">
                    {selectedTable.shape === 'round' ? 'Yuvarlak' : selectedTable.shape === 'rect' ? 'Dikdörtgen' : 'Kare'} Masa
                  </div>
                </div>
                <div className="qty">
                  <button type="button" onClick={() => handleUpdateChairs(-1)}>
                    −
                  </button>
                  <b>{selectedTable.capacity}</b>
                  <button type="button" onClick={() => handleUpdateChairs(1)}>
                    +
                  </button>
                </div>
              </div>

              <button
                type="button"
                className="btn gold sm"
                style={{ width: '100%', marginBottom: '0.5rem' }}
                onClick={() => setQuickOpen(true)}
              >
                <Icon name="zap" size={16} /> Hızlı Sipariş (menüden seç)
              </button>

              {/* Sandalye Bazlı Hızlı Sipariş Butonu */}
              <button
                type="button"
                className="btn ghost sm"
                style={{ width: '100%', marginBottom: '1rem' }}
                onClick={() => {
                  setSelectedChair(1);
                  setChairOrderModal(true);
                }}
              >
                Sandalyeye Göre Sipariş Al
              </button>

              {/* Durum Değiştirme */}
              <label style={{ display: 'block', margin: '0.6rem 0' }}>
                <span className="small">Masa Durumu:</span>
                <select
                  value={selectedTable.status}
                  onChange={(e) => handleStatusChange(selectedTable.id, e.target.value)}
                  style={{ marginTop: '0.2rem', width: '100%' }}
                >
                  {Object.entries(TABLE_STATUS_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              {/* Quick Table Clean & Empty Button */}
              {['bill_closed', 'awaiting_cleaning', 'cleaning', 'served'].includes(selectedTable.status) && (
                <button
                  type="button"
                  className="btn ghost sm"
                  style={{ width: '100%', margin: '0.4rem 0', borderColor: 'var(--success)', color: 'var(--success)' }}
                  onClick={handleClearTable}
                >
                  🧽 Masayı Temizlendi ve Boş Olarak İşaretle
                </button>
              )}

              {/* Hesap & Siparişler */}
              <div style={{ margin: '1rem 0', borderTop: '1px solid var(--line)', paddingTop: '0.8rem' }}>
                <div className="orow">
                  <b>Masa Toplamı:</b>
                  <b className="price" style={{ fontSize: '1.35rem' }}>
                    {tl(tableTotal)}
                  </b>
                </div>

                {selectedTable.activeSession?.opened_at &&
                  Date.now() - new Date(selectedTable.activeSession.opened_at).getTime() > 12 * 60 * 60 * 1000 && (
                    <div style={{ marginTop: '0.65rem', padding: '0.7rem', borderRadius: 8, background: 'var(--gold-bg)', color: 'var(--gold-text)', fontSize: '0.82rem' }}>
                      <b>⚠️ Uzun süredir açık hesap</b>
                      <div>Bu masa oturumu 12 saatten uzun süredir açık. Önceki saatlerdeki siparişler de aynı hesaba dahil olabilir. Sipariş saatlerini kontrol etmeden hesabı kapatmayın.</div>
                    </div>
                  )}

                {tableTotal > 0 && (
                  <button
                    type="button"
                    className="btn gold sm"
                    style={{ width: '100%', marginTop: '0.8rem' }}
                    onClick={() => {
                      setAutoDeliverOnClose(true);
                      setBillModalOpen(true);
                    }}
                  >
                    💳 Hesabı Kapat ({tl(tableTotal)})
                  </button>
                )}

                {loadingOrders ? (
                  <p className="muted small">Siparişler yükleniyor...</p>
                ) : (
                  <div style={{ marginTop: '0.8rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <h4 style={{ fontSize: '0.9rem', margin: 0 }}>Masadaki Siparişler ({activeOrders.length}):</h4>
                    </div>

                    {activeOrders.map((o) => {
                      const isDelivered = o.status === 'delivered';

                      return (
                        <div
                          key={o.id}
                          style={{
                            fontSize: '0.85rem',
                            marginBottom: '0.6rem',
                            border: '1px solid var(--line)',
                            borderRadius: '8px',
                            padding: '0.5rem 0.6rem',
                            background: isDelivered ? 'var(--surface)' : 'var(--card-bg)',
                          }}
                        >
                          <div className="orow" style={{ marginBottom: '0.3rem' }}>
                            <div>
                              <b>#{o.order_no}</b>
                              <span
                                className={`st ${o.status}`}
                                style={{ fontSize: '0.72rem', padding: '0.1em 0.5em', marginLeft: '0.4rem' }}
                              >
                                {ORDER_STATUS_LABELS[o.status] || o.status}
                              </span>
                            </div>
                            <b>{tl(o.total)}</b>
                          </div>

                          <ul style={{ margin: '0.2rem 0', paddingLeft: '1.1rem', color: 'var(--text-muted)' }}>
                            {o.order_items?.map((it: any) => (
                              <li key={it.id}>
                                {it.note ? <b>[{it.note}] </b> : ''}
                                {it.quantity}× {it.product_name}
                              </li>
                            ))}
                          </ul>

                          {!isDelivered && (
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.4rem' }}>
                              <button
                                type="button"
                                className="btn ghost sm"
                                style={{ fontSize: '0.75rem', padding: '0.2em 0.6em', color: 'var(--success)' }}
                                onClick={() => handleDeliverOrder(o.id)}
                              >
                                ✓ Servis Edildi Yap
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {activeOrders.length === 0 && <p className="muted small">Masada açık sipariş yok</p>}
                  </div>
                )}
              </div>

              {/* Masa QR Kod */}
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: '1rem', textAlign: 'center' }}>
                <h4>Masa QR Kodu</h4>
                {tableQrSvg ? (
                  <div
                    dangerouslySetInnerHTML={{ __html: tableQrSvg }}
                    style={{ maxWidth: '150px', margin: 'auto' }}
                  />
                ) : (
                  <p className="muted small">QR üretiliyor...</p>
                )}
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem' }}>
                  <button
                    type="button"
                    className="btn ghost sm"
                    style={{ flex: 1, fontSize: '0.75rem' }}
                    onClick={handleRegenerateQr}
                  >
                    QR Yenile
                  </button>
                  <a
                    className="btn dark sm"
                    style={{ flex: 1, fontSize: '0.75rem' }}
                    href={`${window.location.origin}/qr/${selectedTable.qrCode?.token || ''}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Menüyü Aç
                  </a>
                </div>
              </div>

              {/* Masayı Sil */}
              <button
                type="button"
                className="linkbtn"
                style={{ color: 'var(--danger)', marginTop: '1.2rem', width: '100%', textAlign: 'center' }}
                onClick={() => handleDeleteTable(selectedTable.id)}
              >
                Masayı Sil (Pasifleştir)
              </button>
            </div>
          ) : (
            <p className="muted center" style={{ padding: '3rem 0' }}>
              İşlem yapmak veya sipariş almak için bir masaya dokunun.
            </p>
          )}
        </aside>
      </div>

      {/* SANDALYE BAZLI SİPARİŞ MODALI */}
      <Modal open={chairOrderModal} onClose={() => setChairOrderModal(false)}>
        <h2>{selectedTable?.name || `Masa ${selectedTable?.number}`} - Sandalyeye Sipariş Girişi</h2>
        <p className="muted small">
          Masanın etrafındaki sandalyelerden birine dokunun ve o kişinin istediği pilav/içecekleri ekleyin.
        </p>

        {/* Görsel Sandalye Seçici */}
        <div className="interactive-table-canvas">
          <div className="chairs-interactive-list">
            {[...Array(selectedTable?.capacity || 4)].map((_, i) => {
              const chairNum = i + 1;
              const hasOrder = chairItems.some((ci) => ci.chair === chairNum);
              const isSelected = selectedChair === chairNum;

              return (
                <button
                  key={chairNum}
                  type="button"
                  className={`chair-btn${isSelected ? ' selected' : ''}${hasOrder ? ' has-order' : ''}`}
                  onClick={() => setSelectedChair(chairNum)}
                >
                  <span>🪑 Sandalye {chairNum}</span>
                  {hasOrder && <small>✓ Sipariş var</small>}
                </button>
              );
            })}
          </div>

          <div className={`table-shape-body ${selectedTable?.shape || 'square'}`}>
            {selectedTable?.name || `Masa ${selectedTable?.number}`}
          </div>
        </div>

        {/* Seçili Sandalye İçin Ürün Ekleme */}
        <div style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '12px', marginBottom: '1rem' }}>
          <b>Sandalye {selectedChair} İçin Ürün Seçin:</b>
          <select
            style={{ marginTop: '0.5rem', width: '100%' }}
            onChange={(e) => {
              if (!e.target.value) return;
              const vId = e.target.value;
              const prod = products.find((p) => p.variants.some((v) => v.id === vId));
              const variant = prod?.variants.find((v) => v.id === vId);

              if (prod && variant) {
                setChairItems([
                  ...chairItems,
                  {
                    chair: selectedChair,
                    variant_id: variant.id,
                    product_name: prod.name,
                    variant_name: variant.name,
                    price: variant.price,
                    quantity: 1,
                  },
                ]);
              }
              e.target.value = '';
            }}
          >
            <option value="">+ Sandalye {selectedChair} için ürün seçin...</option>
            {products.flatMap((p) =>
              p.variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {p.name} - {v.name} ({tl(v.price)})
                </option>
              )),
            )}
          </select>
        </div>

        {/* Eklenen Kalemler Listesi */}
        <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '1rem' }}>
          <h4>Masaya Eklenecek Kalemler:</h4>
          {chairItems.map((ci, idx) => (
            <div key={idx} className="crow">
              <div>
                <b>[Sandalye {ci.chair}]</b> {ci.product_name} ({ci.variant_name})
              </div>
              <div className="qty">
                <button
                  type="button"
                  onClick={() => {
                    const updated = [...chairItems];
                    if (updated[idx].quantity > 1) {
                      updated[idx].quantity -= 1;
                      setChairItems(updated);
                    } else {
                      setChairItems(updated.filter((_, i) => i !== idx));
                    }
                  }}
                >
                  −
                </button>
                <b>{ci.quantity}</b>
                <button
                  type="button"
                  onClick={() => {
                    const updated = [...chairItems];
                    updated[idx].quantity += 1;
                    setChairItems(updated);
                  }}
                >
                  +
                </button>
              </div>
              <b>{tl(ci.price * ci.quantity)}</b>
            </div>
          ))}
          {chairItems.length === 0 && (
            <p className="muted small">Henüz sandalyelere ürün eklenmedi.</p>
          )}
        </div>

        <div className="prow" style={{ marginTop: '1rem' }}>
          <button
            type="button"
            className="btn gold"
            disabled={chairItems.length === 0}
            onClick={handleSubmitChairOrder}
          >
            Siparişi Mutfağa İlet · {tl(chairItems.reduce((s, i) => s + i.price * i.quantity, 0))}
          </button>
          <button type="button" className="btn ghost" onClick={() => setChairOrderModal(false)}>
            Vazgeç
          </button>
        </div>
      </Modal>

      {/* HESAP KAPAT MODAL (Hatasız & Güvenli) */}
      <Modal open={billModalOpen} onClose={() => !closingBill && setBillModalOpen(false)}>
        <h2>{selectedTable?.name || `Masa ${selectedTable?.number}`} Hesabını Kapat</h2>
        <p className="muted">
          Tahsil Edilecek Tutar: <b className="price">{tl(tableTotal)}</b>
        </p>

        {unservedCount > 0 && (
          <div
            style={{
              background: 'var(--gold-bg)',
              color: 'var(--gold-text)',
              padding: '0.8rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              marginBottom: '1rem',
            }}
          >
            <b>ℹ️ Bilgi:</b> Masada henüz 'servis edildi' olarak işaretlenmemiş <b>{unservedCount}</b> sipariş var.
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={autoDeliverOnClose}
                onChange={(e) => setAutoDeliverOnClose(e.target.checked)}
              />
              <span>Tüm siparişleri otomatik 'Servis Edildi' yap ve hesabı kapat</span>
            </label>
          </div>
        )}

        <fieldset style={{ margin: '1rem 0' }}>
          <legend>Tahsilat Şekli</legend>
          <label className="radio">
            <input
              type="radio"
              name="billPay"
              checked={billPayment === 'cash_at_table'}
              onChange={() => setBillPayment('cash_at_table')}
            />
            Nakit (Masada)
          </label>
          <label className="radio">
            <input
              type="radio"
              name="billPay"
              checked={billPayment === 'card_at_table'}
              onChange={() => setBillPayment('card_at_table')}
            />
            Kredi/Banka Kartı (Masada POS)
          </label>
          <label className="radio">
            <input
              type="radio"
              name="billPay"
              checked={billPayment === 'iban'}
              onChange={() => setBillPayment('iban')}
            />
            IBAN / Havale
          </label>
        </fieldset>

        <div className="prow">
          <button
            type="button"
            className="btn gold sm"
            disabled={closingBill}
            onClick={handleCloseBill}
          >
            {closingBill ? 'Kapatılıyor...' : 'Tahsilatı Onayla ve Hesabı Kapat'}
          </button>
          <button
            type="button"
            className="btn ghost sm"
            disabled={closingBill}
            onClick={() => setBillModalOpen(false)}
          >
            Vazgeç
          </button>
        </div>
      </Modal>

      {/* YENİ MASA EKLE MODAL */}
      <Modal open={addTableModal} onClose={() => setAddTableModal(false)}>
        <h2>Yeni Masa Tanımla</h2>
        <form onSubmit={handleAddTable} className="form">
          <label>
            Masa Numarası
            <input
              type="number"
              required
              min={1}
              value={newTableNum}
              onChange={(e) => setNewTableNum(Number(e.target.value))}
            />
          </label>
          <label>
            Masa Adı / Tanımı (İsteğe bağlı)
            <input
              value={newTableName}
              onChange={(e) => setNewTableName(e.target.value)}
              placeholder="Örn: Bahçe 1, Teras 4"
            />
          </label>
          <label>
            Masa Şekli
            <select
              value={newTableShape}
              onChange={(e) => setNewTableShape(e.target.value as any)}
            >
              <option value="square">Kare (◼)</option>
              <option value="rect">Dikdörtgen (▬)</option>
              <option value="round">Yuvarlak (⭕)</option>
            </select>
          </label>
          <label>
            Sandalye Sayısı (Kapasite)
            <input
              type="number"
              required
              min={1}
              max={20}
              value={newTableCap}
              onChange={(e) => setNewTableCap(Number(e.target.value))}
            />
          </label>
          <div className="prow" style={{ marginTop: '1rem' }}>
            <button type="submit" className="btn gold sm">
              Masayı Oluştur
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setAddTableModal(false)}>
              Vazgeç
            </button>
          </div>
        </form>
      </Modal>

      {/* MASA DÜZENLE MODAL */}
      <Modal open={editTableModal} onClose={() => setEditTableModal(false)}>
        <h2>Masayı Düzenle: {editTableData.name || `Masa ${editTableData.number}`}</h2>
        <form onSubmit={handleSaveEditTable} className="form">
          <label>
            Masa Numarası
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
              placeholder="Örn: Bahçe 1"
            />
          </label>
          <label>
            Masa Şekli
            <select
              value={editTableData.shape}
              onChange={(e) => setEditTableData({ ...editTableData, shape: e.target.value as any })}
            >
              <option value="square">Kare (◼)</option>
              <option value="rect">Dikdörtgen (▬)</option>
              <option value="round">Yuvarlak (⭕)</option>
            </select>
          </label>
          <label>
            Sandalye Sayısı (Kapasite)
            <input
              type="number"
              required
              min={1}
              max={20}
              value={editTableData.capacity}
              onChange={(e) => setEditTableData({ ...editTableData, capacity: Number(e.target.value) })}
            />
          </label>
          <div className="prow" style={{ marginTop: '1rem' }}>
            <button type="submit" className="btn gold sm">
              Değişiklikleri Kaydet
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setEditTableModal(false)}>
              Vazgeç
            </button>
          </div>
        </form>
      </Modal>
      <NewOrderModal open={quickOpen} onClose={() => setQuickOpen(false)} presetTableId={selectedTable?.id} onCreated={refetch} />
    </>
  );
}
