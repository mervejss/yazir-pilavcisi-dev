import { tl } from '@/lib/helpers';
import { validValue, type CartLineIn, type DiscountMode, type DiscountResult, type DiscountSpec, type DiscountUnit, type DiscountedLine } from '@/lib/orderDiscount';
import '@/styles/order-discount.css';

/** 10 / 20 / 50 gibi hazır değer ya da 'other' (kendisi yazar) */
export type Preset = number | 'other';

const PERCENT_PRESETS = [10, 20];
const AMOUNT_PRESETS = [10, 20, 50];

/** "Diğer" kutusundaki yazıyı sayıya çevirir (virgül / nokta) */
export const parseValue = (s: string) => parseFloat(String(s).replace(',', '.'));
export const pendingValue = (preset: Preset, custom: string) => (preset === 'other' ? parseValue(custom) : preset);

const num = (n: number) => Number(n.toFixed(2)).toLocaleString('tr-TR');
/** "%10" veya "−70 ₺" */
export const valueLabel = (unit: DiscountUnit, v: number) => (unit === 'percent' ? `%${num(v)}` : `−${tl(v)}`);
const modeText = (r: DiscountResult) =>
  r.mode === 'cart'
    ? `Sepet indirimi (${valueLabel(r.unit, r.value)})`
    : `Ürün indirimleri (${r.unit === 'percent' ? valueLabel(r.unit, r.value) : `adet başı ${valueLabel(r.unit, r.value)}`})`;

/** Sipariş özetinde, Notlar'ın altındaki "İndirim uygula" kutusu */
export function DiscountPanel({
  lines, mode, setMode, unit, setUnit, preset, setPreset, custom, setCustom, applied, onApply, onClear, result,
}: {
  lines: CartLineIn[];
  mode: DiscountMode; setMode: (m: DiscountMode) => void;
  unit: DiscountUnit; setUnit: (u: DiscountUnit) => void;
  preset: Preset; setPreset: (p: Preset) => void;
  custom: string; setCustom: (s: string) => void;
  applied: DiscountSpec | null;
  onApply: (spec: DiscountSpec) => void;
  onClear: () => void;
  result: DiscountResult;
}) {
  const p = pendingValue(preset, custom);
  const ok = validValue(unit, p) && lines.length > 0;
  const changed = !!applied && (applied.mode !== mode || applied.unit !== unit || applied.value !== p);
  const presets = unit === 'percent' ? PERCENT_PRESETS : AMOUNT_PRESETS;

  const pickUnit = (u: DiscountUnit) => {
    if (u === unit) return;
    setUnit(u);
    setPreset(10);
    setCustom('');
  };

  return (
    <div className={`disc-box${applied && result.active ? ' on' : ''}`}>
      <div className="disc-head">
        <b>🏷️ İndirim uygula</b>
        {applied && result.active && !changed && <span className="disc-badge">Uygulandı</span>}
      </div>

      <div className="disc-modes" role="radiogroup" aria-label="İndirim türü">
        <button type="button" role="radio" aria-checked={mode === 'cart'} className={mode === 'cart' ? 'on' : ''} onClick={() => setMode('cart')}>
          <b>Tüm sepet tutarından</b>
          <small>Ara toplam üzerinden tek indirim</small>
        </button>
        <button type="button" role="radio" aria-checked={mode === 'items'} className={mode === 'items' ? 'on' : ''} onClick={() => setMode('items')}>
          <b>Her ürüne ayrı ayrı</b>
          <small>Her ürünün fiyatı tek tek düşer</small>
        </button>
      </div>

      <div className="disc-units" role="radiogroup" aria-label="İndirim birimi">
        <span className="small muted">İndirim şekli</span>
        <button type="button" role="radio" aria-checked={unit === 'percent'} className={unit === 'percent' ? 'on' : ''} onClick={() => pickUnit('percent')}>% Yüzde</button>
        <button type="button" role="radio" aria-checked={unit === 'amount'} className={unit === 'amount' ? 'on' : ''} onClick={() => pickUnit('amount')}>₺ Tutar</button>
      </div>

      <div className="disc-pcts">
        <span className="small muted">{unit === 'percent' ? 'Oran' : 'Tutar'}</span>
        {presets.map((v) => (
          <button key={v} type="button" className={preset === v ? 'on' : ''} onClick={() => setPreset(v)}>
            {unit === 'percent' ? `%${v}` : `${v} ₺`}
          </button>
        ))}
        <button type="button" className={preset === 'other' ? 'on' : ''} onClick={() => setPreset('other')}>Diğer</button>
        {preset === 'other' && (
          <label className="disc-other">
            <input
              inputMode="decimal"
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/[^0-9.,]/g, ''))}
              placeholder={unit === 'percent' ? 'Örn. 15' : 'Örn. 70'}
              aria-label={unit === 'percent' ? 'İndirim yüzdesi' : 'İndirim tutarı (TL)'}
              autoFocus
            />
            <span>{unit === 'percent' ? '%' : '₺'}</span>
          </label>
        )}
      </div>
      {preset === 'other' && custom.trim() !== '' && !validValue(unit, p) && (
        <p className="small disc-err">{unit === 'percent' ? "Oran 0'dan büyük, en fazla 100 olmalı." : "Tutar 0'dan büyük olmalı."}</p>
      )}
      {unit === 'amount' && mode === 'items' && (
        <p className="small muted disc-note" style={{ margin: 0 }}>Tutar, her ürünün <b>tanesinden</b> (birim fiyatından) düşer.</p>
      )}

      <div className="disc-actions">
        <button type="button" className="btn gold small" disabled={!ok} onClick={() => onApply({ mode, unit, value: p, excluded: applied?.excluded ?? [] })}>
          {applied ? 'İndirimi güncelle' : 'İndirimi uygula'}
        </button>
        {applied && <button type="button" className="btn ghost small" onClick={onClear}>İndirimi kaldır</button>}
      </div>

      {applied && result.active && (
        <div className="disc-result" aria-live="polite">
          <div><span>Önceki ara toplam</span><s>{tl(result.subtotal)}</s></div>
          <div className="neg"><span>{modeText(result)}</span><b>−{tl(result.discount)}</b></div>
          <div className="fin"><span>Yeni ara toplam</span><b>{tl(result.subtotalAfter)}</b></div>
        </div>
      )}
      {changed && <p className="small disc-hint">Seçim değişti — yeni değeri görmek için "İndirimi güncelle"ye basın.</p>}
      <p className="small muted disc-note">
        {applied ? 'İndirim yalnızca sepette görünür; sipariş "Mutfağa gönder" ile kaydedilince bu fiyatlar geçerli olur.' : 'Uygula\'ya basınca sonuç sepette görünür, sipariş hemen verilmez.'}
      </p>
    </div>
  );
}

