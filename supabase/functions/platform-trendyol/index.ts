// Trendyol Go (Uber Eats geçişi dahil) — Yemek entegrasyonu
// Dağıtım:  supabase functions deploy platform-trendyol
// Gizliler: supabase secrets set TRENDYOL_API_KEY=... TRENDYOL_API_SECRET=... CRON_SECRET=...
//
// v28: durum senkronu düzeltildi (kurye şartsız, atlayan geçişler, tüm sayfalar, kayıp sipariş raporu).
// DOĞRULANDI (canlıda 200): packages, restaurant_info. Diğerleri HENÜZ DOĞRULANMADI (tahmin).
// ÖNEMLİ: Aşağıdaki ENDPOINTS haritası, TGO geliştirici dokümanındaki uç nokta yollarına göre
// canlıya almadan önce DOĞRULANMALIDIR. Yollar tek yerde toplandığı için düzeltmek tek satırdır;
// ayrıca integrations.config.endpoints ile ezilebilir.
import { authorize, CORS, json, logEvent, msg, resolveAdmin, touchPlatform } from '../_shared/common.ts';
import { mapPackage, mapStatus } from '../_shared/trendyolOrders.ts';
import { financePaymentOrders, financeProbe, financeSync, makeFinCtx } from './finance.ts';

const PLATFORM = 'trendyol';
const BASES: Record<string, string> = {
  prod: 'https://api.tgoapis.com',
  stage: 'https://stageapi.tgoapis.com',
};

// Doğrulanmış uç noktalar: config.endpoints ile EZİLEMEZ (eski/yanlış kayıtlar zarar vermesin)
const LOCKED_EP = ['packages', 'restaurant_info', 'accept', 'prepared', 'shipped', 'delivered', 'cancel', 'invoiced'];

type Ctx = { supplierId: string; storeId: string; base: string; auth: string; ua: string; ep: Record<string, string>; cfg: any; row?: any };
// Sağlıklı sessiz çekimlerde 'integrations' satırı en çok bu sıklıkla yazılır (egress/Realtime tasarrufu)
const HEARTBEAT_MS = 10 * 60_000;

// {s}=supplierId  {st}=storeId  {p}=packageId  {id}=ürün/kategori id
const ENDPOINTS: Record<string, string> = {
  packages:        'GET  /integrator/order/meal/suppliers/{s}/packages',
  accept:          'PUT  /integrator/order/meal/suppliers/{s}/packages/picked',            // gövde: {packageId, preparationTime}
  prepared:        'PUT  /integrator/order/meal/suppliers/{s}/packages/invoiced',          // gövde: {packageId}
  shipped:         'PUT  /integrator/order/meal/suppliers/{s}/packages/{p}/manual-shipped',
  delivered:       'PUT  /integrator/order/meal/suppliers/{s}/packages/{p}/manual-delivered',
  cancel:          'PUT  /integrator/order/meal/suppliers/{s}/packages/unsupplied',        // gövde: {packageId, ...} (alanlar doğrulanacak)
  invoiced:        'PUT  /integrator/order/meal/suppliers/{s}/packages/invoiced',
  restaurant_info: 'GET  /integrator/store/meal/suppliers/{s}/stores/{st}',
  working_hours:   'PUT  /integrator/store/meal/suppliers/{s}/stores/{st}/working-hours',
  working_status:  'PUT  /integrator/store/meal/suppliers/{s}/stores/{st}/status',
  delivery_time:   'PUT  /integrator/store/meal/suppliers/{s}/stores/{st}/delivery-time',
  menus:           'GET  /integrator/product/meal/suppliers/{s}/stores/{st}/menus',
  product_status:  'PUT  /integrator/product/meal/suppliers/{s}/stores/{st}/products/{id}/status',
  product_price:   'PUT  /integrator/product/meal/suppliers/{s}/stores/{st}/products/{id}/price',
  category_status: 'PUT  /integrator/product/meal/suppliers/{s}/stores/{st}/categories/{id}/status',
  reviews:         'GET  /integrator/review/meal/suppliers/{s}/stores/{st}/reviews',
};

