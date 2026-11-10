import { useState, useRef, useEffect, useCallback } from 'react';
import Modal from '@/components/ui/Modal';

interface ImageViewerModalProps {
  open: boolean;
  onClose: () => void;
  imageUrl: string;
  alt: string;
  title?: string;
  subtitle?: string;
  onEdit?: () => void;
  onDownload?: () => void;
  onDelete?: () => void;
  showActions?: boolean;
  loading?: boolean;
}

export default function ImageViewerModal({
  open,
  onClose,
  imageUrl,
  alt,
  title,
  subtitle,
  onEdit,
  onDownload,
  onDelete,
  showActions = true,
  loading = false,
}: ImageViewerModalProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset transform when image changes
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setImageLoaded(false);
  }, [imageUrl]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') handleZoomIn();
      if (e.key === '-') handleZoomOut();
      if (e.key === '0') resetView();
      if (e.key === 'ArrowLeft') pan(-50, 0);
      if (e.key === 'ArrowRight') pan(50, 0);
      if (e.key === 'ArrowUp') pan(0, -50);
      if (e.key === 'ArrowDown') pan(0, 50);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const handleImageLoad = () => {
    if (imgRef.current) {
      setNaturalSize({
        width: imgRef.current.naturalWidth,
        height: imgRef.current.naturalHeight,
      });
    }
    setImageLoaded(true);
  };

  const handleZoomIn = () => setScale((s) => Math.min(s * 1.2, 5));
  const handleZoomOut = () => setScale((s) => Math.max(s / 1.2, 0.2));
  const resetView = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const pan = (dx: number, dy: number) => {
    setPosition((p) => ({ x: p.x + dx / scale, y: p.y + dy / scale }));
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Zoom with Ctrl+wheel
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setScale((s) => Math.min(Math.max(s * delta, 0.2), 5));
    } else {
      // Pan with wheel
      pan(-e.deltaX, -e.deltaY);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    e.preventDefault();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (scale <= 1) return;
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({ x: touch.clientX - position.x, y: touch.clientY - position.y });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    setPosition({ x: touch.clientX - dragStart.x, y: touch.clientY - dragStart.y });
    e.preventDefault();
  };

  const handleTouchEnd = () => setIsDragging(false);

  const handleDoubleClick = () => {
    if (scale > 1) {
      resetView();
    } else {
      setScale(2);
    }
  };

  const downloadImage = () => {
    if (onDownload) {
      onDownload();
    } else {
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = alt || 'image';
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} size="xl">
      <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.8rem 1rem',
            borderBottom: '1px solid var(--line)',
            background: 'var(--card-bg)',
            borderRadius: '14px 14px 0 0',
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            {title && (
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {title}
              </h2>
            )}
            {subtitle && (
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {subtitle}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {showActions && onEdit && (
              <button
                type="button"
                className="btn ghost sm"
                onClick={onEdit}
                disabled={loading}
                title="Düzenle"
                style={{ padding: '0.4em 0.7em' }}
              >
                ✏️ Düzenle
              </button>
            )}
            {showActions && onDownload && (
              <button
                type="button"
                className="btn ghost sm"
                onClick={downloadImage}
                disabled={loading}
                title="İndir"
                style={{ padding: '0.4em 0.7em' }}
              >
                ⬇️ İndir
              </button>
            )}
            {showActions && onDelete && (
              <button
                type="button"
                className="btn ghost sm"
                onClick={onDelete}
                disabled={loading}
                title="Sil"
                style={{ padding: '0.4em 0.7em', color: 'var(--danger)' }}
              >
                🗑️ Sil
              </button>
            )}
            <button
              type="button"
              className="icon-circle"
              onClick={onClose}
              disabled={loading}
              title="Kapat (Esc)"
              style={{ width: '36px', height: '36px' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Image Viewport */}
        <div
          ref={containerRef}
          style={{
            flex: 1,
            overflow: 'hidden',
            background: '#000',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '300px',
            maxHeight: '70vh',
            cursor: scale > 1 ? 'grab' : 'default',
          }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onDoubleClick={handleDoubleClick}
        >
          {!imageLoaded && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', padding: '2rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.8rem' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    border: '3px solid rgba(255,255,255,0.3)',
                    borderTopColor: 'var(--gold)',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }}
                />
                <span style={{ fontSize: '0.9rem' }}>Yükleniyor...</span>
              </div>
            </div>
          )}
          <img
            ref={imgRef}
            src={imageUrl}
            alt={alt}
            onLoad={handleImageLoad}
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transformOrigin: 'center center',
              transition: 'transform 0.1s ease-out',
              maxWidth: 'none',
              maxHeight: 'none',
              userSelect: 'none',
              pointerEvents: 'none',
              opacity: imageLoaded ? 1 : 0,
            }}
          />
          {imageLoaded && naturalSize.width > 0 && (
            <div
              style={{
                position: 'absolute',
                bottom: '12px',
                right: '12px',
                background: 'rgba(0,0,0,0.7)',
                color: '#fff',
                padding: '0.4rem 0.8rem',
                borderRadius: '8px',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '0.8rem',
              }}
            >
              <span>{naturalSize.width} × {naturalSize.height} px</span>
              <span>{Math.round(scale * 100)}%</span>
            </div>
          )}
        </div>

        {/* Zoom Controls */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            padding: '0.8rem 1rem',
            background: 'var(--card-bg)',
            borderTop: '1px solid var(--line)',
            borderRadius: '0 0 14px 14px',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            className="btn ghost sm"
            onClick={handleZoomOut}
            disabled={scale <= 0.2 || loading}
            title="Uzaklaştır (-)"
            style={{ padding: '0.4em 0.8em' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <input
            type="range"
            min="0.2"
            max="5"
            step="0.05"
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            style={{ flex: 1, maxWidth: '200px', accentColor: 'var(--gold)' }}
            aria-label="Zoom seviyesi"
          />
          <span style={{ minWidth: '50px', textAlign: 'right', fontSize: '0.85rem', fontWeight: 600, fontFamily: 'monospace' }}>
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            className="btn ghost sm"
            onClick={handleZoomIn}
            disabled={scale >= 5 || loading}
            title="Yakınlaştır (+)"
            style={{ padding: '0.4em 0.8em' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <button
            type="button"
            className="btn ghost sm"
            onClick={resetView}
            disabled={scale === 1 && position.x === 0 && position.y === 0 || loading}
            title="Sıfırla (0)"
            style={{ padding: '0.4em 0.8em' }}
          >
            ⟲
          </button>
        </div>

        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </Modal>
  );
}