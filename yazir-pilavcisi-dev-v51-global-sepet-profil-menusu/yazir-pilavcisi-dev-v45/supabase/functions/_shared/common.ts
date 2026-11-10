// Ortak yardımcılar — tüm platform fonksiyonları kullanır.
// Her platform kendi fonksiyonunda çalışır; birinin hatası diğerlerini etkilemez.
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

/** service_role istemcisi (yalnızca sunucuda). */
export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
}

// Yeni Supabase anahtarları (sb_secret_...) JWT değildir; Authorization: Bearer olarak gönderilmemeli.
const dropNonJwtBearer: typeof fetch = (input, init) => {
  const h = new Headers(init?.headers);
  if ((h.get('Authorization') || '').startsWith('Bearer sb_')) h.delete('Authorization');
  return fetch(input, { ...init, headers: h });
};

/** Edge Function ortamındaki olası servis anahtarları (eski JWT + yeni secret anahtarlar). */
function serviceKeyCandidates(): { name: string; key: string }[] {
  const out: { name: string; key: string }[] = [];
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) out.push({ name: 'SUPABASE_SERVICE_ROLE_KEY', key: legacy });
  try {
    const parsed = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
    for (const [n, k] of Object.entries(parsed)) if (typeof k === 'string' && k) out.push({ name: `SUPABASE_SECRET_KEYS.${n}`, key: k });
  } catch { /* yoksay */ }
  return out;
}

/**
 * Çalışan bir service_role istemcisi bulur: her anahtarı integrations tablosunu okutarak dener.
 * Hiçbiri çalışmazsa gerçek nedeni (permission denied, Invalid API key...) `error` içinde döndürür —
 * böylece hata "kimlikler 000" gibi yanıltıcı bir mesaja dönüşmez.
 */
export async function resolveAdmin(): Promise<{ db: SupabaseClient; via: string; error?: string }> {
  const url = Deno.env.get('SUPABASE_URL')!;
  const errors: string[] = [];
  let first: SupabaseClient | null = null;
  for (const c of serviceKeyCandidates()) {
    const db = createClient(url, c.key, { auth: { persistSession: false }, global: { fetch: dropNonJwtBearer } });
    first ??= db;
    const { error } = await db.from('integrations').select('platform').limit(1);
    if (!error) return { db, via: c.name };
    errors.push(`${c.name}: ${error.message}`);
  }
  return {
    db: first ?? createClient(url, 'anahtar-yok', { auth: { persistSession: false } }),
    via: 'none',
    error: errors.join(' | ') || 'Edge Function ortamında servis anahtarı bulunamadı',
  };
}

/**
 * Çağıran yetkili mi? İki yol:
 *  1) Giriş yapmış kullanıcı + 'integrations.manage' yetkisi (yönetim paneli)
 *  2) x-cron-secret başlığı = CRON_SECRET (zamanlanmış çekim)
 */
export async function authorize(req: Request): Promise<{ ok: boolean; via?: 'user' | 'cron'; reason?: string; userClient?: SupabaseClient }> {
  const cron = Deno.env.get('CRON_SECRET');
  const sent = req.headers.get('x-cron-secret');
  if (cron && sent && sent === cron) return { ok: true, via: 'cron' };

  const auth = req.headers.get('Authorization');
  if (!auth) return { ok: false, reason: 'Oturum gerekli' };
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return { ok: false, reason: 'Oturum geçersiz' };
  const { data, error } = await userClient.rpc('has_permission', { p_key: 'integrations.manage' });
  if (error || data !== true) return { ok: false, reason: 'Entegrasyon yönetimi yetkiniz yok' };
  return { ok: true, via: 'user', userClient };
}

/**
 * Olay / hata kaydı. Kayıt başarısız olsa bile akışı bozmaz; ama nedeni artık YUTULMAZ:
 * function loglarına yazılır ve metin olarak döndürülür (null = başarılı).
 */
export async function logEvent(
  db: SupabaseClient, platform: string, direction: 'in' | 'out', eventType: string,
  opts: { ref?: string; payload?: unknown; error?: string; ms?: number } = {},
): Promise<string | null> {
  try {
    const { error } = await db.from('integration_events').insert({
      platform, direction, event_type: eventType, external_ref: opts.ref ?? null,
      payload: opts.payload === undefined ? null : truncate(opts.payload),
      status: opts.error ? 'error' : 'ok', error: opts.error ? opts.error.slice(0, 1500) : null,
      duration_ms: opts.ms ?? null,
    });
    if (error) { console.error('[logEvent]', error.message); return 'olay kaydı yazılamadı: ' + error.message; }
    return null;
  } catch (e) { console.error('[logEvent]', e); return 'olay kaydı yazılamadı: ' + msg(e); }
}

/** Platform durumunu günceller — yalnızca o platformun satırına dokunur. Hata metni döner (null = başarılı). */
export async function touchPlatform(
  db: SupabaseClient, platform: string, ok: boolean, err?: string, extra: Record<string, unknown> = {},
): Promise<string | null> {
  try {
    const { data: cur } = await db.from('integrations').select('error_count,status').eq('platform', platform).maybeSingle();
    const patch: Record<string, unknown> = { ...extra };
    if (ok) {
      patch.status = 'connected'; patch.last_error = null; patch.error_count = 0; patch.last_ok_at = new Date().toISOString();
    } else {
      patch.status = 'error'; patch.last_error = (err || 'Bilinmeyen hata').slice(0, 500);
      patch.error_count = ((cur as any)?.error_count ?? 0) + 1;
    }
    const { error } = await db.from('integrations').update(patch).eq('platform', platform);
    if (error) { console.error('[touchPlatform]', error.message); return 'durum güncellenemedi: ' + error.message; }
    return null;
  } catch (e) { console.error('[touchPlatform]', e); return 'durum güncellenemedi: ' + msg(e); }
}

function truncate(v: unknown) {
  try {
    const s = JSON.stringify(v);
    return s.length > 20000 ? { truncated: true, preview: s.slice(0, 20000) } : v;
  } catch { return null; }
}

export function msg(e: unknown) {
  if (e instanceof Error) return e.message;
  // Supabase/PostgREST hataları Error değil düz nesnedir → "[object Object]" yerine gerçek metni çıkar
  if (e && typeof e === 'object') {
    const x = e as Record<string, unknown>;
    const parts = [x.message, x.details, x.hint, x.code ? `(kod ${x.code})` : null].filter(Boolean).map(String);
    if (parts.length) return parts.join(' — ');
    try { return JSON.stringify(e).slice(0, 500); } catch { /* yoksay */ }
  }
  return String(e);
}