// Platform durumu → bizim durum, paket eşleme: ../_shared/trendyolOrders.ts
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const az = await authorize(req);
  if (!az.ok) return json({ ok: false, error: az.reason }, 401);

  // Çalışan service_role istemcisini bul (eski JWT anahtar → yeni secret anahtar sırasıyla dener).
  const adm = await resolveAdmin();
  const db = adm.db;
  let body: any = {};
  try { body = await req.json(); } catch { /* boş gövde */ }
  const action: string = body.action || 'status';

  try {
    // Ayar satırını oku. Hata YUTULMAZ: eskiden okuma başarısız olunca cfg = {} kalıyor ve
    // kullanıcıya "kimlikler 000" deniyordu; gerçek neden (izin/anahtar) hiç görünmüyordu.
    let row: any = null;
    let dbError: string | null = adm.error ? `service_role erişimi yok → ${adm.error}` : null;
    if (!adm.error) {
      const r = await db.from('integrations').select('*').eq('platform', PLATFORM).maybeSingle();
      if (r.error) dbError = `integrations okunamadı (${adm.via}): ${r.error.message}`;
      else if (!r.data) dbError = 'integrations tablosunda "trendyol" satırı yok (sql/11_platform_integrations.sql çalıştırıldı mı?)';
      else row = r.data;
    }
    // Yedek yol: panelden gelen çağrıda kullanıcının kendi oturumuyla (RLS: integrations.manage) oku.
    if (!row && az.via === 'user' && az.userClient) {
      const r = await az.userClient.from('integrations').select('*').eq('platform', PLATFORM).maybeSingle();
      if (!r.error && r.data) row = r.data;
      else if (r.error) dbError = (dbError ? dbError + ' | ' : '') + 'kullanıcı oturumuyla da okunamadı: ' + r.error.message;
    }
    const cfg = row?.config || {};

    if (action === 'status') return json({ ok: true, ...(await statusInfo(cfg, row)), db_via: adm.via, db_error: row && !adm.error ? null : dbError });
    if (!row) throw new Error('Entegrasyon ayarları okunamadı — ' + (dbError || 'bilinmeyen neden'));

    if (!(row as any)?.is_enabled && az.via === 'cron') return json({ ok: true, skipped: 'Entegrasyon kapalı' });

    const ctx = makeCtx(cfg);
    ctx.row = row;
    const t0 = Date.now();
    let result: any;

    switch (action) {
      case 'peek_packages':   result = await peekPackages(ctx); break;
      case 'probe_actions':   result = await probeActions(ctx, db, body); break;
      case 'diagnose':        result = await diagnose(ctx, db, body); break;
      case 'test_connection': result = await testConnection(ctx, db); break;
      case 'sync_orders':     result = await syncOrders(ctx, db); break;
      case 'order_status':    result = await pushOrderStatus(ctx, db, body); break;
      // tek paketi kabul eder
      case 'accept_package':  result = await call(ctx, 'accept', { p: String(body.package_id) }, { packageId: String(body.package_id), preparationTime: Number(ctx.cfg.default_prep_minutes ?? 30) }); break;
      case 'push_invoice':    result = await pushInvoice(ctx, body); break;
      case 'restaurant_info': result = await call(ctx, 'restaurant_info'); break;
      case 'set_working_status': result = await call(ctx, 'working_status', {}, { status: body.open ? 'OPEN' : 'CLOSED' }); break;
      case 'set_delivery_time':  result = await call(ctx, 'delivery_time', {}, { minTime: body.min, maxTime: body.max }); break;
      case 'push_working_hours': result = await pushWorkingHours(ctx, db); break;
      case 'sync_menu':       result = await syncMenu(ctx, db); break;
      case 'product_availability': result = await call(ctx, 'product_status', { id: body.external_id }, { status: body.available ? 'AVAILABLE' : 'UNAVAILABLE' }); break;
      case 'product_price':   result = await call(ctx, 'product_price', { id: body.external_id }, { price: Number(body.price) }); break;
      case 'reviews':         result = await reviews(ctx); break;
      case 'category_availability': result = await call(ctx, 'category_status', { id: body.external_id }, { status: body.available ? 'AVAILABLE' : 'UNAVAILABLE' }); break;
      case 'push_availability': result = await pushAvailability(ctx, db); break;
      case 'package_status':  result = await packageStatus(ctx, db, body); break;
      // v32: Muhasebe & Finans (Cari Hesap Ekstresi) — bkz. finance.ts
      case 'finance_probe':          result = await financeProbe(makeFinCtx(cfg, ctx.auth, ctx.supplierId)); break;
      case 'finance_sync':           result = await financeSync(makeFinCtx(cfg, ctx.auth, ctx.supplierId), db, body); break;
      case 'finance_payment_orders': result = await financePaymentOrders(makeFinCtx(cfg, ctx.auth, ctx.supplierId), db); break;
      default: return json({ ok: false, error: 'Bilinmeyen işlem: ' + action }, 400);
    }

    // Değişiklik yoksa (yeni sipariş / durum güncellemesi / hata yok) olay kaydı YAZILMAZ — panelden (user) tetiklenen çekimler de dahil
    const quiet = action === 'sync_orders' && !result?.created && !result?.status_updated && !result?.failed && !result?.amended && !result?.truncated;
    const w1 = quiet ? null : await logEvent(db, PLATFORM, action === 'sync_orders' ? 'in' : 'out', action, { ms: Date.now() - t0, payload: summarize(result) });
    // Sağlıklı (connected, hatasız) ve son başarı kaydı 10 dk'dan yeniyse arka plan çekiminde durum satırı yeniden yazılmaz
    const healthyRecently = az.via === 'cron' && (row as any)?.status === 'connected' && !(row as any)?.error_count
      && (row as any)?.last_ok_at && Date.now() - Date.parse((row as any).last_ok_at) < HEARTBEAT_MS;
    const w2 = action !== 'reviews' && action !== 'diagnose' && action !== 'probe_actions' && !action.startsWith('finance_') && !healthyRecently ? await touchPlatform(db, PLATFORM, true) : null;
    return json({ ok: true, result, db_warning: w1 || w2 || undefined });
  } catch (e) {
    // Hata YALNIZCA bu platformun kaydına yazılır. Kayıt yazılamazsa nedeni de yanıtla döner.
    const m = msg(e);
    const w1 = await logEvent(db, PLATFORM, 'out', action, { error: m });
    const w2 = action.startsWith('finance_') ? null : await touchPlatform(db, PLATFORM, false, m); // finans hatası sipariş bağlantısını 'hatalı' göstermesin
    return json({ ok: false, error: m, db_warning: w1 || w2 || undefined }, 200);
  }
});

// ---------------------------------------------------------------------
function makeCtx(cfg: any): Ctx {
  const key = Deno.env.get('TRENDYOL_API_KEY');
  const secret = Deno.env.get('TRENDYOL_API_SECRET');
  if (!key || !secret) throw new Error('TRENDYOL_API_KEY / TRENDYOL_API_SECRET henüz tanımlanmamış (Edge Function secrets).');
  const supplierId = String(cfg.supplier_id || '').trim();
  const storeId = String(cfg.store_id || '').trim();
  if (!supplierId || supplierId === '000' || !storeId || storeId === '000') {
    throw new Error(`Satıcı (supplier) ve mağaza (store) kimlikleri henüz girilmemiş (veritabanında okunan: supplier_id="${supplierId}", store_id="${storeId}").`);
  }
  return {
    supplierId, storeId, cfg,
    base: BASES[cfg.environment === 'prod' ? 'prod' : 'stage'],
    auth: 'Basic ' + btoa(`${key}:${secret}`),
    ua: `${supplierId} - SelfIntegration`,
    ep: { ...ENDPOINTS, ...(Object.fromEntries(Object.entries(cfg.endpoints || {}).filter(([k]) => !LOCKED_EP.includes(k))) as Record<string, string>) },
  };
}

