import { tl } from '@/lib/helpers';
import { parseNum, validSurchargeInput, type SuggestionSet, type SurchargeResult, type SurchargeSpec } from '@/lib/orderSurcharge';
import '@/styles/order-surcharge.css';

const pct = (n: number) => `%${Number(n.toFixed(2)).toLocaleString('tr-TR')}`;

/** Ek ücretin özeti: "₺40 + %5 (₺20) = ₺60" */
export const surchargeBreakdown = (r: SurchargeResult) =>
  [r.fixed > 0 ? tl(r.fixed) : '', r.percent > 0 ? `${pct(r.percent)} (${tl(r.pctAmount)})` : ''].filter(Boolean).join(' + ');

/** Sipariş özetinde, İndirim kutusunun altındaki "Ek ücret" kutusu */
export function SurchargePanel({
  enabled, suggestions, whenLabel, hasLoc, canFindLoc, finding, onFindLoc,
  amountStr, setAmountStr, pctStr, setPctStr, reason, setReason,
  applied, onApply, onClear, result,
}: {
  enabled: boolean;                       // yalnızca Paket Servis
  suggestions: SuggestionSet;
  whenLabel: string;                      // "şu an" | "planlı saat"
  hasLoc: boolean;
  canFindLoc: boolean;                    // adres yazılı + Google anahtarı var
  finding: boolean;
  onFindLoc: () => void;
  amountStr: string; setAmountStr: (s: string) => void;
  pctStr: string; setPctStr: (s: string) => void;
  reason: string; setReason: (s: string) => void;
  applied: SurchargeSpec | null;
  onApply: (spec: SurchargeSpec) => void;
  onClear: () => void;
  result: SurchargeResult;
}) {
  if (!enabled) {
    return (
      <div className="disc-box sur-box">
        <div className="disc-head"><b>➕ Ek ücret</b></div>
        <p className="small muted disc-note">Ek ücret (uzak mesafe / gece) yalnızca <b>Paket Servis</b> siparişlerinde uygulanır.</p>
      </div>
    );
  }

  const a = parseNum(amountStr);
  const p = parseNum(pctStr);
  const ok = validSurchargeInput(amountStr, pctStr);
  const changed = !!applied && (applied.amount !== (Number.isFinite(a) ? a : 0) || applied.percent !== (Number.isFinite(p) ? p : 0));
  const rec = suggestions.options[0];

  return (
    <div className={`disc-box sur-box${applied && result.active ? ' on' : ''}`}>
      <div className="disc-head">
        <b>➕ Ek ücret</b>
        {applied && result.active && !changed && <span className="disc-badge">Uygulandı</span>}
      </div>

      <div className="sur-info">
        <div className="sur-line">
          <span>📍</span>
          {suggestions.distance ? (
            <span>
              {suggestions.distance.text}
              {suggestions.distance.amount > 0 ? <em> · önerilen +{tl(suggestions.distance.amount)}</em> : <span className="muted"> · ek ücret önerilmiyor</span>}
            </span>
          ) : (
            <span className="muted">
              Konum işaretlenmedi — haritadan işaretleyin
              {canFindLoc && (
                <> veya <button type="button" className="sur-link" onClick={onFindLoc} disabled={finding}>{finding ? 'aranıyor…' : 'adresten konumu bul'}</button></>
              )}
            </span>
          )}
        </div>
        <div className="sur-line">
          <span>🕒</span>
          <span>
            {suggestions.time.text} <span className="muted">({whenLabel})</span>
            {suggestions.time.amount > 0 && <em> · önerilen +{tl(suggestions.time.amount)}</em>}
          </span>
        </div>
      </div>

      {suggestions.options.length > 0 && (
        <div className="sur-opts" role="group" aria-label="Önerilen ek ücret">
          {suggestions.options.map((o, i) => (
            <button
              key={o.key}
              type="button"
              className={`${i === 0 ? 'rec ' : ''}${amountStr !== '' && parseNum(amountStr) === o.amount && pctStr === '' ? 'on' : ''}`}
              onClick={() => { setAmountStr(String(o.amount)); setPctStr(''); setReason(o.reason); }}
            >
              <small>{o.title}</small>
              <b>+{tl(o.amount)}</b>
            </button>
          ))}
        </div>
      )}
      {!hasLoc && !rec && <p className="small muted" style={{ margin: 0 }}>Konum ve saat için ek ücret gerekmiyorsa aşağıya kendiniz de yazabilirsiniz.</p>}

      <div className="sur-inputs">
        <label className="fld">
          <span>₺ Sabit tutar</span>
          <input
            inputMode="decimal"
            value={amountStr}
            onChange={(e) => { setAmountStr(e.target.value.replace(/[^0-9.,]/g, '')); setReason('Elle girildi'); }}
            placeholder="Örn. 40"
            aria-label="Ek ücret TL"
          />
        </label>
        <span className="sur-plus" aria-hidden="true">+</span>
        <label className="fld">
          <span>% Yüzde</span>
          <input
            inputMode="decimal"
            value={pctStr}
            onChange={(e) => { setPctStr(e.target.value.replace(/[^0-9.,]/g, '')); setReason('Elle girildi'); }}
            placeholder="Örn. 10"
            aria-label="Ek ücret yüzde"
          />
        </label>
      </div>
      <p className="small muted disc-note" style={{ margin: 0 }}>Yüzde, indirim sonrası <b>ürün tutarı</b> üzerinden hesaplanır. İkisini birlikte de yazabilirsiniz.</p>
      {(amountStr.trim() !== '' || pctStr.trim() !== '') && !ok && <p className="small disc-err">Geçerli bir tutar girin (yüzde en fazla 100).</p>}

      <div className="disc-actions">
        <button
          type="button"
          className="btn gold small"
          disabled={!ok}
          onClick={() => onApply({ amount: Number.isFinite(a) ? a : 0, percent: Number.isFinite(p) ? p : 0, reason: reason || 'Elle girildi' })}
        >
          {applied ? 'Ek ücreti güncelle' : 'Ek ücreti uygula'}
        </button>
        {applied && <button type="button" className="btn ghost small" onClick={onClear}>Ek ücreti kaldır</button>}
      </div>

      {applied && result.active && (
        <div className="disc-result" aria-live="polite">
          <div className="pos"><span>Ek ücret{result.reason ? ` · ${result.reason}` : ''}</span><b>+{tl(result.total)}</b></div>
          {result.fixed > 0 && result.percent > 0 && <div className="small muted"><span>{surchargeBreakdown(result)}</span></div>}
        </div>
      )}
      {changed && <p className="small disc-hint">Değer değişti — yeni tutarı görmek için "Ek ücreti güncelle"ye basın.</p>}
      <p className="small muted disc-note">
        {applied ? 'Ek ücret yalnızca sepette görünür; sipariş "Mutfağa gönder" ile kaydedilince teslimat ücretine eklenir.' : 'Uygula\'ya basınca sonuç sepette görünür, sipariş hemen verilmez.'}
      </p>
    </div>
  );
}

/** Sepet: teslimat ücretinin altında ek ücret satırı */
export function CartSurchargeRow({ result }: { result: SurchargeResult }) {
  if (!result.active) return null;
  return (
    <div className="qline disc-row pos">
      <span className="qname">➕ Ek ücret{result.reason ? ` (${result.reason})` : ''}</span>
      <b className="qsum">+{tl(result.total)}</b>
    </div>
  );
}
