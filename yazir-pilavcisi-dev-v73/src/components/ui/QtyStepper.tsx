import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';

/**
 * Adet seçici: − [yazılabilir sayı] +  ve altında hızlı artır/azalt düğmeleri (−50 −25 −10 −5 +5 +10 +25 +50 +100).
 *  - Eksi düğmeleri adedi en az 1'e kadar düşürür (satırı silmez); silmek için "−" kullanılır.
 *  - Sayıya dokunup doğrudan yazılabilir (ör. 66 midye); Enter veya başka yere dokununca uygulanır.
 *  - Geçersiz / boş / 0 girilirse eski değer korunur (yanlışlıkla satır silinmez); satırı silmek için "−" (1'de) kullanılır.
 *  - onChange(0) → çağıran satırı kaldırır ("−" ile 1'den 0'a inince).
 */
export const QTY_MAX = 9999;
export const DEFAULT_CHIPS = [-50, -25, -10, -5, 5, 10, 25, 50, 100];
/** Dar alanlar (müşteri sepeti) için kısa liste */
export const SHORT_CHIPS = [-10, -5, 5, 10];

export default function QtyStepper({
  value, onChange, chips = DEFAULT_CHIPS, max = QTY_MAX, size = 'md', ariaLabel = 'Adet',
}: {
  value: number;
  onChange: (next: number) => void;
  chips?: number[] | false;
  max?: number;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  // Dışarıdan değer değişirse (düğmelerle) yazma taslağını bırak
  useEffect(() => { setDraft(null); }, [value]);

  const commit = () => {
    if (draft === null) return;
    const n = parseInt(draft.replace(/\D/g, ''), 10);
    setDraft(null);
    if (!Number.isFinite(n) || n < 1) return; // eski değer kalır
    const next = Math.min(n, max);
    if (next !== value) onChange(next);
  };

  return (
    <div className={`qstep qstep-${size}`}>
      <div className="qty">
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} aria-label="Azalt"><Icon name="minus" size={14} /></button>
        <input
          className="qstep-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label={ariaLabel}
          value={draft ?? String(value)}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 4))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); (e.currentTarget as HTMLInputElement).blur(); }
            if (e.key === 'Escape') { setDraft(null); (e.currentTarget as HTMLInputElement).blur(); }
          }}
        />
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} aria-label="Artır"><Icon name="plus" size={14} /></button>
      </div>
      {chips && chips.length > 0 && (
        <div className="qstep-chips">
          {chips.map((c) => {
            const next = c < 0 ? Math.max(1, value + c) : Math.min(max, value + c);
            return (
              <button key={c} type="button" className={c < 0 ? 'neg' : 'pos'} disabled={next === value}
                onClick={() => onChange(next)} aria-label={c < 0 ? `${-c} adet çıkar` : `${c} adet ekle`}>
                {c < 0 ? `−${-c}` : `+${c}`}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
