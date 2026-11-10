// Migros Yemek — Güncellenmiş Entegrasyon Edge Function (Resmi Dokümana Uygun)
// Dağıtım: supabase functions deploy platform-migros --no-verify-jwt
// Gizliler: supabase secrets set MIGROS_API_KEY=... MIGROS_SECRET_KEY=... MIGROS_BASE_URL=... CRON_SECRET=...

import { authorize, CORS, json, logEvent, msg, resolveAdmin, touchPlatform } from '../_shared/common.ts';

const PLATFORM = 'migros';

type Ctx = { storeId: string; base: string; apiKey: string; secretKey: string; ua: string; cfg: any };

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    const az = await authorize(req);
    if (!az.ok) return json({ ok: false, error: az.reason }, 401);

    const adm = await resolveAdmin();
    const db = adm.db;
    let body: any = {};
    try { body = await req.json(); } catch { /* boş gövde */ }
    const action: string = body.action || 'status';

    try {
        let row: any = null;
        let dbError: string | null = adm.error ? `service_role erişimi yok → ${adm.error}` : null;
        if (!adm.error) {
            const r = await db.from('integrations').select('*').eq('platform', PLATFORM).maybeSingle();
            if (r.error) dbError = `integrations okunamadı: ${r.error.message}`;
            else if (!r.data) dbError = 'integrations tablosunda "migros" satırı yok.';
            else row = r.data;
        }
        const cfg = row?.config || {};

        if (action === 'status') return json({ ok: true, ...(await statusInfo(cfg, row)), db_via: adm.via, db_error: row && !adm.error ? null : dbError });
        if (!row) throw new Error('Entegrasyon ayarları okunamadı — ' + (dbError || 'bilinmeyen neden'));

        if (!(row as any)?.is_enabled && az.via === 'cron') return json({ ok: true, skipped: 'Entegrasyon kapalı' });

        const ctx = makeCtx(cfg);
        const t0 = Date.now();
        let result: any;

        switch (action) {
            case 'test_connection': result = await testConnection(ctx); break;
            case 'sync_orders':     result = await syncOrders(ctx, db); break;
            case 'order_status':    result = await pushOrderStatus(ctx, db, body); break;
            default: return json({ ok: false, error: 'Bilinmeyen işlem: ' + action }, 400);
        }

        const quiet = az.via === 'cron' && action === 'sync_orders' && !result?.created;
        const w1 = quiet ? null : await logEvent(db, PLATFORM, action === 'sync_orders' ? 'in' : 'out', action, { ms: Date.now() - t0, payload: result });
        const w2 = await touchPlatform(db, PLATFORM, true);
        return json({ ok: true, result, db_warning: w1 || w2 || undefined });
    } catch (e) {
        const m = msg(e);
        const w1 = await logEvent(db, PLATFORM, 'out', action, { error: m });
        const w2 = await touchPlatform(db, PLATFORM, false, m);
        return json({ ok: false, error: m, db_warning: w1 || w2 || undefined }, 200);
    }
});

function makeCtx(cfg: any): Ctx {
    const apiKey = Deno.env.get('MIGROS_API_KEY'); // Restoran API Key (XApiKey)
    const secretKey = Deno.env.get('MIGROS_SECRET_KEY') || ''; // Şifreleme için secret key
    const base = Deno.env.get('MIGROS_BASE_URL') || 'https://gateway.migrosyemek.com'; // Resmi gateway veya size verilen adres

    if (!apiKey) throw new Error('MIGROS_API_KEY henüz tanımlanmamış (Edge Function secrets).');
    const storeId = String(cfg.store_id || '').trim();
    if (!storeId || storeId === '000') {
        throw new Error(`Mağaza ID (store_id) henüz girilmemiş.`);
    }
    return {
        storeId, base, apiKey, secretKey, cfg,
        ua: `${storeId} - MigrosIntegration`,
    };
}