function apiHeaders(ctx: Ctx): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: ctx.auth, 'User-Agent': ctx.ua, 'Content-Type': 'application/json', Accept: 'application/json',
    'x-agentname': 'SelfIntegration',
  };
  // Dokümana göre durum değiştiren çağrılarda işlemi yapan kullanıcı e-postası istenebilir (config.executor_email).
  if (ctx.cfg.executor_email) h['x-executor-user'] = String(ctx.cfg.executor_email);
  return h;
}

async function call(ctx: Ctx, name: string, vars: Record<string, string> = {}, payload?: unknown, query = '') {
  const spec = ctx.ep[name];
  if (!spec) throw new Error('Uç nokta tanımsız: ' + name);
  const [method, rawPath] = spec.trim().split(/\s+/);
  const path = rawPath
    .replace('{s}', encodeURIComponent(ctx.supplierId)).replace('{st}', encodeURIComponent(ctx.storeId))
    .replace('{p}', encodeURIComponent(vars.p || '')).replace('{id}', encodeURIComponent(vars.id || ''));
  const res = await fetch(ctx.base + path + query, {
    method,
    headers: apiHeaders(ctx),
    body: payload !== undefined && method !== 'GET' ? JSON.stringify(payload) : undefined,
  });
  const text = await res.text();
  let data: any = text;
  try { data = text ? JSON.parse(text) : {}; } catch { /* düz metin */ }
  if (!res.ok) {
    const hint = [404, 503, 556].includes(res.status) ? ` [İSTEK: ${method} ${ctx.base}${path} — yol/ortam yanlış olabilir, "Tanılama" düğmesini çalıştırın]` : '';
    const e: any = new Error(`TGO ${name} → HTTP ${res.status}: ${typeof data === 'string' ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300)}${hint}`);
    e.status = res.status; e.data = data;
    throw e;
  }
  return data;
}

async function statusInfo(cfg: any, row: any) {
  const k = !!Deno.env.get('TRENDYOL_API_KEY'), s = !!Deno.env.get('TRENDYOL_API_SECRET');
  return {
    secrets_set: k && s,
    ids_set: !!cfg.supplier_id && cfg.supplier_id !== '000' && !!cfg.store_id && cfg.store_id !== '000',
    cron_secret_set: !!Deno.env.get('CRON_SECRET'),
    environment: cfg.environment === 'prod' ? 'prod' : 'stage',
    base_url: BASES[cfg.environment === 'prod' ? 'prod' : 'stage'],
    raw_environment: cfg.environment ?? null,
    supplier_id: cfg.supplier_id ?? null,
    store_id: cfg.store_id ?? null,
    status: row?.status,
  };
}

async function testConnection(ctx: Ctx, _db: any) {
  const info = await call(ctx, 'restaurant_info');
  return { reachable: true, restaurant: info };
}

// ---------------------------------------------------------------------
// Siparişler (Uber Eats geçişi alanları dahil)
// ---------------------------------------------------------------------
// Durum yalnızca İLERİ taşınır; bu kural veritabanındaki platform_apply_status() içinde uygulanır
// (kurye şartı ve "atlayan geçiş" engeli platform senkronu için kaldırıldı → sql/22_trendyol_status_sync.sql).
const ACTIVE = new Set(['Created', 'Received', 'Picking', 'Accepted', 'Invoiced', 'Prepared', 'Shipped']);
const FINAL_LOCAL = ['delivered', 'cancelled'];

/**
 * Trendyol paket listesi. Sıralama belgelenmemiş (en yeni başta VEYA sonda olabilir) ve sayfa başına en çok 50 kayıt
 * dönüyor; bu yüzden TÜM sayfalar (üst sınır: MAX_PAGES) çekilir. Sayfa sayısı sınırı aşarsa baştan ve sondan alınır.
 * complete=false → liste kesilmiş olabilir (kayıp-sipariş tespiti yapılmaz).
 */
const PAGE_SIZE = 50;
const MAX_PAGES = 10;
const listOf = (d: any): any[] => d?.content || d?.packages || (Array.isArray(d) ? d : []);

// Kabul denemesi başarısızlık sayacı (çalışan örnek ömrü boyunca; sonsuz deneme / log şişmesi olmasın)
const acceptFails = new Map<string, number>();

/** Paket son 36 saat içinde mi oluşmuş? Tarih alanı bulunamazsa false (güvenli taraf: eski paketleri içeri alma). */
function recentPackage(p: any): boolean {
  for (const k of ['packageCreationDate', 'creationDate', 'createdDate', 'orderDate', 'packageCreatedDate', 'createdAt', 'lastModifiedDate', 'packageLastModifiedDate']) {
    const v = p?.[k];
    if (v === undefined || v === null || v === '') continue;
    const t = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(String(v));
    if (Number.isFinite(t)) return Date.now() - t < 36 * 3600_000 && t - Date.now() < 3600_000;
  }
  return false;
}

async function fetchPackages(ctx: Ctx): Promise<any[]> {
  const { packages } = await fetchPackagesMeta(ctx);
  return packages;
}

