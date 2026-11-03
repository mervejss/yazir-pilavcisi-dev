import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { tl, businessDayStart } from '@/lib/helpers';
import { SOURCE_LABELS, SOURCE_COLORS } from '@/lib/constants';

type Period = 'today' | '7' | '30' | '90' | '365';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Bugün' },
  { key: '7', label: '7 gün' },
  { key: '30', label: '30 gün' },
  { key: '90', label: '90 gün' },
  { key: '365', label: '12 ay' },
];
const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

interface Row {
  created_at: string;
  total: number;
  source: string;
}

const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short',
});
const WD: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
function parts(iso: string) {
  const p = fmt.formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value || '';
  return { day: `${g('year')}-${g('month')}-${g('day')}`, month: `${g('year')}-${g('month')}`, hour: Number(g('hour')), wd: WD[g('weekday')] ?? 0 };
}

function delta(cur: number, prev: number) {
  if (!prev) return cur ? { txt: 'yeni', up: true } : { txt: '—', up: true };
  const d = ((cur - prev) / prev) * 100;
  return { txt: `${d >= 0 ? '▲' : '▼'} %${Math.abs(d).toFixed(0)}`, up: d >= 0 };
}

function Bars({ values, labels, color = 'var(--gold)', format = (v: number) => String(v), height = 170 }: { values: number[]; labels: string[]; color?: string; format?: (v: number) => string; height?: number }) {
  const max = Math.max(1, ...values);
  const w = 100 / values.length;
  return (
    <div className="ch-bars" style={{ height }}>
      {values.map((v, i) => (
        <div key={i} className="ch-bar-col" style={{ width: `${w}%` }} title={`${labels[i]}: ${format(v)}`}>
          <span className="ch-bar-val">{v > 0 && values.length <= 12 ? format(v) : ''}</span>
          <div className="ch-bar" style={{ height: `${(v / max) * 100}%`, background: color }} />
          <small>{labels[i]}</small>
        </div>
      ))}
    </div>
  );
}

function LineCompare({ cur, prev, labels }: { cur: number[]; prev: number[]; labels: string[] }) {
  const W = 760, H = 220, P = 28;
  const n = Math.max(cur.length, 2);
  const max = Math.max(1, ...cur, ...prev);
  const x = (i: number) => P + (i * (W - P * 2)) / (n - 1);
  const y = (v: number) => H - P - (v / max) * (H - P * 2);
  const path = (a: number[]) => a.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const step = Math.ceil(n / 8);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ch-line" role="img" aria-label="Ciro karşılaştırması">
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line x1={P} x2={W - P} y1={y(max * t)} y2={y(max * t)} stroke="var(--line)" />
          <text x={4} y={y(max * t) + 4} fontSize="10" fill="var(--text-muted)">{tl(max * t).replace(',00', '')}</text>
        </g>
      ))}
      <path d={path(prev)} fill="none" stroke="#9a968a" strokeWidth="2" strokeDasharray="5 4" />
      <path d={path(cur)} fill="none" stroke="var(--gold-deep)" strokeWidth="3" />
      {cur.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r="3.5" fill="var(--gold)" stroke="#14110c">
          <title>{labels[i]}: {tl(v)} (önceki: {tl(prev[i] || 0)})</title>
        </circle>
      ))}
      {labels.map((l, i) => (i % step === 0 ? <text key={i} x={x(i)} y={H - 8} fontSize="10" textAnchor="middle" fill="var(--text-muted)">{l}</text> : null))}
    </svg>
  );
}

