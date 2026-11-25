import { tl } from '@/lib/helpers';
import { parseNum, type SuggestionSet, type SurchargeResult, type SurchargeSpec } from '@/lib/orderSurcharge';
import '@/styles/order-surcharge.css';

const num = (n: number) => Number(n.toFixed(2)).toLocaleString('tr-TR');

export type SurKind = 'tl' | 'pct';
/** Konumun nereden geldiği: pin (haritadan/kayıtlı) · auto (yazılan adresten) · searching · notfound · none */
export type LocState = 'pin' | 'auto' | 'searching' | 'notfound' | 'none';

/** Panel girişinden uygulanacak değer (0 → geçersiz) */
export const surchargeValueOk = (kind: SurKind, valueStr: string) => {
  const v = parseNum(valueStr);
  return Number.isFinite(v) && v > 0 && (kind === 'tl' ? v <= 100000 : v <= 100);
};
export const specFromInput = (kind: SurKind, valueStr: string, reason: string): SurchargeSpec => {
  const v = parseNum(valueStr);
  const val = Number.isFinite(v) ? v : 0;
  return { amount: kind === 'tl' ? val : 0, percent: kind === 'pct' ? val : 0, reason: reason || 'Elle girildi' };
};

/** Sipariş özetinde, İndirim kutusunun altındaki "Ek ücret" kutusu */
export function SurchargePanel({
  enabled, suggestions, whenLabel, locState,
  kind, setKind, valueStr, setValueStr, reason, setReason,
  applied, onApply, onClear, result,
}: {
  enabled: boolean;                       // yalnızca Paket Servis
  suggestions: SuggestionSet;
  whenLabel: string;                      // "şu an" | "planlı saat"
  locState: LocState;
  kind: SurKind; setKind: (k: SurKind) => void;
  valueStr: string; setValueStr: (s: string) => void;
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

  const v = parseNum(valueStr);
  const ok = surchargeValueOk(kind, valueStr);
  const changed = !!applied && (kind === 'tl' ? applied.amount !== v || applied.percent !== 0 : applied.percent !== v || applied.amount !== 0);
  const d = suggestions.distance;
  const where = locState === 'pin' ? 'haritada işaretlendi' : 'adresten bulundu';

  return (
    <div className={`disc-box sur-box${applied && result.active ? ' on' : ''}`}>
      <div className="disc-head">
        <b>➕ Ek ücret</b>
        {applied && result.active && !changed && <span className="disc-badge">Uygulandı</span>}
      </div>

      <div className="sur-info" aria-live="polite">
        <div className="sur-line">
          <span>📍</span>
          {d ? (
            <span>
              {d.text} <span className="muted">· {where}</span>
              {d.amount > 0 ? <em> · önerilen +{tl(d.amount)}</em> : <span className="muted"> · ek ücret önerilmiyor</span>}
            </span>
          ) : locState === 'searching' ? (
            <span className="muted">Adres haritada aranıyor…</span>
          ) : locState === 'notfound' ? (
            <span className="muted">Adres haritada bulunamadı — haritadan teslimat noktasını işaretleyin.</span>
          ) : (
            <span className="muted">Adresi yazın veya haritadan teslimat noktasını işaretleyin — mesafe anında hesaplanır.</span>
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
              className={`${i === 0 ? 'rec ' : ''}${kind === 'tl' && valueStr !== '' && parseNum(valueStr) === o.amount ? 'on' : ''}`}
              onClick={() => { setKind('tl'); setValueStr(String(o.amount)); setReason(o.reason); }}
            >
              <small>{o.title}</small>
              <b>+{tl(o.amount)}</b>
            </button>
          ))}
        </div>
      )}

      <div className="disc-units" role="radiogroup" aria-label="Ek ücret şekli">
        <span className="small muted">Kendiniz girin</span>
        <button type="button" role="radio" aria-checked={kind === 'tl'} className={kind === 'tl' ? 'on' : ''} onClick={() => { setKind('tl'); setReason('Elle girildi'); }}>₺ Tutar</button>
        <button type="button" role="radio" aria-checked={kind === 'pct'} className={kind === 'pct' ? 'on' : ''} onClick={() => { setKind('pct'); setReason('Elle girildi'); }}>% Yüzde</button>
        <label className="disc-other">
          <input
            inputMode="decimal"
            value={valueStr}
            onChange={(e) => { setValueStr(e.target.value.replace(/[^0-9.,]/g, '')); setReason('Elle girildi'); }}
            placeholder={kind === 'tl' ? 'Örn. 40' : 'Örn. 10'}
            aria-label={kind === 'tl' ? 'Ek ücret TL' : 'Ek ücret yüzde'}
          />
          <span>{kind === 'tl' ? '₺' : '%'}</span>
        </label>
      </div>
      <p className="small muted disc-note" style={{ margin: 0 }}>
        {kind === 'tl' ? 'Girdiğiniz tutar siparişin toplamına eklenir.' : 'Yüzde, indirim sonrası ürün tutarı üzerinden hesaplanıp toplama eklenir.'}
      </p>
      {valueStr.trim() !== '' && !ok && <p className="small disc-err">{kind === 'tl' ? "Tutar 0'dan büyük olmalı." : 'Yüzde 0 ile 100 arasında olmalı.'}</p>}

      <div className="disc-actions">
        <button type="button" className="btn gold small" disabled={!ok} onClick={() => onApply(specFromInput(kind, valueStr, reason))}>
          {applied ? 'Ek ücreti güncelle' : 'Ek ücreti uygula'}
        </button>
        {applied && <button type="button" className="btn ghost small" onClick={onClear}>Ek ücreti kaldır</button>}
      </div>

      {applied && result.active && (
        <div className="disc-result" aria-live="polite">
          <div className="pos"><span>Ek ücret · {result.reason}{result.percent > 0 ? ` (%${num(result.percent)} → ${tl(result.pctAmount)})` : ''}</span><b>+{tl(result.total)}</b></div>
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
