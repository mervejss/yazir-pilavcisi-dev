import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { downloadFromUrl } from '@/lib/imageTools';

export interface LightboxItem {
  url: string;
  title: string;
  subtitle?: string;
  /** Küçük resim şeridi için (yoksa url kullanılır) */
  thumb?: string;
  filename?: string;
}

export interface LightboxAction {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  primary?: boolean;
  onClick: (index: number) => void;
}

interface Props {
  open: boolean;
  items: LightboxItem[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  actions?: LightboxAction[];
  showDownload?: boolean;
  /** Sağ üstte görünen ek bilgi (ör. "Yayında") */
  badge?: ReactNode;
}

/**
 * Tam ekran görsel görüntüleyici: yakınlaştır/uzaklaştır, sürükle, çift tıkla büyüt,
 * ok tuşlarıyla gezin, indir ve özel eylemler (düzenle, sil...).
 */
export default function Lightbox({ open, items, index, onIndexChange, onClose, actions = [], showDownload = true, badge }: Props) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const item = items[index];

  const reset = useCallback(() => {
    setScale(1);
    setPos({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    reset();
    setNatural(null);
    setLoaded(false);
  }, [item?.url, reset]);

  const go = useCallback(
    (d: number) => {
      if (items.length < 2) return;
      onIndexChange((index + d + items.length) % items.length);
    },
    [index, items.length, onIndexChange],
  );

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === '+' || e.key === '=') setScale((s) => Math.min(6, s * 1.25));
      else if (e.key === '-') setScale((s) => Math.max(0.5, s / 1.25));
      else if (e.key === '0') reset();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [open, go, onClose, reset]);

  useEffect(() => {
    const el = stageRef.current;
    if (!open || !el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setScale((s) => Math.min(6, Math.max(0.5, +(s * (e.deltaY > 0 ? 0.9 : 1.1)).toFixed(3))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [open, item?.url]);

  useEffect(() => {
    if (scale <= 1) setPos({ x: 0, y: 0 });
  }, [scale]);

  if (!open || !item) return null;

  return (
    <div className="lb" role="dialog" aria-modal="true" aria-label={item.title}>
      <div className="lb-top">
        <div className="lb-title">
          <b>{item.title}</b>
          {item.subtitle && <span>{item.subtitle}</span>}
        </div>
        <div className="lb-actions">
          {badge}
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              className={`lb-btn${a.danger ? ' danger' : ''}${a.primary ? ' primary' : ''}`}
              onClick={() => a.onClick(index)}
            >
              {a.icon} {a.label}
            </button>
          ))}
          {showDownload && (
            <button type="button" className="lb-btn" onClick={() => downloadFromUrl(item.url, item.filename || 'gorsel.webp')}>
              ⬇ İndir
            </button>
          )}
          <button type="button" className="lb-close" onClick={onClose} aria-label="Kapat (Esc)">
            ✕
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        className="lb-stage"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        onDoubleClick={() => (scale > 1 ? reset() : setScale(2.5))}
        onPointerDown={(e) => {
          if (scale <= 1) return;
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setPos({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y });
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        style={{ cursor: scale > 1 ? 'grab' : 'zoom-in' }}
      >
        {!loaded && <div className="lb-loading">Yükleniyor…</div>}
        <img
          src={item.url}
          alt={item.title}
          draggable={false}
          onLoad={(e) => {
            setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
            setLoaded(true);
          }}
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            opacity: loaded ? 1 : 0,
            transition: drag.current ? 'none' : 'transform 0.12s ease-out',
          }}
        />
        {items.length > 1 && (
          <>
            <button type="button" className="lb-nav prev" onClick={() => go(-1)} aria-label="Önceki">
              ‹
            </button>
            <button type="button" className="lb-nav next" onClick={() => go(1)} aria-label="Sonraki">
              ›
            </button>
          </>
        )}
      </div>

      <div className="lb-bottom">
        <div className="lb-zoom">
          <button type="button" onClick={() => setScale((s) => Math.max(0.5, s / 1.25))} aria-label="Uzaklaştır">
            −
          </button>
          <input type="range" min={0.5} max={6} step={0.05} value={scale} onChange={(e) => setScale(Number(e.target.value))} aria-label="Yakınlaştırma" />
          <button type="button" onClick={() => setScale((s) => Math.min(6, s * 1.25))} aria-label="Yakınlaştır">
            +
          </button>
          <span>{Math.round(scale * 100)}%</span>
          <button type="button" className="txt" onClick={reset}>
            Sığdır
          </button>
        </div>
        {natural && (
          <div className="lb-meta">
            {natural.w} × {natural.h} px{items.length > 1 ? ` · ${index + 1} / ${items.length}` : ''}
          </div>
        )}
        {items.length > 1 && (
          <div className="lb-strip">
            {items.map((it, i) => (
              <button key={it.url + i} type="button" className={i === index ? 'on' : ''} onClick={() => onIndexChange(i)} aria-label={it.title}>
                <img src={it.thumb || it.url} alt="" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