async function fetchPackagesMeta(ctx: Ctx): Promise<{ packages: any[]; complete: boolean; totalPages: number }> {
  const first = await call(ctx, 'packages', {}, undefined, `?size=${PAGE_SIZE}&page=0`);
  const out: any[] = [...listOf(first)];
  const totalPages = Number(first?.totalPages || 1);
  const want: number[] = [];
  if (totalPages <= MAX_PAGES) for (let p = 1; p < totalPages; p++) want.push(p);
  else {
    for (let p = 1; p < 3; p++) want.push(p);                                           // baştan 3 sayfa
    for (let p = totalPages - (MAX_PAGES - 3); p < totalPages; p++) want.push(p);       // sondan kalanlar
  }
  // Sayfalar 4'erli paralel çekilir (eskiden sırayla: 10 sayfa ≈ 10× gecikme). İlk ek sayfa hatası fırlatılır, sonrakiler kısmi hata sayılır.
  for (let i = 0; i < want.length; i += 4) {
    const batch = want.slice(i, i + 4);
    const res = await Promise.allSettled(batch.map((p) => call(ctx, 'packages', {}, undefined, `?size=${PAGE_SIZE}&page=${p}`)));
    res.forEach((r, k) => {
      if (r.status === 'fulfilled') out.push(...listOf(r.value));
      else if (batch[k] === want[0]) throw r.reason;
    });
  }
  const seen = new Set<string>();
  const packages = out.filter((p) => { const id = String(p.id ?? p.packageId ?? ''); if (!id || seen.has(id)) return false; seen.add(id); return true; });
  return { packages, complete: totalPages <= MAX_PAGES, totalPages };
}

async function syncOrders(ctx: Ctx, db: any) {
  const { packages: all, complete } = await fetchPackagesMeta(ctx);
  const storeOf = (p: any) => String(p.storeId ?? p.restaurantId ?? p.store?.id ?? p.restaurant?.id ?? '');
  const mine = all.filter((p) => !storeOf(p) || storeOf(p) === ctx.storeId);
  const stOf = (p: any) => String(p.packageStatus || p.status || '');
  const refOf = (p: any) => String(p.id ?? p.packageId ?? '');
  const cancelReasonOf = (p: any) => String(p.cancelReason || p.cancellationReason || p.cancelDescription || p.unSuppliedReason || '') || 'Trendyol iptali';

  // Sitede zaten var olan siparişler (bitmiş paketlerin durumunu da güncelleyebilmek için)
  const refs = mine.map(refOf);
  const known = new Map<string, any>();
  for (let i = 0; i < refs.length; i += 100) {
    const { data: existing, error } = await db.from('orders').select('id,order_no,external_ref,status,platform_status,total')
      .eq('source', PLATFORM).in('external_ref', refs.slice(i, i + 100));
    if (error) throw error;
    for (const o of existing || []) known.set(String(o.external_ref), o);
  }

  let created = 0, status_updated = 0, failed = 0, unchanged = 0, late = 0, amended = 0, accepted_retry = 0;
  const changes: string[] = [];
  // Edge Function süre sınırına (~150 sn) asla takılmayalım: 90 sn sonra kalan işi sonraki çekime bırak (hiçbir şey kaybolmaz, bilinmeyen paket zaten tekrar denenir)
  const deadline = Date.now() + 90_000;
  let truncated = false;
  for (const pkg of mine) {
    if (Date.now() > deadline) { truncated = true; break; }
    const ref = refOf(pkg), st = stOf(pkg), mapped = mapStatus(st);
    try {
      const cur = known.get(ref);
      if (!cur) {
        if (!ACTIVE.has(st)) {
          // v63: bitmiş ama sitede HİÇ olmayan paket — çekimler arasında (kesinti, kapalı sunucu) teslim olup kaçmış olabilir.
          // Yalnızca TESLİM EDİLMİŞ ve son 36 saatte oluşmuş (tarih alanı okunabilirse) paket gelir olarak kaydedilir; tarih okunamazsa eskisi gibi atlanır.
          if (ctx.cfg.catch_delivered === true && mapped === 'delivered' && recentPackage(pkg) && late < 20) { // v64: varsayılan KAPALI (eski teslimler gelmesin); config.catch_delivered=true ile açılır
            const { data: r, error } = await db.rpc('platform_ingest_order', { p: { ...mapPackage(pkg) } });
            if (error) throw error;
            if (r?.created) { late++; created++; changes.push(`geç yakalanan teslim: ${ref}`); }
          }
          continue;
        }
        const { data: r, error } = await db.rpc('platform_ingest_order', { p: { ...mapPackage(pkg), cancel_reason: mapped === 'cancelled' ? cancelReasonOf(pkg) : undefined } });
        if (error) throw error;
        if (r?.created) {
          created++;
          if (ctx.cfg.auto_accept && st === 'Created') {
            try { await call(ctx, 'accept', { p: ref }, { packageId: ref, preparationTime: Number(pkg.preparationTime ?? ctx.cfg.default_prep_minutes ?? 30) }); } catch (e) { await logEvent(db, PLATFORM, 'out', 'auto_accept', { ref, error: msg(e) }); }
          }
        }
        continue;
      }

      // Var olan sipariş: Trendyol'daki son durumu siteye yansıt (yalnızca ileri, kurye şartı OLMADAN)
      const platformChanged = cur.platform_status !== st;
      // v63: otomatik kabul önceki çekimde başarısız olduysa (ağ/API hatası) sipariş 'Created'da takılı kalır ve Trendyol süre dolunca iptal eder.
      // Durum hâlâ Created ise kabul tekrar denenir (aynı paket için en çok 5 deneme / çalışan örnek).
      if (ctx.cfg.auto_accept && st === 'Created' && (acceptFails.get(ref) || 0) < 5) {
        try {
          await call(ctx, 'accept', { p: ref }, { packageId: ref, preparationTime: Number(pkg.preparationTime ?? ctx.cfg.default_prep_minutes ?? 30) });
          accepted_retry++;
        } catch (e) {
          acceptFails.set(ref, (acceptFails.get(ref) || 0) + 1);
          if (acceptFails.get(ref) === 1) await logEvent(db, PLATFORM, 'out', 'auto_accept_retry', { ref, error: msg(e) });
        }
      }
      // v63: aynı durumdayken paket içeriği/tutarı değiştiyse (kısmi iptal, ürün çıkarma) siparişi eşitle
      if (!platformChanged && !FINAL_LOCAL.includes(cur.status)) {
        const mp0 = mapPackage(pkg);
        if (Math.abs(Number(cur.total) - Number(mp0.total)) > 0.01 && mp0.total > 0) {
          const { error: ae } = await db.rpc('platform_update_items', { p_order_id: cur.id, p: mp0 });
          if (!ae) { amended++; changes.push(`#${cur.order_no}: tutar ${cur.total} → ${mp0.total}`); }
          else if (acceptFails.get('amend_err') === undefined) { acceptFails.set('amend_err', 1); await logEvent(db, PLATFORM, 'in', 'amend', { ref, error: msg(ae) }); }
        }
      }
      // v59: Trendyol'daki durum son çekimden beri DEĞİŞMEDİYSE veritabanına HİÇ dokunma.
      // Eskiden her çekimde her paket için UPDATE atılıyor → her seferinde Realtime olayı → tüm panellerde sipariş listesi yeniden iniyordu (egress/log patlaması).
      if (!platformChanged) { unchanged++; continue; }
      const mp = mapPackage(pkg);
      const { data: r, error } = await db.rpc('platform_apply_status', {
        p_order_id: cur.id,
        p_status: mapped || cur.status,
        p_platform_status: st,
        p_cancel_reason: mapped === 'cancelled' ? cancelReasonOf(pkg) : null,
        p_payload: pkg,
        p_call_center_phone: mp?.call_center_phone ?? null,
        p_pin_code: mp?.pin_code ?? null,
      });
      if (error) throw error;
      if (r?.changed) { status_updated++; changes.push(`#${cur.order_no}: ${cur.status} → ${r.status}`); } else unchanged++;
    } catch (e) {
      failed++;
      await logEvent(db, PLATFORM, 'in', 'ingest', { ref, error: msg(e), payload: pkg });
    }
  }

  // Sitede AÇIK görünen ama Trendyol listesinde bulunamayan siparişler (liste eksiksizse raporlanır)
  let missing: { order_no: number; status: string }[] = [];
  if (complete) {
    const seenRefs = new Set(refs);
    const { data: open } = await db.from('orders').select('order_no,external_ref,status').eq('source', PLATFORM).not('status', 'in', `(${FINAL_LOCAL.join(',')})`);
    missing = (open || []).filter((o: any) => !seenRefs.has(String(o.external_ref))).map((o: any) => ({ order_no: o.order_no, status: o.status }));
  }

  // v59: "son senkron" zamanı her çekimde yazılmaz (her yazım Realtime olayı üretir). Değişiklik varsa ya da kayıt 10 dk'dan eskiyse yazılır.
  const lastSyncMs = ctx.row?.last_order_sync_at ? Date.parse(ctx.row.last_order_sync_at) : 0;
  if (created || status_updated || failed || amended || Date.now() - lastSyncMs > HEARTBEAT_MS) {
    const nowIso = new Date().toISOString();
    await db.from('integrations').update({ last_sync_at: nowIso, last_order_sync_at: nowIso }).eq('platform', PLATFORM);
  }
  return { fetched: all.length, considered: mine.length, created, status_updated, unchanged, failed, late_caught: late, amended, accept_retried: accepted_retry, truncated, complete, missing_count: missing.length, missing: missing.slice(0, 20), changes: changes.slice(0, 20) };
}

