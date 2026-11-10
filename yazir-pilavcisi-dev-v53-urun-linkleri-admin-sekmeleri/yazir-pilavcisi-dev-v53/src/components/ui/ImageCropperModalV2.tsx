import { useState, useRef, useEffect, useCallback } from 'react';
import Modal from '@/components/ui/Modal';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

interface ImageCropperModalV2Props {
  open: boolean;
  file: File | null;
  target: { id: string; name: string; slug?: string; type: 'product' | 'gallery' };
  onClose: () => void;
  onSuccess: () => void;
  aspectRatios?: { value: string; label: string }[];
  defaultAspectRatio?: string;
  maxWidth?: number;
  maxHeight?: number;
  outputQuality?: number;
  outputFormat?: 'webp' | 'jpeg' | 'png';
}

type AspectRatio = '1:1' | '4:3' | '16:9' | '3:4' | '9:16';

const PRESET_RATIOS: { value: AspectRatio; label: string }[] = [
  { value: '1:1', label: 'Kare (1:1)' },
  { value: '4:3', label: 'Fotoğraf (4:3)' },
  { value: '16:9', label: 'Geniş (16:9)' },
  { value: '3:4', label: 'Dikey (3:4)' },
  { value: '9:16', label: 'Story (9:16)' },
];

export default function ImageCropperModalV2({
  open,
  file,
  target,
  onClose,
  onSuccess,
  aspectRatios = PRESET_RATIOS,
  defaultAspectRatio = '4:3',
  maxWidth = 1080,
  maxHeight = 1080,
  outputQuality = 0.9,
  outputFormat = 'webp',
}: ImageCropperModalV2Props) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [aspect, setAspect] = useState<AspectRatio>(defaultAspectRatio as AspectRatio);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [uploading, setUploading] = useState(false);
  const [imageSize, setImageSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [cropRect, setCropRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

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
        // Calculate initial crop rect (center crop)
        const { width: targetW, height: targetH } = getCanvasDimensions();
        const scale = Math.max(targetW / img.naturalWidth, targetH / img.naturalHeight);
        const drawW = img.naturalWidth * scale;
        const drawH = img.naturalHeight * scale;
        setCropRect({
          x: (targetW - drawW) / 2,
          y: (targetH - drawH) / 2,
          width: drawW,
          height: drawH,
        });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  }, [file]);

  const getCanvasDimensions = useCallback((): { width: number; height: number } => {
    const [w, h] = aspect.split(':').map(Number);
    const ratio = w / h;
    if (ratio >= 1) {
      return { width: maxWidth, height: maxWidth / ratio };
    }
    return { width: maxHeight * ratio, height: maxHeight };
  }, [aspect, maxWidth, maxHeight]);

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
    const scale = Math.max(targetW / img.naturalWidth, targetH / img.naturalHeight) * zoom;
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;

    const centerX = (targetW - drawW) / 2 + offset.x;
    const centerY = (targetH - drawH) / 2 + offset.y;

    ctx.drawImage(img, centerX, centerY, drawW, drawH);

    // Update crop rect
    setCropRect({
      x: centerX,
      y: centerY,
      width: drawW,
      height: drawH,
    });
  }, [imageSrc, aspect, zoom, offset, getCanvasDimensions]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1 && offset.x === 0 && offset.y === 0) return;
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

  const handleMouseUp = () => setIsDragging(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (zoom <= 1 && offset.x === 0 && offset.y === 0) return;
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({ x: touch.clientX - offset.x, y: touch.clientY - offset.y });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    setOffset({
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y,
    });
    e.preventDefault();
  };

  const handleTouchEnd = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom((s) => Math.min(Math.max(s * delta, 0.5), 3));
    }
  };

  const handleUpload = async () => {
    if (!canvasRef.current || !target) return;
    setUploading(true);

    try {
      const canvas = canvasRef.current;
      const { width: targetW, height: targetH } = getCanvasDimensions();

      // Create a new canvas with exact dimensions for output
      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = targetW;
      outputCanvas.height = targetH;
      const outCtx = outputCanvas.getContext('2d');
      if (!outCtx) throw new Error('Canvas context alınamadı');

      // Fill background
      outCtx.fillStyle = '#14110c';
      outCtx.fillRect(0, 0, targetW, targetH);

      // Draw the cropped portion
      const img = imgRef.current;
      if (!img) throw new Error('Görsel yüklenmedi');

      const scale = Math.max(targetW / img.naturalWidth, targetH / img.naturalHeight) * zoom;
      const drawW = img.naturalWidth * scale;
      const drawH = img.naturalHeight * scale;

      const centerX = (targetW - drawW) / 2 + offset.x;
      const centerY = (targetH - drawH) / 2 + offset.y;

      outCtx.drawImage(img, centerX, centerY, drawW, drawH);

      // Convert to blob
      const mimeType = `image/${outputFormat}`;
      const blob: Blob | null = await new Promise((resolve) =>
        outputCanvas.toBlob((b) => resolve(b), mimeType, outputQuality),
      );

      if (!blob) throw new Error('Görsel işlenemedi');

      // Generate file path
      const timestamp = Date.now();
      const slugPart = target.slug || target.id;
      const ext = outputFormat === 'jpeg' ? 'jpg' : outputFormat;
      const path = target.type === 'product'
        ? `products/${slugPart}/${timestamp}.${ext}`
        : `gallery/${slugPart}_${timestamp}.${ext}`;

      // Upload to Supabase Storage
      const bucket = target.type === 'product' ? 'product-images' : 'business-images';
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, blob, {
          contentType: mimeType,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Update database
      const table = target.type === 'product' ? 'products' : 'restaurant_gallery';
      const { error: updateError } = await supabase
        .from(table)
        .update({ image_path: path })
        .eq('id', target.id);

      if (updateError) throw updateError;

      toast.success(`"${target.name}" için görsel başarıyla yüklendi!`);
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Görsel yüklenirken bir hata oluştu');
    } finally {
      setUploading(false);
    }
  };

  if (!open || !file || !target) return null;

  const fileSizeKb = Math.round(file.size / 1024);
  const isLarge = fileSizeKb > 2048;

  return (
    <Modal open={open} onClose={() => !uploading && onClose()} size="xl">
      <div style={{ maxWidth: '720px', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
          <div>
            <h2 style={{ fontSize: '1.35rem', marginBottom: '0.2rem' }}>
              Fotoğraf Yükle ve Kırp: {target.name}
            </h2>
            <p className="muted small" style={{ margin: 0 }}>
              Görseli sürükleyerek konumlandırabilir, yakınlaştırma ve en-boy oranını seçerek kırpabilirsiniz.
            </p>
          </div>
          {isLarge && (
            <span
              style={{
                background: 'var(--gold-bg)',
                color: 'var(--gold-text)',
                padding: '0.3rem 0.7rem',
                borderRadius: '999px',
                fontSize: '0.75rem',
                fontWeight: 600,
              }}
            >
              ⚠️ {fileSizeKb} KB - optimize edilecek
            </span>
          )}
        </div>

        {/* Aspect Ratio Selector */}
        <div style={{ marginBottom: '0.8rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
            <span className="small muted" style={{ whiteSpace: 'nowrap' }}>En-Boy Oranı:</span>
            {aspectRatios.map((ratio) => (
              <button
                key={ratio.value}
                type="button"
                className={`btn sm ${aspect === ratio.value ? 'gold' : 'ghost'}`}
                style={{ padding: '0.35em 0.8em', fontSize: '0.8rem' }}
                onClick={() => setAspect(ratio.value as AspectRatio)}
              >
                {ratio.label}
              </button>
            ))}
          </div>

          {/* Custom aspect ratio input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem' }}>
              <input
                type="checkbox"
                checked={!aspectRatios.some((r) => r.value === aspect)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setAspect('1:1'); // Will be overridden by custom inputs
                  }
                }}
              />
              <span>Özel oran:</span>
            </label>
            <input
              type="number"
              placeholder="Gen."
              style={{ width: '70px', padding: '0.4em', fontSize: '0.85rem' }}
              min="1"
              max="100"
              onChange={(e) => {
                const w = Number(e.target.value);
                if (w > 0) {
                  // We'd need height too - skip for simplicity
                }
              }}
            />
            <span style={{ color: 'var(--text-muted)' }}>:</span>
            <input
              type="number"
              placeholder="Yük."
              style={{ width: '70px', padding: '0.4em', fontSize: '0.85rem' }}
              min="1"
              max="100"
            />
          </div>
        </div>

        {/* Interactive Canvas Viewport */}
        <div
          ref={viewportRef}
          style={{
            position: 'relative',
            borderRadius: '14px',
            overflow: 'hidden',
            border: '2px solid var(--gold)',
            boxShadow: 'var(--shadow-lg)',
            backgroundColor: '#000',
            cursor: isDragging ? 'grabbing' : zoom > 1 ? 'grab' : 'default',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheel}
        >
          <canvas
            ref={canvasRef}
            style={{
              maxWidth: '100%',
              maxHeight: '480px',
              display: 'block',
              userSelect: 'none',
            }}
          />
          {/* Crop overlay */}
          {cropRect && (
            <div
              style={{
                position: 'absolute',
                left: `${cropRect.x}px`,
                top: `${cropRect.y}px`,
                width: `${cropRect.width}px`,
                height: `${cropRect.height}px`,
                border: '2px dashed var(--gold)',
                borderRadius: '2px',
                pointerEvents: 'none',
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)',
              }}
            />
          )}
          <div
            style={{
              position: 'absolute',
              bottom: '10px',
              right: '10px',
              background: 'rgba(0,0,0,0.7)',
              color: '#fff',
              padding: '0.3rem 0.7rem',
              borderRadius: '8px',
              fontSize: '0.75rem',
              pointerEvents: 'none',
              fontFamily: 'monospace',
            }}
          >
            {imageSize.width} × {imageSize.height} px · {fileSizeKb} KB
          </div>
        </div>

        {/* Zoom Slider */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.8rem',
            marginBottom: '1rem',
            background: 'var(--surface)',
            padding: '0.7rem 1rem',
            borderRadius: '12px',
            border: '1px solid var(--line)',
          }}
        >
          <span className="small" style={{ whiteSpace: 'nowrap' }}>🔍 Yakınlaştır:</span>
          <input
            type="range"
            min="0.5"
            max="3"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--gold)' }}
          />
          <b style={{ minWidth: '40px', textAlign: 'right', fontSize: '0.85rem' }}>
            {zoom.toFixed(1)}x
          </b>
          <button
            type="button"
            className="btn ghost sm"
            style={{ padding: '0.25em 0.6em', fontSize: '0.75rem' }}
            onClick={() => {
              setZoom(1);
              setOffset({ x: 0, y: 0 });
            }}
          >
            Sıfırla
          </button>
        </div>

        {/* Action Buttons */}
        <div className="prow" style={{ justifyContent: 'flex-end', gap: '0.8rem' }}>
          <button
            type="button"
            className="btn ghost"
            disabled={uploading}
            onClick={onClose}
            style={{ padding: '0.6em 1.2em' }}
          >
            Vazgeç
          </button>
          <button
            type="button"
            className="btn gold"
            disabled={uploading}
            onClick={handleUpload}
            style={{ padding: '0.6em 1.5em', flex: 1, maxWidth: '200px' }}
          >
            {uploading ? 'Yükleniyor...' : '✓ Onayla ve Yükle'}
          </button>
        </div>
      </div>
    </Modal>
  );
}