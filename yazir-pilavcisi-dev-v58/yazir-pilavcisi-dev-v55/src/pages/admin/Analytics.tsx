import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import '@/styles/analytics-pro.css';
import {
  GROUP_META, INSIDE_CHANNELS, PLATFORM_KEYS, PRESETS, autoGran, channelGroup, fmtDateTimeIst, loadSettings, platformLabel, resolveDateRange, saveSettings, todayKey,
  type AnalyticsSettings, type Gran, type Preset,
} from '@/lib/analyticsData';
import { useFinanceActuals } from '@/hooks/useFinance';
import ProfitTab from '@/components/analytics/pro/tabs/ProfitTab';
import { SOURCE_EMOJI } from '@/lib/constants';
import { useAnalysis, useAnalyticsData, usePlatformCounts } from '@/hooks/useAnalyticsData';
import { exportOrdersCsv, exportSummaryCsv, exportWorkbook } from '@/lib/analyticsExport';
import { fmtMoneyShort } from '@/components/analytics/pro/Kit';
import OverviewTab from '@/components/analytics/pro/tabs/OverviewTab';
import TimeTab from '@/components/analytics/pro/tabs/TimeTab';
import PlatformTab from '@/components/analytics/pro/tabs/PlatformTab';
import ProductTab from '@/components/analytics/pro/tabs/ProductTab';
import CourierTab from '@/components/analytics/pro/tabs/CourierTab';
import CustomerTab from '@/components/analytics/pro/tabs/CustomerTab';
import BusinessTab from '@/components/analytics/pro/tabs/BusinessTab';
import type { TabProps } from '@/components/analytics/pro/tabs/types';

