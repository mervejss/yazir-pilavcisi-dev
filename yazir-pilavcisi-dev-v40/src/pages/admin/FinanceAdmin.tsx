import { useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import '@/styles/analytics-pro.css';
import '@/styles/finance.css';
import { PRESETS, fmtDateTimeIst, resolveDateRange, todayKey, type Preset } from '@/lib/analyticsData';
import { commitImport, parseStatement, type ImportPreview } from '@/lib/financeImport';
import { isMissingTable, useFinance } from '@/hooks/useFinance';
import { Card } from '@/components/analytics/pro/Kit';
import { BreakdownTab, CostTab, OrdersTab, PaymentsTab, SummaryTab } from '@/components/finance/FinanceTabs';

const TABS = [
  { key: 'ozet', label: '📊 Özet' },
  { key: 'siparis', label: '🧾 Sipariş bazında' },
  { key: 'odeme', label: '🏦 Ödemeler' },
  { key: 'dokum', label: '🔍 Kesinti dökümü' },
  { key: 'maliyet', label: '⚙️ Maliyet & KDV' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function FinanceAdmin() {
  const [tab, setTab] = useState<TabKey>('ozet');
  const [preset, setPreset] = useState<Preset>('30');
  const today = todayKey();
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState(today);
  const range = useMemo(() => resolveDateRange(preset, customFrom || undefined, customTo || undefined), [preset, customFrom, customTo]);

  const f = useFinance(range);
  const r = f.result;

  const [progress, setProgress] = useState<string | null>(null);
  const [probe, setProbe] = useState<any>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const doSync = async () => {
    if (progress) return;
    setProgress('Başlıyor…');
    const s = await f.sync(range.from, range.to, setProgress);
    setProgress(null);
    if (s.errors.length) toast.error(`Trendyol finans: ${s.errors[0]}`, { duration: 14000 });
    else toast.success(`${s.saved.toLocaleString('tr-TR')} kayıt güncellendi (${s.windows} dönem)`);
    if (s.errors.length && !s.saved) doProbe();
  };

  const doProbe = async () => {
    setProgress('Bağlantı deneniyor…');
    const p = await f.probe();
    setProgress(null);
    setProbe(p.ok ? p.result : { works: false, hint: p.error, checks: [] });
  };

  const onFile = async (file?: File | null) => {
    if (!file) return;
    try { setPreview(await parseStatement(file)); }
    catch (e: any) { toast.error(e?.message || 'Dosya okunamadı'); }
    if (fileRef.current) fileRef.current.value = '';
  };
  const doImport = async () => {
    if (!preview) return;
    setImporting(true);
    const err = await commitImport(preview);
    setImporting(false);
    if (err) return toast.error('İçe aktarılamadı: ' + err, { duration: 12000 });
    toast.success(`${(preview.settlements.length + preview.others.length).toLocaleString('tr-TR')} kayıt içe aktarıldı`);
    setPreview(null); f.reload();
  };

  const missing = isMissingTable(f.error);
  const empty = !f.loading && !f.error && !r.hasData;

  return (
    <div className="anp-root">
      <div className="anp-head">
        <div>
          <h1>Trendyol Finans · Net Kâr</h1>
          <p className="muted">
            Komisyon, iade, indirim, stopaj, hizmet bedeli, KDV ve maliyet düşülmüş gerçek rakamlar · Trendyol Cari Hesap Ekstresi
            {f.lastSyncAt && <> · son senkron {fmtDateTimeIst(Date.parse(f.lastSyncAt))}</>}
          </p>
        </div>
        <div className="anp-actions no-print">
          <button type="button" className="anp-btn" onClick={f.reload} disabled={f.loading}>🔄 Yenile</button>
          <button type="button" className="anp-btn" onClick={() => fileRef.current?.click()}>📥 Dosyadan içe aktar</button>
          <button type="button" className="anp-btn" onClick={doProbe} disabled={!!progress}>🔌 Bağlantıyı dene</button>
          <button type="button" className="anp-btn gold" onClick={doSync} disabled={!!progress}>{progress || '⬇ Trendyol’dan çek'}</button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
      </div>

      <div className="anp-filters">
        <div className="anp-row">
          <div className="anp-pills no-print" role="tablist" aria-label="Tarih aralığı">
            {PRESETS.map((p) => (
              <button key={p.key} type="button" className={preset === p.key ? 'on' : ''}
                onClick={() => { setPreset(p.key); if (p.key === 'custom' && !customFrom) setCustomFrom(range.fromKey); }}>{p.label}</button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="anp-custom no-print">
              <input type="date" value={customFrom || range.fromKey} max={today} onChange={(e) => setCustomFrom(e.target.value)} aria-label="Başlangıç" />
              <span>→</span>
              <input type="date" value={customTo} max={today} onChange={(e) => setCustomTo(e.target.value)} aria-label="Bitiş" />
            </div>
          )}
        </div>
        <div className="anp-range-label">📅 {range.label} ({range.days} gün) · Trendyol finansal kayıtları sipariş teslim edildikten sonra oluşur</div>
      </div>

      {missing && <div className="anp-banner err">⚠️ Finans tabloları yok. Supabase SQL Editor’da <code>sql/24_trendyol_finance.sql</code> dosyasını çalıştırın.</div>}
      {f.error && !missing && <div className="anp-banner err">⚠️ Veri okunamadı: {f.error}</div>}

      {probe && (
        <div className={`anp-banner ${probe.works ? '' : 'err'}`}>
          <b>{probe.works ? '✅ Finans servisi çalışıyor' : '❌ Finans servisine ulaşılamadı'}</b> — {probe.hint}
          {probe.base && <div className="small muted">Adres: {probe.base} · satıcı: {probe.seller_id}</div>}
          {(probe.checks || []).map((c: any) => (
            <div key={c.label} className="small">{c.ok ? '✔' : '✖'} {c.label} → HTTP {c.status}{c.ok ? (c.total != null ? ` · ${c.total} kayıt` : '') : ` · ${String(c.body || '').slice(0, 160)}`}</div>
          ))}
          <button type="button" className="anp-mini" onClick={() => setProbe(null)}>Kapat</button>
        </div>
      )}

      {preview && (
        <Card title={`📥 İçe aktarma önizlemesi — ${preview.fileName}`}>
          <p>
            <b>{preview.settlements.length.toLocaleString('tr-TR')}</b> satış/iade/komisyon satırı ve <b>{preview.others.length.toLocaleString('tr-TR')}</b> diğer finansal satır
            tanındı ({preview.totalRows.toLocaleString('tr-TR')} satırdan). Aynı dosyayı tekrar yüklemek kayıtları çoğaltmaz.
          </p>
          {preview.missingColumns.length > 0 && <div className="anp-banner err">Eksik sütun: {preview.missingColumns.join(', ')}</div>}
          {preview.skipped.length > 0 && (
            <div className="anp-note">Tanınmadığı için atlanan işlem türleri: {preview.skipped.slice(0, 8).map((s) => `${s.label} (${s.count})`).join(', ')}</div>
          )}
          <div className="fin-actions">
            <button type="button" className="anp-btn gold" disabled={importing || (!preview.settlements.length && !preview.others.length)} onClick={doImport}>{importing ? 'Aktarılıyor…' : '✅ İçe aktar'}</button>
            <button type="button" className="anp-btn" onClick={() => setPreview(null)}>Vazgeç</button>
          </div>
        </Card>
      )}

      {empty && (
        <Card title="Henüz finans verisi yok">
          <ol className="fin-steps">
            <li><b>sql/24_trendyol_finance.sql</b> dosyasını Supabase’de çalıştırın (yapmadıysanız).</li>
            <li><code>supabase functions deploy platform-trendyol</code> ile fonksiyonu yeniden dağıtın.</li>
            <li>Yukarıdan <b>“🔌 Bağlantıyı dene”</b>: Trendyol finans servisi anahtarlarınızla yanıt veriyor mu görün.</li>
            <li>Çalışıyorsa <b>“⬇ Trendyol’dan çek”</b>. Çalışmıyorsa Trendyol panelinden Cari Hesap Ekstresi’ni indirip <b>“📥 Dosyadan içe aktar”</b> ile yükleyin.</li>
          </ol>
        </Card>
      )}

      <nav className="anp-tabs no-print" role="tablist">
        {TABS.map((t) => <button key={t.key} type="button" className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>{t.label}</button>)}
      </nav>

      {f.loading ? (
        <><div className="anp-skel" /><div className="anp-skel" style={{ height: 260 }} /></>
      ) : (
        <>
          {tab === 'ozet' && <SummaryTab r={r} settings={f.settings} range={range} />}
          {tab === 'siparis' && <OrdersTab orders={r.byOrder} />}
          {tab === 'odeme' && <PaymentsTab recon={f.recon} onRefresh={async (id) => {
            const x = await f.refreshPaymentOrder(id);
            if (x.ok) toast.success(`#${id} yenilendi`); else toast.error(x.error || 'Yenilenemedi');
          }} />}
          {tab === 'dokum' && <BreakdownTab r={r} />}
          {tab === 'maliyet' && <CostTab settings={f.settings} onSave={f.saveSettings} />}
        </>
      )}
    </div>
  );
}