export default function AnalyticsCharts() {
  const [period, setPeriod] = useState<Period>('30');
  const [rows, setRows] = useState<Row[]>([]);
  const [top, setTop] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<'orders' | 'revenue'>('orders');

  const range = useMemo(() => {
    const to = new Date();
    let from: Date;
    if (period === 'today') from = businessDayStart();
    else from = new Date(to.getTime() - Number(period) * 864e5);
    const len = to.getTime() - from.getTime();
    return { from, to, prevFrom: new Date(from.getTime() - len), len };
  }, [period]);

  useEffect(() => {
    let off = false;
    (async () => {
      setLoading(true);
      const all: Row[] = [];
      for (let page = 0; page < 12; page++) {
        const { data, error } = await supabase
          .from('orders')
          .select('created_at,total,source')
          .neq('status', 'cancelled')
          .gte('created_at', range.prevFrom.toISOString())
          .order('created_at', { ascending: true })
          .range(page * 1000, page * 1000 + 999);
        if (error || !data) break;
        all.push(...(data as unknown as Row[]).map((r) => ({ ...r, total: Number(r.total) })));
        if (data.length < 1000) break;
      }
      const { data: tp } = await supabase.rpc('report_top_products', { p_from: range.from.toISOString(), p_to: range.to.toISOString(), p_limit: 8 });
      if (off) return;
      setRows(all);
      setTop((tp as any[]) || []);
      setLoading(false);
    })();
    return () => {
      off = true;
    };
  }, [range]);

  const calc = useMemo(() => {
    const cur = rows.filter((r) => new Date(r.created_at) >= range.from);
    const prev = rows.filter((r) => new Date(r.created_at) < range.from);
    const sum = (a: Row[]) => a.reduce((s, r) => s + r.total, 0);

    const hourCnt = Array(24).fill(0), hourRev = Array(24).fill(0);
    const wdCnt = Array(7).fill(0), wdRev = Array(7).fill(0);
    const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
    const dayCur = new Map<string, number>();
    const monthRev = new Map<string, number>();
    const src = new Map<string, { n: number; rev: number }>();
    cur.forEach((r) => {
      const p = parts(r.created_at);
      hourCnt[p.hour]++; hourRev[p.hour] += r.total;
      wdCnt[p.wd]++; wdRev[p.wd] += r.total;
      heat[p.wd][p.hour]++;
      dayCur.set(p.day, (dayCur.get(p.day) || 0) + r.total);
      monthRev.set(p.month, (monthRev.get(p.month) || 0) + r.total);
      const s = src.get(r.source) || { n: 0, rev: 0 };
      s.n++; s.rev += r.total; src.set(r.source, s);
    });

    // Gün gün seri (bugün ise saat saat)
    let labels: string[] = [], curSeries: number[] = [], prevSeries: number[] = [];
    if (period === 'today') {
      labels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
      curSeries = hourRev;
      const ph = Array(24).fill(0);
      prev.forEach((r) => (ph[parts(r.created_at).hour] += r.total));
      prevSeries = ph;
    } else {
      const days = Number(period);
      const pd = new Map<string, number>();
      prev.forEach((r) => { const k = parts(r.created_at).day; pd.set(k, (pd.get(k) || 0) + r.total); });
      for (let i = 0; i < days; i++) {
        const d = new Date(range.from.getTime() + i * 864e5);
        const k = parts(d.toISOString()).day;
        const pk = parts(new Date(range.from.getTime() - (days - i) * 864e5).toISOString()).day;
        labels.push(k.slice(8) + '.' + k.slice(5, 7));
        curSeries.push(dayCur.get(k) || 0);
        prevSeries.push(pd.get(pk) || 0);
      }
    }
    const months = [...monthRev.entries()].sort(([a], [b]) => a.localeCompare(b));
    const maxHeat = Math.max(1, ...heat.flat());
    return {
      curN: cur.length, prevN: prev.length, curRev: sum(cur), prevRev: sum(prev),
      hourCnt, hourRev, wdCnt, wdRev, heat, maxHeat, labels, curSeries, prevSeries, months,
      src: [...src.entries()].sort((a, b) => b[1].rev - a[1].rev),
      peak: hourCnt.indexOf(Math.max(...hourCnt)),
    };
  }, [rows, range, period]);

  const dRev = delta(calc.curRev, calc.prevRev);
  const dN = delta(calc.curN, calc.prevN);
  const avg = calc.curN ? calc.curRev / calc.curN : 0;
  const avgPrev = calc.prevN ? calc.prevRev / calc.prevN : 0;
  const dAvg = delta(avg, avgPrev);
  const maxTop = Math.max(1, ...top.map((t) => Number(t.quantity)));
  const maxSrc = Math.max(1, ...calc.src.map(([, v]) => v.rev));

  return (
    <section className="ch-wrap">
      <div className="ch-head">
        <div>
          <h2 style={{ margin: 0 }}>📊 Grafikler ve Karşılaştırma</h2>
          <p className="muted small" style={{ margin: 0 }}>Seçilen dönem, hemen öncesindeki aynı uzunluktaki dönemle karşılaştırılır.</p>
        </div>
        <div className="seg">
          {PERIODS.map((p) => (
            <button key={p.key} type="button" className={period === p.key ? 'on' : ''} onClick={() => setPeriod(p.key)}>{p.label}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="muted center" style={{ padding: '2rem' }}>Grafikler hazırlanıyor…</p>
      ) : (
        <>
          <div className="ch-kpis">
            <div className="ch-kpi"><small>Ciro</small><b>{tl(calc.curRev)}</b><span className={dRev.up ? 'up' : 'down'}>{dRev.txt}</span><em>önceki: {tl(calc.prevRev)}</em></div>
            <div className="ch-kpi"><small>Sipariş</small><b>{calc.curN}</b><span className={dN.up ? 'up' : 'down'}>{dN.txt}</span><em>önceki: {calc.prevN}</em></div>
            <div className="ch-kpi"><small>Ortalama sepet</small><b>{tl(avg)}</b><span className={dAvg.up ? 'up' : 'down'}>{dAvg.txt}</span><em>önceki: {tl(avgPrev)}</em></div>
            <div className="ch-kpi"><small>En yoğun saat</small><b>{calc.curN ? `${calc.peak}:00` : '—'}</b><span className="up">{calc.curN ? `${calc.hourCnt[calc.peak]} sipariş` : ''}</span><em>seçili dönemde</em></div>
          </div>

          <div className="ch-card">
            <h3>{period === 'today' ? 'Saatlik ciro' : 'Günlük ciro'} <span className="ch-legend"><i style={{ background: 'var(--gold-deep)' }} /> Bu dönem <i style={{ background: '#9a968a' }} /> Önceki dönem</span></h3>
            <LineCompare cur={calc.curSeries} prev={calc.prevSeries} labels={calc.labels} />
          </div>

          <div className="ch-grid2">
            <div className="ch-card">
              <h3>Saat bazlı {metric === 'orders' ? 'sipariş' : 'ciro'}
                <span className="seg"><button type="button" className={metric === 'orders' ? 'on' : ''} onClick={() => setMetric('orders')}>Adet</button><button type="button" className={metric === 'revenue' ? 'on' : ''} onClick={() => setMetric('revenue')}>Ciro</button></span>
              </h3>
              <Bars values={metric === 'orders' ? calc.hourCnt : calc.hourRev} labels={Array.from({ length: 24 }, (_, i) => String(i))} format={metric === 'orders' ? (v) => `${v} sipariş` : tl} />
            </div>
            <div className="ch-card">
              <h3>Haftanın günleri</h3>
              <Bars values={metric === 'orders' ? calc.wdCnt : calc.wdRev} labels={DAYS} color="#2563eb" format={metric === 'orders' ? (v) => `${v} sipariş` : tl} />
            </div>
          </div>

          <div className="ch-grid2">
            <div className="ch-card">
              <h3>🔥 En çok satanlar</h3>
              {top.length === 0 && <p className="muted small">Veri yok.</p>}
              {top.map((t) => (
                <div key={t.product_id || t.product_name} className="ch-hbar">
                  <span className="n" title={t.product_name}>{t.product_name}</span>
                  <div><i style={{ width: `${(Number(t.quantity) / maxTop) * 100}%` }} /></div>
                  <b>{t.quantity} adet</b>
                  <small>{tl(Number(t.revenue))}</small>
                </div>
              ))}
            </div>
            <div className="ch-card">
              <h3>Sipariş kaynakları (ciro)</h3>
              {calc.src.length === 0 && <p className="muted small">Veri yok.</p>}
              {calc.src.map(([k, v]) => (
                <div key={k} className="ch-hbar">
                  <span className="n">{SOURCE_LABELS[k] || k}</span>
                  <div><i style={{ width: `${(v.rev / maxSrc) * 100}%`, background: SOURCE_COLORS[k] || 'var(--gold)' }} /></div>
                  <b>{v.n} adet</b>
                  <small>{tl(v.rev)}</small>
                </div>
              ))}
            </div>
          </div>

          <div className="ch-card">
            <h3>Yoğunluk haritası <small className="muted">(gün × saat, koyu = daha çok sipariş)</small></h3>
            <div className="ch-heat">
              <div className="ch-heat-row head"><span />{Array.from({ length: 24 }, (_, h) => <i key={h}>{h}</i>)}</div>
              {calc.heat.map((row, d) => (
                <div key={d} className="ch-heat-row">
                  <span>{DAYS[d]}</span>
                  {row.map((v, h) => (
                    <i key={h} title={`${DAYS[d]} ${h}:00 — ${v} sipariş`} style={{ background: v ? `rgba(212,175,55,${0.15 + (v / calc.maxHeat) * 0.85})` : 'var(--surface)' }}>{v || ''}</i>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {period === '365' && calc.months.length > 0 && (
            <div className="ch-card">
              <h3>Aylık ciro</h3>
              <Bars values={calc.months.map(([, v]) => v)} labels={calc.months.map(([m]) => m.slice(5) + '/' + m.slice(2, 4))} color="#16a34a" format={tl} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
