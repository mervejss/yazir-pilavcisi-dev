import { useMemo, useState } from 'react';
import { HOURS_ORDER, WD_SHORT, bizKey, hourSlot, platformColor, platformLabel, seriesBy, weekdayOfKey, type ProductStat } from '@/lib/analyticsData';
import { BarChart, Card, DataTable, DeltaBadge, Donut, Empty, Grid, HBarList, KpiCard, PALETTE, Seg, TrendChart, fmtInt, fmtMoney, fmtMoneyShort, fmtNum1, type Col } from '../Kit';
import type { TabProps } from './types';

export default function ProductTab({ a, cur, range, compare, gran }: TabProps) {
  const [metric, setMetric] = useState<'qty' | 'revenue'>('qty');
  const [sel, setSel] = useState<string | null>(null);
  const [cat, setCat] = useState<string | null>(null);

  const list = useMemo(() => (cat ? a.products.filter((p) => p.category === cat) : a.products), [a.products, cat]);
  const sorted = useMemo(() => [...list].sort((x, y) => (metric === 'qty' ? y.qty - x.qty : y.revenue - x.revenue)), [list, metric]);
  const top = sorted.slice(0, 10);
  const bottom = [...list].filter((p) => p.qty > 0).sort((x, y) => x.qty - y.qty).slice(0, 6);
  const rising = [...a.products].filter((p) => p.prevQty >= 3).map((p) => ({ ...p, d: ((p.qty - p.prevQty) / p.prevQty) * 100 })).sort((x, y) => y.d - x.d);
  const prodTotal = a.products.reduce((s, p) => s + p.qty, 0);

  // Birlikte satılanlar
  const pairs = useMemo(() => {
    const m = new Map<string, number>();
    cur.filter((o) => o.status === 'delivered').forEach((o) => {
      const names = [...new Set(o.items.map((i) => i.name))].slice(0, 12).sort();
      for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) { const k = `${names[i]} + ${names[j]}`; m.set(k, (m.get(k) || 0) + 1); }
    });
    return [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8);
  }, [cur]);

  // Seçili ürün ayrıntısı
  const detail = useMemo(() => {
    if (!sel) return null;
    const orders = cur.filter((o) => o.status === 'delivered' && o.items.some((i) => i.name === sel));
    const qtyOf = (o: (typeof orders)[number]) => o.items.filter((i) => i.name === sel).reduce((s, i) => s + i.qty, 0);
    const trend = seriesBy(orders, range, gran, () => 'q', qtyOf);
    const hrs = Array(24).fill(0), wds = Array(7).fill(0); const plat = new Map<string, number>();
    orders.forEach((o) => { const q = qtyOf(o); hrs[hourSlot(o.ts)] += q; wds[weekdayOfKey(bizKey(o.ts))] += q; plat.set(o.platform, (plat.get(o.platform) || 0) + q); });
    return { trend, hrs, wds, plat: [...plat.entries()].sort((x, y) => y[1] - x[1]), stat: a.products.find((p) => p.name === sel)! };
  }, [sel, cur, range, gran, a.products]);

  const cols: Col<ProductStat>[] = [
    { key: 'name', label: 'Ürün', value: (p) => p.name, render: (p) => <b>{p.name}</b> },
    { key: 'category', label: 'Kategori', value: (p) => p.category },
    { key: 'qty', label: 'Adet', align: 'right', value: (p) => p.qty, render: (p) => <>{fmtInt(p.qty)} <DeltaBadge cur={p.qty} prev={p.prevQty} compare={compare} /></> },
    { key: 'revenue', label: 'Ciro', align: 'right', value: (p) => p.revenue, render: (p) => fmtMoney(p.revenue) },
    { key: 'avgPrice', label: 'Ort. fiyat', align: 'right', value: (p) => p.avgPrice, render: (p) => fmtMoney(p.avgPrice) },
    { key: 'orders', label: 'Sipariş', align: 'right', value: (p) => p.orders },
    { key: 'share', label: 'Ciro payı', align: 'right', value: (p) => p.share, render: (p) => `%${fmtNum1(p.share)}` },
  ];

  if (!a.products.length) return <Empty text="Seçili aralıkta ürün satışı bulunamadı." />;

  return (
    <>
      <div className="anp-kpis">
        <KpiCard icon="🍽️" label="Satılan ürün adedi" value={fmtInt(prodTotal)} sub={`${a.products.length} farklı ürün`} />
        <KpiCard icon="🥇" label="En çok satan" value={a.products[0].name} sub={`${a.products[0].qty} adet`} color="#d4af37" />
        <KpiCard icon="💎" label="En yüksek ciro" value={[...a.products].sort((x, y) => y.revenue - x.revenue)[0].name} sub={fmtMoney([...a.products].sort((x, y) => y.revenue - x.revenue)[0].revenue)} color="#0ea5e9" />
        <KpiCard icon="🗂️" label="Kategori" value={a.categories.length} sub={a.categories[0] ? `lider: ${a.categories[0].name}` : ''} color="#7c4dff" />
      </div>

      <Grid cols={2}>
        <Card title={`🏅 En çok satan ürünler${cat ? ` — ${cat}` : ''}`} actions={<Seg value={metric} onChange={setMetric} options={[{ key: 'qty', label: 'Adet' }, { key: 'revenue', label: 'Ciro' }]} />}
          sub="Bir ürüne tıklayın → aşağıda satış trendi ve saat/gün dağılımı açılır">
          <HBarList rank activeKey={sel} onPick={(k) => setSel(sel === k ? null : k)} format={metric === 'qty' ? fmtInt : fmtMoney}
            rows={top.map((p) => ({ key: p.name, label: p.name, value: metric === 'qty' ? p.qty : p.revenue, right: metric === 'qty' ? ' adet' : '', sub: metric === 'qty' ? fmtMoney(p.revenue) : `${p.qty} adet` }))} />
        </Card>
        <Card title="Kategori karşılaştırması" sub="Dilime tıklayarak kategoriye göre filtreleyin" actions={cat ? <button type="button" className="anp-mini" onClick={() => setCat(null)}>✕ {cat}</button> : undefined}>
          <Donut activeLabel={cat} onPick={(l) => setCat(cat === l ? null : l)} format={fmtMoneyShort}
            slices={a.categories.map((c, i) => ({ label: c.name, value: c.revenue, color: PALETTE[i % PALETTE.length] }))} center={fmtMoneyShort(a.categories.reduce((s, c) => s + c.revenue, 0))} centerSub="ürün cirosu" />
        </Card>
      </Grid>

      {detail && (
        <Card title={`📈 ${sel} — ürün ayrıntısı`} sub={`${detail.stat.qty} adet · ${fmtMoney(detail.stat.revenue)} · %${fmtNum1(detail.stat.share)} ciro payı`}
          actions={<button type="button" className="anp-mini" onClick={() => setSel(null)}>✕ Kapat</button>}>
          <TrendChart labels={detail.trend.labels} longLabels={detail.trend.longLabels} height={200} series={[{ name: 'Adet', color: '#d4af37', values: detail.trend.groups.q || detail.trend.labels.map(() => 0) }]} />
          <Grid cols={3}>
            <div><h4 className="anp-h4">Saat dağılımı</h4><BarChart height={150} data={detail.hrs.map((v, i) => ({ label: String(HOURS_ORDER[i]).padStart(2, '0'), value: v }))} format={(v) => `${v} adet`} /></div>
            <div><h4 className="anp-h4">Gün dağılımı</h4><BarChart height={150} data={detail.wds.map((v, i) => ({ label: WD_SHORT[i], value: v }))} format={(v) => `${v} adet`} /></div>
            <div><h4 className="anp-h4">Kanal dağılımı</h4><HBarList rows={detail.plat.map(([k, v]) => ({ label: platformLabel(k), value: v, color: platformColor(k) }))} /></div>
          </Grid>
        </Card>
      )}

      <Grid cols={3}>
        <Card title="🚀 Yükselenler / 📉 Düşenler" sub="Önceki döneme göre adet değişimi">
          <HBarList rows={[...rising.slice(0, 4), ...rising.slice(-3).reverse()].filter((v, i, s) => s.findIndex((x) => x.name === v.name) === i).map((p) => ({ label: p.name, value: Math.abs(p.d), right: `  ${p.d >= 0 ? '▲' : '▼'}`, color: p.d >= 0 ? '#16a34a' : '#dc2626' }))} format={(v) => `%${fmtNum1(v, 0)}`} empty="Karşılaştırma için önceki dönem verisi yetersiz." />
        </Card>
        <Card title="🐢 En az satanlar" sub="Menü sadeleştirme fırsatı"><HBarList rows={bottom.map((p) => ({ label: p.name, value: p.qty, right: ' adet', color: '#0ea5e9' }))} /></Card>
        <Card title="🤝 Birlikte satılanlar" sub="Aynı siparişte sık görülen ikililer (kombo fikri)"><HBarList rows={pairs.map(([k, v]) => ({ label: k, value: v, right: ' sipariş', color: '#7c4dff' }))} empty="Yeterli çoklu ürünlü sipariş yok." /></Card>
      </Grid>

      <Card title="Tüm ürünler" sub="Sıralamak için başlıklara, ayrıntı için satıra tıklayın">
        <DataTable rows={list} cols={cols} pageSize={12} initialSort={{ key: 'qty', dir: 'desc' }} csvName="urun-analizi" onRow={(p) => setSel(p.name)} rowKey={(p) => p.name} />
      </Card>

      <Card title="Kategori tablosu">
        <DataTable rows={a.categories} csvName="kategori-analizi" pageSize={10} rowKey={(c) => c.name}
          cols={[
            { key: 'name', label: 'Kategori', value: (c) => c.name, render: (c) => <b>{c.name}</b> },
            { key: 'products', label: 'Ürün çeşidi', align: 'right', value: (c) => c.products },
            { key: 'qty', label: 'Adet', align: 'right', value: (c) => c.qty },
            { key: 'revenue', label: 'Ciro', align: 'right', value: (c) => c.revenue, render: (c) => <>{fmtMoney(c.revenue)} <DeltaBadge cur={c.revenue} prev={c.prevRevenue} compare={compare} /></> },
            { key: 'share', label: 'Pay', align: 'right', value: (c) => c.share, render: (c) => `%${fmtNum1(c.share)}` },
          ]} />
      </Card>
    </>
  );
}
