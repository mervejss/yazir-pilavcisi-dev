import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import { supabase } from '@/lib/supabase';
import { tl } from '@/lib/helpers';

export type SplitMethod = 'cash_on_delivery' | 'card_on_delivery' | 'iban';
export const SPLIT_LABELS: Record<SplitMethod, string> = {
  cash_on_delivery: '💵 Nakit',
  card_on_delivery: '💳 Kart',
  iban: '🏦 IBAN',
};

interface DetailItem { id: string; name: string; variant: string | null; qty: number; unit_price: number; line_total: number; note: string | null }
interface Group { label: string; method: SplitMethod; amount: number; lines: string[] }
interface Detail {
  id: string; order_no: number; status: string; payment_method: string | null;
  subtotal: number; delivery_fee: number; discount: number; total: number;
  items: DetailItem[]; splits: Array<{ seq: number; label: string | null; method: SplitMethod; amount: number; lines: string[] }>;
}
interface Line { key: string; name: string; variant?: string | null; price: number; kind: 'item' | 'fee' | 'discount' | 'adj'; note?: string | null }

const r2 = (n: number) => Math.round(n * 100) / 100;
const defaultMethod = (pm: string | null | undefined): SplitMethod =>
  pm === 'card_on_delivery' || pm === 'card_at_table' ? 'card_on_delivery' : pm === 'iban' ? 'iban' : 'cash_on_delivery';

interface Props {
  orderId: string | null;
  customerName?: string | null;
  onClose: () => void;
}

