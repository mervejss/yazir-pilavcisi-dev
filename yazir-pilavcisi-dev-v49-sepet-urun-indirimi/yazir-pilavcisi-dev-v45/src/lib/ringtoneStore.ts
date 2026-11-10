import { supabase } from '@/lib/supabase';

/** Kişiye özel zil sesi: tarayıcıda (IndexedDB) saklanır, ayrıca hesaba yedeklenir (başka cihazda da çalsın) */
const DB = 'yz-ringtones';
const STORE = 'tones';
export const MAX_RINGTONE_BYTES = 1.5 * 1024 * 1024;

interface Tone { blob: Blob; name: string }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key: string): Promise<Tone | null> {
  try {
    const db = await open();
    return await new Promise((res) => {
      const r = db.transaction(STORE).objectStore(STORE).get(key);
      r.onsuccess = () => res((r.result as Tone) || null);
      r.onerror = () => res(null);
    });
  } catch {
    return null;
  }
}
async function idbPut(key: string, v: Tone): Promise<void> {
  const db = await open();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(v, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function idbDel(key: string): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((res) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    });
  } catch {
    /* yoksay */
  }
}

const urlCache = new Map<string, string>();

/** Çalmaya hazır ses adresi (yoksa null) */
export async function getToneUrl(key: string): Promise<string | null> {
  const hit = urlCache.get(key);
  if (hit) return hit;
  const t = await idbGet(key);
  if (!t) return null;
  const u = URL.createObjectURL(t.blob);
  urlCache.set(key, u);
  return u;
}

export async function getToneName(key: string): Promise<string | null> {
  return (await idbGet(key))?.name || null;
}

const toB64 = (buf: ArrayBuffer) => {
  let s = '';
  const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (b64: string, mime: string) => {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
};

/** Dosyayı kaydet (cihaza + hesaba). Hesaba yedekleme başarısız olsa da cihazda çalışır. */
export async function saveTone(key: string, userId: string | undefined, file: File): Promise<{ cloud: boolean }> {
  if (!file.type.startsWith('audio/')) throw new Error('Lütfen bir ses dosyası seçin (mp3, m4a, wav, ogg…)');
  if (file.size > MAX_RINGTONE_BYTES) throw new Error('Dosya en fazla 1,5 MB olabilir. Daha kısa bir zil sesi seçin.');
  await idbPut(key, { blob: file, name: file.name });
  const old = urlCache.get(key);
  if (old) URL.revokeObjectURL(old);
  urlCache.delete(key);
  let cloud = false;
  if (userId) {
    const data = toB64(await file.arrayBuffer());
    const { error } = await supabase.from('user_ringtones').upsert({ user_id: userId, name: file.name, mime: file.type, data, updated_at: new Date().toISOString() } as any);
    cloud = !error;
  }
  return { cloud };
}

export async function removeTone(key: string, userId: string | undefined): Promise<void> {
  await idbDel(key);
  const old = urlCache.get(key);
  if (old) URL.revokeObjectURL(old);
  urlCache.delete(key);
  if (userId) await supabase.from('user_ringtones').delete().eq('user_id', userId);
}

/** Bu cihazda yoksa hesaptan indirip cihaza yazar. Dönen değer: ad (yoksa null) */
export async function syncToneFromAccount(key: string, userId: string): Promise<string | null> {
  const local = await idbGet(key);
  if (local) return local.name;
  const { data, error } = await supabase.from('user_ringtones').select('name,mime,data').eq('user_id', userId).maybeSingle();
  if (error || !data) return null;
  await idbPut(key, { blob: fromB64((data as any).data, (data as any).mime), name: (data as any).name });
  return (data as any).name as string;
}