const TABS = [
  { key: 'genel', label: '📊 Genel', C: OverviewTab },
  { key: 'kar', label: '💼 Kâr & Kanal', C: ProfitTab },
  { key: 'zaman', label: '⏰ Zaman', C: TimeTab },
  { key: 'platform', label: '🛵 Platform', C: PlatformTab },
  { key: 'urun', label: '🍽️ Ürün', C: ProductTab },
  { key: 'kurye', label: '🚴 Kurye', C: CourierTab },
  { key: 'musteri', label: '👥 Müşteri', C: CustomerTab },
  { key: 'isletme', label: '🏪 İşletme', C: BusinessTab },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function Analytics() {
  const [sp, setSp] = useSearchParams();
  const tab = (TABS.find((t) => t.key === sp.get('sekme'))?.key || 'genel') as TabKey;
  const preset = (PRESETS.find((p) => p.key === sp.get('donem'))?.key || '30') as Preset;
  const platform = sp.get('kanal') || 'all';
  const today = todayKey();
  const customFrom = sp.get('bas') || '';
  const customTo = sp.get('bit') || today;

  const patch = useCallback((o: Record<string, string | null>) => {
    const n = new URLSearchParams(sp);
    Object.entries(o).forEach(([k, v]) => (v == null ? n.delete(k) : n.set(k, v)));
    setSp(n, { replace: true });
  }, [sp, setSp]);

  const [settings, setSettingsState] = useState<AnalyticsSettings>(loadSettings);
  const setSettings = (s: AnalyticsSettings) => { setSettingsState(s); saveSettings(s); };

  const range = useMemo(() => resolveDateRange(preset, customFrom || undefined, customTo || undefined), [preset, customFrom, customTo]);
  const [gran, setGran] = useState<Gran>(autoGran(range.days));
  useEffect(() => setGran(autoGran(range.days)), [range.days]);

  const data = useAnalyticsData(range);
  const counts = usePlatformCounts(data.orders, range);
  const finActuals = useFinanceActuals(range);
  const { cur, prev, analysis } = useAnalysis(data.orders, data.catalog, range, platform, settings.slaMin);

  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [printAll, setPrintAll] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  useEffect(() => {
    const done = () => setPrintAll(false);
    window.addEventListener('afterprint', done);
    return () => window.removeEventListener('afterprint', done);
  }, []);

  const { insideKeys, outsideKeys } = useMemo(() => {
    const extra = Object.keys(counts).filter((k) => k !== 'all' && k !== 'inside' && k !== 'outside' && !PLATFORM_KEYS.includes(k));
    return {
      insideKeys: INSIDE_CHANNELS,
      outsideKeys: [...PLATFORM_KEYS.filter((k) => !INSIDE_CHANNELS.includes(k)), ...extra.filter((k) => channelGroup(k) === 'outside')],
    };
  }, [counts]);

  const props: TabProps = {
    a: analysis, cur, prev, range, platform, compare: settings.compare, settings, onSettings: setSettings,
    gran, onGran: setGran, courierNames: data.courierNames, tableUsage: data.tableUsage, fin: finActuals.fin, finSettings: finActuals.settings,
  };
  const Active = TABS.find((t) => t.key === tab)!.C;

  const doExport = async (kind: 'xlsx' | 'summary' | 'orders') => {
    setMenu(false);
    if (!cur.length && kind !== 'summary') { toast.error('Dışa aktarılacak sipariş yok.'); return; }
    try {
      setBusy(true);
      if (kind === 'xlsx') await exportWorkbook(analysis, cur, platform, data.courierNames, settings);
      else if (kind === 'summary') exportSummaryCsv(analysis, platform);
      else exportOrdersCsv(cur, analysis, platform);
      toast.success('Dosya indirildi.');
    } catch (e: any) {
      toast.error('Dışa aktarma başarısız: ' + (e?.message || 'bilinmeyen hata'));
    } finally { setBusy(false); }
  };
  const doPrint = (all: boolean) => {
    setMenu(false);
    setPrintAll(all);
    setTimeout(() => window.print(), all ? 600 : 150);
  };

  const platformName = platform === 'all' ? 'Tüm platformlar' : platform === 'inside' || platform === 'outside' ? GROUP_META[platform].label : platformLabel(platform);

  return (
    <div className="anp-root">
      <div className="anp-head">
        <div>
          <h1>Raporlar ve İşletme Analizi</h1>
          <p className="muted">
            Canlı siparişler + Excel'den aktarılan geçmiş kayıtlar · İstanbul saati · iş günü 03:00
            {data.loadedAt && <> · son güncelleme {fmtDateTimeIst(data.loadedAt).slice(11)}</>}
          </p>
        </div>
        <div className="anp-actions no-print" ref={menuRef}>
          <button type="button" className="anp-btn" onClick={data.reload} disabled={data.loading}>🔄 Yenile</button>
          <button type="button" className="anp-btn gold" onClick={() => setMenu((m) => !m)} disabled={busy}>⬇ Dışa aktar / Yazdır ▾</button>
          {menu && (
            <div className="anp-menu">
              <button type="button" onClick={() => doExport('xlsx')}>📗 Excel (.xlsx) — tüm analiz sayfaları</button>
              <button type="button" onClick={() => doExport('summary')}>📄 Özet raporu (CSV)</button>
              <button type="button" onClick={() => doExport('orders')}>🧾 Filtrelenmiş siparişler (CSV · {cur.length})</button>
              <hr />
              <button type="button" onClick={() => doPrint(false)}>🖨️ Bu sekmeyi yazdır / PDF</button>
              <button type="button" onClick={() => doPrint(true)}>🖨️ Tüm raporu yazdır / PDF</button>
            </div>
          )}
        </div>
      </div>

      <div className="anp-print-title">
        <h2>Yazır Pilavcısı — Analiz Raporu</h2>
        <p>{range.label} · {platformName} · Oluşturulma: {fmtDateTimeIst(Date.now())}</p>
      </div>

      <div className="anp-filters">
        <div className="anp-row">
          <div className="anp-pills no-print" role="tablist" aria-label="Tarih aralığı">
            {PRESETS.map((p) => (
              <button key={p.key} type="button" className={preset === p.key ? 'on' : ''}
                onClick={() => patch({ donem: p.key === '30' ? null : p.key, ...(p.key === 'custom' && !customFrom ? { bas: range.fromKey, bit: range.toKey } : {}) })}>{p.label}</button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="anp-custom no-print">
              <input type="date" value={customFrom || range.fromKey} max={today} onChange={(e) => patch({ bas: e.target.value || null })} aria-label="Başlangıç" />
              <span>→</span>
              <input type="date" value={customTo} max={today} onChange={(e) => patch({ bit: e.target.value || null })} aria-label="Bitiş" />
            </div>
          )}
          <label className="anp-toggle no-print">
            <input type="checkbox" checked={settings.compare} onChange={(e) => setSettings({ ...settings, compare: e.target.checked })} />
            Önceki dönemle karşılaştır
          </label>
        </div>
        <div className="anp-range-label">📅 {range.label} ({range.days} iş günü){settings.compare && <span className="muted"> · karşılaştırma: {range.prevFromKey.slice(8)}.{range.prevFromKey.slice(5, 7)} → {range.prevToKey.slice(8)}.{range.prevToKey.slice(5, 7)}</span>}</div>

        <div className="anp-plat" role="tablist" aria-label="Kanal filtresi">
          <button type="button" className={platform === 'all' ? 'on' : ''} onClick={() => patch({ kanal: null })}
            title={`Tüm kanallar: ${(counts.all?.orders || 0)} sipariş · ${fmtMoneyShort(counts.all?.revenue || 0)} ciro`}>
            <span>🌐 Tümü</span><span className="cnt">{(counts.all?.orders || 0).toLocaleString('tr-TR')}</span>
          </button>
        </div>
        {([['inside', insideKeys], ['outside', outsideKeys]] as const).map(([g, keys]) => {
          const gc = counts[g] || { orders: 0, revenue: 0, cancelled: 0 };
          const m = GROUP_META[g];
          return (
            <div key={g} className="anp-plat anp-plat-group" role="tablist" aria-label={m.label}>
              <button type="button" className={`${platform === g ? 'on' : ''}${gc.orders === 0 ? ' zero' : ''} grp`} onClick={() => patch({ kanal: g })}
                title={`${m.label} — ${m.hint}: ${gc.orders} sipariş · ${fmtMoneyShort(gc.revenue)} ciro`}>
                <span>{m.emoji} {m.label}</span><span className="cnt">{gc.orders.toLocaleString('tr-TR')}</span>
              </button>
              <span className="anp-plat-sep" aria-hidden>›</span>
              {keys.map((k) => {
                const c = counts[k] || { orders: 0, revenue: 0, cancelled: 0 };
                return (
                  <button key={k} type="button" className={`${platform === k ? 'on' : ''}${c.orders === 0 ? ' zero' : ''}`} onClick={() => patch({ kanal: k })}
                    title={`${platformLabel(k)}: ${c.orders} sipariş · ${c.cancelled} iptal · ${fmtMoneyShort(c.revenue)} ciro`}>
                    <span>{SOURCE_EMOJI[k] || '🔗'} {platformLabel(k)}</span>
                    <span className="cnt">{c.orders.toLocaleString('tr-TR')}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {data.warnings.map((w, i) => <div key={i} className="anp-banner err">⚠️ {w}</div>)}
      {!data.loading && !data.warnings.length && data.counts.imported > 0 && (
        <div className="anp-note no-print">Bu analiz {data.counts.live.toLocaleString('tr-TR')} canlı sipariş + {data.counts.imported.toLocaleString('tr-TR')} aktarılmış geçmiş sipariş içerir (önceki dönem dahil). Kurye, müşteri ve masa verileri yalnızca canlı siparişlerden gelir.</div>
      )}

      <nav className="anp-tabs no-print" role="tablist">
        {TABS.map((t) => <button key={t.key} type="button" className={tab === t.key ? 'on' : ''} onClick={() => patch({ sekme: t.key === 'genel' ? null : t.key })}>{t.label}</button>)}
      </nav>

      {data.loading ? (
        <><div className="anp-skel" /><div className="anp-skel" style={{ height: 260 }} /><div className="anp-skel" /></>
      ) : printAll ? (
        TABS.map((t) => (
          <section key={t.key} className="anp-print-section">
            <h2>{t.label}</h2>
            <t.C {...props} />
          </section>
        ))
      ) : (
        <Active {...props} />
      )}
    </div>
  );
}
