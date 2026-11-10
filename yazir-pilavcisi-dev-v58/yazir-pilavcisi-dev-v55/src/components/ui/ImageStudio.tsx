import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Modal from '@/components/ui/Modal';
import { canvasToBlob, formatBytes, loadImage, RATIO_VALUE, urlToBlob } from '@/lib/imageTools';
import toast from 'react-hot-toast';

export type AspectKey = '1:1' | '4:3' | '16:9' | '3:4' | '9:16' | 'orig';

const ASPECT_LABEL: Record<AspectKey, string> = {
  '1:1': 'Kare 1:1',
  '4:3': 'Klasik 4:3',
  '16:9': 'Geniş 16:9',
  '3:4': 'Dikey 3:4',
  '9:16': 'Story 9:16',
  orig: 'Orijinal oran',
};

export interface StudioResult {
  width: number;
  height: number;
  size: number;
  ext: 'webp' | 'jpeg';
  contentType: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Düzenlenecek kaynak: yeni seçilmiş dosya ya da mevcut görsel adresi */
  source: { file?: Blob | null; url?: string | null } | null;
  title: string;
  defaultAspect?: AspectKey;
  aspects?: AspectKey[];
  defaultMaxWidth?: number;
  saveLabel?: string;
  onSave: (blob: Blob, info: StudioResult) => Promise<void> | void;
}

const BOX_W = 540;
const BOX_H = 420;

/**
 * Görsel Stüdyosu — kırpma, yakınlaştırma, döndürme, çevirme, parlaklık/kontrast/doygunluk,
 * çıktı boyutu ve kalite ayarı. Hem yeni dosyalar hem de mevcut yüklü görseller için çalışır.
 */
