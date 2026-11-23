import { useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';

type Hook = { id: string; url: string; status: string; authenticationType?: string; subscribedStatuses?: string[] | null; createdDate?: number };

/**
 * Trendyol webhook yönetimi (Edge Function: order-webhook). Webhook = Trendyol'un siparişi BİZE göndermesi → sürekli sorma yok.
 * Not: Bu servis Trendyol Marketplace dokümanındadır. Trendyol Go (Yemek) API'sinde webhook belgelenmemiştir;
 * Go siparişleri için sunucu zamanlayıcısı (sql/40) asıl yoldur. Oluştururken hata alırsanız Trendyol bu hesapta webhook'u açmamıştır.
 */
export default function TrendyolWebhookSection() {
  const [sellerId, setSellerId] = useState('');
  const [hooks, setHooks] = useState<Hook[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [hookUrl, setHookUrl] = useState('');

  const call = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(action);
    try {
      const { data, error } = await supabase.functions.invoke('order-webhook', { body: { action, seller_id: sellerId || undefined, ...extra } });
      if (error) throw new Error('order-webhook ulaşılamadı. Dağıtıldı mı? (--no-verify-jwt) ' + (error.message || ''));
      if (!data?.ok) throw new Error(data?.error || 'Bilinmeyen hata');
      if (data.webhook_url) setHookUrl(data.webhook_url);
      return data.result;
    } catch (e: any) {
      toast.error(e?.message || 'Hata', { duration: 7000 });
      return undefined;
    } finally { setBusy(null); }
  };

  const list = async () => {
    const r = await call('webhook_list');
    if (r !== undefined) setHooks(Array.isArray(r) ? r : []);
  };
  const create = async () => {
    const r = await call('webhook_create');
    if (r !== undefined) { toast.success('Webhook oluşturuldu'); await list(); }
  };
  const act = async (action: string, id: string, ok: string) => {
    const r = await call(action, { id });
    if (r !== undefined) { toast.success(ok); await list(); }
  };

  return (
    <section className="card int-card">
      <h3>5b · Webhook (anlık sipariş bildirimi)</h3>
      <p className="small muted">
        Webhook açıkken Trendyol yeni sipariş / durum değişikliğini bu sisteme kendisi gönderir; sunucu sürekli sormak zorunda kalmaz (yük ve Supabase kotası düşer).
        Webhook kurulunca sql/40'taki zamanlayıcıyı 10 dakikaya çekin (yalnızca güvenlik ağı). Gereken secret: <code>WEBHOOK_API_KEY</code>.
      </p>
      <label className="pf">
        <b>Trendyol satıcı (seller) ID</b>
        <input value={sellerId} onChange={(e) => setSellerId(e.target.value)} placeholder="Trendyol Entegrasyon Bilgileri'ndeki satıcı ID" />
      </label>
      <div className="int-actions">
        <button type="button" className="btn ghost sm" disabled={!!busy} onClick={list}>{busy === 'webhook_list' ? '…' : 'Webhook\'ları listele'}</button>
        <button type="button" className="btn gold sm" disabled={!!busy || !sellerId} onClick={create}>{busy === 'webhook_create' ? '…' : 'Webhook oluştur (tüm statüler)'}</button>
      </div>
      {hookUrl && <p className="small muted">Bildirim adresi: <code>{hookUrl}</code></p>}
      {hooks && (hooks.length === 0 ? <p className="muted small">Kayıtlı webhook yok.</p> : (
        <div className="int-log">
          {hooks.map((h) => (
            <div key={h.id} className={`int-log-row ${h.status === 'ACTIVE' ? 'ok' : 'error'}`}>
              <b>{h.status}</b>
              <code>{h.id}</code>
              <span className="small">{h.url}</span>
              <span className="int-actions" style={{ gap: '.3rem' }}>
                {h.status === 'ACTIVE'
                  ? <button type="button" className="btn ghost sm" disabled={!!busy} onClick={() => act('webhook_deactivate', h.id, 'Pasife alındı')}>Pasife al</button>
                  : <button type="button" className="btn ghost sm" disabled={!!busy} onClick={() => act('webhook_activate', h.id, 'Aktife alındı')}>Aktife al</button>}
                <button type="button" className="btn ghost sm" disabled={!!busy} onClick={() => { if (confirm('Bu webhook silinsin mi?')) void act('webhook_delete', h.id, 'Silindi'); }}>Sil</button>
              </span>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
