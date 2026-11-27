import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { tl, businessDayStart } from '@/lib/helpers';
import { SOURCE_LABELS, SOURCE_EMOJI, SOURCE_COLORS } from '@/lib/constants';
import {
  FIELD_DEFS, autoMap, buildItems, deleteBatch, importItems, readWorkbook,
  type BuildResult, type FieldKey, type Mapping, type ParsedSheet,
} from '@/lib/pastOrdersImport';
import '@/styles/past-orders.css';

// ---------------------------------------------------------------------------
// Geçmiş siparişler: (1) sitede biten siparişler (web, telefon, masa, Trendyol canlı...) +
// (2) Excel'den yüklenen platform siparişleri. Her kaynak ayrı sekmede listelenir.
// ---------------------------------------------------------------------------
const TABS = ['all', 'web', 'phone', 'table', 'counter', 'trendyol', 'yemeksepeti', 'migros', 'getir', 'other'] as const;
const IMPORT_PLATFORMS = ['trendyol', 'yemeksepeti', 'migros', 'getir', 'other', 'web'] as const;

interface PastRow {
  key: string;
  liveId?: string;          // sitedeki (orders) sipariş kimliği — yalnızca canlı kayıtlarda
  origin: 'live' | 'import';
  platform: string;
  no: string;
  at: string;               // sıralama için yerel zaman metni
  atDate: Date;
  finishedAt: Date | null;
  state: 'delivered' | 'cancelled' | 'other';
  statusText: string;
  total: number;
  customer: string;
  payment: string;
  place: string;
  reason: string;
  items: { name: string; qty: number; price: number }[];
}

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtDT = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
// "YYYY-MM-DD HH:MM:SS" (saat dilimsiz duvar saati) → yerel Date
const wall = (s: string | null): Date | null => {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) : null;
};
const stateOfText = (t: string): PastRow['state'] => {
  const s = (t || '').toLocaleLowerCase('tr');
  if (s.includes('iptal') || s.includes('cancel') || s.includes('unsupplied')) return 'cancelled';
  if (s.includes('teslim') || s.includes('deliver')) return 'delivered';
  return 'other';
};
const LIVE_PAYMENT: Record<string, string> = {
  cash_on_delivery: 'Kapıda nakit', card_on_delivery: 'Kapıda kart', online_card: 'Online kart', platform_online: 'Platform (online)',
};

