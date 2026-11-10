import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { downloadCsv } from '@/lib/analytics';

/* =============================================================================
   Analiz arayüz kiti — bağımlılıksız (SVG + CSS), etkileşimli, tema uyumlu
   ============================================================================= */

export const fmtInt = (n: number) => Math.round(n).toLocaleString('tr-TR');
export const fmtMoney = (n: number) => `${Math.round(n).toLocaleString('tr-TR')} ₺`;
export const fmtMoneyShort = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} Mn ₺`;
  if (a >= 1e4) return `${(n / 1e3).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} B ₺`;
  return fmtMoney(n);
};
export const fmtNum1 = (n: number | null | undefined, d = 1) => (n == null || Number.isNaN(n) ? '—' : n.toLocaleString('tr-TR', { maximumFractionDigits: d }));
export const fmtMin = (m: number | null | undefined) => {
  if (m == null || Number.isNaN(m)) return '—';
  const v = Math.round(m);
  return v < 60 ? `${v} dk` : `${Math.floor(v / 60)} sa ${v % 60} dk`;
};

export const PALETTE = ['#d4af37', '#0ea5e9', '#14b8a6', '#f27a1a', '#7c4dff', '#fa0050', '#2e9e45', '#a16207', '#64748b', '#ec4899', '#84cc16', '#06b6d4'];

/** Kapsayıcı genişliğini izler (gerçek piksel çizimi için) */
function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const upd = () => setW(Math.max(200, Math.floor(el.clientWidth)));
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// ----------------------------------------------------------------------------
// Kart / başlık / boş durum
// ----------------------------------------------------------------------------
export function Card({ title, sub, actions, children, className = '', onCsv, span }: {
  title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; span?: 2 | 3; onCsv?: () => void;
}) {
  return (
    <section className={`anp-card${span ? ` span${span}` : ''} ${className}`}>
      {(title || actions || onCsv) && (
        <header className="anp-card-h">
          <div>
            {title && <h3>{title}</h3>}
            {sub && <p className="anp-sub">{sub}</p>}
          </div>
          <div className="anp-card-act">
            {actions}
            {onCsv && <button type="button" className="anp-mini no-print" onClick={onCsv} title="Bu tabloyu CSV indir">⬇ CSV</button>}
          </div>
        </header>
      )}
      {children}
    </section>
  );
}

export function Empty({ text = 'Bu aralıkta veri yok.' }: { text?: string }) {
  return <p className="anp-empty">{text}</p>;
}

export function Grid({ cols = 2, children }: { cols?: 1 | 2 | 3 | 4; children: ReactNode }) {
  return <div className={`anp-grid c${cols}`}>{children}</div>;
}

export function Seg({ value, onChange, options }: { value: string; onChange: (v: any) => void; options: { key: string; label: string }[] }) {
  return (
    <div className="anp-seg no-print" role="tablist">
      {options.map((o) => (
        <button key={o.key} type="button" className={value === o.key ? 'on' : ''} onClick={() => onChange(o.key)}>{o.label}</button>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Değişim rozeti + KPI
// ----------------------------------------------------------------------------
export function DeltaBadge({ cur, prev, inverse = false, compare = true }: { cur: number; prev: number; inverse?: boolean; compare?: boolean }) {
  if (!compare) return null;
  if (!prev) return <span className="anp-delta flat">{cur ? 'yeni' : '—'}</span>;
  const d = ((cur - prev) / prev) * 100;
  const good = inverse ? d <= 0 : d >= 0;
  return (
    <span className={`anp-delta ${Math.abs(d) < 0.5 ? 'flat' : good ? 'up' : 'down'}`} title={`Önceki dönem: ${fmtNum1(prev, 0)}`}>
      {d >= 0 ? '▲' : '▼'} %{Math.abs(d).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
    </span>
  );
}

export function Sparkline({ values, color = 'var(--gold)', height = 34 }: { values: number[]; color?: string; height?: number }) {
  const W = 120;
  if (values.length < 2 || !values.some((v) => v > 0)) return <svg className="anp-spark" viewBox={`0 0 ${W} ${height}`} />;
  const max = Math.max(...values, 1);
  const x = (i: number) => (i * W) / (values.length - 1);
  const y = (v: number) => height - 3 - (v / max) * (height - 6);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className="anp-spark" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none">
      <path d={`${d} L${W},${height} L0,${height} Z`} fill={color} opacity="0.16" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function KpiCard({ label, value, sub, delta, spark, color = 'var(--gold)', icon, hint }: {
  label: string; value: ReactNode; sub?: ReactNode; delta?: ReactNode; spark?: number[]; color?: string; icon?: string; hint?: string;
}) {
  return (
    <div className="anp-kpi" style={{ ['--kc' as any]: color }} title={hint}>
      <div className="anp-kpi-top">
        <small>{icon && <span className="anp-kpi-ic">{icon}</span>}{label}</small>
        {delta}
      </div>
      <b>{value}</b>
      {sub != null && <em>{sub}</em>}
      {spark && <Sparkline values={spark} color={color} />}
    </div>
  );
}

export function InsightCard({ icon, title, text, tone }: { icon: string; title: string; text: string; tone: 'gold' | 'ok' | 'warn' | 'info' }) {
  return (
    <div className={`anp-insight ${tone}`}>
      <span className="ic">{icon}</span>
      <div><b>{title}</b><p>{text}</p></div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Tooltip
// ----------------------------------------------------------------------------
function Tip({ x, y, w, children }: { x: number; y: number; w: number; children: ReactNode }) {
  const flip = x > w * 0.6;
  return (
    <div className="anp-tip" style={{ left: x, top: y, transform: `translate(${flip ? 'calc(-100% - 12px)' : '12px'}, -50%)` }}>{children}</div>
  );
}

// ----------------------------------------------------------------------------
// Trend grafiği (çizgi / alan / sütun / yığılmış sütun), önceki dönem karşılaştırmalı
// ----------------------------------------------------------------------------
export interface TrendSeries { name: string; color: string; values: number[]; dashed?: boolean; fill?: boolean }

export function TrendChart({ labels, longLabels, series, format = fmtInt, height = 270, type = 'area', stacked = false, onPick, activeIndex }: {
  labels: string[]; longLabels?: string[]; series: TrendSeries[]; format?: (v: number) => string; height?: number;
  type?: 'area' | 'line' | 'bar'; stacked?: boolean; onPick?: (i: number) => void; activeIndex?: number | null;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const PL = 46, PR = 10, PT = 12, PB = 26;
  const H = height;
  const iw = W - PL - PR, ih = H - PT - PB;
  const totals = labels.map((_, i) => series.reduce((s, x) => s + (x.values[i] || 0), 0));
  const maxV = stacked ? Math.max(1, ...totals) : Math.max(1, ...series.flatMap((s) => s.values));
  const nice = (m: number) => { const p = 10 ** Math.floor(Math.log10(m)); const f = m / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };
  const top = nice(maxV);
  const y = (v: number) => PT + ih - (v / top) * ih;
  const bw = iw / Math.max(n, 1);
  const x = (i: number) => (type === 'bar' ? PL + bw * i + bw / 2 : PL + (n <= 1 ? iw / 2 : (i * iw) / (n - 1)));
  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 56))));
  const hasData = series.some((s) => s.values.some((v) => v > 0));
  if (!n || !hasData) return <Empty />;

  const pathOf = (v: number[]) => v.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(' ');
  const move = (e: React.MouseEvent) => {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = type === 'bar' ? Math.floor((px - PL) / bw) : Math.round(((px - PL) / iw) * (n - 1));
    setHover(i >= 0 && i < n ? i : null);
  };
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div ref={ref} className="anp-chart" style={{ height }}>
      <svg width={W} height={H} onMouseMove={move} onMouseLeave={() => setHover(null)} onClick={() => hover != null && onPick?.(hover)} style={{ cursor: onPick ? 'pointer' : 'default' }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PL} x2={W - PR} y1={y(top * t)} y2={y(top * t)} className="anp-gridline" />
            <text x={PL - 6} y={y(top * t) + 4} textAnchor="end" className="anp-axis">{format(top * t).replace(' ₺', '')}</text>
          </g>
        ))}
        {type === 'bar' && !stacked && series.map((s, si) => s.values.map((v, i) => {
          const sw = (bw * 0.78) / series.length;
          const bx = PL + bw * i + bw * 0.11 + sw * si;
          return <rect key={`${si}-${i}`} x={bx} y={y(v)} width={Math.max(1, sw - 1)} height={Math.max(0, PT + ih - y(v))} rx="3" fill={s.color} opacity={hover == null || hover === i ? (s.dashed ? 0.45 : 1) : 0.4} />;
        }))}
        {type === 'bar' && stacked && labels.map((_, i) => {
          let acc = 0;
          return series.map((s, si) => {
            const v = s.values[i] || 0; const y0 = y(acc); acc += v; const y1 = y(acc);
            return <rect key={`${si}-${i}`} x={PL + bw * i + bw * 0.1} y={y1} width={bw * 0.8} height={Math.max(0, y0 - y1)} fill={s.color} opacity={hover == null || hover === i ? 1 : 0.45} />;
          });
        })}
        {type !== 'bar' && series.map((s, si) => (
          <g key={si}>
            {type === 'area' && s.fill !== false && !s.dashed && (
              <path d={`${pathOf(s.values)} L${x(n - 1)},${PT + ih} L${x(0)},${PT + ih} Z`} fill={s.color} opacity="0.14" />
            )}
            <path d={pathOf(s.values)} fill="none" stroke={s.color} strokeWidth={s.dashed ? 2 : 3} strokeDasharray={s.dashed ? '5 4' : undefined} strokeLinejoin="round" />
          </g>
        ))}
        {type !== 'bar' && n <= 45 && series.filter((s) => !s.dashed).map((s, si) => s.values.map((v, i) => (
          <circle key={`${si}-${i}`} cx={x(i)} cy={y(v)} r={hover === i ? 5 : 2.8} fill={s.color} stroke="var(--card-bg)" strokeWidth="1.5" />
        )))}
        {activeIndex != null && <line x1={x(activeIndex)} x2={x(activeIndex)} y1={PT} y2={PT + ih} className="anp-cross act" />}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PT} y2={PT + ih} className="anp-cross" />}
        {labels.map((l, i) => (i % step === 0 ? <text key={i} x={x(i)} y={H - 7} textAnchor="middle" className="anp-axis">{l}</text> : null))}
      </svg>
      {hover != null && (
        <Tip x={x(hover)} y={PT + 40} w={W}>
          <b>{longLabels?.[hover] || labels[hover]}</b>
          {series.map((s) => (
            <div key={s.name} className="anp-tip-row"><i style={{ background: s.color }} />{s.name}<span>{format(s.values[hover] || 0)}</span></div>
          ))}
          {stacked && series.length > 1 && <div className="anp-tip-row tot">Toplam<span>{format(totals[hover])}</span></div>}
        </Tip>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Sütun grafiği (saat / gün) — en yüksek ALTIN, en düşük MAVİ vurgulu
// ----------------------------------------------------------------------------
export interface BarDatum { label: string; value: number; sub?: string; color?: string }

export function BarChart({ data, format = fmtInt, height = 220, onPick, activeIndex, mark = true, labelEvery }: {
  data: BarDatum[]; format?: (v: number) => string; height?: number; onPick?: (i: number) => void; activeIndex?: number | null; mark?: boolean; labelEvery?: number;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const PL = 8, PR = 8, PT = 22, PB = 24;
  const H = height, ih = H - PT - PB, iw = W - PL - PR;
  const max = Math.max(1, ...data.map((d) => d.value));
  const positives = data.filter((d) => d.value > 0).map((d) => d.value);
  const maxV = Math.max(...positives, 0), minV = Math.min(...positives, Infinity);
  const bw = iw / Math.max(data.length, 1);
  const step = labelEvery || Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(iw / 30))));
  if (!positives.length) return <Empty />;
  return (
    <div ref={ref} className="anp-chart" style={{ height }}>
      <svg width={W} height={H} onMouseLeave={() => setHover(null)}>
        <line x1={PL} x2={W - PR} y1={PT + ih} y2={PT + ih} className="anp-gridline" />
        {data.map((d, i) => {
          const h = (d.value / max) * ih;
          const isMax = mark && d.value === maxV && d.value > 0;
          const isMin = mark && d.value === minV && minV !== maxV && d.value > 0;
          const fill = d.color || (isMax ? '#d4af37' : isMin ? '#0ea5e9' : 'var(--bar)');
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onClick={() => onPick?.(i)} style={{ cursor: onPick ? 'pointer' : 'default' }}>
              <rect x={PL + bw * i} y={PT} width={bw} height={ih} fill="transparent" />
              <rect x={PL + bw * i + bw * 0.14} y={PT + ih - h} width={bw * 0.72} height={Math.max(d.value > 0 ? 2 : 0, h)} rx="4"
                fill={fill} opacity={hover == null || hover === i ? 1 : 0.5}
                stroke={activeIndex === i ? 'var(--text)' : 'none'} strokeWidth="2" />
              {(isMax || isMin || hover === i) && d.value > 0 && bw > 14 && (
                <text x={PL + bw * i + bw / 2} y={PT + ih - h - 5} textAnchor="middle" className="anp-barval">{format(d.value)}</text>
              )}
              {i % step === 0 && <text x={PL + bw * i + bw / 2} y={H - 7} textAnchor="middle" className="anp-axis">{d.label}</text>}
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <Tip x={PL + bw * hover + bw / 2} y={PT + 24} w={W}>
          <b>{data[hover].label}</b>
          <div className="anp-tip-row">{format(data[hover].value)}</div>
          {data[hover].sub && <small>{data[hover].sub}</small>}
        </Tip>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Isı haritası (satır × sütun)
// ----------------------------------------------------------------------------
export function Heatmap({ matrix, rows, cols, format = fmtInt, unit = 'sipariş', onPick, active }: {
  matrix: number[][]; rows: string[]; cols: string[]; format?: (v: number) => string; unit?: string;
  onPick?: (r: number, c: number) => void; active?: { r: number; c: number } | null;
}) {
  const max = Math.max(1, ...matrix.flat());
  const colorOf = (v: number) => {
    if (!v) return { bg: 'var(--surface)', fg: 'var(--text-muted)' };
    const t = Math.min(1, v / max);
    return { bg: `hsl(${48 - 46 * t} ${70 + 25 * t}% ${90 - 44 * t}%)`, fg: t > 0.55 ? '#fff' : '#14110c' };
  };
  const [hov, setHov] = useState<{ r: number; c: number } | null>(null);
  return (
    <div className="anp-heat">
      <div className="anp-heat-scroll">
        <div className="anp-heat-grid" style={{ gridTemplateColumns: `46px repeat(${cols.length}, minmax(24px, 1fr))` }}>
          <span />
          {cols.map((c, i) => <b key={i} className="anp-heat-col">{c}</b>)}
          {matrix.map((row, r) => (
            <FragmentRow key={r}>
              <b className="anp-heat-row">{rows[r]}</b>
              {row.map((v, c) => {
                const { bg, fg } = colorOf(v);
                const isA = active && active.r === r && active.c === c;
                return (
                  <i key={c} style={{ background: bg, color: fg, outline: isA || (hov && hov.r === r && hov.c === c) ? '2px solid var(--text)' : 'none' }}
                    onMouseEnter={() => setHov({ r, c })} onMouseLeave={() => setHov(null)} onClick={() => onPick?.(r, c)}
                    title={`${rows[r]} ${cols[c]}:00 — ${format(v)} ${unit}`}>{v ? (max > 99 && v > 99 ? '' : fmtInt(v)) : ''}</i>
                );
              })}
            </FragmentRow>
          ))}
        </div>
      </div>
      <div className="anp-heat-legend"><span>Az</span><i /><span>Çok</span>{hov && <em>{rows[hov.r]} {cols[hov.c]}:00 → <b>{format(matrix[hov.r][hov.c])} {unit}</b></em>}</div>
    </div>
  );
}
const FragmentRow = ({ children }: { children: ReactNode }) => <>{children}</>;

// ----------------------------------------------------------------------------
// Halka grafik
// ----------------------------------------------------------------------------
export interface Slice { label: string; value: number; color: string; sub?: string }

export function Donut({ slices, center, centerSub, size = 190, format = fmtInt, onPick, activeLabel }: {
  slices: Slice[]; center?: ReactNode; centerSub?: ReactNode; size?: number; format?: (v: number) => string; onPick?: (label: string) => void; activeLabel?: string | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const data = slices.filter((s) => s.value > 0);
  const total = data.reduce((s, x) => s + x.value, 0);
  if (!total) return <Empty />;
  const R = size / 2 - 6, r = R * 0.62, cx = size / 2, cy = size / 2;
  let a0 = -Math.PI / 2;
  const arcs = data.map((s) => {
    const a1 = a0 + (s.value / total) * Math.PI * 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const full = data.length === 1;
    const p = (a: number, rad: number) => `${cx + rad * Math.cos(a)},${cy + rad * Math.sin(a)}`;
    const d = full
      ? `M${cx - R},${cy} a${R},${R} 0 1,0 ${2 * R},0 a${R},${R} 0 1,0 ${-2 * R},0 M${cx - r},${cy} a${r},${r} 0 1,1 ${2 * r},0 a${r},${r} 0 1,1 ${-2 * r},0`
      : `M${p(a0, R)} A${R},${R} 0 ${large} 1 ${p(a1, R)} L${p(a1, r)} A${r},${r} 0 ${large} 0 ${p(a0, r)} Z`;
    a0 = a1;
    return { s, d };
  });
  const h = hover != null ? data[hover] : null;
  return (
    <div className="anp-donut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {arcs.map(({ s, d }, i) => (
          <path key={s.label} d={d} fill={s.color} fillRule="evenodd" opacity={hover == null || hover === i ? 1 : 0.45}
            stroke={activeLabel === s.label ? 'var(--text)' : 'var(--card-bg)'} strokeWidth={activeLabel === s.label ? 3 : 2}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => onPick?.(s.label)} style={{ cursor: onPick ? 'pointer' : 'default' }} />
        ))}
        <foreignObject x={cx - r + 6} y={cy - r + 6} width={(r - 6) * 2} height={(r - 6) * 2}>
          <div className="anp-donut-c">
            <b>{h ? format(h.value) : center}</b>
            <small>{h ? `${h.label} · %${((h.value / total) * 100).toFixed(0)}` : centerSub}</small>
          </div>
        </foreignObject>
      </svg>
      <ul className="anp-legend">
        {data.map((s, i) => (
          <li key={s.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => onPick?.(s.label)} className={activeLabel === s.label ? 'on' : ''}>
            <i style={{ background: s.color }} /><span>{s.label}</span><b>{format(s.value)}</b><em>%{((s.value / total) * 100).toFixed(0)}</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Yatay çubuk listesi
// ----------------------------------------------------------------------------
export interface HRow { key?: string; label: string; value: number; right?: string; sub?: string; color?: string; prev?: number }

export function HBarList({ rows, format = fmtInt, onPick, activeKey, max: maxProp, rank = false, empty }: {
  rows: HRow[]; format?: (v: number) => string; onPick?: (key: string) => void; activeKey?: string | null; max?: number; rank?: boolean; empty?: string;
}) {
  const max = maxProp || Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <Empty text={empty} />;
  return (
    <div className="anp-hbars">
      {rows.map((r, i) => {
        const k = r.key || r.label;
        return (
          <div key={k} className={`anp-hbar${onPick ? ' click' : ''}${activeKey === k ? ' on' : ''}`} onClick={() => onPick?.(k)}>
            <div className="anp-hbar-top">
              <span title={r.label}>{rank && <em className="rk">{i + 1}</em>}{r.label}</span>
              <b>{format(r.value)}{r.right && <small>{r.right}</small>}</b>
            </div>
            <div className="anp-hbar-track"><i style={{ width: `${(r.value / max) * 100}%`, background: r.color || 'var(--gold)' }} /></div>
            {r.sub && <small className="anp-hbar-sub">{r.sub}</small>}
          </div>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Sıralanabilir tablo
// ----------------------------------------------------------------------------
export interface Col<T> {
  key: string; label: string; align?: 'left' | 'right' | 'center';
  value: (r: T) => string | number | null;
  render?: (r: T) => ReactNode;
  csv?: (r: T) => string | number | null;
}

export function DataTable<T>({ rows, cols, pageSize = 12, initialSort, onRow, csvName, empty, rowKey }: {
  rows: T[]; cols: Col<T>[]; pageSize?: number; initialSort?: { key: string; dir: 'asc' | 'desc' }; onRow?: (r: T) => void; csvName?: string; empty?: string; rowKey?: (r: T, i: number) => string;
}) {
  const [sort, setSort] = useState(initialSort || null);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState('');
  const sorted = useMemo(() => {
    let r = rows;
    if (q.trim()) {
      const s = q.trim().toLocaleLowerCase('tr');
      r = r.filter((x) => cols.some((c) => String(c.value(x) ?? '').toLocaleLowerCase('tr').includes(s)));
    }
    if (!sort) return r;
    const c = cols.find((x) => x.key === sort.key);
    if (!c) return r;
    const f = sort.dir === 'asc' ? 1 : -1;
    return [...r].sort((a, b) => {
      const va = c.value(a), vb = c.value(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'tr')) * f;
    });
  }, [rows, sort, q, cols]);
  useEffect(() => setPage(0), [rows, q]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const view = sorted.slice(page * pageSize, page * pageSize + pageSize);
  const exportCsv = () => downloadCsv(`${csvName || 'tablo'}.csv`, [cols.map((c) => c.label), ...sorted.map((r) => cols.map((c) => (c.csv ? c.csv(r) : c.value(r))))]);
  return (
    <div className="anp-table-wrap">
      <div className="anp-table-tools no-print">
        {rows.length > pageSize && <input className="anp-search" placeholder="Tabloda ara…" value={q} onChange={(e) => setQ(e.target.value)} />}
        {csvName && <button type="button" className="anp-mini" onClick={exportCsv}>⬇ CSV</button>}
      </div>
      <div className="anp-table-scroll">
        <table className="anp-table">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key} className={c.align || ''} onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'desc' }))}>
                  {c.label}{sort?.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => (
              <tr key={rowKey ? rowKey(r, i) : i} className={onRow ? 'click' : ''} onClick={() => onRow?.(r)}>
                {cols.map((c) => <td key={c.key} className={c.align || ''}>{c.render ? c.render(r) : (c.value(r) ?? '—')}</td>)}
              </tr>
            ))}
            {!view.length && <tr><td colSpan={cols.length} className="center muted">{empty || 'Kayıt yok.'}</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="anp-pager no-print">
          <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>‹</button>
          <span>{page + 1} / {pages} · {sorted.length} kayıt</span>
          <button type="button" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>›</button>
        </div>
      )}
    </div>
  );
}

/** Basit çoklu seçim çipleri */
export function Chips<T extends string>({ options, value, onChange }: { options: { key: T; label: string; color?: string }[]; value: T[]; onChange: (v: T[]) => void }) {
  return (
    <div className="anp-chips no-print">
      {options.map((o) => {
        const on = value.includes(o.key);
        return (
          <button key={o.key} type="button" className={on ? 'on' : ''} style={on && o.color ? { borderColor: o.color, background: `${o.color}22` } : undefined}
            onClick={() => onChange(on ? value.filter((x) => x !== o.key) : [...value, o.key])}>
            {o.color && <i style={{ background: o.color }} />}{o.label}
          </button>
        );
      })}
    </div>
  );
}
