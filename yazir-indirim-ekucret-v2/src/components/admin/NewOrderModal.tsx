import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { tl, plannedLabel, untilLabel } from '@/lib/helpers';
import { TABLE_STATUS_LABELS } from '@/lib/constants';
import { useMenu, type MenuProduct } from '@/hooks/useMenu';
import { useTables } from '@/hooks/useTables';
import { useCouriers } from '@/hooks/useCouriers';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { HAS_GMAPS_KEY, RESTAURANT_FALLBACK, geocodeFull, mapsPlaceUrl, type LatLng } from '@/lib/googleMaps';
import { isMissingFn, normalizePhone, type HistoryItem, type HistoryOrder } from '@/lib/staffCustomers';
import { parseVoiceOrder } from '@/lib/voiceOrderParser';
import VoiceDictateButton from '@/components/ui/VoiceDictateButton';
import PhoneCustomerPanel, { type PickedAddress } from '@/components/admin/PhoneCustomerPanel';
import LocationPicker from '@/components/maps/LocationPicker';
import Modal from '@/components/ui/Modal';
import { categoryIcon } from '@/lib/categoryIcon';
import { explainSpeechError } from '@/lib/voiceMic';
import Icon from '@/components/ui/Icon';
import BulkRequestForm, { toLocalInput } from '@/components/admin/BulkRequestForm';
import QtyStepper from '@/components/ui/QtyStepper';
import ProductImage from '@/components/ui/ProductImage';
import { computeDiscount, discountPayload, type DiscountMode, type DiscountResult, type DiscountSpec, type DiscountUnit } from '@/lib/orderDiscount';
import { DiscountPanel, CartDiscountRows, LineDiscountNote, type Preset } from '@/components/admin/OrderDiscount';
import { buildSuggestions, computeSurcharge, type SurchargeResult, type SurchargeSpec } from '@/lib/orderSurcharge';
import { SurchargePanel, CartSurchargeRow, type SurKind, type LocState } from '@/components/admin/OrderSurcharge';

type Mode = 'quick' | 'full';
type OType = 'delivery' | 'pickup' | 'dine_in';
type Pay = 'cash_on_delivery' | 'card_on_delivery' | 'iban';

interface Line {
  variant_id: string;
  name: string;
  price: number;
  qty: number;
}

/** Başka bir sayfadan (Müşteriler, Sipariş panosu) açılırken müşteri / tekrarlanacak sipariş hazır gelir */
export interface OrderPrefill {
  customer?: { id?: string | null; name?: string | null; phone?: string | null };
  /** Verilirse bu siparişin kalemleri ve adresi sepete aktarılır */
  repeat?: {
    orderId: string;
    type: OType;
    address?: string | null;
    district?: string | null;
    lat?: number | null;
    lng?: number | null;
    note?: string | null;
    payment?: string | null;
  };
  /** "Toplu talebi siparişe çevir": adres / saat / not hazır gelir */
  draft?: { address?: string | null; scheduledAt?: string | null; note?: string | null };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: (r?: { order_id?: string; order_no?: number }) => void;
  /** Masalar sayfasından açılırsa masa hazır seçili gelir */
  presetTableId?: string | null;
  prefill?: OrderPrefill | null;
}

