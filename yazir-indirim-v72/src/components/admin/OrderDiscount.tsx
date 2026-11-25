import { tl } from '@/lib/helpers';
import { validPercent, type CartLineIn, type DiscountMode, type DiscountResult, type DiscountSpec, type DiscountedLine } from '@/lib/orderDiscount';
import '@/styles/order-discount.css';

export type Preset = 10 | 20 | 'other';

/** "Diğer" kutusundaki yazıyı yüzdeye çevirir (virgül / nokta) */
export const parsePercent = (s: string) => parseFloat(String(s).replace(',', '.'));
export const pendingPercent = (preset: Preset, custom: string) => (preset === 'other' ? parsePercent(custom) : preset);

const pct = (n: number) => `%${Number(n.toFixed(2)).toLocaleString('tr-TR')}`;

/** Sipariş özetinde, Notlar'ın altındaki "İndirim uygula" kutusu */
export function DiscountPanel({
  lines, mode, setMode, preset, setPreset, custom, setCustom, applied, onApply, onClear, result,
}: {
  lines: CartLineIn[];
  mode: DiscountMode; setMode: (m: DiscountMode) => void;
  preset: Preset; setPreset: (p: Preset) => void;
  custom: string; setCustom: (s: string) => void;
  applied: DiscountSpec | null;
  onApply: (spec: DiscountSpec) => void;
  onClear: () => void;
  result: DiscountResult;
}) {
  const p = pendingPercent(preset, custom);
  const ok = validPercent(p) && lines.length > 0;
  const changed = !!applied && (applied.mode !== mode || applied.percent !== p);

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

      <div className="disc-pcts">
        <span className="small muted">İndirim oranı</span>
        <button type="button" className={preset === 10 ? 'on' : ''} onClick={() => setPreset(10)}>%10</button>
        <button type="button" className={preset === 20 ? 'on' : ''} onClick={() => setPreset(20)}>%20</button>
        <button type="button" className={preset === 'other' ? 'on' : ''} onClick={() => setPreset('other')}>Diğer</button>
        {preset === 'other' && (
          <label className="disc-other">
            <input
              inputMode="decimal"
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/[^0-9.,]/g, ''))}
              placeholder="Örn. 15"
              aria-label="İndirim yüzdesi"
              autoFocus
            />
            <span>%</span>
          </label>
        )}
      </div>
      {preset === 'other' && custom.trim() !== '' && !validPercent(p) && (
        <p className="small disc-err">Oran 0'dan büyük, en fazla 100 olmalı.</p>
      )}

      <div className="disc-actions">
        <button type="button" className="btn gold small" disabled={!ok} onClick={() => onApply({ mode, percent: p, excluded: applied?.excluded ?? [] })}>
          {applied ? 'İndirimi güncelle' : 'İndirimi uygula'}
        </button>
        {applied && <button type="button" className="btn ghost small" onClick={onClear}>İndirimi kaldır</button>}
      </div>

      {applied && result.active && (
        <div className="disc-result" aria-live="polite">
          <div><span>Önceki ara toplam</span><s>{tl(result.subtotal)}</s></div>
          <div className="neg"><span>{result.mode === 'cart' ? `Sepet indirimi (${pct(result.percent)})` : `Ürün indirimleri (${pct(result.percent)})`}</span><b>−{tl(result.discount)}</b></div>
          <div className="fin"><span>Yeni ara toplam</span><b>{tl(result.subtotalAfter)}</b></div>
        </div>
      )}
      {changed && <p className="small disc-hint">Seçim değişti — yeni oranı görmek için "İndirimi güncelle"ye basın.</p>}
      <p className="small muted disc-note">
        {applied ? 'İndirim yalnızca sepette görünür; sipariş "Mutfağa gönder" ile kaydedilince bu fiyatlar geçerli olur.' : 'Uygula\'ya basınca sonuç sepette görünür, sipariş hemen verilmez.'}
      </p>
    </div>
  );
}

/** Ürün satırının altında: önceki → yeni fiyat, tek tek indirim, "indirimden çıkar" */
export function LineDiscountNote({ line, onToggle }: { line: DiscountedLine; onToggle: () => void }) {
  const off = line.percent === 0;
  return (
    <div className={`disc-sub${off ? ' off' : ''}`}>
      {off ? (
        <span>İndirim dışı · {tl(line.unit)} × {line.qty}</span>
      ) : (
        <span>
          <s>{tl(line.unit)}</s> → <b>{tl(line.unitAfter)}</b> × {line.qty} · {pct(line.percent)} · <em>−{tl(line.saved)}</em>
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
        <span className="qname">🏷️ {result.mode === 'cart' ? `Sepet indirimi (${pct(result.percent)})` : `Ürün indirimleri toplamı (${pct(result.percent)})`}</span>
        <b className="qsum">−{tl(result.discount)}</b>
      </div>
      <div className="qline disc-row"><span className="qname">İndirimli ara toplam</span><b className="qsum">{tl(result.subtotalAfter)}</b></div>
    </>
  );
}
