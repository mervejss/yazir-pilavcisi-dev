// Personel hesabı yönetimi (YALNIZCA işletme sahibi): oluştur · bilgi/e-posta/şifre güncelle
// Dağıtım: supabase functions deploy staff-admin --no-verify-jwt
//
// Neden Edge Function? Tarayıcıdan auth.signUp ile hesap açmak (1) "User already registered" hatasına,
// (2) e-posta onayı beklemeye ve (3) başkasının profilini güncelleyememeye (RLS 403) yol açıyordu.
// Burada service_role ile hesap doğrudan açılır, e-posta onaylı gelir, rol ve profil aynı adımda yazılır.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { CORS, json, msg, resolveAdmin } from '../_shared/common.ts';

const ROLES = ['owner', 'sub_admin', 'operator', 'courier'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function trText(m: string): string {
  const s = m.toLowerCase();
  if (s.includes('already been registered') || s.includes('already registered') || s.includes('email_exists')) {
    return 'Bu e-posta başka bir hesapta kayıtlı.';
  }
  if (s.includes('password') && (s.includes('at least') || s.includes('weak') || s.includes('short'))) {
    return 'Şifre çok zayıf veya kısa (en az 6 karakter).';
  }
  if (s.includes('invalid') && s.includes('email')) return 'E-posta adresi geçersiz.';
  return m;
}

async function findAuthUserByEmail(db: any, email: string): Promise<any | null> {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const hit = data.users.find((u: any) => (u.email || '').toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < 1000) break;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // 1) Çağıran kim?
    const auth = req.headers.get('Authorization');
    if (!auth) return json({ ok: false, error: 'Oturum gerekli' }, 401);
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ ok: false, error: 'Oturum geçersiz' }, 401);

    const adm = await resolveAdmin();
    if (adm.error) return json({ ok: false, error: 'Sunucu servis anahtarı okunamadı: ' + adm.error }, 500);
    const db = adm.db;

    const { data: me } = await db.from('profiles').select('role,is_active').eq('id', u.user.id).maybeSingle();
    if (!me || me.role !== 'owner' || !me.is_active) {
      return json({ ok: false, error: 'Bu işlem yalnızca işletme sahibine açıktır.' }, 403);
    }

    let body: any = {};
    try { body = await req.json(); } catch { /* boş gövde */ }
    const action: string = body.action || '';

    const fullName = String(body.full_name ?? '').trim();
    const phone = String(body.phone ?? '').trim() || null;
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');

    // ------------------------------------------------------------------ OLUŞTUR
    if (action === 'create') {
      const role = String(body.role ?? '');
      if (!fullName) return json({ ok: false, error: 'Ad soyad zorunlu.' }, 400);
      if (!EMAIL_RE.test(email)) return json({ ok: false, error: 'Geçerli bir e-posta girin.' }, 400);
      if (password.length < 6) return json({ ok: false, error: 'Şifre en az 6 karakter olmalı.' }, 400);
      if (!ROLES.includes(role)) return json({ ok: false, error: 'Geçersiz rol.' }, 400);

      // Bu e-posta zaten var mı? (önceki yarım kalmış denemeler "müşteri" olarak takılı kalmış olabilir)
      let existing: any = null;
      {
        const { data: p } = await db.from('profiles').select('id,role,is_active,full_name').eq('email', email).maybeSingle();
        if (p) existing = p;
        else existing = await findAuthUserByEmail(db, email).then((a) => (a ? { id: a.id, role: 'customer', is_active: true, full_name: '' } : null));
      }

      let userId: string;
      let adopted = false;

      if (existing) {
        if (ROLES.includes(existing.role) && existing.is_active) {
          return json({ ok: false, error: `Bu e-posta zaten aktif personel olarak kayıtlı${existing.full_name ? ' (' + existing.full_name + ')' : ''}. Bilgilerini listeden ✏️ Düzenle ile değiştirebilirsiniz.` }, 409);
        }
        const { error } = await db.auth.admin.updateUserById(existing.id, {
          password, email_confirm: true, user_metadata: { full_name: fullName, phone },
        });
        if (error) throw error;
        userId = existing.id;
        adopted = true;
      } else {
        const { data, error } = await db.auth.admin.createUser({
          email, password, email_confirm: true, user_metadata: { full_name: fullName, phone },
        });
        if (error) throw error;
        userId = data.user!.id;
      }

      // Profil: (tetikleyici müşteri olarak açmış olabilir) → ad, telefon, rol, aktif — service_role olduğu için koruma tetikleyicisine takılmaz
      const { error: pe } = await db.from('profiles').upsert(
        { id: userId, full_name: fullName, phone, email, role, is_active: true, created_by: u.user.id },
        { onConflict: 'id' },
      );
      if (pe) throw pe;
      await db.from('staff_permissions').delete().eq('user_id', userId); // temiz başla: rolün varsayılanı geçerli
      await db.from('customers').update({ full_name: fullName, phone }).eq('user_id', userId);

      return json({ ok: true, id: userId, adopted });
    }

    // ------------------------------------------------------------------ GÜNCELLE
    if (action === 'update') {
      const id = String(body.id ?? '');
      if (!id) return json({ ok: false, error: 'Kullanıcı kimliği eksik.' }, 400);
      if (!fullName) return json({ ok: false, error: 'Ad soyad boş olamaz.' }, 400);
      if (email && !EMAIL_RE.test(email)) return json({ ok: false, error: 'Geçerli bir e-posta girin.' }, 400);
      if (password && password.length < 6) return json({ ok: false, error: 'Yeni şifre en az 6 karakter olmalı.' }, 400);

      const { data: target } = await db.from('profiles').select('id,email').eq('id', id).maybeSingle();
      if (!target) return json({ ok: false, error: 'Kullanıcı bulunamadı.' }, 404);

      const authPatch: Record<string, unknown> = { user_metadata: { full_name: fullName, phone } };
      if (email && email !== (target.email || '').toLowerCase()) {
        const clash = await db.from('profiles').select('id').eq('email', email).neq('id', id).maybeSingle();
        if (clash.data) return json({ ok: false, error: 'Bu e-posta başka bir hesapta kayıtlı.' }, 409);
        authPatch.email = email;
        authPatch.email_confirm = true;
      }
      if (password) authPatch.password = password;

      const { error: ae } = await db.auth.admin.updateUserById(id, authPatch);
      if (ae) throw ae;

      // e-posta değişiminde tetikleyici profiles/customers.email'i de eşitler; yine de açıkça yaz
      const patch: Record<string, unknown> = { full_name: fullName, phone };
      if (authPatch.email) patch.email = email;
      const { error: pe } = await db.from('profiles').update(patch).eq('id', id);
      if (pe) throw pe;
      await db.from('customers').update(patch).eq('user_id', id);

      return json({ ok: true });
    }

    return json({ ok: false, error: 'Bilinmeyen işlem: ' + action }, 400);
  } catch (e) {
    console.error('[staff-admin]', e);
    return json({ ok: false, error: trText(msg(e)) }, 400);
  }
});
