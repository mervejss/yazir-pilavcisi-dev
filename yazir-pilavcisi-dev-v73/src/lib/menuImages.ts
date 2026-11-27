import { supabase, getPublicUrl } from '@/lib/supabase';

export const PRODUCT_BUCKET = 'product-images';
export const GALLERY_BUCKET = 'business-images';

export function productImageUrl(path?: string | null): string | null {
  if (!path) return null;
  return path.startsWith('http') ? path : getPublicUrl(PRODUCT_BUCKET, path);
}

export function galleryImageUrl(path?: string | null): string {
  if (!path) return '';
  return path.startsWith('http') ? path : getPublicUrl(GALLERY_BUCKET, path);
}

export async function uploadToBucket(bucket: string, path: string, blob: Blob, contentType: string) {
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType, upsert: true, cacheControl: '31536000' });
  if (error) throw error;
  return path;
}

/** Depodan dosya siler; hata verirse sessizce yoksayar (eski dosya zaten yoksa sorun değil) */
export async function removeFromBucket(bucket: string, path?: string | null) {
  if (!path || path.startsWith('http')) return;
  try {
    await supabase.storage.from(bucket).remove([path]);
  } catch {
    /* yoksay */
  }
}

/** Depo içinde dosyayı kopyalar (çoğaltma için). Başarısızsa null döner. */
export async function copyInBucket(bucket: string, from: string, to: string): Promise<string | null> {
  const { error } = await supabase.storage.from(bucket).copy(from, to);
  return error ? null : to;
}