/* ------------------------------------------------------------------ */
/* Ürün seçici: kategori sekmeleri + arama + dokunmatik dostu kartlar   */
/* ------------------------------------------------------------------ */
export function ProductPicker({ onAdd, counts }: { onAdd: (p: MenuProduct, variantIdx: number) => void; counts: Record<string, number> }) {
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
        <button type="button" className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}><Icon name="grid" size={16} />Tümü</button>
        {categories.map((c) => (
          <button key={c.id} type="button" className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>
            <Icon name={categoryIcon(c.name)} size={16} />{c.name}
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
function CartLines({ lines, setLines, fee = 0, disc, sur, onToggleLine }: {
  lines: Line[]; setLines: (l: Line[]) => void; fee?: number; disc: DiscountResult; sur: SurchargeResult; onToggleLine: (variantId: string) => void;
}) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const total = r2(disc.subtotalAfter + fee + sur.total);
  const totalBefore = r2(disc.subtotal + fee + sur.total);
  const byId = new Map(disc.lines.map((d) => [d.variant_id, d]));
  // Adet doğrudan belirlenir (yazılan sayı / hızlı düğmeler); 0 → satır kalkar
  const setQty = (id: string, qty: number) =>
    setLines(lines.map((l) => (l.variant_id === id ? { ...l, qty } : l)).filter((l) => l.qty > 0));
  return (
    <div className="qcart">
      {lines.length === 0 && <p className="muted center" style={{ margin: '1.5rem 0' }}>Henüz ürün seçilmedi.<br />Soldan dokunarak ekleyin.</p>}
      <div className="qcart-lines">
      {lines.map((l) => {
        const d = byId.get(l.variant_id);
        const perItem = disc.mode === 'items' && !!d;
        return (
          <Fragment key={l.variant_id}>
            <div className="qline qline-step">
              <span className="qname">{l.name}</span>
              <b className="qsum">
                {perItem && d!.saved > 0
                  ? <><s className="disc-old">{tl(d!.lineBefore)}</s><span className="disc-new">{tl(d!.lineAfter)}</span></>
                  : tl(l.price * l.qty)}
              </b>
              <QtyStepper value={l.qty} onChange={(n) => setQty(l.variant_id, n)} ariaLabel={`${l.name} adedi`} />
            </div>
            {perItem && <LineDiscountNote line={d!} unit={disc.unit} onToggle={() => onToggleLine(l.variant_id)} />}
          </Fragment>
        );
      })}
      </div>
      <CartDiscountRows result={disc} />
      {fee > 0 && (
        <div className="qline"><span className="qname">Teslimat ücreti</span><b className="qsum">{tl(fee)}</b></div>
      )}
      <CartSurchargeRow result={sur} />
      <div className="qtotal">
        <span>Toplam</span>
        <b>{disc.active && <s className="disc-old">{tl(totalBefore)}</s>}{tl(total)}</b>
      </div>
    </div>
  );
}

export default function NewOrderModal({ open, onClose, onCreated, presetTableId, prefill }: Props) {
  const { tables } = useTables();
  const { couriers } = useCouriers();
  const { settings } = useBusinessSettings();
  const [mode, setMode] = useState<Mode>('quick');
  const [type, setType] = useState<OType>('pickup');
  const [tableId, setTableId] = useState<string>('');
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [district, setDistrict] = useState('Yazır');
  const [loc, setLoc] = useState<LatLng | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [courierId, setCourierId] = useState('');
  const [feeOverride, setFeeOverride] = useState('');
  const [saveAddress, setSaveAddress] = useState(true);
  const [pay, setPay] = useState<Pay>('cash_on_delivery');
  const [source, setSource] = useState('counter');
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<'order' | 'bulk'>('order');
  const [planOn, setPlanOn] = useState(false);
  const [planAt, setPlanAt] = useState('');

  // --- İndirim (admin): seçim (mode/oran) + "Uygula"ya basılınca geçerli olan indirim ---
  const [dMode, setDMode] = useState<DiscountMode>('cart');
  const [dUnit, setDUnit] = useState<DiscountUnit>('percent');
  const [dPreset, setDPreset] = useState<Preset>(10);
  const [dCustom, setDCustom] = useState('');
  const [applied, setApplied] = useState<DiscountSpec | null>(null);

  // --- Ek ücret (admin): uzak mesafe / gece vb. — TL ve/veya % ; "Uygula"ya basılınca geçerli ---
  const [sKind, setSKind] = useState<SurKind>('tl');
  const [sValue, setSValue] = useState('');
  const [sReason, setSReason] = useState('');
  const [sApplied, setSApplied] = useState<SurchargeSpec | null>(null);
  // Yazılan adresten otomatik konum (pin yoksa): yazmayı bırakınca ~0,7 sn sonra aranır
  const [autoLoc, setAutoLoc] = useState<LatLng | null>(null);
  const [autoState, setAutoState] = useState<'idle' | 'searching' | 'found' | 'notfound'>('idle');
  useEffect(() => {
    if (type !== 'delivery' || loc) { setAutoState('idle'); return; }
    const q = [address, district].filter(Boolean).join(', ');
    if (!HAS_GMAPS_KEY || address.trim().length < 4) { setAutoLoc(null); setAutoState('idle'); return; }
    setAutoState('searching');
    let dead = false;
    const t = setTimeout(async () => {
      const g = await geocodeFull(q).catch(() => null);
      if (dead) return;
      if (g) { setAutoLoc({ lat: g.lat, lng: g.lng }); setAutoState('found'); }
      else { setAutoLoc(null); setAutoState('notfound'); }
    }, 700);
    return () => { dead = true; clearTimeout(t); };
  }, [address, district, loc, type]);
  const effLoc = loc ?? autoLoc;
  const locState: LocState = loc ? 'pin' : autoState === 'found' && autoLoc ? 'auto' : autoState === 'searching' ? 'searching' : autoState === 'notfound' ? 'notfound' : 'none';
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 30000); return () => clearInterval(t); }, []);

  // --- Sesle Sipariş Gir (telefon siparişleri için canlı konuşma-metin + akıllı ayrıştırma) ---
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceInterim, setVoiceInterim] = useState('');
  const voiceSupported = typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const recognitionRef = useRef<any>(null);
  const voiceStoppedManually = useRef(true);

  // Masalar sayfasından gelen hazır masa
  const effectiveTable = tableId || presetTableId || '';

  const counts = useMemo(() => Object.fromEntries(lines.map((l) => [l.variant_id, l.qty])), [lines]);
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const defaultFee = settings ? (settings.free_delivery_threshold && subtotal >= settings.free_delivery_threshold ? 0 : Number(settings.delivery_fee || 0)) : 0;
  const fee = type === 'delivery' ? (feeOverride.trim() !== '' ? Math.max(Number(feeOverride) || 0, 0) : defaultFee) : 0;
  const dres = useMemo(() => computeDiscount(lines, applied), [lines, applied]);
  const sres = useMemo(() => computeSurcharge(dres.subtotalAfter, type === 'delivery' ? sApplied : null), [dres.subtotalAfter, sApplied, type]);
  const total = Math.round((dres.subtotalAfter + fee + sres.total) * 100) / 100;
  // Öneri: restorana uzaklık (kuş uçuşu) + saat (planlıysa planlanan saat, değilse şimdi)
  const plannedWhen = planOn && planAt && !Number.isNaN(new Date(planAt).getTime()) ? new Date(planAt) : null;
  const suggestions = buildSuggestions(RESTAURANT_FALLBACK, effLoc, plannedWhen ?? new Date());

  const sortedCouriers = useMemo(
    () => [...couriers].filter((c) => c.is_active !== false).sort((a, b) => Number(b.is_online) - Number(a.is_online) || a.active_order_count - b.active_order_count),
    [couriers],
  );

  const reset = () => {
    setLines([]);
    setNote('');
    setName('');
    setPhone('');
    setAddress('');
    setDistrict('Yazır');
    setLoc(null);
    setCustomerId(null);
    setCourierId('');
    setFeeOverride('');
    setTableId('');
    setPay('cash_on_delivery');
    setPlanOn(false);
    setPlanAt('');
    setSApplied(null);
    setSValue('');
    setSKind('tl');
    setAutoLoc(null);
    setSReason('');
    setApplied(null);
    setDMode('cart');
    setDUnit('percent');
    setDPreset(10);
    setDCustom('');
    voiceStoppedManually.current = true;
    recognitionRef.current?.stop();
    setVoiceActive(false);
    setVoiceTranscript('');
    setVoiceInterim('');
  };

  const voiceFullText = () => `${voiceTranscript} ${voiceInterim}`.replace(/\s+/g, ' ').trim();

  /** Mikrofona tıklandığında: durdurma butonuna basılana kadar ASLA kendiliğinden durmaz
   *  (tarayıcı sessizlikte kapatırsa otomatik yeniden başlatılır). */
  const startVoiceOrder = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error('Bu tarayıcı sesle yazmayı desteklemiyor. Lütfen Chrome kullanın.');
      return;
    }
    voiceStoppedManually.current = false;
    setVoiceTranscript('');
    setVoiceInterim('');
    const rec = new SR();
    rec.lang = 'tr-TR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      let finalChunk = '';
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalChunk += r[0].transcript + ' ';
        else interim += r[0].transcript;
      }
      if (finalChunk) setVoiceTranscript((prev) => `${prev} ${finalChunk}`.replace(/\s+/g, ' ').trim());
      setVoiceInterim(interim);
    };
    rec.onerror = (e: any) => {
      if (['not-allowed', 'service-not-allowed', 'audio-capture', 'network'].includes(e.error)) {
        voiceStoppedManually.current = true;
        setVoiceActive(false);
        explainSpeechError(e.error).then((m) => toast.error(m, { id: 'mic-err', duration: 8000 }));
      }
      // 'no-speech' / 'aborted' gibi geçici hatalarda sessizce devam — onend zaten yeniden başlatacak
    };
    rec.onend = () => {
      if (!voiceStoppedManually.current) {
        try { rec.start(); } catch { /* zaten başlatılmaya çalışılıyorsa yoksay */ }
      }
    };
    recognitionRef.current = rec;
    try {
      rec.start();
      setVoiceActive(true);
    } catch {
      toast.error('Mikrofon başlatılamadı, tekrar deneyin.');
    }
  };

  /** Durdur butonu: dinlemeyi kapatır ve biriken tüm metni akıllıca ayrıştırıp formu doldurur.
   *  Ham metnin TAMAMI her zaman nota eklenir, hiçbir şey unutulmaz. */
  const stopVoiceOrder = () => {
    voiceStoppedManually.current = true;
    try { recognitionRef.current?.stop(); } catch { /* yoksay */ }
    setVoiceActive(false);
    const full = voiceFullText();
    setVoiceInterim('');
    if (!full) {
      toast('Herhangi bir konuşma algılanmadı.', { icon: '🎙️' });
      return;
    }
    const parsed = parseVoiceOrder(full);
    // Akıllı ayrıştırma ile bulunan her şey ilgili alana YAZILIR (boş da olsa üzerine yazılır,
    // çünkü bu akış tam olarak bu alanları doldurmak için kullanılıyor).
    if (parsed.phone) setPhone(parsed.phone);
    if (parsed.name) setName(parsed.name);
    if (type === 'delivery') {
      if (parsed.address) setAddress(parsed.address);
      if (parsed.district) setDistrict(parsed.district);
    }
    setNote((cur) => {
      const pieces = [cur.trim(), parsed.note, `🎙️ Sesli sipariş (tam metin, güvenlik için saklanır): ${parsed.raw}`].filter(Boolean);
      return pieces.join('\n');
    });
    const found: string[] = [];
    if (parsed.phone) found.push('telefon');
    if (parsed.name) found.push('isim');
    if (parsed.address) found.push('adres');
    toast.success(
      found.length
        ? `Sesli sipariş metne döküldü · otomatik dolduruldu: ${found.join(', ')}`
        : 'Sesli sipariş metne döküldü ama alanlar otomatik tanınamadı — tam metin Not kısmına eklendi, isterseniz oradan elle kopyalayın veya alanların yanındaki 🎙️ ile tekrar deneyin.',
    );
  };

  // Modal kapanırken mikrofon açık kalmasın
  useEffect(() => {
    if (!open) {
      voiceStoppedManually.current = true;
      recognitionRef.current?.stop();
      setVoiceActive(false);
    }
  }, [open]);

  // Bileşen tamamen kaldırılırken de dinlemeyi kapat
  useEffect(() => () => {
    voiceStoppedManually.current = true;
    try { recognitionRef.current?.stop(); } catch { /* yoksay */ }
  }, []);

  const chooseType = (t: OType) => {
    setType(t);
    setSource(t === 'delivery' ? 'phone' : t === 'dine_in' ? 'table' : 'counter');
    if (t !== 'delivery') setCourierId('');
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

  const pickAddress = (a: PickedAddress) => {
    setAddress(a.address);
    setDistrict(a.district || district);
    setLoc(a.lat != null && a.lng != null ? { lat: a.lat, lng: a.lng } : null);
  };

  /** Geçmiş siparişi sepete + forma aktar ("Tekrarla") */
  const applyRepeat = (o: {
    order_no?: number; order_type: OType; items: HistoryItem[]; address?: string | null; district?: string | null;
    lat?: number | null; lng?: number | null; note?: string | null; payment_method?: string | null;
  }) => {
    const merged = new Map<string, Line>();
    const missing: string[] = [];
    for (const i of o.items) {
      if (i.variant_id && i.is_available && i.current_price != null) {
        const nm = i.product_name + (i.variant_name ? ` (${i.variant_name})` : '');
        const cur = merged.get(i.variant_id);
        if (cur) cur.qty += i.quantity;
        else merged.set(i.variant_id, { variant_id: i.variant_id, name: nm, price: Number(i.current_price), qty: i.quantity });
      } else missing.push(i.product_name);
    }
    setLines([...merged.values()]);
    if (o.order_type === 'delivery') {
      chooseType('delivery');
      if (o.address) pickAddress({ address: o.address, district: o.district || '', lat: o.lat != null ? Number(o.lat) : null, lng: o.lng != null ? Number(o.lng) : null });
    } else if (o.order_type === 'pickup') {
      chooseType('pickup');
    }
    setNote(o.note || '');
    if (o.payment_method && ['cash_on_delivery', 'card_on_delivery', 'iban'].includes(o.payment_method)) setPay(o.payment_method as Pay);
    toast.success(`${o.order_no ? `#${o.order_no} ` : ''}siparişi sepete aktarıldı · güncel fiyatlarla`);
    if (missing.length) toast(`Menüde artık olmayan/tükenen ürünler eklenmedi: ${missing.join(', ')}`, { icon: '⚠️', duration: 8000 });
  };

  const repeatFromHistory = (o: HistoryOrder) =>
    applyRepeat({ order_no: o.order_no, order_type: o.order_type, items: o.items, address: o.address, district: o.district, lat: o.lat, lng: o.lng, note: o.note, payment_method: o.payment_method });

  // Başka sayfadan hazır müşteri / tekrar siparişiyle açılış
  const prefillKey = prefill ? JSON.stringify(prefill) : '';
  useEffect(() => {
    if (!open || !prefill) return;
    reset();
    setMode('quick');
    const c = prefill.customer;
    if (c) {
      setName(c.name || '');
      setPhone(c.phone || '');
      setCustomerId(c.id || null);
    }
    setKind('order');
    if (prefill.draft) {
      if (prefill.draft.address) setAddress(prefill.draft.address);
      if (prefill.draft.note) setNote(prefill.draft.note);
      if (prefill.draft.scheduledAt) { setPlanOn(true); setPlanAt(toLocalInput(new Date(prefill.draft.scheduledAt))); }
    }
    chooseType(prefill.repeat?.type === 'delivery' || prefill.draft || (!prefill.repeat && !!c) ? 'delivery' : 'pickup');
    const r = prefill.repeat;
    if (r) {
      supabase.rpc('reorder_items', { p_order_id: r.orderId } as any).then(({ data, error }) => {
        if (error) return void toast.error('Sipariş kalemleri alınamadı: ' + error.message);
        const items: HistoryItem[] = ((data || []) as any[]).map((x) => ({
          variant_id: x.variant_id, product_name: x.product_name, variant_name: x.variant_name, quantity: x.quantity,
          unit_price: Number(x.current_price ?? 0), current_price: x.current_price != null ? Number(x.current_price) : null, is_available: !!x.is_available,
        }));
        applyRepeat({ order_type: r.type, items, address: r.address, district: r.district, lat: r.lat, lng: r.lng, note: r.note, payment_method: r.payment });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefillKey]);

  const submit = async (opts: { deliverNow?: boolean } = {}) => {
    if (busy) return;
    if (lines.length === 0) return toast.error('Lütfen en az bir ürün seçin');
    if (type === 'dine_in' && !effectiveTable) return toast.error('Lütfen masa seçin');

    const np = normalizePhone(phone);
    if (type === 'delivery') {
      if (!np) return toast.error('Paket servis için geçerli telefon girin (05xx xxx xx xx)');
      if (!address.trim()) return toast.error('Teslimat adresini yazın veya haritadan seçin');
    }
    if (type === 'pickup' && phone.trim() && !np) return toast.error('Telefon geçersiz (05xx xxx xx xx)');

    const planned = planOn && type !== 'dine_in' && planAt ? new Date(planAt) : null;
    if (planOn && type !== 'dine_in') {
      if (!planned) return toast.error('Planlı sipariş için tarih ve saat seçin');
      if (planned.getTime() < Date.now() - 5 * 60000) return toast.error('Planlanan saat geçmişte olamaz');
    }

    setBusy(true);
    try {
      // Konum işaretlenmediyse yazılı adresi Google ile çöz (kurye haritası ve birebir bağlantı için)
      let pin = loc;
      if (type === 'delivery' && !pin && HAS_GMAPS_KEY) {
        const g = await geocodeFull([address, district].filter(Boolean).join(', '));
        if (g) pin = { lat: Number(g.lat.toFixed(6)), lng: Number(g.lng.toFixed(6)) };
      }

      const customer: Record<string, string | number> = {};
      if (name.trim()) customer.name = name.trim();
      else if (type === 'delivery') customer.name = 'İsimsiz Müşteri';
      if (np) customer.phone = np;
      if (type === 'delivery') {
        customer.address = address.trim();
        if (district.trim()) customer.district = district.trim();
        if (pin) {
          customer.lat = pin.lat;
          customer.lng = pin.lng;
        }
        // Ek ücret (uzak mesafe / gece) teslimat ücretine eklenerek kaydedilir → toplam formülü her yerde aynı kalır
        if (sres.active) customer.delivery_fee = Math.round((fee + sres.total) * 100) / 100;
        else if (feeOverride.trim() !== '') customer.delivery_fee = Math.max(Number(feeOverride) || 0, 0);
        customer.address_title = 'Adres';
      }

      // Masa (restoranda) siparişi HER ZAMAN 'table' (Masa Servisi) kaynağıyla kaydedilir → analizde "Restoran Paket/Gel-Al" ile karışmaz
      const src = type === 'dine_in' ? 'table' : source;
      const common = {
        p_source: src,
        p_type: type,
        p_customer: customer,
        p_items: lines.map((l) => ({ variant_id: l.variant_id, quantity: l.qty })),
        p_table_id: type === 'dine_in' ? effectiveTable : null,
        p_payment: type === 'dine_in' ? null : pay,
        p_note: note.trim() || null,
      };

      const exArgs = {
        ...common,
        p_courier_id: type === 'delivery' && courierId ? courierId : null,
        p_save_address: type === 'delivery' && saveAddress,
        ...(planned ? { p_scheduled_for: planned.toISOString() } : {}),
      };
      let data: any;
      let error: any;
      if (applied && dres.active) {
        // İndirimli sipariş: sipariş + indirim sunucuda TEK işlemde kaydedilir
        ({ data, error } = await supabase.rpc('staff_create_order_discounted', { ...exArgs, ...discountPayload(lines, applied) } as any));
        if (error && isMissingFn(error)) {
          throw new Error('İndirimli sipariş için sql/48_admin_order_discount.sql çalıştırılmalı. Sipariş kaydedilmedi.');
        }
        if (error && /Geçersiz indirim türü/i.test(String(error.message || ''))) {
          throw new Error('Tutar (₺) ile indirim için sql/49_admin_order_discount_amount.sql çalıştırılmalı. Sipariş kaydedilmedi.');
        }
      } else {
        ({ data, error } = await supabase.rpc('staff_create_order_ex', exArgs as any));
        if (error && isMissingFn(error) && planned) {
          throw new Error('Planlı sipariş için sql/46_scheduled_orders_bulk_requests.sql çalıştırılmalı.');
        }
        if (error && isMissingFn(error)) {
          // SQL 25 henüz çalıştırılmadı: eski akışa düş (kurye ön ataması ve müşteri eşleme yok)
          if (courierId) toast('Kurye ataması için sql/25_phone_customers_maps.sql çalıştırılmalı. Sipariş kuryesiz kaydedilecek.', { icon: '⚠️', duration: 8000 });
          ({ data, error } = await supabase.rpc('staff_create_order', { ...common, p_save_address: type === 'delivery' && saveAddress } as any));
        }
      }
      if (error) throw error;

      const res = (data || {}) as { order_id?: string; order_no?: number; customer_created?: boolean };

      // Tezgâhtan hemen teslim: sırayla hazırlanıyor → hazır → teslim edildi (tarih/saatler otomatik işlenir)
      if (opts.deliverNow && res.order_id) {
        for (const st of ['preparing', 'ready', 'delivered']) {
          const { error: e2 } = await supabase.rpc('update_order_status', { p_order_id: res.order_id, p_status: st as any, p_note: null });
          if (e2) throw new Error(`Sipariş kaydedildi (#${res.order_no}) ama teslim durumuna alınamadı: ${e2.message}`);
        }
      }

      const cName = courierId ? sortedCouriers.find((c) => c.courier_id === courierId)?.full_name : '';
      toast.success(`Sipariş #${res.order_no ?? ''} kaydedildi · ${tl(total)}${cName ? ` · Kurye: ${cName}` : ''}${res.customer_created ? ' · yeni müşteri eklendi' : ''}${planned ? ` · ⏰ ${plannedLabel(planned.toISOString())}` : ''}`);
      reset();
      onCreated?.({ order_id: res.order_id, order_no: res.order_no });
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

  const customerBlock = (
    <div className="no-block">
      <PhoneCustomerPanel
        name={name}
        phone={phone}
        onName={setName}
        onPhone={setPhone}
        requirePhone={type === 'delivery'}
        customerId={customerId}
        onCustomerId={setCustomerId}
        onPickAddress={pickAddress}
        onRepeat={repeatFromHistory}
        showAddresses={type === 'delivery'}
      />

      {type === 'delivery' && (
        <>
          <div className="two-col">
            <label className="fld">Mahalle
              <input value={district} onChange={(e) => setDistrict(e.target.value)} />
            </label>
            <label className="fld">Teslimat ücreti <span className="muted">(boş = {tl(defaultFee)})</span>
              <input inputMode="decimal" value={feeOverride} onChange={(e) => setFeeOverride(e.target.value.replace(',', '.'))} placeholder={String(defaultFee)} />
            </label>
          </div>
          <label className="fld">
            <span className="fld-row">
              Açık adres <span className="req">*</span>
              <VoiceDictateButton value={address} onChange={setAddress} title="Adresi sesle yazdır" />
            </span>
            <textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Sokak, bina, kapı / daire no, tarif — veya 🎙️ ile sesle söyleyin" />
          </label>
          <LocationPicker value={loc} onChange={setLoc} address={address} district={district} height="240px"
            onAddress={(a) => { setAddress(a.address); if (a.district) setDistrict(a.district); }} />
          <label className="radio" style={{ margin: '0.5rem 0 0' }}>
            <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} />
            Adresi müşteri kaydına ekle (sonraki aramada hazır gelir)
          </label>

          <div className="no-courier">
            <h4><Icon name="truck" size={16} /> Kurye <span className="muted small">(isteğe bağlı — sonradan da atanabilir)</span></h4>
            <div className="no-courier-list">
              <button type="button" className={courierId === '' ? 'on' : ''} onClick={() => setCourierId('')}>
                <b>Sonra ata</b><small>Mutfak hazır olunca</small>
              </button>
              {sortedCouriers.map((c) => (
                <button key={c.courier_id} type="button" className={courierId === c.courier_id ? 'on' : ''} onClick={() => setCourierId(c.courier_id)}>
                  <b><i className={`dot ${c.is_online ? 'on' : ''}`} /> {c.full_name}</b>
                  <small>{c.is_online ? 'Çevrimiçi' : 'Çevrimdışı'}{c.active_order_count ? ` · ${c.active_order_count} aktif paket` : ''}</small>
                </button>
              ))}
              {sortedCouriers.length === 0 && <p className="muted small">Tanımlı kurye yok. Personel sayfasından kurye ekleyin.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );

  const sourceSeg = type !== 'dine_in' && (
    <div className="fld">
      <span>Sipariş nereden geldi?</span>
      <div className="seg">
        <button type="button" className={source === 'phone' ? 'on' : ''} onClick={() => setSource('phone')}>📞 Telefon</button>
        <button type="button" className={source === 'counter' ? 'on' : ''} onClick={() => setSource('counter')}>🥡 Restoran Gel-Al</button>
        {mode === 'full' && <button type="button" className={source === 'web' ? 'on' : ''} onClick={() => setSource('web')}>🌐 Web</button>}
      </div>
    </div>
  );

  const voiceOrderBox = type !== 'dine_in' && source === 'phone' && (
    <div className="fld voice-order-box">
      <span>
        🎙️ Sesle Sipariş Gir <span className="muted">(isteğe bağlı — elle yazmaya da devam edebilirsiniz)</span>
      </span>
      <textarea
        className="voice-order-ta"
        rows={4}
        value={voiceActive ? voiceFullText() : voiceTranscript}
        onChange={(e) => setVoiceTranscript(e.target.value)}
        readOnly={voiceActive}
        placeholder="Mikrofona basıp müşteriyle konuşurken söylenen her şey anlık olarak buraya yazılır. İsim, telefon, adres söyleyin — bitince Durdur'a basın, sistem akıllıca ayrıştırsın."
      />
      <div className="voice-order-actions">
        {!voiceActive ? (
          <button type="button" className="btn ghost small" onClick={startVoiceOrder} disabled={!voiceSupported}>
            🎙️ Sesle Sipariş Gir
          </button>
        ) : (
          <button type="button" className="btn danger small voice-recording" onClick={stopVoiceOrder}>
            ⏹️ Durdur ve Ayrıştır
          </button>
        )}
        {voiceActive && <span className="small muted voice-rec-dot">● Dinleniyor… bitirince Durdur'a basın, kendi kendine kesilmez.</span>}
        {!voiceSupported && <span className="small muted">Bu tarayıcı sesle yazmayı desteklemiyor (Chrome önerilir).</span>}
      </div>
    </div>
  );

  return (
    <Modal open={open} onClose={() => !busy && onClose()} size="xl" className="neworder">
      <div className="no-head">
        <h2><Icon name="zap" size={22} /> {kind === 'bulk' ? 'Toplu Sipariş Talebi' : 'Yeni Sipariş'}</h2>
        <div className="seg modeseg">
          <button type="button" className={kind === 'order' ? 'on' : ''} onClick={() => setKind('order')}>🍽️ Sipariş</button>
          <button type="button" className={kind === 'bulk' ? 'on' : ''} onClick={() => setKind('bulk')}>🎉 Toplu sipariş</button>
        </div>
        <div className="seg modeseg" style={kind === 'bulk' ? { display: 'none' } : undefined}>
          <button type="button" className={mode === 'quick' ? 'on' : ''} onClick={() => setMode('quick')}>
            ⚡ Hızlı
          </button>
          <button type="button" className={mode === 'full' ? 'on' : ''} onClick={() => setMode('full')}>
            📋 Detaylı
          </button>
        </div>
        <button type="button" className="icon-circle" onClick={onClose} aria-label="Kapat"><Icon name="x" size={16} /></button>
      </div>

      {kind === 'bulk' ? (
        <div style={{ padding: '1rem 1.25rem', maxWidth: 720 }}>
          <BulkRequestForm onDone={() => { onCreated?.(); onClose(); setKind('order'); }} onCancel={onClose} />
        </div>
      ) : (
      <div className="no-grid">
        {/* SOL: sipariş bilgisi + ürün seçici */}
        <div className="no-left">
          <div className="no-info">
          <div className="typetiles t3">
            <button type="button" className={type === 'delivery' ? 'on' : ''} onClick={() => chooseType('delivery')}>
              <Icon name="truck" size={26} />
              <b>Paket Servis</b>
              <small>Adrese gider · kurye atanır</small>
            </button>
            <button type="button" className={type === 'pickup' ? 'on' : ''} onClick={() => chooseType('pickup')}>
              <Icon name="bag" size={26} />
              <b>Gel-Al</b>
              <small>Gelip alıp giden · bilgi gerekmez</small>
            </button>
            <button type="button" className={type === 'dine_in' ? 'on' : ''} onClick={() => chooseType('dine_in')}>
              <Icon name="utensils" size={26} />
              <b>Restoranda</b>
              <small>Masada yiyecek · kurye yok</small>
            </button>
          </div>

          {type === 'dine_in' ? (
            <div className="no-block">
              <h4>Masa</h4>
              {tableChips}
            </div>
          ) : (
            <>
              {sourceSeg}
              {voiceOrderBox}
              {customerBlock}
            </>
          )}

          </div>
          <div className="no-menu"><ProductPicker onAdd={add} counts={counts} /></div>
        </div>

        {/* SAĞ: sepet + ödeme + gönder */}
        <aside className="no-right">
          <h4><Icon name="receipt" size={18} /> Sipariş özeti</h4>
          <CartLines
            lines={lines}
            setLines={setLines}
            fee={type === 'delivery' ? fee : 0}
            disc={dres}
            sur={sres}
            onToggleLine={(id) => setApplied((a) => (a ? { ...a, excluded: a.excluded.includes(id) ? a.excluded.filter((x) => x !== id) : [...a.excluded, id] } : a))}
          />

          {type === 'delivery' && address.trim() && (
            <p className="small muted" style={{ margin: '0.5rem 0 0' }}>
              <Icon name="mapPin" size={13} /> {address.trim()}
              {loc && <> · <a href={mapsPlaceUrl({ lat: loc.lat, lng: loc.lng })} target="_blank" rel="noreferrer">Google Haritalar</a></>}
            </p>
          )}

          <label className="fld" style={{ marginTop: '0.8rem' }}>
            <span className="fld-row">
              {mode === 'quick' ? 'Not' : 'Sipariş notu'} <span className="muted">(isteğe bağlı)</span>
              <VoiceDictateButton value={note} onChange={setNote} title="Notu sesle yazdır" />
            </span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Örn. acısız, bol soslu, zili çalmayın… — veya 🎙️ ile sesle söyleyin" />
          </label>

          <DiscountPanel
            lines={lines}
            mode={dMode}
            setMode={setDMode}
            unit={dUnit}
            setUnit={setDUnit}
            preset={dPreset}
            setPreset={setDPreset}
            custom={dCustom}
            setCustom={setDCustom}
            applied={applied}
            result={dres}
            onApply={(spec) => {
              setApplied(spec);
              const r = computeDiscount(lines, spec);
              toast.success(r.active ? `İndirim uygulandı · −${tl(r.discount)} · yeni ara toplam ${tl(r.subtotalAfter)}` : 'İndirim uygulandı ama düşecek tutar yok');
            }}
            onClear={() => { setApplied(null); toast('İndirim kaldırıldı', { icon: '↩️' }); }}
          />

          <SurchargePanel
            enabled={type === 'delivery'}
            suggestions={suggestions}
            whenLabel={plannedWhen ? 'planlı saat' : 'şu an'}
            locState={locState}
            kind={sKind}
            setKind={setSKind}
            valueStr={sValue}
            setValueStr={setSValue}
            reason={sReason}
            setReason={setSReason}
            applied={sApplied}
            result={sres}
            onApply={(spec) => {
              setSApplied(spec);
              const r = computeSurcharge(dres.subtotalAfter, spec);
              toast.success(r.active ? `Ek ücret uygulandı · +${tl(r.total)}` : 'Ek ücret tutarı 0');
            }}
            onClear={() => { setSApplied(null); toast('Ek ücret kaldırıldı', { icon: '↩️' }); }}
          />

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

          {type !== 'dine_in' ? (
            <div className="fld planbox">
              <label className="row" style={{ gap: '0.5rem', alignItems: 'center', cursor: 'pointer' }}>
                <input type="checkbox" checked={planOn} onChange={(e) => {
                  setPlanOn(e.target.checked);
                  if (e.target.checked && !planAt) { const d = new Date(Date.now() + 3600000); d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0); setPlanAt(toLocalInput(d)); }
                }} />
                <span><Icon name="clock" size={14} /> İleri tarihli / saatli sipariş <span className="muted">(isteğe bağlı)</span></span>
              </label>
              {planOn && (
                <>
                  <input type="datetime-local" value={planAt} min={toLocalInput(new Date())} onChange={(e) => setPlanAt(e.target.value)} style={{ marginTop: '0.4rem' }} />
                  <div className="row" style={{ gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                    {[['+1 sa', () => new Date(Date.now() + 3600000)], ['Bugün 19:00', () => { const d = new Date(); d.setHours(19, 0, 0, 0); return d; }], ['Bugün 20:00', () => { const d = new Date(); d.setHours(20, 0, 0, 0); return d; }], ['Yarın 12:00', () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(12, 0, 0, 0); return d; }]].map(([l, fn]) => (
                      <button key={l as string} type="button" className="chip" onClick={() => setPlanAt(toLocalInput((fn as () => Date)()))}>{l as string}</button>
                    ))}
                  </div>
                  {planAt && !isNaN(new Date(planAt).getTime()) && (
                    <p className="small muted" style={{ margin: '0.4rem 0 0' }}>
                      ⏰ {plannedLabel(new Date(planAt).toISOString())} · {untilLabel(new Date(planAt).toISOString())}. Sipariş şimdi kaydedilir; süre/gecikme bu saatten sayılır.
                    </p>
                  )}
                </>
              )}
            </div>
          ) : null}

          <p className="small muted" style={{ margin: '0.4rem 0' }}>
            <Icon name="clock" size={14} /> {planOn && type !== 'dine_in' ? 'Kayıt anı da saklanır; teslim saati planlanan saattir.' : 'Tarih ve saat otomatik kaydedilir.'}
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
      )}
    </Modal>
  );
}
