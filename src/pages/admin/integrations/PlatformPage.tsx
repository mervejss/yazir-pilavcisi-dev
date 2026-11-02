import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { callPlatform, platformByCode, type PlatformField } from '@/lib/platforms';
import { useIntegrations, usePlatformEvents } from '@/hooks/useIntegrations';
import Switch from '@/components/ui/Switch';
import Icon from '@/components/ui/Icon';

export const STATUS_TEXT: Record<string, { label: string; cls: string }> = {
  not_connected: { label: 'Bağlı değil', cls: 'off' },
  pending_approval: { label: 'Onay bekliyor', cls: 'warn' },
  connected: { label: 'Bağlı', cls: 'ok' },
  error: { label: 'Hata var', cls: 'err' },
};

export const fmtDT = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

function Field({ f, value, onChange }: { f: PlatformField; value: any; onChange: (v: any) => void }) {
  if (f.type === 'bool') {
    return (
      <div className="pf pf-bool">
        <span><b>{f.label}</b>{f.help && <small>{f.help}</small>}</span>
        <Switch checked={!!value} onChange={() => onChange(!value)} />
      </div>
    );
  }
  return (
    <label className="pf">
      <b>{f.label}</b>
      {f.type === 'select' ? (
        <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : (
        <input
          type={f.type === 'number' ? 'number' : 'text'}
          value={value ?? ''}
          placeholder={f.placeholder}
          onChange={(e) => onChange(f.type === 'number' ? Number(e.target.value) : e.target.value)}
        />
      )}
      {f.help && <small>{f.help}</small>}
    </label>
  );
}

export default function PlatformPage({ code }: { code: string }) {
  const meta = platformByCode(code)!;
  const { get, loading, refetch } = useIntegrations();
  const row = get(code);
  const [cfg, setCfg] = useState<Record<string, any>>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [secretInfo, setSecretInfo] = useState<any>(null);
  const [showAll, setShowAll] = useState(false);
  const { events } = usePlatformEvents(code, !showAll);
  const [orderStats, setOrderStats] = useState<{ today: number; open: number } | null>(null);

  useEffect(() => { if (row) { setCfg(row.config || {}); setDirty(false); } }, [row?.updated_at, row?.platform]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('platform_order_stats');
      const s = (data as any[] | null)?.find((x) => x.source === code);
      setOrderStats(s ? { today: Number(s.today_count), open: Number(s.open_count) } : { today: 0, open: 0 });
    })();
    if (meta.implemented) callPlatform(code, 'status').then((r) => setSecretInfo(r));
  }, [code]);

  if (loading) return <div className="muted">Yükleniyor…</div>;
  if (!row) return <div className="card">Bu platform için kayıt bulunamadı. <code>sql/11_platform_integrations.sql</code> dosyasını çalıştırdınız mı?</div>;

  const st = STATUS_TEXT[row.status] || STATUS_TEXT.not_connected;
  const set = (k: string, v: any) => { setCfg((c) => ({ ...c, [k]: v })); setDirty(true); };

  const save = async () => {
    setBusy('save');
    const { error } = await supabase.from('integrations').update({ config: cfg }).eq('platform', code);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success('Ayarlar kaydedildi'); setDirty(false); refetch();
  };

  const toggle = async (on: boolean) => {
    const { error } = await supabase.from('integrations').update({ is_enabled: on }).eq('platform', code);
    if (error) return toast.error(error.message);
    toast.success(on ? `${meta.name} açıldı` : `${meta.name} kapatıldı`); refetch();
  };

  const run = async (action: string, label: string, body: Record<string, unknown> = {}) => {
    setBusy(action);
    const r = await callPlatform(code, action, body);
    setBusy(null);
    if (r.ok) toast.success(`${label}: tamam`); else toast.error(r.error || `${label} başarısız`);
    refetch();
    return r;
  };

  const secretState = (name: string) => {
    if (!meta.implemented) return 'sonraki adım';
    if (!secretInfo) return '…';
    if (name === 'CRON_SECRET') return secretInfo.cron_secret_set ? 'tanımlı' : 'isteğe bağlı';
    return secretInfo.secrets_set ? 'tanımlı' : 'eksik';
  };
  const placeholderIds = meta.storeFields.some((f) => ['000', '', undefined].includes(cfg[f.key]) && f.placeholder === '000');
  const Btn = ({ action, label, body }: { action: string; label: string; body?: Record<string, unknown> }) => (
    <button type="button" className="btn dark sm" disabled={!!busy || !meta.implemented} onClick={() => run(action, label, body)}>
      {busy === action ? '…' : label}
    </button>
  );

  return (
    <>
      <div className="bar">
        <div>
          <p className="crumb"><Link to="/admin/entegrasyonlar">Entegrasyonlar</Link> › {meta.name}</p>
          <h1>{meta.emoji} {meta.name}</h1>
          <p className="muted" style={{ margin: 0 }}>{meta.blurb}</p>
        </div>
        <div className="int-head-actions">
          <span className={`st-pill ${st.cls}`}>{st.label}</span>
          <label className="int-onoff">Entegrasyon açık <Switch checked={row.is_enabled} onChange={() => toggle(!row.is_enabled)} /></label>
        </div>
      </div>

      {!meta.implemented && (
        <div className="int-note warn">
          <Icon name="info" size={16} /> Bu platformun API fonksiyonu henüz kurulmadı. Kimlik/ayar alanlarını şimdiden doldurabilirsiniz; eşitleme düğmeleri bir sonraki adımda etkinleşecek.
        </div>
      )}
      {row.last_error && (
        <div className="int-note err"><Icon name="info" size={16} /> Son hata: {row.last_error}</div>
      )}
      <div className="int-note">
        <Icon name="lock" size={16} /> Gizli anahtarlar (API key/secret) <b>buraya girilmez</b> ve veritabanında tutulmaz; Supabase → Edge Functions → Secrets bölümünden tanımlanır.
        {meta.secrets.length > 0 && <> Gerekli değişkenler: {meta.secrets.map((s) => <code key={s}>{s}</code>)}</>}
      </div>

      <div className="int-grid">
        {/* 1 · API bağlantı bilgileri */}
        <section className="card int-card">
          <h3>1 · API bağlantı bilgileri</h3>
          {meta.connectionFields.map((f) => <Field key={f.key} f={f} value={cfg[f.key]} onChange={(v) => set(f.key, v)} />)}
          <ul className="int-checks">
            {meta.secrets.map((s) => (
              <li key={s}><code>{s}</code>
                <i className={secretState(s) === 'tanımlı' ? 'ok' : 'off'}>{secretState(s)}</i>
              </li>
            ))}
            {meta.docUrl && <li><a href={meta.docUrl} target="_blank" rel="noreferrer">API dokümanı <Icon name="external" size={12} /></a></li>}
          </ul>
        </section>

        {/* 2 · Restoran / mağaza bilgileri */}
        <section className="card int-card">
          <h3>2 · Restoran / mağaza bilgileri</h3>
          {meta.storeFields.map((f) => <Field key={f.key} f={f} value={cfg[f.key]} onChange={(v) => set(f.key, v)} />)}
          {placeholderIds && <p className="small muted">Kimlikler henüz <b>000</b>: işletmeyle netleşince buradan güncellenir.</p>}
          {code === 'trendyol' && <div className="int-actions"><Btn action="restaurant_info" label="Mağaza bilgisini getir" /></div>}
        </section>

        {/* 3 · Bağlantı durumu */}
        <section className="card int-card">
          <h3>3 · Bağlantı durumu</h3>
          <dl className="int-dl">
            <dt>Durum</dt><dd><span className={`st-pill ${st.cls}`}>{st.label}</span></dd>
            <dt>Son başarılı işlem</dt><dd>{fmtDT(row.last_ok_at)}</dd>
            <dt>Ardışık hata</dt><dd>{row.error_count}</dd>
            <dt>Ortam</dt><dd>{cfg.environment === 'prod' ? 'Canlı' : 'Test'}</dd>
          </dl>
          <div className="int-actions"><Btn action="test_connection" label="Bağlantıyı test et" /></div>
          <p className="small muted">Bu platformdaki bir hata yalnızca bu sayfanın durumunu etkiler; diğer platformların siparişleri akmaya devam eder.</p>
        </section>

        {/* 4 · Menü senkronizasyonu */}
        <section className="card int-card">
          <h3>4 · Menü senkronizasyonu</h3>
          <dl className="int-dl"><dt>Son menü eşitleme</dt><dd>{fmtDT(row.last_menu_sync_at)}</dd></dl>
          <p className="small muted">Platform menüsü çekilir, ürünler ada göre kendi menünüzle eşleştirilir. Fiyat ve açık/kapalı durumu eşleşen ürünler için gönderilir.</p>
          <div className="int-actions">
            <Btn action="sync_menu" label="Menüyü eşitle" />
            {code === 'trendyol' && <Btn action="push_working_hours" label="Çalışma saatlerini gönder" />}
          </div>
        </section>

        {/* 5 · Sipariş senkronizasyonu */}
        <section className="card int-card">
          <h3>5 · Sipariş senkronizasyonu</h3>
          <dl className="int-dl">
            <dt>Son sipariş çekimi</dt><dd>{fmtDT(row.last_order_sync_at)}</dd>
            <dt>Bugün gelen</dt><dd>{orderStats?.today ?? '…'}</dd>
            <dt>Açık siparişler</dt><dd>{orderStats?.open ?? '…'}</dd>
          </dl>
          <div className="int-actions">
            <Btn action="sync_orders" label="Siparişleri şimdi çek" />
            <Link to="/admin/siparisler" className="btn ghost sm">Siparişler panosu</Link>
          </div>
        </section>

        {/* 7 · Platforma özel ayarlar */}
        <section className="card int-card">
          <h3>7 · Platforma özel ayarlar</h3>
          {meta.settingFields.map((f) => <Field key={f.key} f={f} value={cfg[f.key]} onChange={(v) => set(f.key, v)} />)}
          {code === 'trendyol' && (
            <div className="int-extra">
              <p className="small muted">Uber Eats'ten geçen mağazalarda yorum uç noktaları 403 döner; bu normaldir, sistem hata saymaz.</p>
              <div className="int-actions">
                <Btn action="set_working_status" label="Restoranı AÇIK yap" body={{ open: true }} />
                <Btn action="set_working_status" label="Restoranı KAPALI yap" body={{ open: false }} />
                <Btn action="reviews" label="Yorumları kontrol et" />
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="int-save">
        <button type="button" className="btn gold" disabled={!dirty || busy === 'save'} onClick={save}>{busy === 'save' ? 'Kaydediliyor…' : 'Ayarları kaydet'}</button>
        {dirty && <span className="muted small">Kaydedilmemiş değişiklikler var</span>}
      </div>

      {/* 6 · Hata kayıtları */}
      <section className="card int-card" style={{ marginTop: '1rem' }}>
        <div className="orow"><h3 style={{ margin: 0 }}>6 · {showAll ? 'Tüm olaylar' : 'Hata kayıtları'}</h3>
          <button type="button" className="btn ghost sm" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Yalnızca hatalar' : 'Tüm olayları göster'}</button>
        </div>
        {events.length === 0 ? <p className="muted">Kayıt yok.</p> : (
          <div className="int-log">
            {events.map((e) => (
              <div key={e.id} className={`int-log-row ${e.status}`}>
                <span className="small muted">{fmtDT(e.created_at)}</span>
                <b>{e.direction === 'in' ? '⬇' : '⬆'} {e.event_type}</b>
                {e.external_ref && <code>{e.external_ref}</code>}
                <span>{e.error || 'başarılı'}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