export default function ImageStudio({
  open,
  onClose,
  source,
  title,
  defaultAspect = '4:3',
  aspects = ['4:3', '1:1', '16:9', '3:4', '9:16', 'orig'],
  defaultMaxWidth = 1200,
  saveLabel = 'Kaydet',
  onSave,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [origBytes, setOrigBytes] = useState<number | null>(null);
  const [loadErr, setLoadErr] = useState('');

  const [aspect, setAspect] = useState<AspectKey>(defaultAspect);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [rot, setRot] = useState(0); // 0..3 (×90°)
  const [flip, setFlip] = useState(false);
  const [bright, setBright] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [sat, setSat] = useState(100);
  const [maxW, setMaxW] = useState(defaultMaxWidth);
  const [quality, setQuality] = useState(0.88);
  const [format, setFormat] = useState<'webp' | 'jpeg'>('webp');
  const [saving, setSaving] = useState(false);
  const [estimate, setEstimate] = useState<number | null>(null);

  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  /* ---------- Kaynağı yükle ---------- */
  useEffect(() => {
    if (!open || !source) return;
    let revoked = false;
    let objUrl = '';
    setImg(null);
    setLoadErr('');
    setEstimate(null);
    setAspect(defaultAspect);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setRot(0);
    setFlip(false);
    setBright(100);
    setContrast(100);
    setSat(100);
    setMaxW(defaultMaxWidth);
    (async () => {
      try {
        let blob: Blob;
        if (source.file) blob = source.file;
        else if (source.url) blob = await urlToBlob(source.url);
        else throw new Error('Kaynak yok');
        objUrl = URL.createObjectURL(blob);
        const image = await loadImage(objUrl);
        if (revoked) return;
        setOrigBytes(blob.size);
        setImg(image);
      } catch (e: any) {
        if (!revoked) setLoadErr(e?.message || 'Görsel açılamadı');
      }
    })();
    return () => {
      revoked = true;
      if (objUrl) setTimeout(() => URL.revokeObjectURL(objUrl), 3000);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, source]);

  /* ---------- Geometri ---------- */
  const geom = useMemo(() => {
    if (!img) return null;
    const rotated = rot % 2 === 1;
    const iw = rotated ? img.naturalHeight : img.naturalWidth;
    const ih = rotated ? img.naturalWidth : img.naturalHeight;
    const ratio = aspect === 'orig' ? iw / ih : RATIO_VALUE[aspect];
    const pw = Math.min(BOX_W, BOX_H * ratio);
    const ph = pw / ratio;
    const baseP = Math.max(pw / iw, ph / ih) * zoom; // önizlemede ölçek
    return { iw, ih, ratio, pw, ph, baseP };
  }, [img, rot, aspect, zoom]);

  const clamp = useCallback(
    (o: { x: number; y: number }) => {
      if (!geom) return o;
      const maxX = Math.max(0, (geom.iw * geom.baseP - geom.pw) / 2);
      const maxY = Math.max(0, (geom.ih * geom.baseP - geom.ph) / 2);
      return { x: Math.min(maxX, Math.max(-maxX, o.x)), y: Math.min(maxY, Math.max(-maxY, o.y)) };
    },
    [geom],
  );

  // Oran/zoom/döndürme değişince kaydırmayı sınırda tut
  useEffect(() => {
    setOffset((o) => clamp(o));
  }, [clamp]);

  /* ---------- Çizim ---------- */
  const draw = useCallback(
    (canvas: HTMLCanvasElement, W: number, H: number) => {
      if (!img || !geom) return;
      const k = W / geom.pw;
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2 + offset.x * k, H / 2 + offset.y * k);
      ctx.rotate((rot * Math.PI) / 2);
      if (flip) ctx.scale(-1, 1);
      (ctx as any).filter = `brightness(${bright}%) contrast(${contrast}%) saturate(${sat}%)`;
      const dw = img.naturalWidth * geom.baseP * k;
      const dh = img.naturalHeight * geom.baseP * k;
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    },
    [img, geom, offset, rot, flip, bright, contrast, sat],
  );

  // Çıktı boyutu (büyütme yok)
  const output = useMemo(() => {
    if (!geom) return null;
    const srcW = Math.floor(geom.pw / geom.baseP);
    const w = Math.max(16, Math.min(maxW, srcW));
    return { w, h: Math.max(16, Math.round(w / geom.ratio)) };
  }, [geom, maxW]);

  useEffect(() => {
    if (!canvasRef.current || !geom) return;
    draw(canvasRef.current, Math.round(geom.pw), Math.round(geom.ph));
  }, [draw, geom]);

  // Tahmini dosya boyutu (gecikmeli)
  useEffect(() => {
    if (!geom || !output) return;
    const t = setTimeout(async () => {
      const c = document.createElement('canvas');
      draw(c, output.w, output.h);
      const b = await canvasToBlob(c, format === 'webp' ? 'image/webp' : 'image/jpeg', quality);
      setEstimate(b ? b.size : null);
    }, 350);
    return () => clearTimeout(t);
  }, [draw, geom, output, format, quality]);

  /* ---------- Etkileşim ---------- */
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setOffset(clamp({ x: drag.current.ox + e.clientX - drag.current.x, y: drag.current.oy + e.clientY - drag.current.y }));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  // Fare tekerleği ile yakınlaştırma (sayfa kaymasın diye pasif olmayan dinleyici)
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.min(4, Math.max(1, +(z * (e.deltaY > 0 ? 0.92 : 1.08)).toFixed(3))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [img]);

  const resetAll = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setRot(0);
    setFlip(false);
    setBright(100);
    setContrast(100);
    setSat(100);
  };

  /* ---------- Kaydet ---------- */
  const handleSave = async () => {
    if (!geom || !output) return;
    setSaving(true);
    try {
      const c = document.createElement('canvas');
      draw(c, output.w, output.h);
      const type = format === 'webp' ? 'image/webp' : 'image/jpeg';
      const blob = await canvasToBlob(c, type, quality);
      if (!blob) throw new Error('Görsel işlenemedi');
      await onSave(blob, { width: output.w, height: output.h, size: blob.size, ext: format, contentType: type });
    } catch (e: any) {
      toast.error(e?.message || 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  if (!open || !source) return null;

  const dirty = zoom !== 1 || rot !== 0 || flip || bright !== 100 || contrast !== 100 || sat !== 100;

  return (
    <Modal open={open} onClose={() => !saving && onClose()} size="xl" className="studio-sheet">
      <div className="st-head">
        <div>
          <h2>🎨 Görsel Stüdyosu</h2>
          <p className="muted small">{title}</p>
        </div>
        <button type="button" className="icon-circle" onClick={onClose} disabled={saving} aria-label="Kapat">
          ✕
        </button>
      </div>

      {loadErr ? (
        <div className="st-error">
          <b>Görsel açılamadı.</b>
          <p className="muted small">{loadErr}. Dosya bozuk olabilir ya da depolama alanı görseli düzenlemeye izin vermiyor (CORS).</p>
        </div>
      ) : !img || !geom || !output ? (
        <div className="st-loading">Görsel yükleniyor…</div>
      ) : (
        <div className="st-grid">
          {/* Sahne */}
          <div className="st-stage">
            <div className="st-canvas-wrap" style={{ width: geom.pw, height: geom.ph }}>
              <canvas
                ref={canvasRef}
                style={{ width: geom.pw, height: geom.ph, touchAction: 'none', cursor: 'grab' }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
              <div className="st-guides" aria-hidden="true" />
            </div>
            <div className="st-tools">
              <button type="button" className="btn ghost sm" onClick={() => setRot((r) => (r + 3) % 4)} title="Sola döndür">
                ↺ Sola
              </button>
              <button type="button" className="btn ghost sm" onClick={() => setRot((r) => (r + 1) % 4)} title="Sağa döndür">
                ↻ Sağa
              </button>
              <button type="button" className={`btn ghost sm${flip ? ' active' : ''}`} onClick={() => setFlip((f) => !f)} title="Yatay çevir">
                ⇋ Çevir
              </button>
              <button type="button" className="btn ghost sm" onClick={resetAll} disabled={!dirty}>
                ⟲ Sıfırla
              </button>
            </div>
            <p className="muted small st-hint">Görseli sürükleyerek konumlandırın · fare tekerleği veya kaydırıcıyla yakınlaştırın</p>
          </div>

          {/* Ayarlar */}
          <div className="st-panel">
            <section>
              <h4>En-boy oranı</h4>
              <div className="seg">
                {aspects.map((a) => (
                  <button type="button" key={a} className={aspect === a ? 'on' : ''} onClick={() => setAspect(a)}>
                    {ASPECT_LABEL[a]}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h4>Yakınlaştırma <b>{Math.round(zoom * 100)}%</b></h4>
              <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
            </section>

            <section>
              <h4>Renk ayarları</h4>
              <label className="st-slider">
                <span>Parlaklık</span>
                <input type="range" min={50} max={150} value={bright} onChange={(e) => setBright(Number(e.target.value))} />
                <b>{bright}</b>
              </label>
              <label className="st-slider">
                <span>Kontrast</span>
                <input type="range" min={50} max={150} value={contrast} onChange={(e) => setContrast(Number(e.target.value))} />
                <b>{contrast}</b>
              </label>
              <label className="st-slider">
                <span>Doygunluk</span>
                <input type="range" min={0} max={200} value={sat} onChange={(e) => setSat(Number(e.target.value))} />
                <b>{sat}</b>
              </label>
            </section>

            <section>
              <h4>Çıktı</h4>
              <div className="two-col">
                <label className="fld">
                  Maksimum genişlik
                  <select value={maxW} onChange={(e) => setMaxW(Number(e.target.value))}>
                    <option value={640}>640 px (küçük)</option>
                    <option value={800}>800 px</option>
                    <option value={1200}>1200 px (önerilen)</option>
                    <option value={1600}>1600 px</option>
                    <option value={2000}>2000 px (yüksek)</option>
                  </select>
                </label>
                <label className="fld">
                  Biçim
                  <select value={format} onChange={(e) => setFormat(e.target.value as any)}>
                    <option value="webp">WebP (küçük dosya)</option>
                    <option value="jpeg">JPEG (uyumlu)</option>
                  </select>
                </label>
              </div>
              <label className="st-slider">
                <span>Kalite</span>
                <input type="range" min={0.5} max={1} step={0.01} value={quality} onChange={(e) => setQuality(Number(e.target.value))} />
                <b>{Math.round(quality * 100)}%</b>
              </label>
            </section>

            <section className="st-info">
              <div>
                <small>Orijinal</small>
                <b>{img.naturalWidth} × {img.naturalHeight}</b>
                <span>{formatBytes(origBytes)}</span>
              </div>
              <div className="arrow">→</div>
              <div>
                <small>Sonuç</small>
                <b>{output.w} × {output.h}</b>
                <span>{estimate != null ? '≈ ' + formatBytes(estimate) : '…'}</span>
              </div>
            </section>

            <div className="st-actions">
              <button type="button" className="btn ghost" onClick={onClose} disabled={saving}>
                Vazgeç
              </button>
              <button type="button" className="btn gold" onClick={handleSave} disabled={saving}>
                {saving ? 'Kaydediliyor…' : saveLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
