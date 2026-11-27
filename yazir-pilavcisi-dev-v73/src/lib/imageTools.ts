/** Menü / galeri yönetimi için görsel yardımcıları */

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function randId(n = 5): string {
  return Math.random().toString(36).slice(2, 2 + n);
}

export function formatBytes(bytes?: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function loadImage(src: string, cors = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Görsel yüklenemedi'));
    img.src = src;
  });
}

/** Uzaktaki görseli blob olarak indirir (CORS açık olmalı; Supabase public bucket açıktır) */
export async function urlToBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { mode: 'cors', cache: 'no-store' });
  if (!res.ok) throw new Error('Görsel indirilemedi');
  return res.blob();
}

export async function downloadFromUrl(url: string, filename: string) {
  try {
    const blob = await urlToBlob(url);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch {
    window.open(url, '_blank', 'noreferrer');
  }
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

/**
 * Otomatik ortadan kırpma + küçültme (toplu yükleme için).
 * ratio = null → oranı koru, sadece küçült.
 */
export async function autoCropToBlob(
  file: Blob,
  ratio: number | null,
  maxW = 1600,
  quality = 0.88,
): Promise<{ blob: Blob; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const r = ratio || iw / ih;
    let cw = iw;
    let ch = iw / r;
    if (ch > ih) {
      ch = ih;
      cw = ih * r;
    }
    const sx = (iw - cw) / 2;
    const sy = (ih - ch) / 2;
    const outW = Math.min(maxW, Math.round(cw));
    const outH = Math.round(outW / r);
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas desteklenmiyor');
    ctx.drawImage(img, sx, sy, cw, ch, 0, 0, outW, outH);
    const blob = await canvasToBlob(canvas, 'image/webp', quality);
    if (!blob) throw new Error('Görsel işlenemedi');
    return { blob, width: outW, height: outH };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const RATIO_VALUE: Record<string, number> = {
  '1:1': 1,
  '4:3': 4 / 3,
  '16:9': 16 / 9,
  '3:4': 3 / 4,
  '9:16': 9 / 16,
};
