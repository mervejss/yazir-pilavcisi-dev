import { useEffect, useRef, type ReactNode } from 'react';

interface ConfirmationModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  loading?: boolean;
  children?: ReactNode;
}

const iconMap = {
  danger: '⚠️',
  warning: '❓',
  info: 'ℹ️',
};

export default function ConfirmationModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Evet, Sil',
  cancelLabel = 'Vazgeç',
  variant = 'danger',
  loading = false,
  children,
}: ConfirmationModalProps) {
  const down = useRef(false);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter' && !loading) onConfirm();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, onConfirm, loading]);

  if (!open) return null;

  const variantStyles: Record<string, { bg: string; border: string; iconBg: string; iconColor: string }> = {
    danger: {
      bg: 'var(--danger-bg)',
      border: 'var(--danger)',
      iconBg: 'var(--danger)',
      iconColor: '#fff',
    },
    warning: {
      bg: 'var(--gold-bg)',
      border: 'var(--gold)',
      iconBg: 'var(--gold)',
      iconColor: '#14110c',
    },
    info: {
      bg: 'var(--surface)',
      border: 'var(--line-strong)',
      iconBg: 'var(--gold)',
      iconColor: '#14110c',
    },
  };

  const style = variantStyles[variant];

  return (
    <div
      className="modal"
      onMouseDown={(e) => {
        down.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (down.current && e.target === e.currentTarget) onClose();
        down.current = false;
      }}
    >
      <div className="sheet" style={{ maxWidth: '440px', borderColor: style.border }} role="dialog" aria-modal="true">
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '1rem',
            marginBottom: '1rem',
            padding: '0.5rem',
            background: style.bg,
            borderRadius: '12px',
            border: `1px solid ${style.border}`,
          }}
        >
          <div
            style={{
              display: 'grid',
              placeItems: 'center',
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: style.iconBg,
              color: style.iconColor,
              fontSize: '1.5rem',
              flexShrink: 0,
            }}
            role="img"
            aria-hidden="true"
          >
            {iconMap[variant]}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: '0.2rem 0 0.4rem', fontSize: '1.25rem', fontWeight: 800 }}>{title}</h2>
            <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.5 }}>{message}</p>
            {children && <div style={{ marginTop: '0.8rem' }}>{children}</div>}
          </div>
        </div>

        <div className="prow" style={{ justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button
            type="button"
            className="btn ghost"
            onClick={onClose}
            disabled={loading}
            style={{ padding: '0.6em 1.2em' }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${variant === 'danger' ? 'danger' : 'gold'}`}
            onClick={onConfirm}
            disabled={loading}
            style={{ padding: '0.6em 1.2em' }}
          >
            {loading ? 'İşleniyor...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}