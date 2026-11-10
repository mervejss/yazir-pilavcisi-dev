import { useRef, useState } from 'react';

interface StarsProps {
  /** 0–5 arası; yarım değerler (4.5) desteklenir */
  rating: number;
  size?: number;
  className?: string;
}

/** Salt okunur yıldız göstergesi (yarım yıldız dahil). Eski kullanımlarla uyumludur. */
export default function Stars({ rating, size, className = '' }: StarsProps) {
  const r = Math.max(0, Math.min(5, Number(rating) || 0));
  return (
    <span className={`stars rv-stars ${className}`} style={size ? { fontSize: size } : undefined} role="img" aria-label={`5 üzerinden ${r} yıldız`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, r - i));
        return (
          <span key={i} className="rv-star">
            <span className="bg">★</span>
            <span className="fg" style={{ width: `${fill * 100}%` }}>★</span>
          </span>
        );
      })}
    </span>
  );
}

export function ratingWord(v: number): string {
  if (v <= 0) return 'Puan verin';
  if (v < 2) return 'Çok kötü';
  if (v < 3) return 'Kötü';
  if (v < 4) return 'İdare eder';
  if (v < 4.5) return 'İyi';
  if (v < 5) return 'Çok iyi';
  return 'Mükemmel!';
}

interface InputProps {
  value: number;
  onChange: (v: number) => void;
  label: string;
  hint?: string;
  icon?: string;
  disabled?: boolean;
}

/**
 * Tıklanabilir yıldız girişi. Yıldızın SOL yarısı x,5 — SAĞ yarısı tam puan verir.
 * Klavye: ← → ile 0,5 adım.
 */
export function StarRatingInput({ value, onChange, label, hint, icon, disabled }: InputProps) {
  const [hover, setHover] = useState<number | null>(null);
  const [pop, setPop] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const shown = hover ?? value;

  const set = (v: number) => {
    if (disabled) return;
    onChange(v);
    setPop((p) => p + 1);
  };

  return (
    <div className="rv-input">
      <div className="rv-input-head">
        <div>
          <b>
            {icon && <span className="rv-input-ico">{icon}</span>} {label}
          </b>
          {hint && <small>{hint}</small>}
        </div>
        <span className={`rv-input-val${value > 0 ? ' on' : ''}`} key={pop}>
          {value > 0 ? value.toFixed(1) : '–'} <em>{ratingWord(shown)}</em>
        </span>
      </div>
      <div
        ref={ref}
        className="rv-input-stars"
        role="slider"
        tabIndex={0}
        aria-label={`${label} puanı`}
        aria-valuemin={0}
        aria-valuemax={5}
        aria-valuenow={value}
        onMouseLeave={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            set(Math.min(5, (value || 0) + 0.5));
          } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            set(Math.max(0.5, (value || 1) - 0.5));
          }
        }}
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const fill = Math.max(0, Math.min(1, shown - (n - 1)));
          return (
            <span key={n} className={`rv-input-star${pop && value >= n - 0.5 && value > n - 1 ? ' pop' : ''}`}>
              <span className="bg">★</span>
              <span className="fg" style={{ width: `${fill * 100}%` }}>★</span>
              <button type="button" className="half l" aria-label={`${n - 0.5} yıldız`} disabled={disabled} onMouseEnter={() => setHover(n - 0.5)} onClick={() => set(n - 0.5)} />
              <button type="button" className="half r" aria-label={`${n} yıldız`} disabled={disabled} onMouseEnter={() => setHover(n)} onClick={() => set(n)} />
            </span>
          );
        })}
      </div>
    </div>
  );
}