// Bizim durum değişikliğimiz → TGO'ya bildirim. Başarısızlık siparişi bozmaz, yalnızca loglanır.
// TGO durum makinesi sıralıdır: Created → Picking(picked) → Invoiced(invoiced) → Shipped(manual-shipped) → Delivered(manual-delivered).
// Atlanan ara adımlar otomatik tamamlanır (ör. doğrudan "Yolda" denirse önce kabul + hazır gönderilir).
const TGO_RANK: Record<string, number> = { Created: 0, Received: 0, Picking: 1, Accepted: 1, Invoiced: 2, Prepared: 2, Shipped: 3, Delivered: 4 };
// "assigned" (kuryeye atandı) = restoran içi bir atamadır: Trendyol'da yalnızca "hazır" (2) sayılır, "yolda" DEĞİL.
const TARGET_RANK: Record<string, number> = { preparing: 1, ready: 2, assigned: 2, on_the_way: 3, delivered: 4 };

async function pushOrderStatus(ctx: Ctx, db: any, body: any) {
  const { data: o } = await db.from('orders').select('id,external_ref,platform_status,source,cancel_reason,external_payload').eq('id', body.order_id).single();
  if (!o || o.source !== PLATFORM || !o.external_ref) throw new Error('Bu sipariş Trendyol Go siparişi değil');
  const p = String(o.external_ref);

  // Platformdaki GÜNCEL paketi al (statü, hazırlık süresi, teslimat tipi, kalem kimlikleri)
  // v63: eskiden her durum tıklamasında TÜM paket sayfaları çekiliyordu (yavaş + gereksiz API yükü). Artık sipariş alınırken saklanan paket kullanılır;
  // güncel durum bilgisi yalnızca saklı paket yoksa API'den alınır. Adım zaten yapılmışsa Trendyol 400/409/422 döner ve aşağıda güvenle ele alınır.
  // v63: ham paket 'order_payloads' tablosunda (sql/42); yoksa eski 'orders.external_payload' (taşınmamış kayıt), o da yoksa API
  let pkg: any = null;
  try { const { data: pl } = await db.from('order_payloads').select('payload').eq('order_id', o.id).maybeSingle(); if (pl?.payload?.lines) pkg = pl.payload; } catch { /* tablo yoksa sessizce geç */ }
  if (!pkg && o.external_payload && typeof o.external_payload === 'object' && (o.external_payload as any).lines) pkg = o.external_payload;
  if (!pkg) { try { pkg = (await fetchPackages(ctx)).find((x) => String(x.id) === p) || null; } catch { /* yedek: DB statüsü */ } }
  const cur = String(o.platform_status || pkg?.packageStatus || 'Created'); // sitedeki son bilinen durum (saklı paket eski olabilir)

  if (body.status === 'cancelled') {
    const items = (pkg?.lines || []).flatMap((l: any) => (l.items || []).map((i: any) => ({ packageItemId: i.packageItemId, lineItemId: i.lineItemId })));
    const r = await call(ctx, 'cancel', { p }, { packageId: p, reasonId: Number(body.reason_id ?? 623), items, description: o.cancel_reason || body.note || 'İşletme iptali' });
    await db.from('orders').update({ platform_status: 'UnSupplied' }).eq('id', o.id);
    return { sent: 'unsupplied', r };
  }

  const target = TARGET_RANK[body.status];
  if (target === undefined) return { sent: null };

  // Trendyol kuryesi teslim eden siparişlerde yolda/teslim bildirimi RESTORAN tarafından yapılmaz.
  if (target >= 3 && pkg?.deliveryType && pkg.deliveryType !== 'STORE') {
    return { sent: null, skipped: `Teslimatı Trendyol kuryesi yapıyor (deliveryType=${pkg.deliveryType}); restoran bildirimi gerekmez` };
  }

  const have = TGO_RANK[cur] ?? 0;
  const sent: string[] = [];
  let last: any = null;
  for (let step = have + 1; step <= target; step++) {
    const isFinal = step === target;
    try {
      if (step === 1) { last = await call(ctx, 'accept', { p }, { packageId: p, preparationTime: Number(pkg?.preparationTime ?? ctx.cfg.default_prep_minutes ?? 30) }); sent.push('picked'); }
      else if (step === 2) { last = await call(ctx, 'prepared', { p }, { packageId: p }); sent.push('invoiced'); }
      else if (step === 3) { last = await call(ctx, 'shipped', { p }, {}); sent.push('manual-shipped'); }
      else if (step === 4) { last = await call(ctx, 'delivered', { p }, {}); sent.push('manual-delivered'); }
    } catch (e: any) {
      // Ara adım zaten yapılmış olabilir (400/409/422): son adım değilse devam et
      if (!isFinal && [400, 409, 422].includes(e?.status)) continue;
      // Son adım reddedildiyse Trendyol büyük olasılıkla zaten ilerlemiştir (ör. Trendyol kuryesi aldı):
      // hata fırlatmak yerine gerçek durumu eşitle ve uyarı olarak bildir.
      if (isFinal && [400, 409, 422].includes(e?.status)) {
        let sync: any = null;
        try { sync = await syncOrders(ctx, db); } catch { /* yoksay */ }
        return { sent: sent.join(' → ') || null, warning: 'Trendyol bu adımı kabul etmedi (durum zaten ilerlemiş olabilir): ' + msg(e), platform_status_before: cur, synced: sync ? { status_updated: sync.status_updated } : null };
      }
      throw e;
    }
  }
  const names = ['Created', 'Picking', 'Invoiced', 'Shipped', 'Delivered'];
  if (sent.length) await db.from('orders').update({ platform_status: names[target] }).eq('id', o.id);
  return { sent: sent.join(' → ') || 'zaten bu durumda', platform_status_before: cur, r: last };
}