/** Ürün satırının altında: önceki → yeni fiyat, tek tek indirim, "indirimden çıkar" */
export function LineDiscountNote({ line, unit, onToggle }: { line: DiscountedLine; unit: DiscountUnit; onToggle: () => void }) {
  const off = line.value === 0;
  return (
    <div className={`disc-sub${off ? ' off' : ''}`}>
      {off ? (
        <span>İndirim dışı · {tl(line.unit)} × {line.qty}</span>
      ) : (
        <span>
          <s>{tl(line.unit)}</s> → <b>{tl(line.unitAfter)}</b> × {line.qty} · {unit === 'percent' ? valueLabel(unit, line.value) : `${valueLabel(unit, line.value)}/adet`} · <em>−{tl(line.saved)}</em>
        </span>
      )}
      <button type="button" onClick={onToggle}>{off ? 'İndirime dahil et' : 'İndirimden çıkar'}</button>
    </div>
  );
}

/** Sepetin altı: indirimsiz ara toplam, indirim, indirimli ara toplam */
export function CartDiscountRows({ result }: { result: DiscountResult }) {
  if (!result.active) return null;
  return (
    <>
      <div className="qline disc-row"><span className="qname">Ara toplam (indirimsiz)</span><b className="qsum"><s>{tl(result.subtotal)}</s></b></div>
      <div className="qline disc-row neg">
        <span className="qname">🏷️ {result.mode === 'cart' ? modeText(result) : `Ürün indirimleri toplamı (${result.unit === 'percent' ? valueLabel(result.unit, result.value) : `adet başı ${valueLabel(result.unit, result.value)}`})`}</span>
        <b className="qsum">−{tl(result.discount)}</b>
      </div>
      <div className="qline disc-row"><span className="qname">İndirimli ara toplam</span><b className="qsum">{tl(result.subtotalAfter)}</b></div>
    </>
  );
}
