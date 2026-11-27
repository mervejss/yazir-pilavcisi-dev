import { hourLabel } from '@/lib/analytics';

/* Hafif, bağımlılıksız grafikler (CSS + SVG). Renkler tema değişkenlerinden gelir. */

interface BarItem {
  label: string;
  value: number;
  sub?: string;
  highlight?: boolean;
}

/** Dikey sütun grafiği (saat / gün / ay dağılımı) */
export function ColumnChart({ items, height = 150, format = (v: number) => String(v), showEvery = 1 }: {
  items: BarItem[];
  height?: number;
  format?: (v: number) => string;
  showEvery?: number;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const peak = Math.max(...items.map((i) => i.value));
  return (
    <div className="an-cols" style={{ height }}>
      {items.map((it, i) => (
        <div
          key={`${it.label}-${i}`}
          className={`an-col${it.value > 0 && it.value === peak ? ' peak' : ''}${it.highlight ? ' hl' : ''}`}
          title={`${it.label}: ${format(it.value)}${it.sub ? ` · ${it.sub}` : ''}`}
        >
          <span className="an-col-val">{it.value > 0 && items.length <= 12 ? format(it.value) : ''}</span>
          <div className="an-col-track">
            <div className="an-col-bar" style={{ height: `${Math.max(it.value > 0 ? 4 : 0, (it.value / max) * 100)}%` }} />
          </div>
          <small>{i % showEvery === 0 ? it.label : ''}</small>
        </div>
      ))}
    </div>
  );
}

/** 24 saatlik dağılım */
export function HourChart({ data, valueKey = 'count', unit = 'teslimat' }: {
  data: { hour: number; count?: number; revenue?: number }[];
  valueKey?: 'count' | 'revenue';
  unit?: string;
}) {
  const items = Array.from({ length: 24 }, (_, h) => {
    const r = data.find((x) => Number(x.hour) === h);
    return { label: String(h).padStart(2, '0'), value: Number(r?.[valueKey] || 0), sub: unit };
  });
  const total = items.reduce((s, i) => s + i.value, 0);
  if (!total) return <p className="muted small an-empty">Bu aralıkta veri yok.</p>;
  return <ColumnChart items={items} showEvery={2} format={(v) => (valueKey === 'revenue' ? `${Math.round(v)} ₺` : String(v))} />;
}

/** Yatay çubuk listesi (bölgeler, ürünler, ödeme türleri…) */
export function HBars({ rows, format = (v: number) => String(v), empty = 'Veri yok.' }: {
  rows: { label: string; value: number; note?: string }[];
  format?: (v: number) => string;
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="muted small an-empty">{empty}</p>;
  return (
    <div className="an-hbars">
      {rows.map((r, i) => (
        <div key={`${r.label}-${i}`} className="an-hbar">
          <div className="an-hbar-top">
            <span className="an-hbar-label" title={r.label}>{r.label}</span>
            <b>{format(r.value)}</b>
          </div>
          <div className="an-hbar-track"><i style={{ width: `${(r.value / max) * 100}%` }} /></div>
          {r.note && <small className="muted">{r.note}</small>}
        </div>
      ))}
    </div>
  );
}

/** Isı haritası: 7 gün × 24 saat benzeri değil; 24 saatlik tek satır yoğunluk şeridi */
export function HeatStrip({ data }: { data: { hour: number; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => Number(d.count) || 0));
  return (
    <div className="an-heat">
      {Array.from({ length: 24 }, (_, h) => {
        const c = Number(data.find((d) => Number(d.hour) === h)?.count || 0);
        const a = c === 0 ? 0 : 0.15 + (c / max) * 0.85;
        return (
          <div key={h} className="an-heat-cell" title={`${hourLabel(h)} · ${c}`} style={{ ['--a' as any]: a }}>
            <span>{String(h).padStart(2, '0')}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Basit çizgi/alan grafiği (günlük seri) */
export function LineArea({ points, labels, format = (v: number) => String(v), height = 190 }: {
  points: number[];
  labels: string[];
  format?: (v: number) => string;
  height?: number;
}) {
  const W = 720, H = height, P = 26;
  const n = Math.max(points.length, 2);
  const max = Math.max(1, ...points);
  const x = (i: number) => P + (i * (W - P * 2)) / (n - 1);
  const y = (v: number) => H - P - (v / max) * (H - P * 2);
  const line = points.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H - P} L${x(0).toFixed(1)},${H - P} Z`;
  const step = Math.max(1, Math.ceil(points.length / 8));
  if (!points.length || !points.some((p) => p > 0)) return <p className="muted small an-empty">Bu aralıkta veri yok.</p>;
  return (
    <svg className="an-line" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img">
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line x1={P} x2={W - P} y1={y(max * t)} y2={y(max * t)} className="an-grid" />
          <text x={4} y={y(max * t) + 4} className="an-axis">{format(Math.round(max * t))}</text>
        </g>
      ))}
      <path d={area} className="an-area" />
      <path d={line} className="an-path" />
      {points.map((v, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(v)} r={points.length > 40 ? 1.6 : 3.2} className="an-dot"><title>{`${labels[i]}: ${format(v)}`}</title></circle>
          {i % step === 0 && <text x={x(i)} y={H - 6} textAnchor="middle" className="an-axis">{labels[i]}</text>}
        </g>
      ))}
    </svg>
  );
}

/** Yığılmış yatay şerit (segment dağılımı) */
export function SplitBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return <p className="muted small an-empty">Veri yok.</p>;
  return (
    <div>
      <div className="an-split">
        {parts.filter((p) => p.value > 0).map((p) => (
          <i key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.label}: ${p.value}`} />
        ))}
      </div>
      <div className="an-legend">
        {parts.map((p) => (
          <span key={p.label}><i style={{ background: p.color }} />{p.label} <b>{p.value}</b></span>
        ))}
      </div>
    </div>
  );
}

/** KPI kutusu */
export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className={`an-stat${tone ? ' ' + tone : ''}`}>
      <small>{label}</small>
      <b>{value}</b>
      {sub != null && <span>{sub}</span>}
    </div>
  );
}
