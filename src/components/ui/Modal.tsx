import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** 'wide' ≈ 760px, 'xl' ≈ 1100px (hızlı sipariş, yetki tabloları vb.) */
  size?: 'sm' | 'wide' | 'xl';
  className?: string;
}

export default function Modal({ open, onClose, children, size = 'sm', className = '' }: ModalProps) {
  const down = useRef(false);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal"
      // Pencere içinde başlayan sürükleme (ör. metin seçimi) dışarıda bitince pencere kapanmasın
      onMouseDown={(e) => {
        down.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (down.current && e.target === e.currentTarget) onClose();
        down.current = false;
      }}
    >
      <div className={`sheet${size !== 'sm' ? ' ' + size : ''} ${className}`} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );
}
