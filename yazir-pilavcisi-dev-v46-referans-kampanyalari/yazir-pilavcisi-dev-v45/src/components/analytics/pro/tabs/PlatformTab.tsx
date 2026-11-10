import { useMemo, useState } from 'react';
import { HOURS_ORDER, platformLabel, seriesBy, GRAN_LABELS, type Gran } from '@/lib/analyticsData';
import { Card, Chips, DataTable, DeltaBadge, Donut, Empty, Grid, HBarList, Heatmap, KpiCard, Seg, TrendChart, fmtInt, fmtMoney, fmtMoneyShort, fmtNum1, type Col } from '../Kit';
import type { TabProps } from './types';
import type { PlatformStat } from '@/lib/analyticsData';

export default function PlatformTab({ a, cur, range, compare, gran, onGran }: TabProps) {
  const [metric, setMetric] = useState<'orders' | 'revenue'>('orders');
  const keys = a.platforms.map((p) => p.key);
  const [shown, setShown] = useState<string[] | null>(null);
  const visible = shown ?? keys;

  const stacked = useMemo(() => {
    const valid = cur.filter((o) => o.status === 'delivered');
    return seriesBy(valid, range, gran, (o) => o.platform, metric === 'orders' ? () => 1 : (o) => o.total);
  }, [cur, range, gran, metric]);

  const cols: Col<PlatformStat>[] = [
    { key: 'label', label: 'Kanal', value: (p) => p.label, render: (p) => <b><i className="anp-dot" style={{ background: p.color }} />{p.label}</b> },
    { key: 'orders', label: 'Sipariş', align: 'right', value: (p) => p.orders, render: (p) => <>{fmtInt(p.orders)} <DeltaBadge cur={p.orders} prev={p.prevOrders} compare={compare} /></> },
    { key: 'revenue', label: 'Ciro', align: 'right', value: (p) => p.revenue, render: (p) => <>{fmtMoney(p.revenue)} <DeltaBadge cur={p.revenue} prev={p.prevRevenue} compare={compare} /></> },
    { key: 'share', label: 'Ciro payı', align: 'right', value: (p) => p.revenueShare, render: (p) => `%${fmtNum1(p.revenueShare)}` },
    { key: 'avg', label: 'Ort. sepet', align: 'right', value: (p) => p.avgBasket, render: (p) => fmtMoney(p.avgBasket) },
    { key: 'cancel', label: 'İptal', align: 'right', value: (p) => p.cancelRate, render: (p) => `${p.cancelled} (%${fmtNum1(p.cancelRate)})` },
    { key: 'peak', label: 'Yoğun saat', align: 'right', value: (p) => (p.peakSlot != null ? HOURS_ORDER[p.peakSlot] : null), render: (p) => (p.peakSlot != null ? `${String(HOURS_ORDER[p.peakSlot]).padStart(2, '0')}:00` : '—') },
  ];

  if (!a.platforms.length) return <Empty text="Platform analizi için seçili aralıkta sipariş yok." />;
  const grans: Gran[] = range.days <= 14 ? ['day'] : range.days <= 62 ? ['day', 'week'] : ['day', 'week', 'month'];
  const best = [...a.platforms].sort((x, y) => y.avgBasket - x.avgBasket)[0];
  const worstCancel = [...a.platforms].filter((p) => p.orders >= 5).sort((x, y) => y.cancelRate - x.cancelRate)[0];

  return (
    <>
      <div className="anp-kpis">
        <KpiCard icon="🏪" label="Aktif kanal" value={a.platforms.length} sub={`${a.platforms.filter((p) => !p.external).length} kendi · ${a.platforms.filter((p) => p.external).length} dış platform`} />
        <KpiCard icon="🥇" label="Lider kanal (ciro)" value={a.platforms[0].label} color={a.platforms[0].color} sub={`%${fmtNum1(a.platforms[0].revenueShare)} pay`} />
        <KpiCard icon="🛒" label="En yüksek sepet" value={best ? best.label : '—'} color="#14b8a6" sub={best ? fmtMoney(best.avgBasket) : ''} />
        <KpiCard icon="⚠️" label="En yüksek iptal" value={worstCancel ? worstCancel.label : '—'} color="#dc2626" sub={worstCancel ? `%${fmtNum1(worstCancel.cancelRate)} iptal` : 'yeterli veri yok'} />
      </div>

      <Card title="Kanal karşılaştırma tablosu" sub="Başlıklara tıklayarak sıralayın">
        <DataTable rows={a.platforms} cols={cols} pageSize={12} initialSort={{ key: 'revenue', dir: 'desc' }} csvName="platform-analizi" rowKey={(p) => p.key} />
      </Card>

      <Grid cols={2}>
        <Card title="Ciro payı"><Donut slices={a.platforms.map((p) => ({ label: p.label, value: p.revenue, color: p.color }))} format={fmtMoneyShort} center={fmtMoneyShort(a.totals.revenue)} centerSub="toplam ciro" /></Card>
        <Card title="Sipariş payı"><Donut slices={a.platforms.map((p) => ({ label: p.label, value: p.delivered, color: p.color }))} center={fmtInt(a.totals.delivered)} centerSub="teslim sipariş" /></Card>
      </Grid>

      <Card title="Kanal bazlı zaman serisi (yığılmış)"
        actions={<>
          <Seg value={metric} onChange={setMetric} options={[{ key: 'orders', label: 'Sipariş' }, { key: 'revenue', label: 'Ciro' }]} />
          {grans.length > 1 && <Seg value={gran} onChange={onGran} options={grans.map((g) => ({ key: g, label: GRAN_LABELS[g] }))} />}
        </>}>
        <Chips options={a.platforms.map((p) => ({ key: p.key, label: p.label, color: p.color }))} value={visible} onChange={(v) => setShown(v.length ? v : keys)} />
        <TrendChart type="bar" stacked labels={stacked.labels} longLabels={stacked.longLabels} format={metric === 'revenue' ? fmtMoney : fmtInt}
          series={a.platforms.filter((p) => visible.includes(p.key)).map((p) => ({ name: p.label, color: p.color, values: stacked.groups[p.key] || stacked.labels.map(() => 0) }))} />
      </Card>

      <Grid cols={2}>
        <Card title="Ortalama sepet karşılaştırması"><HBarList rows={[...a.platforms].sort((x, y) => y.avgBasket - x.avgBasket).map((p) => ({ label: p.label, value: p.avgBasket, color: p.color }))} format={fmtMoney} /></Card>
        <Card title="İptal oranı (%)"><HBarList rows={[...a.platforms].sort((x, y) => y.cancelRate - x.cancelRate).map((p) => ({ label: p.label, value: p.cancelRate, right: ` · ${p.cancelled} adet`, color: p.cancelRate >= 8 ? '#dc2626' : p.color }))} format={(v) => `%${fmtNum1(v)}`} /></Card>
      </Grid>

      <Card title="Kanal × saat yoğunluğu" sub="Hangi platform günün hangi saatinde güçlü?">
        <Heatmap matrix={a.platforms.map((p) => p.hours)} rows={a.platforms.map((p) => platformLabel(p.key).split(' ')[0].slice(0, 6))} cols={HOURS_ORDER.map((h) => String(h).padStart(2, '0'))} />
        <p className="anp-hint" style={{ marginTop: 8 }}>Satırlar: {a.platforms.map((p) => `${platformLabel(p.key).split(' ')[0].slice(0, 6)} = ${p.label}`).join(' · ')}</p>
      </Card>
    </>
  );
}
