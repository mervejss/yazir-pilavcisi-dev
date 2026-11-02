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

/**
 * Çağıran yetkili mi? İki yol:
 *  1) Giriş yapmış kullanıcı + 'integrations.manage' yetkisi (yönetim paneli)
 *  2) x-cron-secret başlığı = CRON_SECRET (zamanlanmış çekim)
 */
export async function authorize(req: Request): Promise<{ ok: boolean; via?: 'user' | 'cron'; reason?: string }> {
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
  return { ok: true, via: 'user' };
}

/** Olay / hata kaydı. Kayıt başarısız olsa bile akışı bozmaz. */
export async function logEvent(
  db: SupabaseClient, platform: string, direction: 'in' | 'out', eventType: string,
  opts: { ref?: string; payload?: unknown; error?: string; ms?: number } = {},
) {
  try {
    await db.from('integration_events').insert({
      platform, direction, event_type: eventType, external_ref: opts.ref ?? null,
      payload: opts.payload === undefined ? null : truncate(opts.payload),
      status: opts.error ? 'error' : 'ok', error: opts.error ? opts.error.slice(0, 1500) : null,
      duration_ms: opts.ms ?? null,
    });
  } catch (_) { /* yoksay */ }
}

/** Platform durumunu günceller — yalnızca o platformun satırına dokunur. */
export async function touchPlatform(
  db: SupabaseClient, platform: string, ok: boolean, err?: string, extra: Record<string, unknown> = {},
) {
  try {
    const { data: cur } = await db.from('integrations').select('error_count,status').eq('platform', platform).single();
    const patch: Record<string, unknown> = { ...extra };
    if (ok) {
      patch.status = 'connected'; patch.last_error = null; patch.error_count = 0; patch.last_ok_at = new Date().toISOString();
    } else {
      patch.status = 'error'; patch.last_error = (err || 'Bilinmeyen hata').slice(0, 500);
      patch.error_count = ((cur as any)?.error_count ?? 0) + 1;
    }
    await db.from('integrations').update(patch).eq('platform', platform);
  } catch (_) { /* yoksay */ }
}

function truncate(v: unknown) {
  try {
    const s = JSON.stringify(v);
    return s.length > 20000 ? { truncated: true, preview: s.slice(0, 20000) } : v;
  } catch { return null; }
}

export function msg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