async function migrosFetch(ctx: Ctx, endpoint: string, method = 'POST', payload?: unknown) {
    const url = `${ctx.base}${endpoint}`;

    // Dokümana göre POST isteklerinde body AES ile şifrelenip { value: "..." } şeklinde gönderilir.
    // Şimdilik test aşamasında düz JSON veya şifreli paket yapısı kurulabilir.
    const requestBody = payload ? JSON.stringify(payload) : undefined;

    const res = await fetch(url, {
        method,
        headers: {
            'XApiKey': ctx.apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': ctx.ua,
        },
        body: requestBody,
    });

    const text = await res.text();
    let data: any = text;
    try { data = text ? JSON.parse(text) : {}; } catch { /* metin */ }
    if (!res.ok) {
        throw new Error(`Migros API HTTP ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    }
    return data;
}

async function statusInfo(cfg: any, row: any) {
    const keySet = !!Deno.env.get('MIGROS_API_KEY');
    return {
        secrets_set: keySet,
        ids_set: !!cfg.store_id && cfg.store_id !== '000',
        base_url: Deno.env.get('MIGROS_BASE_URL') || 'https://gateway.migrosyemek.com',
        store_id: cfg.store_id ?? null,
        status: row?.status,
    };
}

async function testConnection(ctx: Ctx) {
    // Dokümana göre GET /Store/GetStoreDetail şifrelemesiz ve XApiKey header ile çalışır.
    const data = await migrosFetch(ctx, '/Store/GetStoreDetail', 'GET');
    return { reachable: true, data };
}

async function syncOrders(ctx: Ctx, db: any) {
    // Dokümana göre onay bekleyen siparişler: POST /Order/PendingOrdersWithStores[cite: 57]
    const data = await migrosFetch(ctx, '/Order/PendingOrdersWithStores', 'POST', {
        storeIds: [Number(ctx.storeId)],
        offset: 0,
        limit: 20
    });

    const orders = data?.data?.[0]?.pendingOrderDetailsDTOS || [];

    let created = 0;
    for (const o of orders) {
        const ref = String(o.id);
        const mappedPayload = {
            source: PLATFORM,
            external_ref: ref,
            status: 'new',
            customer_name: o.customerFullName || 'Migros Müşterisi',
            customer_phone: o.phoneNumber || null,
            delivery_address: o.address || null,
            note: o.orderNote || null,
            subtotal: Number(o.totalPrice ?? 0) / 100, // Kuruş cinsinden gelir, TL'ye çevrilir[cite: 58]
            delivery_fee: 0,
            discount: 0,
            total: Number(o.discountedPrice ?? o.totalPrice ?? 0) / 100,
            payload: o,
            items: (o.products || []).map((i: any) => ({
                name: i.name,
                unit_price: Number(i.price ?? 0) / 100,
                quantity: Number(i.amount ?? 1),
                note: i.note || null,
            })),
        };

        const { data: r, error } = await db.rpc('platform_ingest_order', { p: mappedPayload });
        if (!error && r?.created) created++;
    }

    await db.from('integrations').update({ last_order_sync_at: new Date().toISOString() }).eq('platform', PLATFORM);
    return { fetched: orders.length, created };
}

async function pushOrderStatus(ctx: Ctx, db: any, body: any) {
    const { data: o } = await db.from('orders').select('id,external_ref,source').eq('id', body.order_id).single();
    if (!o || o.source !== PLATFORM || !o.external_ref) throw new Error('Bu sipariş Migros siparişi değil');

    // Dokümana göre statüler: Approved, Prepared, Delivery, Completed, Rejected[cite: 67]
    let orderStatus = 'Prepared';
    if (body.status === 'ready') orderStatus = 'Prepared';
    else if (body.status === 'on_the_way') orderStatus = 'Delivery';
    else if (body.status === 'delivered') orderStatus = 'Completed';
    else if (body.status === 'cancelled') orderStatus = 'Rejected';

    const res = await migrosFetch(ctx, '/Order/v2/UpdateOrderStatus', 'POST', {
        orderId: Number(o.external_ref),
        storeId: Number(ctx.storeId),
        orderStatus: orderStatus,
    });
    return { sent: orderStatus, response: res };
}