// ---------------------------------------------------------------------
// Restoran: çalışma saatleri (kendi opening_hours → TGO)
// ---------------------------------------------------------------------
async function pushWorkingHours(ctx: Ctx, db: any) {
  const { data: hrs } = await db.from('opening_hours').select('*').order('day_of_week');
  const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
  const payload = {
    workingHours: (hrs || []).map((h: any) => ({
      dayOfWeek: days[(Number(h.day_of_week) + 6) % 7] ?? days[0],
      openingTime: String(h.open_time).slice(0, 5), closingTime: String(h.close_time).slice(0, 5), isClosed: !!h.is_closed,
    })),
  };
  return await call(ctx, 'working_hours', {}, payload);
}

// ---------------------------------------------------------------------
// Menü: platform menüsünü çek → ürün eşleştirme tablosuna yaz (ad eşleşmesi); kendi menü durumunu it
// ---------------------------------------------------------------------
async function syncMenu(ctx: Ctx, db: any) {
  const data = await call(ctx, 'menus');
  const products: any[] = [];
  const walk = (n: any) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.id && n.name && (n.price !== undefined || n.salePrice !== undefined)) products.push(n);
    for (const v of Object.values(n)) if (typeof v === 'object') walk(v);
  };
  walk(data);
  const { data: mine } = await db.from('products').select('id,name');
  const norm = (s: string) => (s || '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();
  const byName = new Map<string, string>((mine || []).map((p: any) => [norm(p.name), p.id]));
  let matched = 0;
  for (const p of products) {
    const pid = byName.get(norm(p.name));
    if (!pid) continue;
    const { error } = await db.from('product_platform_mappings').upsert(
      { product_id: pid, platform: PLATFORM, external_id: String(p.id), external_name: p.name, last_synced_at: new Date().toISOString() },
      { onConflict: 'platform,external_id' });
    if (!error) matched++;
  }
  await db.from('integrations').update({ last_menu_sync_at: new Date().toISOString() }).eq('platform', PLATFORM);
  return { platform_products: products.length, matched, unmatched: products.length - matched };
}

// ---------------------------------------------------------------------
// Yorumlar: Uber'den geçen mağazalarda 403 (endpoint.not-available.error) döner → ÇÖKME YOK, "desteklenmiyor" olarak bildir
// ---------------------------------------------------------------------
async function reviews(ctx: Ctx) {
  try {
    return { supported: true, data: await call(ctx, 'reviews') };
  } catch (e: any) {
    const code = JSON.stringify(e?.data || '');
    if (e?.status === 403 || code.includes('endpoint.not-available')) {
      return { supported: false, reason: 'Bu mağaza için yorum uç noktası kullanılamıyor (Uber Eats geçişi).' };
    }
    throw e;
  }
}

