import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { tl } from '@/lib/helpers';
import QtyStepper from '@/components/ui/QtyStepper';
import { r2, splitRemaining, type SplitLine, type SplitPayment, type SplitMethodOpt, type SplitRef } from '@/lib/billSplit';

/**
 * Hesap bölme (kurye + admin/masa hesabı ortak).
 *  - Her kalemin solunda kare: dokununca kalemin kalan TÜM adedi seçilir; çok adetli üründe yanında adet seçici çıkar (kısmi ödeme).
 *  - "Eşit böl": 2-6 hızlı düğme veya YAZILAN kişi sayısı → her ödemede kalan / kalan kişi sayısı otomatik gelir (son kişi tam kalanı öder).
 *  - Elle tutar da girilebilir. Öncelik: elle tutar > seçilen kalemler > eşit bölüm.
 *  - Ödeme alındıkça kalan otomatik hesaplanır; ödemeler geri alınabilir.
 */
export type { SplitLine, SplitRef, SplitPayment, SplitMethodOpt } from '@/lib/billSplit';
export { r2, normalizeRefs, splitRemaining } from '@/lib/billSplit';

const QUICK_PARTS = [2, 3, 4, 5, 6];

export default function BillSplitter({
  lines, total, methods, defaultMethod, payments, onChange, busy = false, footerNote,
}: {
  lines: SplitLine[];
  total: number;
  methods: SplitMethodOpt[];
  defaultMethod: string;
  payments: SplitPayment[];
  onChange: (next: SplitPayment[]) => void | Promise<void>;
  busy?: boolean;
  footerNote?: string;
}) {
  const [sel, setSel] = useState<Record<string, number>>({});
  const [method, setMethod] = useState(defaultMethod);
  const [label, setLabel] = useState('');
  const [manual, setManual] = useState('');
  const [parts, setParts] = useState<number | null>(null);
  const [partsDraft, setPartsDraft] = useState('2');

  const labelOf = (v: string) => methods.find((m) => m.value === v)?.label || v;

  // Kalem başına ödenmiş adet ve kimin ödediği
  const paid = useMemo(() => {
    const qty: Record<string, number> = {};
    const who: Record<string, string[]> = {};
    payments.forEach((p) => p.lines.forEach((r) => {
      qty[r.k] = (qty[r.k] || 0) + r.n;
      (who[r.k] ||= []).push(`${p.label}${r.n > 1 ? ` ×${r.n}` : ''}`);
    }));
    return { qty, who };
  }, [payments]);

  const left = (l: SplitLine) => Math.max(0, l.qty - (paid.qty[l.key] || 0));
  const unitOf = useMemo(() => Object.fromEntries(lines.map((l) => [l.key, l.unit])) as Record<string, number>, [lines]);

  const paidSum = r2(payments.reduce((a, p) => a + p.amount, 0));
  const remaining = r2(total - paidSum);
  const done = remaining <= 0.004;

  const selKeys = Object.keys(sel).filter((k) => sel[k] > 0);
  const selSum = r2(selKeys.reduce((a, k) => a + (unitOf[k] || 0) * sel[k], 0));
  const manualNum = Number(manual.replace(',', '.'));
  const hasManual = manual.trim() !== '' && Number.isFinite(manualNum) && manualNum > 0;
  const useSel = !hasManual && selKeys.length > 0;
  const equalAmount = parts ? (parts <= 1 ? remaining : r2(remaining / parts)) : null;
  const chargeNow = hasManual ? r2(manualNum) : useSel ? selSum : equalAmount ?? 0;
  const useEqual = !hasManual && !useSel && equalAmount !== null;

  const toggle = (l: SplitLine) => {
    const lf = left(l);
    if (lf <= 0) return;
    setManual('');
    setSel((s) => ({ ...s, [l.key]: s[l.key] > 0 ? 0 : lf }));
  };
  const selectAll = () => { setManual(''); setSel(Object.fromEntries(lines.filter((l) => left(l) > 0).map((l) => [l.key, left(l)]))); };
  const clearSel = () => { setSel({}); setManual(''); };

  const setEqual = (n: number) => {
    const v = Math.max(2, Math.min(99, Math.floor(n) || 2));
    setParts(v); setPartsDraft(String(v)); setSel({}); setManual('');
  };

  const confirmPay = async (overrideRemaining = false) => {
    let amount = overrideRemaining ? remaining : chargeNow;
    if (amount <= 0) return toast.error('Ürün seçin, tutar girin veya eşit bölün');
    if (amount > remaining + 0.005) return toast.error(`Kalan tutar ${tl(remaining)}; daha fazlası girilemez`);
    if (Math.abs(amount - remaining) < 0.02) amount = remaining; // kuruş artığı kalmasın
    const refs: SplitRef[] = !overrideRemaining && useSel ? selKeys.map((k) => ({ k, n: sel[k] })) : [];
    const p: SplitPayment = { label: label.trim() || `${payments.length + 1}. kişi`, method, amount, lines: refs };
    setSel({}); setManual(''); setLabel('');
    if (!overrideRemaining && useEqual && parts) {
      const nextParts = parts - 1;
      if (nextParts >= 1) { setParts(nextParts); setPartsDraft(String(Math.max(2, nextParts))); } else setParts(null);
    } else if (overrideRemaining) setParts(null);
    await onChange([...payments, p]);
    toast.success(`${p.label}: ${tl(p.amount)} alındı`);
  };

  const undo = async (idx: number) => { await onChange(payments.filter((_, i) => i !== idx)); };

  const byMethod = (m: string) => r2(payments.filter((p) => p.method === m).reduce((a, p) => a + p.amount, 0));

  return (
    <div className="bs">
      <p className="small muted osd-hint">Kalemin solundaki kareye dokunarak seçin (çok adetli üründe yanındaki sayıdan kaç tanesi olduğunu belirleyin) → <b>"Ödemeyi al"</b>. Ya da kişi sayısı girip <b>eşit bölün</b>.</p>

      <ul className="osd-lines">
        {lines.map((l) => {
          const lf = left(l);
          const n = sel[l.key] || 0;
          const on = n > 0;
          const fully = lf <= 0;
          const who = paid.who[l.key];
          return (
            <li key={l.key}>
              <div className={`osd-line bs-line${on ? ' on' : ''}${fully ? ' paid' : ''}`}>
                <button type="button" className="osd-chk bs-chk" disabled={fully} onClick={() => toggle(l)} aria-pressed={on} aria-label={`${l.name} seç`}>
                  {fully ? '✓' : on ? '☑' : '☐'}
                </button>
                <button type="button" className="bs-name" disabled={fully} onClick={() => toggle(l)}>
                  <span className="osd-name">
                    {l.qty > 1 ? `${l.qty}× ` : ''}{l.name}{l.variant ? ` (${l.variant})` : ''}
                    {l.note && <em>↳ {l.note}</em>}
                    {who && <em className="osd-by">{who.join(', ')}{!fully && ` · kalan ${lf}/${l.qty}`}</em>}
                  </span>
                </button>
                {on && l.qty > 1 && lf > 1 ? (
                  <QtyStepper value={n} max={lf} chips={false} size="sm" ariaLabel={`${l.name} seçilen adet`}
                    onChange={(v) => setSel((s) => ({ ...s, [l.key]: Math.max(0, Math.min(lf, v)) }))} />
                ) : <span />}
                <b className={l.unit < 0 ? 'neg' : ''}>{tl(l.unit * l.qty)}</b>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="osd-sum">
        <div className="tot"><span>TOPLAM</span><b>{tl(total)}</b></div>
        <div className="ok"><span>Alınan</span><b>{tl(paidSum)}</b></div>
        <div className={`rem${done ? ' done' : ''}`}><span>KALAN</span><b>{done ? '✅ Hesap tamam' : tl(remaining)}</b></div>
      </div>

      {!done && (
        <div className="osd-pay">
          <div className="osd-pay-top">
            <button type="button" className="btn ghost sm" onClick={selectAll}>Kalanların hepsini seç</button>
            <button type="button" className="btn ghost sm" onClick={clearSel}>Seçimi temizle</button>
          </div>

          <div className="bs-equal">
            <span className="small"><b>Eşit böl:</b></span>
            {QUICK_PARTS.map((n) => (
              <button key={n} type="button" className={`btn sm ${parts === n ? 'gold' : 'ghost'}`} onClick={() => setEqual(n)}>{n} kişi</button>
            ))}
            <input
              className="bs-parts" inputMode="numeric" aria-label="Kişi sayısı" value={partsDraft}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setPartsDraft(e.target.value.replace(/\D/g, '').slice(0, 2))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setEqual(Number(partsDraft)); } }}
            />
            <button type="button" className="btn ghost sm" onClick={() => setEqual(Number(partsDraft))}>Böl</button>
            {parts && <button type="button" className="btn ghost sm" onClick={() => setParts(null)}>Eşit bölmeyi kapat</button>}
          </div>
          {parts && (
            <p className="small" style={{ margin: 0 }}>
              👥 Kalan <b>{parts}</b> kişi · kişi başı <b>{tl(equalAmount || 0)}</b>
              {parts > 1 && <span className="muted"> (son kişi tam kalanı öder)</span>}
            </p>
          )}

          <div className="osd-method" style={{ gridTemplateColumns: `repeat(${methods.length}, 1fr)` }} role="radiogroup" aria-label="Ödeme yöntemi">
            {methods.map((m) => (
              <button key={m.value} type="button" role="radio" aria-checked={method === m.value} className={method === m.value ? 'on' : ''} onClick={() => setMethod(m.value)}>
                {m.label}
              </button>
            ))}
          </div>

          <div className="osd-fields">
            <label className="fld">Kişi / not
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`${payments.length + 1}. kişi`} maxLength={30} />
            </label>
            <label className="fld">Elle tutar (₺) <span className="muted">(boşsa seçim / eşit bölüm)</span>
              <input inputMode="decimal" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="örn. 150" />
            </label>
          </div>

          <button type="button" className="btn gold lg block" disabled={busy || chargeNow <= 0} onClick={() => void confirmPay()}>
            {chargeNow > 0 ? `${labelOf(method)} · ${tl(chargeNow)} — Ödemeyi al` : 'Ürün seçin / kişi sayısı girin'}
          </button>
          {chargeNow > 0 && <p className="small muted" style={{ textAlign: 'center', margin: 0 }}>Müşteriye söyleyin: <b>{tl(chargeNow)}</b>{useSel ? ` (${selKeys.length} kalem)` : useEqual ? ' (eşit pay)' : ''}</p>}
          <button type="button" className="btn ghost sm block" disabled={busy} onClick={() => void confirmPay(true)}>
            Kalanın tamamını tek kişi öder · {labelOf(method)} · {tl(remaining)}
          </button>
        </div>
      )}

      {payments.length > 0 && (
        <div className="osd-done">
          <h3>Alınan ödemeler</h3>
          {payments.map((p, i) => (
            <div key={i} className="osd-g">
              <span>{p.label} · {labelOf(p.method)}{p.lines.length > 0 && ` · ${p.lines.reduce((a, r) => a + r.n, 0)} adet`}</span>
              <b>{tl(p.amount)}</b>
              <button type="button" className="linklike small danger-txt" disabled={busy} onClick={() => void undo(i)}>Geri al</button>
            </div>
          ))}
          <div className="osd-bym">
            {methods.map((m) => byMethod(m.value) > 0 && <span key={m.value}>{m.label} {tl(byMethod(m.value))}</span>)}
          </div>
          {footerNote && !done && <p className="small muted">{footerNote}</p>}
        </div>
      )}
    </div>
  );
}