export default function PastOrders() {
  const role = useAuthStore((s) => s.profile?.role);
  const isOwner = role === 'owner';
  const canDelete = role === 'owner' || role === 'sub_admin';
  const [deleting, setDeleting] = useState<string | null>(null);
  const today = new Date();
  const [from, setFrom] = useState(isoDay(addDays(today, -14)));
  const [to, setTo] = useState(isoDay(today));
  const [includeToday, setIncludeToday] = useState(false);
  const [tab, setTab] = useState<(typeof TABS)[number]>('all');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<PastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [truncated, setTruncated] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [batches, setBatches] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const fromD = new Date(`${from}T00:00:00`);
    const toD = new Date(`${to}T23:59:59`);
    const dayStart = businessDayStart().toISOString();
    const LIVE_LIMIT = 2000, IMP_LIMIT = 5000;

    let lq = supabase.from('orders')
      .select('id,order_no,source,order_type,status,customer_name,district,payment_method,total,created_at,delivered_at,cancelled_at,cancel_reason,pin_code,external_ref,orderNumber:external_payload->>orderNumber,order_items(product_name,variant_name,quantity,unit_price)')
      .in('status', ['delivered', 'cancelled'])
      .gte('created_at', fromD.toISOString()).lte('created_at', toD.toISOString())
      .order('created_at', { ascending: false }).limit(LIVE_LIMIT);
    // Bugünün biten siparişleri hâlâ Siparişler panosunda; "bugünü de göster" kapalıyken buraya gelmez
    if (!includeToday) lq = lq.or(`delivered_at.lt.${dayStart},cancelled_at.lt.${dayStart}`);

    const iq = supabase.from('past_import_orders_v').select('*')
      .gte('ordered_at', `${from} 00:00:00`).lte('ordered_at', `${to} 23:59:59`)
      .order('ordered_at', { ascending: false }).limit(IMP_LIMIT);

    const [live, imp, bt] = await Promise.all([
      lq, iq,
      supabase.from('past_order_batches').select('*').order('period_start', { ascending: false }),
    ]);
    if (live.error) toast.error('Sitedeki geçmiş siparişler okunamadı: ' + live.error.message);
    if (imp.error) toast.error('İçe aktarılan siparişler okunamadı (sql/23_past_orders_v2.sql çalıştırıldı mı?): ' + imp.error.message);
    setBatches((bt.data as any[]) || []);

    const liveRows: PastRow[] = ((live.data as any[]) || []).map((o) => {
      const at = new Date(o.created_at);
      const fin = o.delivered_at || o.cancelled_at;
      return {
        key: 'l-' + o.id, liveId: o.id, origin: 'live', platform: o.source, no: String(o.order_no), at: fmtDT(at), atDate: at,
        finishedAt: fin ? new Date(fin) : null, state: o.status === 'cancelled' ? 'cancelled' : 'delivered',
        statusText: o.status === 'cancelled' ? 'İptal edildi' : 'Teslim edildi',
        total: Number(o.total) || 0, customer: o.customer_name || 'Misafir', payment: LIVE_PAYMENT[o.payment_method || ''] || o.payment_method || '—',
        place: o.district || '', reason: o.status === 'cancelled' ? o.cancel_reason || '' : '',
        items: (o.order_items || []).map((i: any) => ({ name: i.product_name + (i.variant_name ? ` (${i.variant_name})` : ''), qty: i.quantity, price: Number(i.unit_price) || 0 })),
      };
    });

    // Aynı Trendyol siparişi hem canlı akıştan hem Excel'den gelmişse Excel kopyası atlanır
    const liveNos = new Set<string>();
    ((live.data as any[]) || []).forEach((o) => { if (o.pin_code) liveNos.add(String(o.pin_code)); if (o.orderNumber) liveNos.add(String(o.orderNumber)); });

    const impRows: PastRow[] = ((imp.data as any[]) || [])
      .filter((o) => !liveNos.has(String(o.order_no)))
      .map((o) => {
        const at = wall(o.ordered_at) || new Date(0);
        const st = String(o.status || '');
        return {
          key: `i-${o.platform}-${o.order_no}`, origin: 'import', platform: o.platform, no: String(o.order_no), at: fmtDT(at), atDate: at,
          finishedAt: wall(o.delivered_at), state: stateOfText(st), statusText: st || '—', total: Number(o.total) || 0,
          customer: o.delivery_model || '—', payment: o.payment_method || '—', place: [o.district, o.city].filter(Boolean).join(', '), reason: '',
          items: ((o.items as any[]) || []).map((i) => ({ name: i.name, qty: Number(i.qty) || 1, price: Number(i.unit_price) || 0 })),
        };
      });

    const all = [...liveRows, ...impRows].sort((a, b) => b.atDate.getTime() - a.atDate.getTime());
    setRows(all);
    setTruncated((live.data?.length || 0) >= LIVE_LIMIT || (imp.data?.length || 0) >= IMP_LIMIT);
    setLoading(false);
  }, [from, to, includeToday]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: rows.length };
    rows.forEach((r) => { m[r.platform] = (m[r.platform] || 0) + 1; });
    return m;
  }, [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr');
    return rows.filter((r) => (tab === 'all' || r.platform === tab) &&
      (!needle || r.no.includes(needle) || r.customer.toLocaleLowerCase('tr').includes(needle) ||
        r.place.toLocaleLowerCase('tr').includes(needle) || r.items.some((i) => i.name.toLocaleLowerCase('tr').includes(needle))));
  }, [rows, tab, q]);

  const kpi = useMemo(() => {
    const delivered = shown.filter((r) => r.state !== 'cancelled');
    const revenue = delivered.reduce((t, r) => t + r.total, 0);
    return { count: shown.length, cancelled: shown.length - delivered.length, revenue, avg: delivered.length ? revenue / delivered.length : 0 };
  }, [shown]);

  // Platform bazlı kısa özet (sekmelerin altında)
  const perPlatform = useMemo(() => {
    const m = new Map<string, { n: number; sum: number }>();
    rows.filter((r) => r.state !== 'cancelled').forEach((r) => {
      const x = m.get(r.platform) || { n: 0, sum: 0 }; x.n++; x.sum += r.total; m.set(r.platform, x);
    });
    return [...m.entries()].sort((a, b) => b[1].sum - a[1].sum);
  }, [rows]);

  // Yanlış deneme / hatalı siparişi veritabanından KALICI siler (web + panel). İşlem denetim kaydına yazılır.
  const removeRow = async (r: PastRow) => {
    const label = `#${r.no} · ${r.customer} · ${tl(r.total)}`;
    if (!window.confirm(`${label}\n\nBu sipariş veritabanından KALICI olarak silinecek (geri alınamaz). Emin misiniz?`)) return;
    setDeleting(r.key);
    try {
      const { error } = r.liveId
        ? await supabase.rpc('admin_delete_order', { p_order_id: r.liveId } as any)
        : await supabase.rpc('admin_delete_past_import_order', { p_platform: r.platform, p_order_no: r.no } as any);
      if (error) throw error;
      setRows((cur) => cur.filter((x) => x.key !== r.key));
      if (open === r.key) setOpen(null);
      toast.success(`Sipariş ${label} silindi`);
      load();
    } catch (e: any) {
      const m = String(e?.message || e);
      toast.error(/admin_delete|function|does not exist|schema cache/i.test(m) ? 'Silme için yönetici sql/32_delete_orders_courier_payment.sql dosyasını Supabase SQL Editor\'da çalıştırmalı.' : m, { duration: 8000 });
    } finally {
      setDeleting(null);
    }
  };

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Tarih', 'Kaynak', 'Sipariş No', 'Durum', 'Müşteri/Teslimat', 'Yer', 'Ödeme', 'Ürünler', 'Tutar'];
    const lines = shown.map((r) => [r.at, SOURCE_LABELS[r.platform] || r.platform, r.no, r.statusText, r.customer, r.place, r.payment,
      r.items.map((i) => `${i.qty}x ${i.name}`).join(' | '), r.total.toFixed(2).replace('.', ',')].map(esc).join(';'));
    const blob = new Blob(['\ufeff' + [head.map(esc).join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `gecmis-siparisler_${from}_${to}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <div className="bar">
        <div>
          <h1>Geçmiş Siparişler</h1>
          <p className="muted" style={{ margin: 0 }}>
            Gün (03:00) bittiğinde teslim edilen ve iptal edilen siparişler Siparişler panosundan buraya geçer. Web, telefon, masa ve her platform ayrı sekmede listelenir.
          </p>
        </div>
        <button type="button" className="btn ghost" onClick={exportCsv} disabled={!shown.length}>⬇ CSV indir</button>
      </div>

      <div className="po-filters card">
        <label>Başlangıç<input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>Bitiş<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
        <div className="po-presets">
          {[{ l: 'Son 7 gün', d: 6 }, { l: 'Son 15 gün', d: 14 }, { l: 'Son 30 gün', d: 29 }].map((p) => (
            <button key={p.l} type="button" className="btn ghost sm" onClick={() => { setFrom(isoDay(addDays(new Date(), -p.d))); setTo(isoDay(new Date())); }}>{p.l}</button>
          ))}
        </div>
        <label className="po-check"><input type="checkbox" checked={includeToday} onChange={(e) => setIncludeToday(e.target.checked)} /> Bugün biten siparişleri de göster</label>
        <label className="po-search">Ara<input placeholder="Sipariş no, müşteri, ürün…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      </div>

      <div className="src-filter" role="tablist" aria-label="Sipariş kaynağı">
        {TABS.map((t) => (
          <button key={t} type="button" className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {t === 'all' ? 'Tümü' : `${SOURCE_EMOJI[t] || '•'} ${SOURCE_LABELS[t] || t}`} <i>{counts[t] || 0}</i>
          </button>
        ))}
      </div>

      <div className="po-kpis">
        <div className="card po-kpi"><span className="muted small">Sipariş</span><b>{kpi.count}</b></div>
        <div className="card po-kpi"><span className="muted small">İptal</span><b>{kpi.cancelled}</b></div>
        <div className="card po-kpi"><span className="muted small">Ciro (iptaller hariç)</span><b>{tl(kpi.revenue)}</b></div>
        <div className="card po-kpi"><span className="muted small">Ortalama sepet</span><b>{tl(kpi.avg)}</b></div>
      </div>

      {tab === 'all' && perPlatform.length > 1 && (
        <div className="po-split card">
          {perPlatform.map(([p, x]) => (
            <span key={p} className="po-split-item"><i style={{ background: SOURCE_COLORS[p] || '#6b6556' }} />{SOURCE_LABELS[p] || p}: <b>{x.n}</b> sipariş · {tl(x.sum)}</span>
          ))}
        </div>
      )}
      {truncated && <p className="small po-warn">Sonuç sınırına ulaşıldı; tarih aralığını daralttığınızda eksiksiz liste görünür.</p>}

      <div className="card po-table-wrap">
        {loading ? <p className="muted" style={{ padding: '1rem' }}>Yükleniyor…</p> : shown.length === 0 ? (
          <p className="muted" style={{ padding: '1rem' }}>Bu aralıkta kayıt yok.</p>
        ) : (
          <table className="po-table">
            <thead><tr><th>Tarih</th><th>Kaynak</th><th>No</th><th>Müşteri / Teslimat</th><th>Ürünler</th><th>Ödeme</th><th>Durum</th><th style={{ textAlign: 'right' }}>Tutar</th>{canDelete && <th aria-label="Sil" />}</tr></thead>
            <tbody>
              {shown.map((r) => (
                <Fragment key={r.key}>
                  <tr className={`po-row ${r.state}`} onClick={() => setOpen(open === r.key ? null : r.key)}>
                    <td>{r.at}</td>
                    <td><span className="src" style={{ background: SOURCE_COLORS[r.platform] || '#6b6556' }}>{SOURCE_EMOJI[r.platform] || '•'} {SOURCE_LABELS[r.platform] || r.platform}</span></td>
                    <td><code>{r.no}</code></td>
                    <td>{r.customer}{r.place && <div className="muted small">{r.place}</div>}</td>
                    <td className="po-items">{r.items.slice(0, 2).map((i) => `${i.qty}× ${i.name}`).join(', ')}{r.items.length > 2 && ` +${r.items.length - 2}`}</td>
                    <td>{r.payment}</td>
                    <td><span className={`po-st ${r.state}`}>{r.statusText}</span></td>
                    <td style={{ textAlign: 'right' }}><b>{tl(r.total)}</b></td>
                    {canDelete && (
                      <td style={{ textAlign: 'right' }}>
                        <button type="button" className="btn ghost sm po-del" disabled={deleting === r.key} onClick={(e) => { e.stopPropagation(); removeRow(r); }} title="Bu siparişi veritabanından kalıcı sil">
                          {deleting === r.key ? '…' : '🗑 Sil'}
                        </button>
                      </td>
                    )}
                  </tr>
                  {open === r.key && (
                    <tr className="po-detail"><td colSpan={canDelete ? 9 : 8}>
                      <ul>{r.items.map((i, k) => <li key={k}>{i.qty}× {i.name} <span className="muted">— {tl(i.price)}</span></li>)}</ul>
                      <div className="muted small">
                        Kaynak: {r.origin === 'live' ? 'Site / canlı akış' : 'Excel içe aktarma'}
                        {r.finishedAt && ` · Bitiş: ${fmtDT(r.finishedAt)}`}{r.reason && ` · İptal nedeni: ${r.reason}`}
                      </div>
                      {canDelete && (
                        <button type="button" className="btn ghost sm po-del" style={{ marginTop: '0.5rem' }} disabled={deleting === r.key} onClick={() => removeRow(r)}>
                          {deleting === r.key ? 'Siliniyor…' : '🗑 Bu siparişi sil'}
                        </button>
                      )}
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isOwner && <ImportPanel batches={batches} onDone={load} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Excel'den geçmiş sipariş yükleme (yalnızca owner)
// ---------------------------------------------------------------------------
function ImportPanel({ batches, onDone }: { batches: any[]; onDone: () => void }) {
  const [platform, setPlatform] = useState<string>('trendyol');
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [map, setMap] = useState<Mapping>({});
  const [built, setBuilt] = useState<BuildResult | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => { setFile(null); setSheet(null); setMap({}); setBuilt(null); if (inputRef.current) inputRef.current.value = ''; };

  const pick = async (f: File | null, sheetName?: string) => {
    if (!f) return;
    setBusy(true);
    try {
      const s = await readWorkbook(f, sheetName);
      setFile(f); setSheet(s);
      const m = autoMap(s.headers);
      setMap(m);
    } catch (e: any) { toast.error('Dosya okunamadı: ' + (e?.message || e)); reset(); }
    setBusy(false);
  };

  // eşleme değişince önizlemeyi yeniden hesapla
  useEffect(() => {
    let off = false;
    if (!sheet) { setBuilt(null); return; }
    buildItems(sheet, map).then((b) => { if (!off) setBuilt(b); }).catch(() => { if (!off) setBuilt(null); });
    return () => { off = true; };
  }, [sheet, map]);

  const missingRequired = FIELD_DEFS.filter((f) => f.required && map[f.key] === undefined);

  const run = async () => {
    if (!file || !built) return;
    setBusy(true);
    try {
      const r = await importItems(platform, file.name, built);
      toast.success(`${r.orders} sipariş · ${r.inserted} kalem yüklendi${r.skippedDuplicates ? ` (${r.skippedDuplicates} kalem daha önce yüklü olduğu için atlandı)` : ''}`, { duration: 6000 });
      reset(); onDone();
    } catch (e: any) { toast.error('İçe aktarılamadı: ' + (e?.message || e), { duration: 9000 }); }
    setBusy(false);
  };

  const removeBatch = async (key: string) => {
    if (!window.confirm(`"${key}" partisindeki tüm geçmiş sipariş kayıtları silinsin mi?`)) return;
    try { await deleteBatch(key); toast.success('Parti silindi'); onDone(); } catch (e: any) { toast.error(e?.message || 'Silinemedi'); }
  };

  return (
    <section className="card po-import">
      <h3 style={{ marginTop: 0 }}>📥 Excel'den geçmiş sipariş yükle</h3>
      <p className="muted small">
        Trendyol'dan (veya başka platformdan) indirdiğiniz "Siparişleriniz" Excel dosyasını seçin. Sütunlar otomatik eşlenir; yanlışsa aşağıdan düzeltebilirsiniz.
        Aynı sipariş numarası daha önce yüklenmişse tekrar eklenmez. Her 15 günlük dosyayı aynı şekilde yükleyebilirsiniz.
      </p>
      <div className="po-import-row">
        <label>Platform
          <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {IMPORT_PLATFORMS.map((p) => <option key={p} value={p}>{SOURCE_LABELS[p] || p}</option>)}
          </select>
        </label>
        <label>Dosya (.xlsx)
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => pick(e.target.files?.[0] || null)} />
        </label>
        {sheet && sheet.sheets.length > 1 && (
          <label>Sayfa
            <select value={sheet.sheetName} onChange={(e) => pick(file, e.target.value)}>
              {sheet.sheets.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
      </div>

      {sheet && (
        <>
          <div className="po-map">
            {FIELD_DEFS.map((f) => (
              <label key={f.key} className={f.required && map[f.key] === undefined ? 'bad' : ''}>
                {f.label}{f.required ? ' *' : ''}
                <select value={map[f.key] ?? ''} onChange={(e) => setMap((m) => { const n = { ...m }; if (e.target.value === '') delete n[f.key as FieldKey]; else n[f.key as FieldKey] = Number(e.target.value); return n; })}>
                  <option value="">— yok —</option>
                  {sheet.headers.map((h, i) => <option key={i} value={i}>{h || `(sütun ${i + 1})`}</option>)}
                </select>
              </label>
            ))}
          </div>
          {missingRequired.length > 0 && <p className="po-warn small">Zorunlu sütun eşlenmedi: {missingRequired.map((f) => f.label).join(', ')}</p>}
          {built && (
            <p className="small">
              <b>{built.orderCount}</b> sipariş · <b>{built.items.length}</b> kalem · toplam <b>{tl(built.total)}</b>
              {built.minDate && <> · {built.minDate} → {built.maxDate}</>}
              {built.skipped > 0 && <span className="muted"> · {built.skipped} boş/eksik satır yok sayıldı</span>}
            </p>
          )}
          <div className="prow" style={{ gap: '0.5rem' }}>
            <button type="button" className="btn gold" disabled={busy || !built || !built.items.length || missingRequired.length > 0} onClick={run}>{busy ? 'Yükleniyor…' : 'İçe aktar'}</button>
            <button type="button" className="btn ghost" onClick={reset} disabled={busy}>Vazgeç</button>
          </div>
        </>
      )}

      {batches.length > 0 && (
        <div className="po-batches">
          <h4>Yüklü partiler</h4>
          {batches.map((b) => (
            <div key={b.batch_key} className="po-batch">
              <span><b>{SOURCE_LABELS[b.platform] || b.platform}</b> · {b.period_start} → {b.period_end}</span>
              <span className="muted small">{b.order_count ?? '?'} sipariş · {b.item_count ?? '?'} kalem{b.total_amount != null ? ` · ${tl(Number(b.total_amount))}` : ''}</span>
              <button type="button" className="btn ghost sm" onClick={() => removeBatch(b.batch_key)}>Sil</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
