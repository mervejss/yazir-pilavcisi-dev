import { useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Kurye çevrimdışı işlem kuyruğu.
 * Teslim / yola çıkış / ödeme yöntemi / not / ayrı ödeme kayıtları internet yokken KAYBOLMAZ:
 *  - Bağlantı yoksa (veya istek ağ hatasıyla düşerse) işlem tarayıcıda (localStorage) sıraya alınır.
 *  - Bağlantı gelince, uygulama açılınca, sekme öne gelince ve 15 sn'de bir SIRAYLA (FIFO) gönderilir.
 *  - Kuyrukta bekleyen varsa yeni işlemler de arkasına eklenir → aynı sipariş için sıra bozulmaz (önce ödeme, sonra teslim).
 *  - dedupeKey aynı olan bekleyen işlem yenisiyle DEĞİŞTİRİLİR (ör. ayrı ödeme listesi her seferinde tamamı yazılır).
 *  - Sunucu iş kuralı hatası verirse (ör. "zaten teslim edilmiş") işlem kuyruktan atılır ve kullanıcıya bildirilir.
 */
export interface QueuedOp {
  id: string;
  rpc: string;
  args: Record<string, unknown>;
  label: string;
  orderId?: string;
  dedupeKey?: string;
  createdAt: number;
  tries: number;
}

const KEY = 'yz_courier_queue_v1';
const read = (): QueuedOp[] => {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(a) ? a : [];
  } catch { return []; }
};

let ops: QueuedOp[] = typeof localStorage !== 'undefined' ? read() : [];
const listeners = new Set<() => void>();
const commit = (next: QueuedOp[]) => {
  ops = next;
  try { localStorage.setItem(KEY, JSON.stringify(ops)); } catch { /* özel mod / dolu */ }
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** Bekleyen işlemler (React'te canlı) */
export const useQueuedOps = () => useSyncExternalStore(subscribe, () => ops, () => ops);

/** Ağ/bağlantı kaynaklı hata mı? (sunucu bir PostgREST/DB kodu döndürdüyse ağ hatası DEĞİLDİR) */
export const isNetworkError = (e: { message?: string; code?: string } | null | undefined) =>
  !!e && !e.code && /fetch|network|load failed|timeout|timed out|abort|connection|offline/i.test(e.message || '');

const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export type RunResult = { ok: true; queued: false; data: any } | { ok: true; queued: true } | { ok: false; error: string };

/** RPC'yi çalıştırır; bağlantı yoksa kuyruğa alır. ok:true+queued:true → "kaydedildi, bağlantı gelince gönderilecek" */
export async function runOrQueue(
  rpc: string,
  args: Record<string, unknown>,
  opts: { label: string; orderId?: string; dedupeKey?: string },
): Promise<RunResult> {
  if (ops.length === 0 && online()) {
    const { data, error } = await supabase.rpc(rpc, args as any);
    if (!error) return { ok: true, queued: false, data };
    if (!isNetworkError(error)) return { ok: false, error: error.message };
  }
  const op: QueuedOp = { id: uid(), rpc, args, label: opts.label, orderId: opts.orderId, dedupeKey: opts.dedupeKey, createdAt: Date.now(), tries: 0 };
  const i = opts.dedupeKey ? ops.findIndex((o) => o.dedupeKey === opts.dedupeKey) : -1;
  if (i >= 0) { const next = ops.slice(); next[i] = op; commit(next); } else commit([...ops, op]);
  void flushQueue();
  return { ok: true, queued: true };
}

let flushing = false;
export interface FlushResult { sent: number; dropped: string[] }

export async function flushQueue(): Promise<FlushResult> {
  const res: FlushResult = { sent: 0, dropped: [] };
  if (flushing) return res;
  flushing = true;
  try {
    while (ops.length > 0 && online()) {
      const op = ops[0];
      const { error } = await supabase.rpc(op.rpc, op.args as any);
      if (!error) { commit(ops.filter((o) => o.id !== op.id)); res.sent++; continue; }
      if (isNetworkError(error)) break; // bağlantı yine yok: sırayı bozmadan dur
      if (/jwt|token|unauthor|not authenticated/i.test(error.message) && op.tries < 20) {
        commit(ops.map((o) => (o.id === op.id ? { ...o, tries: o.tries + 1 } : o)));
        break; // oturum yenilenince tekrar denenir
      }
      commit(ops.filter((o) => o.id !== op.id)); // iş kuralı hatası → bu işlem uygulanamaz
      res.dropped.push(`${op.label}: ${error.message}`);
    }
  } finally {
    flushing = false;
  }
  return res;
}

/** Uygulama açıkken kuyruğu düzenli boşaltır. onFlush: bir şey gönderilince / atılınca çağrılır. Dönen fonksiyon temizler. */
export function startOfflineQueue(onFlush?: (r: FlushResult) => void): () => void {
  const run = async () => {
    if (ops.length === 0) return;
    const r = await flushQueue();
    if ((r.sent > 0 || r.dropped.length > 0) && onFlush) onFlush(r);
  };
  const onVis = () => { if (document.visibilityState === 'visible') void run(); };
  window.addEventListener('online', run);
  document.addEventListener('visibilitychange', onVis);
  const t = window.setInterval(run, 15_000);
  void run();
  return () => {
    window.removeEventListener('online', run);
    document.removeEventListener('visibilitychange', onVis);
    window.clearInterval(t);
  };
}