/** Kurye: kalem kalem fiyatlar + kişi bazlı ayrı ödeme (kim neyi, hangi yöntemle ödedi) */
export default function OrderDetailSheet({ orderId, customerName, onClose }: Props) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [err, setErr] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<SplitMethod>('cash_on_delivery');
  const [label, setLabel] = useState('');
  const [manual, setManual] = useState('');
  const [saving, setSaving] = useState(false);

  // Sipariş yüklenir
  useEffect(() => {
    if (!orderId) return;
    let off = false;
    setDetail(null);
    setErr('');
    setSel(new Set());
    setManual('');
    setLabel('');
    supabase.rpc('courier_order_detail', { p_order: orderId } as any).then(({ data, error }) => {
      if (off) return;
      if (error) {
        setErr(/courier_order_detail|function|does not exist/i.test(error.message) ? 'Bu özellik için yönetici sql/31_courier_split_payments.sql dosyasını çalıştırmalı.' : error.message);
        return;
      }
      const d = data as unknown as Detail;
      setDetail(d);
      setMethod(defaultMethod(d.payment_method));
      setGroups((d.splits || []).map((s) => ({ label: s.label || '', method: s.method, amount: Number(s.amount), lines: s.lines || [] })));
    });
    return () => {
      off = true;
    };
  }, [orderId]);

  // Her adet ayrı satır (aynı üründen 2 tane varsa ayrı ayrı seçilebilir)
  const lines = useMemo<Line[]>(() => {
    if (!detail) return [];
    const out: Line[] = [];
    detail.items.forEach((i) => {
      for (let n = 0; n < i.qty; n++) out.push({ key: `${i.id}#${n}`, name: i.name, variant: i.variant, price: Number(i.unit_price), kind: 'item', note: n === 0 ? i.note : null });
    });
    if (Number(detail.delivery_fee) > 0) out.push({ key: 'fee', name: 'Teslimat ücreti', price: Number(detail.delivery_fee), kind: 'fee' });
    if (Number(detail.discount) > 0) out.push({ key: 'disc', name: 'İndirim', price: -Number(detail.discount), kind: 'discount' });
    const diff = r2(Number(detail.total) - out.reduce((a, l) => a + l.price, 0));
    if (Math.abs(diff) >= 0.01) out.push({ key: 'adj', name: 'Diğer / yuvarlama', price: diff, kind: 'adj' });
    return out;
  }, [detail]);

  const priceOf = useMemo(() => Object.fromEntries(lines.map((l) => [l.key, l.price])) as Record<string, number>, [lines]);
  const paidBy = useMemo(() => {
    const m: Record<string, Group & { idx: number }> = {};
    groups.forEach((g, idx) => g.lines.forEach((k) => (m[k] = { ...g, idx })));
    return m;
  }, [groups]);

  const total = Number(detail?.total || 0);
  const paidSum = r2(groups.reduce((a, g) => a + g.amount, 0));
  const remaining = r2(total - paidSum);
  const selSum = r2([...sel].reduce((a, k) => a + (priceOf[k] || 0), 0));
  const manualNum = Number(manual.replace(',', '.'));
  const hasManual = manual.trim() !== '' && Number.isFinite(manualNum) && manualNum > 0;
  const chargeNow = hasManual ? r2(manualNum) : selSum;

  const persist = useCallback(
    async (next: Group[]) => {
      if (!orderId) return;
      setSaving(true);
      const { error } = await supabase.rpc('courier_save_splits', { p_order: orderId, p_splits: next } as any);
      setSaving(false);
      if (error) toast.error(error.message);
    },
    [orderId],
  );

  const toggle = (k: string) => {
    if (paidBy[k]) return;
    setSel((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  };

  const selectRemaining = () => setSel(new Set(lines.filter((l) => !paidBy[l.key]).map((l) => l.key)));

  const confirmPay = async () => {
    if (chargeNow <= 0) return toast.error('Önce ürün seçin veya tutar girin');
    if (chargeNow > remaining + 0.005) return toast.error(`Kalan tutar ${tl(remaining)}; daha fazlası girilemez`);
    const g: Group = { label: label.trim() || `${groups.length + 1}. kişi`, method, amount: chargeNow, lines: hasManual ? [] : [...sel] };
    const next = [...groups, g];
    setGroups(next);
    setSel(new Set());
    setManual('');
    setLabel('');
    await persist(next);
    toast.success(`${g.label}: ${tl(g.amount)} alındı`);
  };

  const undo = async (idx: number) => {
    const next = groups.filter((_, i) => i !== idx);
    setGroups(next);
    await persist(next);
  };

  const byMethod = (m: SplitMethod) => r2(groups.filter((g) => g.method === m).reduce((a, g) => a + g.amount, 0));

  return (
    <Modal open={!!orderId} onClose={onClose} size="wide" className="osd">
      <div className="pe-head">
        <div>
          <h2>🧾 Sipariş #{detail?.order_no ?? ''} detayı</h2>
          {customerName && <p className="muted small">{customerName}</p>}
        </div>
        <button type="button" className="icon-circle" onClick={onClose} aria-label="Kapat">✕</button>
      </div>

      {err && <div className="note">{err}</div>}
      {!detail && !err && <div className="cr-empty"><div className="gold-spinner" /></div>}

      {detail && (
        <>
          <p className="small muted osd-hint">Ürünlere dokunarak seçin → ödeyen kişiyi ve yöntemi belirleyin → <b>"Ödemeyi al"</b>. Ödenen satırlar toplamdan düşer.</p>

          <ul className="osd-lines">
            {lines.map((l) => {
              const p = paidBy[l.key];
              const on = sel.has(l.key);
              return (
                <li key={l.key}>
                  <button
                    type="button"
                    className={`osd-line${on ? ' on' : ''}${p ? ' paid' : ''}`}
                    onClick={() => toggle(l.key)}
                    disabled={!!p}
                    aria-pressed={on}
                  >
                    <span className="osd-chk" aria-hidden="true">{p ? '✓' : on ? '☑' : '☐'}</span>
                    <span className="osd-name">
                      {l.name}{l.variant ? ` (${l.variant})` : ''}
                      {l.note && <em>↳ {l.note}</em>}
                      {p && <em className="osd-by">{p.label} · {SPLIT_LABELS[p.method]}</em>}
                    </span>
                    <b className={l.price < 0 ? 'neg' : ''}>{tl(l.price)}</b>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="osd-sum">
            <div><span>Ara toplam</span><b>{tl(Number(detail.subtotal))}</b></div>
            {Number(detail.delivery_fee) > 0 && <div><span>Teslimat</span><b>{tl(Number(detail.delivery_fee))}</b></div>}
            {Number(detail.discount) > 0 && <div><span>İndirim</span><b>-{tl(Number(detail.discount))}</b></div>}
            <div className="tot"><span>TOPLAM</span><b>{tl(total)}</b></div>
            <div className="ok"><span>Alınan</span><b>{tl(paidSum)}</b></div>
            <div className={`rem${remaining <= 0.004 ? ' done' : ''}`}><span>KALAN</span><b>{remaining <= 0.004 ? '✅ Hesap tamam' : tl(remaining)}</b></div>
          </div>

          {remaining > 0.004 && (
            <div className="osd-pay">
              <div className="osd-pay-top">
                <button type="button" className="btn ghost sm" onClick={selectRemaining}>Kalanların hepsini seç</button>
                <button type="button" className="btn ghost sm" onClick={() => { setSel(new Set()); setManual(''); }}>Seçimi temizle</button>
                {[2, 3, 4].map((n) => (
                  <button key={n} type="button" className="btn ghost sm" onClick={() => { setManual(String(r2(remaining / n))); setSel(new Set()); }}>
                    Kalanı {n}'e böl
                  </button>
                ))}
              </div>

              <div className="osd-method" role="radiogroup" aria-label="Ödeme yöntemi">
                {(Object.keys(SPLIT_LABELS) as SplitMethod[]).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={method === m} className={method === m ? 'on' : ''} onClick={() => setMethod(m)}>
                    {SPLIT_LABELS[m]}
                  </button>
                ))}
              </div>

              <div className="osd-fields">
                <label className="fld">Kişi / not
                  <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`${groups.length + 1}. kişi`} maxLength={30} />
                </label>
                <label className="fld">Elle tutar (₺) <span className="muted">(boşsa seçilenler)</span>
                  <input inputMode="decimal" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="örn. 150" />
                </label>
              </div>

              <button type="button" className="btn gold lg block" disabled={saving || chargeNow <= 0} onClick={confirmPay}>
                {chargeNow > 0 ? `${SPLIT_LABELS[method]} · ${tl(chargeNow)} — Ödemeyi al` : 'Ürün seçin'}
              </button>
              {chargeNow > 0 && <p className="small muted" style={{ textAlign: 'center', margin: '0.3rem 0 0' }}>Müşteriye söyleyin: <b>{tl(chargeNow)}</b>{sel.size > 0 ? ` (${sel.size} kalem)` : ''}</p>}
            </div>
          )}

          {groups.length > 0 && (
            <div className="osd-done">
              <h3>Alınan ödemeler</h3>
              {groups.map((g, i) => (
                <div key={i} className="osd-g">
                  <span>{g.label} · {SPLIT_LABELS[g.method]}{g.lines.length > 0 && ` · ${g.lines.length} kalem`}</span>
                  <b>{tl(g.amount)}</b>
                  <button type="button" className="linklike small danger-txt" onClick={() => undo(i)}>Geri al</button>
                </div>
              ))}
              <div className="osd-bym">
                {byMethod('cash_on_delivery') > 0 && <span>💵 Nakit {tl(byMethod('cash_on_delivery'))}</span>}
                {byMethod('card_on_delivery') > 0 && <span>💳 Kart {tl(byMethod('card_on_delivery'))}</span>}
                {byMethod('iban') > 0 && <span>🏦 IBAN {tl(byMethod('iban'))}</span>}
              </div>
              {remaining > 0.004 && <p className="small muted">Kalan {tl(remaining)}, siparişin ana ödeme yöntemiyle ({SPLIT_LABELS[defaultMethod(detail.payment_method)]}) hesaplanır.</p>}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