// ---------------------------------------------------------------------
// Ürün açık/kapalı durumunu (stokta yok / satışa kapalı) eşleşen tüm Trendyol ürünlerine gönderir.
// Not: uç nokta yolu (product_status) henüz canlıda DOĞRULANMADI — hata alırsanız "Tanılama" ile yolu doğrulayın.
// ---------------------------------------------------------------------
async function pushAvailability(ctx: Ctx, db: any) {
  const { data: maps, error } = await db.from('product_platform_mappings')
    .select('external_id, products:product_id(is_active,is_sold_out)').eq('platform', PLATFORM);
  if (error) throw error;
  let ok = 0, failed = 0; const errors: string[] = [];
  for (const m of maps || []) {
    const p = (m as any).products;
    if (!p) continue;
    const available = !!p.is_active && !p.is_sold_out;
    try { await call(ctx, 'product_status', { id: String((m as any).external_id) }, { status: available ? 'AVAILABLE' : 'UNAVAILABLE' }); ok++; }
    catch (e) { failed++; if (errors.length < 3) errors.push(msg(e)); }
  }
  return { total: (maps || []).length, ok, failed, errors };
}

// Tek bir siparişin Trendyol'daki ANLIK durumunu getirir (panelde "Trendyol'da ne görünüyor?" kontrolü)
async function packageStatus(ctx: Ctx, db: any, body: any) {
  const { data: o } = await db.from('orders').select('id,order_no,status,external_ref,platform_status,source').eq('id', body.order_id).single();
  if (!o || o.source !== PLATFORM) throw new Error('Bu sipariş Trendyol Go siparişi değil');
  const pkg = (await fetchPackages(ctx)).find((x) => String(x.id ?? x.packageId) === String(o.external_ref));
  return {
    order_no: o.order_no, local_status: o.status, local_platform_status: o.platform_status,
    found: !!pkg, trendyol_status: pkg ? String(pkg.packageStatus || pkg.status) : null,
    delivery_type: pkg?.deliveryType ?? null,
  };
}

function summarize(r: any) {
  if (!r || typeof r !== 'object') return r;
  const { r: _x, restaurant: _y, data: _z, ...rest } = r;
  return rest;
}

// Uber geçişi: sipariş otomatik "Invoiced" olabilir; /invoiced tekrarı HATA sayılmaz.
async function pushInvoice(ctx: Ctx, body: any) {
  try {
    return await call(ctx, 'invoiced', { p: body.package_id }, { packageId: body.package_id, ...(body.payload || {}) });
  } catch (e: any) {
    if ([400, 409, 422].includes(e?.status)) return { already_invoiced: true, note: msg(e) };
    throw e;
  }
}


// ---------------------------------------------------------------------
// TANILAMA: hangi ortama gidiyoruz, çıkış IP'miz ne, hangi yollar GERÇEKTEN var?
//  - 404 / 556 / 503 / 502 / 504 → yol (veya ortam/IP) yanlış
//  - 200 / 400 / 401 / 403 / 405 / 422 → yol VAR (kimlik/parametre ayrı konu)
// Yalnızca GET denenir (veri değiştirmez). body.apply=true → bulunan çalışan yolu config.endpoints'e yazar.
// body.paths = ["/integrator/....{s}...{st}..."] ile dokümandan kopyaladığınız yolları da deneyebilirsiniz.
// ---------------------------------------------------------------------
const PROBE_CANDIDATES: Record<string, string[]> = {
  packages: [
    '/integrator/order/meal/suppliers/{s}/packages',
    '/integrator/order/meal/suppliers/{s}/stores/{st}/packages',
    '/integrator/order/meal/suppliers/{s}/restaurants/{st}/packages',
  ],
  restaurant_info: [
    '/integrator/store/meal/suppliers/{s}/stores/{st}',
    '/integrator/store/meal/suppliers/{s}/restaurants/{st}',
    '/integrator/restaurant/meal/suppliers/{s}/restaurants/{st}',
    '/integrator/restaurant/meal/suppliers/{s}/stores/{st}',
    '/integrator/store/meal/suppliers/{s}/stores',
    '/integrator/store/meal/suppliers/{s}/restaurants',
  ],
};
const DEAD = [404, 502, 503, 504, 556];

async function diagnose(ctx: Ctx, db: any, body: any) {
  let ip: string = 'alınamadı';
  try { ip = (await (await fetch('https://api.ipify.org?format=json')).json()).ip; } catch { /* yoksay */ }
  const fill = (t: string) => t.replace('{s}', encodeURIComponent(ctx.supplierId)).replace('{st}', encodeURIComponent(ctx.storeId));

  const groups: Record<string, string[]> = { ...PROBE_CANDIDATES };
  if (Array.isArray(body.paths) && body.paths.length) groups.custom = body.paths.map(String);

  const probes: any[] = [];
  const winners: Record<string, string> = {};
  for (const [name, list] of Object.entries(groups)) {
    for (const tpl of list) {
      const url = ctx.base + fill(tpl) + (name === 'packages' ? '?size=1' : '');
      let status = 0, snippet = '';
      try {
        const r = await fetch(url, { method: 'GET', headers: apiHeaders(ctx) });
        status = r.status; snippet = (await r.text()).slice(0, 140);
      } catch (e) { snippet = 'ağ hatası: ' + msg(e); }
      const exists = status > 0 && !DEAD.includes(status);
      probes.push({ group: name, path: tpl, status, exists, snippet });
      if (exists && !winners[name]) winners[name] = 'GET  ' + tpl;
    }
  }

  let applied = false;
  if (body.apply && Object.keys(winners).length) {
    const { data: row } = await db.from('integrations').select('config').eq('platform', PLATFORM).maybeSingle();
    const cfg = { ...(row?.config || {}) };
    const eps = { ...(cfg.endpoints || {}) };
    for (const k of ['packages', 'restaurant_info']) if (winners[k]) eps[k] = winners[k];
    cfg.endpoints = eps;
    const { error } = await db.from('integrations').update({ config: cfg }).eq('platform', PLATFORM);
    applied = !error;
  }

  const all401 = probes.length > 0 && probes.filter((p) => p.exists).every((p) => p.status === 401);
  const allDead = probes.length > 0 && probes.every((p) => !p.exists);
  const verdict = allDead
    ? (ctx.base.includes('stage')
        ? 'TÜM yollar ölü ve ortam TEST (stage): test ortamı IP yetkilendirmesi ister. Çıkış IP’niz aşağıda; ya "Canlı (prod)" seçin ya da TGO’ya bu IP’yi bildirin.'
        : 'TÜM yollar ölü (canlı ortam): yol şablonları yanlış olabilir. Dokümandaki gerçek yolu "paths" ile deneyin.')
    : all401 ? 'Yollar VAR ama kimlik reddedildi (401): API KEY/SECRET veya ortam (prod/stage) uyuşmuyor.'
    : 'En az bir yol çalışıyor; "winners" altındaki yolları kullanın (apply=true ile kaydedilir).';

  return {
    environment: ctx.cfg.environment === 'prod' ? 'prod' : 'stage', raw_environment: ctx.cfg.environment ?? null,
    base: ctx.base, user_agent: ctx.ua, outbound_ip: ip, supplier_id: ctx.supplierId, store_id: ctx.storeId,
    verdict, winners, applied, probes,
  };
}


