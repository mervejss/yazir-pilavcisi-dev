import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { tl, hhmm } from '@/lib/helpers';
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@/lib/constants';
import Modal from '@/components/ui/Modal';
import CustomerAnalyticsPanel from '@/components/analytics/CustomerAnalyticsPanel';
import CustomerInsights from '@/components/analytics/CustomerInsights';
import NewOrderModal, { type OrderPrefill } from '@/components/admin/NewOrderModal';
import AddressMap from '@/components/maps/AddressMap';
import LocationPicker from '@/components/maps/LocationPicker';
import { mapsPlaceUrl, type LatLng } from '@/lib/googleMaps';
import { fmtPhone, isMissingFn, normalizePhone } from '@/lib/staffCustomers';

interface Cust {
  id: string;
  user_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  loyalty_points: number;
  created_at: string;
  order_count: number;
  total_spent: number;
  last_order_at: string | null;
  avg_basket: number;
  created_via?: string | null;
}
type SortKey = 'recent' | 'spent' | 'orders' | 'points' | 'name';

export default function CustomersAdmin() {
  const { profile } = useAuthStore();
  const canPoints = !!profile && ['owner', 'sub_admin'].includes(profile.role);
  const [list, setList] = useState<Cust[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [seg, setSeg] = useState<'all' | 'member' | 'vip' | 'new' | 'sleeping'>('all');
  const [sel, setSel] = useState<Cust | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', phone: '', notes: '' });
  const [adj, setAdj] = useState({ points: '', note: '' });
  const [coupons, setCoupons] = useState<any[]>([]);
  const [couponPick, setCouponPick] = useState('');
  const [openOrder, setOpenOrder] = useState<string | null>(null);
  const [tab, setTab] = useState<'list' | 'analytics'>('list');
  const [orderModal, setOrderModal] = useState(false);
  const [prefill, setPrefill] = useState<OrderPrefill | null>(null);
  const [addrs, setAddrs] = useState<any[]>([]);
  const [mapAddr, setMapAddr] = useState<string | null>(null);
  // Yeni telefon müşterisi / adres ekleme formu
  const emptyNew = { name: '', phone: '', notes: '', address: '', district: 'Yazır', title: 'Ev' };
  const [addOpen, setAddOpen] = useState<null | 'customer' | 'address'>(null);
  const [nf, setNf] = useState(emptyNew);
  const [nfLoc, setNfLoc] = useState<LatLng | null>(null);
  const [nfBusy, setNfBusy] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.rpc('admin_customers');
    if (error) setMissing(true);
    else setList((data || []) as unknown as Cust[]);
    setLoading(false);
  };
  useEffect(() => {
    load();
    supabase.from('coupons').select('id,code,title,audience,customer_ids').eq('audience', 'specific').then(({ data }) => data && setCoupons(data as any[]));
  }, []);

  const open = async (c: Cust) => {
    setSel(c);
    setForm({ name: c.full_name, phone: c.phone || '', notes: c.notes || '' });
    setAdj({ points: '', note: '' });
    setOpenOrder(null);
    setMapAddr(null);
    loadAddrs(c.id);
    const [o, l] = await Promise.all([
      supabase.from('orders').select('*, order_items(*)').eq('customer_id', c.id).order('created_at', { ascending: false }).limit(60),
      supabase.from('loyalty_ledger').select('*').eq('customer_id', c.id).order('created_at', { ascending: false }).limit(40),
    ]);
    setOrders((o.data || []) as any[]);
    setLedger(l.error ? [] : ((l.data || []) as any[]));
  };

  const loadAddrs = async (id: string) => {
    const { data } = await supabase.from('customer_addresses').select('*').eq('customer_id', id).order('is_default', { ascending: false });
    setAddrs((data || []) as any[]);
  };

  const orderFor = (c: Cust, repeat?: any) => {
    setPrefill({ customer: { id: c.id, name: c.full_name, phone: c.phone }, repeat });
    setOrderModal(true);
  };

  const saveNew = async () => {
    const np = nf.phone.trim() ? normalizePhone(nf.phone) : null;
    if (addOpen === 'customer' && !nf.name.trim() && !np) return void toast.error('En az ad veya telefon girin');
    if (nf.phone.trim() && !np) return void toast.error('Telefon geçersiz (05xx xxx xx xx)');
    if (addOpen === 'address' && !nf.address.trim()) return void toast.error('Adres yazın');
    setNfBusy(true);
    const { data, error } = await supabase.rpc('staff_save_customer', {
      p_customer: addOpen === 'address' ? sel?.id : null,
      p_name: addOpen === 'address' ? null : nf.name,
      p_phone: addOpen === 'address' ? null : np,
      p_notes: addOpen === 'address' ? null : nf.notes,
      p_address: nf.address.trim() ? { title: nf.title, address: nf.address.trim(), district: nf.district, lat: nfLoc?.lat ?? null, lng: nfLoc?.lng ?? null, make_default: false } : null,
    } as any);
    setNfBusy(false);
    if (error) return void toast.error(isMissingFn(error) ? 'sql/25_phone_customers_maps.sql dosyasını Supabase SQL Editor\'de çalıştırın' : error.message);
    const r: any = data;
    toast.success(addOpen === 'address' ? 'Adres kaydedildi' : r?.created ? 'Müşteri kaydedildi' : 'Bu telefon zaten kayıtlıydı — bilgiler güncellendi');
    const was = addOpen;
    setAddOpen(null);
    setNf(emptyNew);
    setNfLoc(null);
    await load();
    if (was === 'address' && sel) loadAddrs(sel.id);
  };

  const saveInfo = async () => {
    if (!sel) return;
    const { error } = await supabase.rpc('admin_update_customer', { p_customer: sel.id, p_name: form.name, p_phone: form.phone, p_notes: form.notes });
    if (error) return void toast.error(error.message);
    toast.success('Müşteri bilgileri kaydedildi');
    load();
  };

  const adjust = async () => {
    if (!sel) return;
    const n = parseInt(adj.points, 10);
    if (!n) return void toast.error('Puan miktarı girin (eksi değer puan düşer)');
    const { data, error } = await supabase.rpc('admin_adjust_points', { p_customer: sel.id, p_points: n, p_note: adj.note || null });
    if (error) return void toast.error(error.message);
    toast.success(`Puan güncellendi. Yeni bakiye: ${data}`);
    setAdj({ points: '', note: '' });
    setSel({ ...sel, loyalty_points: Number(data) });
    load();
    const l = await supabase.from('loyalty_ledger').select('*').eq('customer_id', sel.id).order('created_at', { ascending: false }).limit(40);
    setLedger((l.data || []) as any[]);
  };

  const assignCoupon = async () => {
    if (!sel || !couponPick) return;
    const c = coupons.find((x) => x.id === couponPick);
    if (!c) return;
    if ((c.customer_ids || []).includes(sel.id)) return void toast('Bu müşteri zaten tanımlı');
    const { error } = await supabase.from('coupons').update({ customer_ids: [...(c.customer_ids || []), sel.id] }).eq('id', c.id);
    if (error) return void toast.error(error.message);
    toast.success(`${c.code} kuponu ${sel.full_name || 'müşteri'} için tanımlandı`);
    setCoupons((cs) => cs.map((x) => (x.id === c.id ? { ...x, customer_ids: [...(x.customer_ids || []), sel.id] } : x)));
    setCouponPick('');
  };

  const stats = useMemo(() => {
    const month = Date.now() - 30 * 864e5;
    return {
      total: list.length,
      active: list.filter((c) => c.last_order_at && new Date(c.last_order_at).getTime() > month).length,
      points: list.reduce((s, c) => s + (c.loyalty_points || 0), 0),
      avgSpend: list.filter((c) => c.order_count > 0).reduce((s, c, _, a) => s + Number(c.total_spent) / a.length, 0),
    };
  }, [list]);

  const shown = useMemo(() => {
    const t = q.trim().toLocaleLowerCase('tr');
    const now = Date.now();
    let r = list.filter((c) => {
      if (t && !`${c.full_name} ${c.phone || ''} ${c.email || ''}`.toLocaleLowerCase('tr').includes(t)) return false;
      if (seg === 'member') return !!c.user_id;
      if (seg === 'vip') return Number(c.total_spent) >= 1500 || c.order_count >= 10;
      if (seg === 'new') return now - new Date(c.created_at).getTime() < 14 * 864e5;
      if (seg === 'sleeping') return c.order_count > 0 && !!c.last_order_at && now - new Date(c.last_order_at).getTime() > 45 * 864e5;
      return true;
    });
    r = [...r].sort((a, b) => {
      if (sort === 'spent') return Number(b.total_spent) - Number(a.total_spent);
      if (sort === 'orders') return b.order_count - a.order_count;
      if (sort === 'points') return b.loyalty_points - a.loyalty_points;
      if (sort === 'name') return (a.full_name || '').localeCompare(b.full_name || '', 'tr');
      return new Date(b.last_order_at || b.created_at).getTime() - new Date(a.last_order_at || a.created_at).getTime();
    });
    return r;
  }, [list, q, sort, seg]);

  const exportCsv = () => {
    const esc = (s: any) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const rows = [['Ad', 'Telefon', 'E-posta', 'Üye', 'Sipariş', 'Toplam harcama', 'Son sipariş', 'Puan']].concat(
      shown.map((c) => [c.full_name, c.phone || '', c.email || '', c.user_id ? 'Evet' : 'Hayır', String(c.order_count), String(c.total_spent), c.last_order_at ? new Date(c.last_order_at).toLocaleDateString('tr-TR') : '', String(c.loyalty_points)]),
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + rows.map((r) => r.map(esc).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'musteriler.csv';
    a.click();
  };

  /** Analiz sekmesindeki bir müşteriye tıklanınca detay penceresini aç */
  const openById = (id: string) => {
    const c = list.find((x) => x.id === id);
    if (c) open(c);
    else toast.error('Müşteri kaydı bulunamadı');
  };

  if (loading) return <p className="muted center">Müşteriler yükleniyor…</p>;

  return (
    <>
      <div className="bar mx-bar">
        <div>
          <h1>Müşteriler</h1>
          <p className="muted" style={{ margin: 0 }}>Müşteri listesi, davranış analizi, sipariş geçmişi, sadakat puanı ve kupon tanımlama</p>
        </div>
        <div className="mx-bar-actions">
          <button type="button" className="btn gold sm" onClick={() => { setNf(emptyNew); setNfLoc(null); setAddOpen('customer'); }}>📞 Telefon müşterisi ekle</button>
          <button type="button" className="btn ghost sm" onClick={exportCsv}>⬇ CSV</button>
        </div>
      </div>
      {missing && <div className="note">Müşteri paneli için <code>sql/15_coupons_loyalty.sql</code> dosyasını Supabase SQL Editor'de çalıştırın.</div>}

      <div className="ad-tabs main-tabs">
        <button type="button" className={tab === 'list' ? 'on' : ''} onClick={() => setTab('list')}>👥 Müşteri listesi</button>
        <button type="button" className={tab === 'analytics' ? 'on' : ''} onClick={() => setTab('analytics')}>📊 Müşteri analizi</button>
      </div>

      {tab === 'analytics' && <CustomerAnalyticsPanel onOpenCustomer={openById} />}

      {tab === 'list' && (
        <>
      <div className="ad-stats">
        <div className="ad-stat static"><small>Toplam müşteri</small><b>{stats.total}</b><span>kayıtlı</span></div>
        <div className="ad-stat static ok"><small>Aktif (30 gün)</small><b>{stats.active}</b><span>sipariş verdi</span></div>
        <div className="ad-stat static warn"><small>Dağıtılmış puan</small><b>{stats.points}</b><span>toplam bakiye</span></div>
        <div className="ad-stat static"><small>Ort. harcama</small><b>{tl(stats.avgSpend)}</b><span>müşteri başına</span></div>
      </div>

      <div className="ad-toolbar">
        <div className="ad-search"><span>🔍</span><input type="search" placeholder="İsim, telefon veya e-posta ara…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <label className="ad-select"><span>Sıralama</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="recent">Son siparişe göre</option><option value="spent">En çok harcayan</option><option value="orders">En çok sipariş</option><option value="points">En çok puan</option><option value="name">İsme göre</option>
          </select>
        </label>
      </div>
      <div className="ad-tabs">
        {([['all', 'Tümü'], ['member', 'Üyeler'], ['vip', '👑 VIP (1500₺+ / 10+ sipariş)'], ['new', '🆕 Yeni (14 gün)'], ['sleeping', '😴 Uyuyan (45+ gün)']] as const).map(([k, l]) => (
          <button type="button" key={k} className={seg === k ? 'on' : ''} onClick={() => setSeg(k)}>{l}</button>
        ))}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead><tr><th>Müşteri</th><th>Telefon</th><th>Sipariş</th><th>Toplam harcama</th><th>Ort. sepet</th><th>Son sipariş</th><th>Puan</th><th /></tr></thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id} className="row-click" onClick={() => open(c)}>
                <td><b>{c.full_name || 'İsimsiz'}</b> {c.user_id && <span className="chip">üye</span>}{!c.user_id && c.created_via === 'phone' && <span className="chip">📞 telefon</span>}{(Number(c.total_spent) >= 1500 || c.order_count >= 10) && ' 👑'}</td>
                <td>{c.phone ? fmtPhone(c.phone) : '—'}</td>
                <td>{c.order_count}</td>
                <td><b>{tl(Number(c.total_spent))}</b></td>
                <td>{tl(Number(c.avg_basket))}</td>
                <td>{c.last_order_at ? new Date(c.last_order_at).toLocaleDateString('tr-TR') : '—'}</td>
                <td>{c.loyalty_points ? `⭐ ${c.loyalty_points}` : '—'}</td>
                <td><button type="button" className="btn ghost sm">Detay</button></td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={8} className="center muted" style={{ padding: '2rem' }}>Müşteri bulunamadı.</td></tr>}
          </tbody>
        </table>
      </div>
        </>
      )}

      <Modal open={!!sel} onClose={() => setSel(null)} size="xl">
        {sel && (
          <>
            <div className="pe-head">
              <div><h2>👤 {sel.full_name || 'İsimsiz müşteri'}</h2><p className="muted small">Kayıt: {new Date(sel.created_at).toLocaleDateString('tr-TR')} · {sel.user_id ? 'Üye hesabı var' : 'Misafir (telefonla sipariş)'}</p></div>
              <button type="button" className="icon-circle" onClick={() => setSel(null)} aria-label="Kapat">✕</button>
            </div>
            <div className="ad-stats" style={{ marginBottom: '1rem' }}>
              <div className="ad-stat static"><small>Sipariş</small><b>{sel.order_count}</b></div>
              <div className="ad-stat static"><small>Toplam harcama</small><b>{tl(Number(sel.total_spent))}</b></div>
              <div className="ad-stat static"><small>Ort. sepet</small><b>{tl(Number(sel.avg_basket))}</b></div>
              <div className="ad-stat static warn"><small>Puan bakiyesi</small><b>⭐ {sel.loyalty_points}</b></div>
            </div>

            <div className="cu-grid">
              <section className="pe-sec">
                <h4>Bilgiler ve not</h4>
                <label className="fld">Ad soyad<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
                <label className="fld">Telefon<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
                <label className="fld">Yönetici notu (müşteri görmez)<textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Örn: Kapı zili bozuk, aramalı. Acısız sever." /></label>
                <button type="button" className="btn gold sm" onClick={saveInfo}>Kaydet</button>
                {sel.phone && <a className="btn ghost sm" href={`tel:${sel.phone}`}>📞 Ara</a>}
                <button type="button" className="btn dark sm" onClick={() => orderFor(sel)}>🛒 Bu müşteri için sipariş al</button>
              </section>

              <section className="pe-sec">
                <h4>⭐ Sadakat puanı</h4>
                {canPoints ? (
                  <>
                    <div className="two-col">
                      <label className="fld">Puan (+/−)<input type="number" value={adj.points} onChange={(e) => setAdj({ ...adj, points: e.target.value })} placeholder="Örn: 50 veya -20" /></label>
                      <label className="fld">Not<input value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} placeholder="Örn: Telafi hediyesi" /></label>
                    </div>
                    <button type="button" className="btn gold sm" onClick={adjust}>Puanı uygula</button>
                  </>
                ) : <p className="muted small">Puan düzenleme yetkiniz yok.</p>}
                <div className="cu-ledger">
                  {ledger.map((l) => (
                    <div key={l.id}><span>{new Date(l.created_at).toLocaleDateString('tr-TR')} · {l.note || (l.reason === 'earn' ? 'Kazanım' : l.reason === 'redeem' ? 'Kullanım' : 'Düzenleme')}</span><b className={l.points >= 0 ? 'up' : 'down'}>{l.points > 0 ? '+' : ''}{l.points}</b></div>
                  ))}
                  {ledger.length === 0 && <small className="muted">Puan hareketi yok.</small>}
                </div>
                {coupons.length > 0 && canPoints && (
                  <div className="fld">Kişiye özel kupon tanımla
                    <div className="code-row">
                      <select value={couponPick} onChange={(e) => setCouponPick(e.target.value)}>
                        <option value="">Kupon seçin…</option>
                        {coupons.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}
                      </select>
                      <button type="button" className="btn ghost sm" onClick={assignCoupon} disabled={!couponPick}>Tanımla</button>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <section className="pe-sec" style={{ marginTop: '1rem' }}>
              <h4>📍 Kayıtlı adresler ({addrs.length})</h4>
              <div className="cu-addrs">
                {addrs.map((a) => (
                  <div key={a.id} className="cu-addr">
                    <div>
                      <b>{a.title}</b>{a.is_default && <span className="chip">varsayılan</span>}
                      <div className="small">{a.district ? `${a.district} · ` : ''}{a.full_address}</div>
                      <div className="small">
                        {a.lat != null ? <span className="ok-txt">✓ Konum işaretli</span> : <span className="muted">Konum işaretli değil</span>}
                        {' · '}<a href={mapsPlaceUrl({ lat: a.lat, lng: a.lng, address: a.full_address })} target="_blank" rel="noreferrer">Google Haritalar</a>
                        {' · '}<button type="button" className="linklike" onClick={() => setMapAddr(mapAddr === a.id ? null : a.id)}>{mapAddr === a.id ? 'Haritayı gizle' : '🗺️ Haritada göster'}</button>
                      </div>
                    </div>
                    {mapAddr === a.id && <AddressMap lat={a.lat != null ? Number(a.lat) : null} lng={a.lng != null ? Number(a.lng) : null} address={a.full_address} height="220px" />}
                  </div>
                ))}
                {addrs.length === 0 && <p className="muted small">Kayıtlı adres yok. Telefonla paket sipariş girerken adres otomatik kaydedilir.</p>}
              </div>
              <button type="button" className="btn ghost sm" onClick={() => { setNf({ ...emptyNew, title: 'Adres' }); setNfLoc(null); setAddOpen('address'); }}>➕ Adres ekle</button>
            </section>

            <CustomerInsights customerId={sel.id} />

            <section className="pe-sec" style={{ marginTop: '1rem' }}>
              <h4>🧾 Sipariş geçmişi ({orders.length})</h4>
              <div className="cu-orders">
                {orders.map((o) => (
                  <div key={o.id} className="cu-order">
                    <button type="button" className="cu-order-head" onClick={() => setOpenOrder(openOrder === o.id ? null : o.id)}>
                      <b>#{o.order_no}</b>
                      <span>{new Date(o.created_at).toLocaleDateString('tr-TR')} {hhmm(o.created_at)}</span>
                      <span className={`st ${o.status}`}>{ORDER_STATUS_LABELS[o.status] || o.status}</span>
                      <span className="muted small">{PAYMENT_METHOD_LABELS[o.payment_method || ''] || ''}</span>
                      {Number(o.discount) > 0 && <span className="chip">−{tl(Number(o.discount))}</span>}
                      <b className="price">{tl(Number(o.total))}</b>
                    </button>
                    {['delivery', 'pickup'].includes(o.order_type) && o.status !== 'cancelled' && (
                      <button type="button" className="btn gold sm cu-repeat" onClick={() => orderFor(sel, { orderId: o.id, type: o.order_type, address: o.delivery_address, district: o.district, lat: o.lat, lng: o.lng, note: o.note, payment: o.payment_method })}>🔁 Tekrarla</button>
                    )}
                    {openOrder === o.id && (
                      <div className="cu-order-body">
                        <ul>{(o.order_items || []).map((i: any) => <li key={i.id}>{i.quantity}× {i.product_name}{i.variant_name ? ` (${i.variant_name})` : ''} — {tl(Number(i.line_total ?? i.unit_price * i.quantity))}</li>)}</ul>
                        {o.delivery_address && <small className="muted">📍 {o.district ? o.district + ' · ' : ''}{o.delivery_address}</small>}
                        {o.note && <div className="note small">{o.note}</div>}
                      </div>
                    )}
                  </div>
                ))}
                {orders.length === 0 && <p className="muted small">Bu müşterinin siparişi yok.</p>}
              </div>
            </section>
          </>
        )}
      </Modal>

      <Modal open={!!addOpen} onClose={() => !nfBusy && setAddOpen(null)} size="wide">
        <div className="pe-head">
          <div>
            <h2>{addOpen === 'address' ? '📍 Adres ekle' : '📞 Telefon müşterisi ekle'}</h2>
            <p className="muted small">{addOpen === 'address' ? `${sel?.full_name || 'Müşteri'} için yeni adres` : 'Hesabı olmayan, telefonla arayan müşteriyi kaydedin. Yalnızca yöneticiler görür; tekrar aradığında bilgileri hazır gelir.'}</p>
          </div>
          <button type="button" className="icon-circle" onClick={() => setAddOpen(null)} aria-label="Kapat">✕</button>
        </div>
        {addOpen === 'customer' && (
          <>
            <div className="two-col">
              <label className="fld">Telefon<input inputMode="tel" value={nf.phone} onChange={(e) => setNf({ ...nf, phone: e.target.value })} placeholder="05xx xxx xx xx" /></label>
              <label className="fld">Ad soyad<input value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} /></label>
            </div>
            <label className="fld">Not (müşteri görmez)<input value={nf.notes} onChange={(e) => setNf({ ...nf, notes: e.target.value })} placeholder="Örn: Acısız sever, zili çalmayın" /></label>
          </>
        )}
        <div className="two-col">
          <label className="fld">Adres adı<input value={nf.title} onChange={(e) => setNf({ ...nf, title: e.target.value })} placeholder="Ev, İş…" /></label>
          <label className="fld">Mahalle<input value={nf.district} onChange={(e) => setNf({ ...nf, district: e.target.value })} /></label>
        </div>
        <label className="fld">Açık adres <span className="muted">(isteğe bağlı)</span><textarea rows={2} value={nf.address} onChange={(e) => setNf({ ...nf, address: e.target.value })} placeholder="Sokak, bina, kapı / daire no" /></label>
        <LocationPicker value={nfLoc} onChange={setNfLoc} address={nf.address} district={nf.district} height="240px" onAddress={(a) => setNf((f) => ({ ...f, address: a.address, district: a.district || f.district }))} />
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button type="button" className="btn gold" disabled={nfBusy} onClick={saveNew}>{nfBusy ? 'Kaydediliyor…' : 'Kaydet'}</button>
          <button type="button" className="btn ghost" disabled={nfBusy} onClick={() => setAddOpen(null)}>Vazgeç</button>
        </div>
      </Modal>

      <NewOrderModal open={orderModal} onClose={() => { setOrderModal(false); setPrefill(null); }} onCreated={() => { load(); if (sel) open(sel); }} prefill={prefill} />
    </>
  );
}
