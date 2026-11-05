import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { tl } from '@/lib/helpers';
import { TABLE_STATUS_LABELS } from '@/lib/constants';
import { useMenu, type MenuProduct } from '@/hooks/useMenu';
import { useTables } from '@/hooks/useTables';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import ProductImage from '@/components/ui/ProductImage';

type Mode = 'quick' | 'full';
type OType = 'delivery' | 'pickup' | 'dine_in';
type Pay = 'cash_on_delivery' | 'card_on_delivery' | 'iban';

interface Line {
  variant_id: string;
  name: string;
  price: number;
  qty: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  /** Masalar sayfasından açılırsa masa hazır seçili gelir */
  presetTableId?: string | null;
}

/* ------------------------------------------------------------------ */
/* Ürün seçici: kategori sekmeleri + arama + dokunmatik dostu kartlar   */
/* ------------------------------------------------------------------ */
function ProductPicker({ onAdd, counts }: { onAdd: (p: MenuProduct, variantIdx: number) => void; counts: Record<string, number> }) {
  const { categories, products, loading } = useMenu();
  const [cat, setCat] = useState<string>('all');
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const t = q.trim().toLocaleLowerCase('tr');
    return products.filter((p) => {
      if (t) return p.name.toLocaleLowerCase('tr').includes(t);
      return cat === 'all' || p.category_id === cat;
    });
  }, [products, cat, q]);

  if (loading) return <p className="muted">Menü yükleniyor…</p>;

  return (
    <div className="picker">
      <div className="picker-search">
        <Icon name="search" size={17} />
        <input placeholder="Ürün ara…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="catbar" role="tablist">
        <button type="button" className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>Tümü</button>
        {categories.map((c) => (
          <button key={c.id} type="button" className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>
            {c.name}
          </button>
        ))}
      </div>
      <div className="picker-grid">
        {list.map((p) => (
          <div key={p.id} className={`ptile${p.is_sold_out ? ' out' : ''}`}>
            <div className="ptile-top">
              <ProductImage imagePath={p.image_path} emoji={p.emoji} name={p.name} size="md" />
              <div>
                <b>{p.name}</b>
                {p.is_sold_out && <span className="small" style={{ color: 'var(--danger)' }}> Tükendi</span>}
              </div>
            </div>
            <div className="ptile-vars">
              {p.variants.map((v, i) => {
                const n = counts[v.id] || 0;
                return (
                  <button key={v.id} type="button" disabled={p.is_sold_out} onClick={() => onAdd(p, i)} className={n ? 'has' : ''}>
                    <span>{p.variants.length > 1 ? v.name : 'Ekle'}</span>
                    <b>{tl(v.price)}</b>
                    {n > 0 && <i>{n}</i>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="muted">Ürün bulunamadı.</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sepet özeti                                                          */
/* ------------------------------------------------------------------ */
function CartLines({ lines, setLines }: { lines: Line[]; setLines: (l: Line[]) => void }) {
  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const change = (id: string, d: number) =>
    setLines(lines.map((l) => (l.variant_id === id ? { ...l, qty: l.qty + d } : l)).filter((l) => l.qty > 0));
  return (
    <div className="qcart">
      {lines.length === 0 && <p className="muted center" style={{ margin: '1.5rem 0' }}>Henüz ürün seçilmedi.<br />Soldan dokunarak ekleyin.</p>}
      {lines.map((l) => (
        <div key={l.variant_id} className="qline">
          <span className="qname">{l.name}</span>
          <span className="qty">
            <button type="button" onClick={() => change(l.variant_id, -1)} aria-label="Azalt"><Icon name="minus" size={14} /></button>
            <b>{l.qty}</b>
            <button type="button" onClick={() => change(l.variant_id, 1)} aria-label="Artır"><Icon name="plus" size={14} /></button>
          </span>
          <b className="qsum">{tl(l.price * l.qty)}</b>
        </div>
      ))}
      <div className="qtotal">
        <span>Toplam</span>
        <b>{tl(total)}</b>
      </div>
    </div>
  );
}

export default function NewOrderModal({ open, onClose, onCreated, presetTableId }: Props) {
  const { tables } = useTables();
  const [mode, setMode] = useState<Mode>('quick');
  const [type, setType] = useState<OType>('pickup');
  const [tableId, setTableId] = useState<string>('');
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [district, setDistrict] = useState('Yazır');
  const [pay, setPay] = useState<Pay>('cash_on_delivery');
  const [source, setSource] = useState('phone');
  const [busy, setBusy] = useState(false);

  // Masalar sayfasından gelen hazır masa
  const effectiveTable = tableId || presetTableId || '';

  const counts = useMemo(() => Object.fromEntries(lines.map((l) => [l.variant_id, l.qty])), [lines]);
  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);

  const reset = () => {
    setLines([]);
    setNote('');
    setName('');
    setPhone('');
    setAddress('');
    setTableId('');
    setPay('cash_on_delivery');
  };

  const add = (p: MenuProduct, idx: number) => {
    const v = p.variants[idx];
    if (!v) return;
    setLines((cur) => {
      const found = cur.find((l) => l.variant_id === v.id);
      if (found) return cur.map((l) => (l.variant_id === v.id ? { ...l, qty: l.qty + 1 } : l));
      return [...cur, { variant_id: v.id, name: p.variants.length > 1 ? `${p.name} (${v.name})` : p.name, price: v.price, qty: 1 }];
    });
  };

  const submit = async (opts: { deliverNow?: boolean } = {}) => {
    if (busy) return;
    if (lines.length === 0) return toast.error('Lütfen en az bir ürün seçin');
    if (type === 'dine_in' && !effectiveTable) return toast.error('Lütfen masa seçin');
    const full = mode === 'full';
    if (full && type === 'delivery' && (!name.trim() || !phone.trim() || !address.trim())) {
      return toast.error('Teslimat için ad, telefon ve adres gerekli');
    }

    setBusy(true);
    try {
      const customer: Record<string, string> = {};
      if (name.trim()) customer.name = name.trim();
      if (full && phone.trim()) customer.phone = phone.trim();
      if (full && type === 'delivery') {
        customer.address = address.trim();
        if (district.trim()) customer.district = district.trim();
      }

      const { data, error } = await supabase.rpc('staff_create_order', {
        p_source: full ? source : 'counter',
        p_type: type,
        p_customer: customer,
        p_items: lines.map((l) => ({ variant_id: l.variant_id, quantity: l.qty })),
        p_table_id: type === 'dine_in' ? effectiveTable : null,
        p_payment: type === 'dine_in' ? null : pay,
        p_note: note.trim() || null,
        p_save_address: false,
      });
      if (error) throw error;

      const res = (data || {}) as { order_id?: string; order_no?: number };

      // Tezgâhtan hemen teslim: sırayla hazırlanıyor → hazır → teslim edildi (tarih/saatler otomatik işlenir)
      if (opts.deliverNow && res.order_id) {
        for (const st of ['preparing', 'ready', 'delivered']) {
          const { error: e2 } = await supabase.rpc('update_order_status', { p_order_id: res.order_id, p_status: st as any, p_note: null });
          if (e2) throw new Error(`Sipariş kaydedildi (#${res.order_no}) ama teslim durumuna alınamadı: ${e2.message}`);
        }
      }

      toast.success(`Sipariş #${res.order_no ?? ''} kaydedildi · ${tl(total)}`);
      reset();
      onCreated?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Sipariş oluşturulamadı');
    } finally {
      setBusy(false);
    }
  };

  const tableChips = (
    <div className="tablechips">
      {tables.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`${effectiveTable === t.id ? 'on' : ''}${t.status !== 'empty' ? ' busy' : ''}`}
          onClick={() => setTableId(t.id)}
          title={TABLE_STATUS_LABELS[t.status] || t.status}
        >
          <b>{t.number}</b>
          <small>{t.name || TABLE_STATUS_LABELS[t.status]}</small>
        </button>
      ))}
      {tables.length === 0 && <p className="muted small">Tanımlı masa yok. Masa Düzeni sayfasından ekleyin.</p>}
    </div>
  );

  return (
    <Modal open={open} onClose={() => !busy && onClose()} size="xl" className="neworder">
      <div className="no-head">
        <h2><Icon name="zap" size={22} /> Yeni Sipariş</h2>
        <div className="seg modeseg">
          <button type="button" className={mode === 'quick' ? 'on' : ''} onClick={() => { setMode('quick'); if (type === 'delivery') setType('pickup'); }}>
            ⚡ Hızlı
          </button>
          <button type="button" className={mode === 'full' ? 'on' : ''} onClick={() => setMode('full')}>
            📋 Detaylı
          </button>
        </div>
        <button type="button" className="icon-circle" onClick={onClose} aria-label="Kapat"><Icon name="x" size={16} /></button>
      </div>

      <div className="no-grid">
        {/* SOL: sipariş bilgisi + ürün seçici */}
        <div className="no-left">
          {mode === 'quick' ? (
            <>
              <div className="typetiles">
                <button type="button" className={type === 'pickup' ? 'on' : ''} onClick={() => setType('pickup')}>
                  <Icon name="bag" size={26} />
                  <b>Paket / Gel-Al</b>
                  <small>Gelip alıp giden · bilgi gerekmez</small>
                </button>
                <button type="button" className={type === 'dine_in' ? 'on' : ''} onClick={() => setType('dine_in')}>
                  <Icon name="utensils" size={26} />
                  <b>Restoranda</b>
                  <small>Masada yiyecek · masa seçin</small>
                </button>
              </div>
              {type === 'dine_in' ? (
                <div className="no-block">
                  <h4>Masa</h4>
                  {tableChips}
                </div>
              ) : (
                <label className="fld">Müşteri adı <span className="muted">(isteğe bağlı)</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Bilmiyorsanız boş bırakın" />
                </label>
              )}
            </>
          ) : (
            <div className="no-block">
              <div className="two-col">
                <label className="fld">Sipariş türü
                  <select value={type} onChange={(e) => setType(e.target.value as OType)}>
                    <option value="delivery">Paket teslimat (adrese)</option>
                    <option value="pickup">Gel-al / Paket</option>
                    <option value="dine_in">Masada yemek</option>
                  </select>
                </label>
                <label className="fld">Kaynak
                  <select value={source} onChange={(e) => setSource(e.target.value)}>
                    <option value="phone">Telefon</option>
                    <option value="counter">Restoran / Tezgâh</option>
                    <option value="web">Web</option>
                    <option value="table">Masa</option>
                  </select>
                </label>
              </div>
              {type === 'dine_in' ? (
                <div><h4>Masa</h4>{tableChips}</div>
              ) : (
                <>
                  <div className="two-col">
                    <label className="fld">Müşteri adı {type === 'pickup' && <span className="muted">(isteğe bağlı)</span>}
                      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ad soyad" />
                    </label>
                    <label className="fld">Telefon {type === 'pickup' && <span className="muted">(isteğe bağlı)</span>}
                      <input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05xx xxx xx xx" />
                    </label>
                  </div>
                  {type === 'delivery' && (
                    <>
                      <label className="fld">Mahalle
                        <input value={district} onChange={(e) => setDistrict(e.target.value)} />
                      </label>
                      <label className="fld">Adres
                        <textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Sokak, bina, daire no" />
                      </label>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          <ProductPicker onAdd={add} counts={counts} />
        </div>

        {/* SAĞ: sepet + ödeme + gönder */}
        <aside className="no-right">
          <h4><Icon name="receipt" size={18} /> Sipariş özeti</h4>
          <CartLines lines={lines} setLines={setLines} />

          <label className="fld" style={{ marginTop: '0.8rem' }}>
            {mode === 'quick' ? 'Not' : 'Sipariş notu'} <span className="muted">(isteğe bağlı)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Örn. acısız, bol soslu…" />
          </label>

          {type !== 'dine_in' && (
            <div className="fld">
              <span>Ödeme</span>
              <div className="seg paysel">
                <button type="button" className={pay === 'cash_on_delivery' ? 'on' : ''} onClick={() => setPay('cash_on_delivery')}>
                  <Icon name="cash" size={16} /> Nakit
                </button>
                <button type="button" className={pay === 'card_on_delivery' ? 'on' : ''} onClick={() => setPay('card_on_delivery')}>
                  <Icon name="card" size={16} /> Kart
                </button>
                {mode === 'full' && (
                  <button type="button" className={pay === 'iban' ? 'on' : ''} onClick={() => setPay('iban')}>
                    <Icon name="wallet" size={16} /> IBAN
                  </button>
                )}
              </div>
            </div>
          )}

          <p className="small muted" style={{ margin: '0.4rem 0' }}>
            <Icon name="clock" size={14} /> Tarih ve saat otomatik kaydedilir.
          </p>

          <div className="no-actions">
            <button type="button" className="btn gold" disabled={busy || lines.length === 0} onClick={() => submit()}>
              {busy ? 'Kaydediliyor…' : `Mutfağa gönder · ${tl(total)}`}
            </button>
            {type === 'pickup' && (
              <button type="button" className="btn ghost" disabled={busy || lines.length === 0} onClick={() => submit({ deliverNow: true })}>
                <Icon name="check" size={16} /> Teslim edildi olarak kaydet
              </button>
            )}
            <button type="button" className="btn ghost" disabled={busy} onClick={onClose}>Vazgeç</button>
          </div>
        </aside>
      </div>
    </Modal>
  );
}