// Paket yapısını doğrulamak için: alan adları, statü dağılımı ve KİŞİSEL VERİSİZ örnek (ad/telefon/adres maskelenir).
async function peekPackages(ctx: Ctx) {
  const data = await call(ctx, 'packages', {}, undefined, '?size=50');
  const list: any[] = data?.content || [];
  const dist: Record<string, number> = {};
  for (const p of list) { const k = String(p.packageStatus || p.status || '?'); dist[k] = (dist[k] || 0) + 1; }
  const mask = (v: any, key = ''): any => {
    if (Array.isArray(v)) return v.slice(0, 2).map((x) => mask(x, key));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mask(x, k)]));
    if (typeof v === 'string' && /name|phone|address|email|note|pin/i.test(key)) return '***';
    return v;
  };
  return {
    totalCount: data?.totalCount, totalPages: data?.totalPages, page: data?.page, returned: list.length,
    top_level_keys: Object.keys(data || {}), package_keys: list[0] ? Object.keys(list[0]) : [],
    status_distribution: dist, sample: list[0] ? mask(list[0]) : null,
  };
}


// ---------------------------------------------------------------------
// DURUM YOLLARI TARAMASI (kabul / hazır / yolda / teslim / iptal)
// GERÇEK SİPARİŞE DOKUNMAZ: var olmayan sahte paket kimliği kullanılır.
//  - Gövde "NoResourceFoundException" / 556 / 503 → yol YOK
//  - 400 / 404(iş hatası) / 405 / 422 / 409 / 401 / 403 → yol VAR (yanıt metni gövde şeklini gösterir)
// ---------------------------------------------------------------------
const ACTION_CANDIDATES: Record<string, string[]> = {
  accept:   ['picked', 'accepted', 'accept', 'pick'],
  prepared: ['invoiced', 'prepared', 'ready'],
  shipped:  ['manual-shipped', 'shipped', 'ship'],
  delivered: ['manual-delivered', 'delivered', 'deliver'],
  cancel:   ['unsupplied', 'cancelled', 'cancel'],
};

async function probeActions(ctx: Ctx, db: any, body: any) {
  const fake = '0'.repeat(64);
  const base = `/integrator/order/meal/suppliers/${encodeURIComponent(ctx.supplierId)}/packages`;
  type P = { key: string; name: string; shape: string; method: string; url: string; path: string; payload: any };
  const jobs: P[] = [];
  for (const [key, names] of Object.entries(ACTION_CANDIDATES)) {
    for (const name of names) {
      for (const method of ['PUT', 'POST']) {
        jobs.push({ key, name, shape: 'id-in-path', method, path: `/packages/{p}/${name}`, url: `${base}/${fake}/${name}`, payload: {} });
        jobs.push({ key, name, shape: 'id-in-body', method, path: `/packages/${name}`, url: `${base}/${name}`, payload: { packageId: fake } });
      }
    }
  }
  const results: any[] = [];
  for (let i = 0; i < jobs.length; i += 8) {
    await Promise.all(jobs.slice(i, i + 8).map(async (j) => {
      let status = 0, text = '';
      try {
        const r = await fetch(ctx.base + j.url, { method: j.method, headers: apiHeaders(ctx), body: JSON.stringify(j.payload) });
        status = r.status; text = (await r.text()).slice(0, 220);
      } catch (e) { text = 'ağ hatası: ' + msg(e); }
      const dead = status === 0 || [502, 503, 504, 556].includes(status) || /NoResourceFound|No static resource|system\.unexpected-error/i.test(text);
      results.push({ key: j.key, name: j.name, shape: j.shape, method: j.method, path: j.path, status, exists: !dead, snippet: text });
    }));
  }
  const order = (r: any) => ACTION_CANDIDATES[r.key].indexOf(r.name) * 10 + (r.method === 'PUT' ? 0 : 1) + (r.shape === 'id-in-path' ? 0 : 2);
  const winners: Record<string, string> = {};
  for (const key of Object.keys(ACTION_CANDIDATES)) {
    const w = results.filter((r) => r.key === key && r.exists && r.shape === 'id-in-path').sort((a, b) => order(a) - order(b))[0];
    if (w) winners[key] = `${w.method}  /integrator/order/meal/suppliers/{s}${w.path}`;
  }
  let applied = false;
  if (body.apply && Object.keys(winners).length) {
    const { data: row } = await db.from('integrations').select('config').eq('platform', PLATFORM).maybeSingle();
    const cfg = { ...(row?.config || {}) };
    cfg.endpoints = { ...(cfg.endpoints || {}), ...winners };
    const { error } = await db.from('integrations').update({ config: cfg }).eq('platform', PLATFORM);
    applied = !error;
  }
  return { winners, applied, found: results.filter((r) => r.exists).sort((a, b) => order(a) - order(b)) };
}
