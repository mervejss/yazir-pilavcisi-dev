import { useState, useRef, useEffect, useCallback } from 'react';
import Modal from '@/components/ui/Modal';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface ImageCropperModalProps {
  open: boolean;
  file: File | null;
  product: { id: string; name: string; slug: string } | null;
  onClose: () => void;
  onSuccess: () => void;
}

type AspectRatio = '4:3' | '1:1' | '16:9';

export default function ImageCropperModal({
  open,
  file,
  product,
  onClose,
  onSuccess,
}: ImageCropperModalProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [aspect, setAspect] = useState<AspectRatio>('4:3');
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [uploading, setUploading] = useState(false);
  const [imageSize, setImageSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Load image when file changes
  useEffect(() => {
    if (!file) {
      setImageSrc(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      setImageSrc(src);

      const img = new Image();
      img.onload = () => {
        imgRef.current = img;
        setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
        setZoom(1);
        setOffset({ x: 0, y: 0 });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  }, [file]);

  const getCanvasDimensions = useCallback((): { width: number; height: number } => {
    if (aspect === '1:1') return { width: 400, height: 400 };
    if (aspect === '16:9') return { width: 480, height: 270 };
    return { width: 440, height: 330 }; // 4:3
  }, [aspect]);

  // Redraw canvas
  useEffect(() => {
    if (!imageSrc || !imgRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width: targetW, height: targetH } = getCanvasDimensions();
    canvas.width = targetW;
    canvas.height = targetH;

    ctx.clearRect(0, 0, targetW, targetH);
    ctx.fillStyle = '#14110c';
    ctx.fillRect(0, 0, targetW, targetH);

    const img = imgRef.current;
    // Calculate aspect fit
    const scale = Math.max(targetW / img.naturalWidth, targetH / img.naturalHeight) * zoom;
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;

    const centerX = (targetW - drawW) / 2 + offset.x;
    const centerY = (targetH - drawH) / 2 + offset.y;

    ctx.drawImage(img, centerX, centerY, drawW, drawH);
  }, [imageSrc, aspect, zoom, offset, getCanvasDimensions]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleUpload = async () => {
    if (!canvasRef.current || !product) return;
    setUploading(true);

    try {
      const canvas = canvasRef.current;

      // Convert canvas to blob
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/webp', 0.88),
      );

      if (!blob) throw new Error('Görsel işlenemedi');

      const path = `${product.slug}/${Date.now()}.webp`;

      // 1. Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(path, blob, {
          contentType: 'image/webp',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // 2. Update product in database
      const { error: updateError } = await supabase
        .from('products')
        .update({ image_path: path })
        .eq('id', product.id);

      if (updateError) throw updateError;

      toast.success(`"${product.name}" için görsel yüklendi!`);
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Görsel yüklenirken bir hata oluştu');
    } finally {
      setUploading(false);
    }
  };

  if (!open || !file || !product) return null;

  const fileSizeKb = Math.round(file.size / 1024);
  const isLarge = fileSizeKb > 2048;

  return (
    <Modal open={open} onClose={() => !uploading && onClose()}>
      <div style={{ maxWidth: '520px', width: '100%' }}>
        <h2 style={{ fontSize: '1.35rem', marginBottom: '0.4rem' }}>
          Fotoğraf Yükle ve Kırp: {product.name}
        </h2>
        <p className="muted small" style={{ margin: '0 0 1rem 0' }}>
          Görseli sürükleyerek konumlandırabilir, yakınlaştırma ve en boy oranını seçerek kırpabilirsiniz.
        </p>

        {isLarge && (
          <div
            style={{
              background: 'var(--gold-bg)',
              color: 'var(--gold-text)',
              padding: '0.6rem 0.9rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              marginBottom: '0.8rem',
              fontWeight: 600,
            }}
          >
            ⚠️ Seçilen dosya boyutu ({fileSizeKb} KB) biraz büyük. Yüklenirken otomatik olarak optimize edilecek.
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.8rem', alignItems: 'center' }}>
          <span className="small muted">Oran:</span>
          <button
            type="button"
            className={`btn sm ${aspect === '4:3' ? 'gold' : 'ghost'}`}
            style={{ padding: '0.3em 0.8em', fontSize: '0.8rem' }}
            onClick={() => setAspect('4:3')}
          >
            4:3 (Önerilen)
          </button>
          <button
            type="button"
            className={`btn sm ${aspect === '1:1' ? 'gold' : 'ghost'}`}
            style={{ padding: '0.3em 0.8em', fontSize: '0.8rem' }}
            onClick={() => setAspect('1:1')}
          >
            1:1 (Kare)
          </button>
          <button
            type="button"
            className={`btn sm ${aspect === '16:9' ? 'gold' : 'ghost'}`}
            style={{ padding: '0.3em 0.8em', fontSize: '0.8rem' }}
            onClick={() => setAspect('16:9')}
          >
            16:9 (Geniş)
          </button>
        </div>

        {/* Interactive Canvas Viewport */}
        <div
          style={{
            position: 'relative',
            borderRadius: '12px',
            overflow: 'hidden',
            border: '2px solid var(--gold)',
            boxShadow: 'var(--shadow)',
            backgroundColor: '#000',
            cursor: isDragging ? 'grabbing' : 'grab',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <canvas
            ref={canvasRef}
            style={{
              maxWidth: '100%',
              maxHeight: '340px',
              display: 'block',
              userSelect: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: '8px',
              right: '8px',
              background: 'rgba(0,0,0,0.65)',
              color: '#fff',
              padding: '0.2rem 0.5rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              pointerEvents: 'none',
            }}
          >
            {imageSize.width} × {imageSize.height} px ({fileSizeKb} KB)
          </div>
        </div>

        {/* Zoom Slider */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.8rem',
            margin: '1rem 0',
            background: 'var(--surface)',
            padding: '0.6rem 0.9rem',
            borderRadius: '10px',
          }}
        >
          <span className="small">🔍 Yakınlaştır:</span>
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--gold)' }}
          />
          <b style={{ minWidth: '35px', textAlign: 'right', fontSize: '0.85rem' }}>
            {zoom.toFixed(1)}x
          </b>
          <button
            type="button"
            className="btn ghost sm"
            style={{ padding: '0.2em 0.5em', fontSize: '0.75rem' }}
            onClick={() => {
              setZoom(1);
              setOffset({ x: 0, y: 0 });
            }}
          >
            Sıfırla
          </button>
        </div>

        {/* Buttons */}
        <div className="prow" style={{ marginTop: '1.2rem' }}>
          <button
            type="button"
            className="btn gold"
            disabled={uploading}
            onClick={handleUpload}
            style={{ flex: 1 }}
          >
            {uploading ? 'Yükleniyor...' : '✓ Onayla ve Yükle'}
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={uploading}
            onClick={onClose}
          >
            Vazgeç
          </button>
        </div>
      </div>
    </Modal>
  );
}
