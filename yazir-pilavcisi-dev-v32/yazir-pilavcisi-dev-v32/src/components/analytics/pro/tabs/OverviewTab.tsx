import { useMemo, useState } from 'react';
import { GRAN_LABELS, buildInsights, buildTrend, hh, platformColor, type Gran } from '@/lib/analyticsData';
import {
  BarChart, Card, DeltaBadge, Donut, Empty, Grid, HBarList, InsightCard, KpiCard, Seg, TrendChart,
  fmtInt, fmtMoney, fmtMoneyShort, fmtNum1,
} from '../Kit';
import type { TabProps } from './types';

export default function OverviewTab({ a, cur, prev, range, compare, gran, onGran }: TabProps) {
  const [metric, setMetric] = useState<'revenue' | 'orders'>('revenue');
  const t = a.totals, p = a.prevTotals;
  const trend = useMemo(() => buildTrend(cur, prev, range, gran), [cur, prev, range, gran]);
  const insights = useMemo(() => buildInsights(a), [a]);
  const peak = [...a.hours].sort((x, y) => y.orders - x.orders)[0];
  const daysActive = a.days.filter((d) => d.orders > 0).length;
  const fmt = metric === 'revenue' ? fmtMoney : fmtInt;
  const grans: Gran[] = range.days <= 1 ? ['hour'] : range.days <= 14 ? ['day'] : range.days <= 62 ? ['day', 'week'] : ['day', 'week', 'month'];

  return (
    <>
      <div className="anp-kpis">
        <KpiCard icon="💰" label="Ciro (teslim edilen)" value={fmtMoney(t.revenue)} color="#d4af37" delta={<DeltaBadge cur={t.revenue} prev={p.revenue} compare={compare} />} sub={compare ? `önceki: ${fmtMoney(p.revenue)}` : undefined} spark={trend.revenue} />
        <KpiCard icon="🧾" label="Toplam sipariş" value={fmtInt(t.orders)} color="#0ea5e9" delta={<DeltaBadge cur={t.orders} prev={p.orders} compare={compare} />} sub={`${fmtInt(t.delivered)} teslim · ${fmtInt(t.cancelled)} iptal`} spark={trend.orders} />
        <KpiCard icon="🛒" label="Ortalama sepet" value={fmtMoney(t.avgBasket)} color="#14b8a6" delta={<DeltaBadge cur={t.avgBasket} prev={p.avgBasket} compare={compare} />} sub={compare ? `önceki: ${fmtMoney(p.avgBasket)}` : undefined} />
        <KpiCard icon="🚫" label="İptal oranı" value={`%${fmtNum1(t.cancelRate)}`} color="#dc2626" delta={<DeltaBadge cur={t.cancelRate} prev={p.cancelRate} inverse compare={compare} />} sub={`${fmtInt(t.cancelled)} iptal sipariş`} />
        <KpiCard icon="⏰" label="En yoğun saat" value={peak?.orders ? hh(peak.hour) : '—'} color="#f27a1a" sub={peak?.orders ? `${peak.orders} sipariş` : ''} />
        <KpiCard icon="📆" label="Günlük ortalama" value={fmtMoneyShort(daysActive ? t.revenue / daysActive : 0)} color="#7c4dff" sub={`${fmtNum1(daysActive ? t.delivered / daysActive : 0)} sipariş / aktif gün`} />
        <KpiCard icon="🍽️" label="Satılan ürün adedi" value={fmtInt(t.itemsQty)} color="#a16207" delta={<DeltaBadge cur={t.itemsQty} prev={p.itemsQty} compare={compare} />} sub={`sipariş başı ${fmtNum1(t.delivered ? t.itemsQty / t.delivered : 0)} ürün`} />
        <KpiCard icon="👥" label="Tanınan müşteri" value={fmtInt(t.customers)} color="#2e9e45" delta={<DeltaBadge cur={t.customers} prev={p.customers} compare={compare} />} sub="üyelik / telefon ile" />
      </div>

      <Card
        title={`${metric === 'revenue' ? 'Ciro' : 'Sipariş'} trendi`}
        sub={compare ? 'Kesik çizgi: hemen önceki eşdeğer dönem' : undefined}
        actions={<>
          <Seg value={metric} onChange={setMetric} options={[{ key: 'revenue', label: 'Ciro' }, { key: 'orders', label: 'Sipariş' }]} />
          {grans.length > 1 && <Seg value={gran} onChange={onGran} options={grans.map((g) => ({ key: g, label: GRAN_LABELS[g] }))} />}
        </>}
      >
        <TrendChart
          labels={trend.labels} longLabels={trend.longLabels} format={fmt}
          series={[
            { name: 'Bu dönem', color: '#d4af37', values: metric === 'revenue' ? trend.revenue : trend.orders },
            ...(compare ? [{ name: 'Önceki dönem', color: '#94a3b8', dashed: true, values: metric === 'revenue' ? trend.prevRevenue : trend.prevOrders }] : []),
          ]}
        />
      </Card>

      {insights.length > 0 && (
        <Card title="💡 Otomatik içgörüler" sub="Seçili döneme ve platforma göre hesaplanır">
          <div className="anp-insights">{insights.map((i, k) => <InsightCard key={k} {...i} />)}</div>
        </Card>
      )}

      <Grid cols={2}>
        <Card title="Kanal dağılımı (ciro)">
          <Donut
            slices={a.platforms.map((x) => ({ label: x.label, value: x.revenue, color: platformColor(x.key) }))}
            format={fmtMoneyShort} center={fmtMoneyShort(t.revenue)} centerSub="toplam ciro"
          />
        </Card>
        <Card title="🔥 En çok satan 8 ürün">
          <HBarList rank rows={a.products.slice(0, 8).map((x) => ({ label: x.name, value: x.qty, right: ` adet`, sub: fmtMoney(x.revenue) }))} />
        </Card>
      </Grid>

      <Grid cols={2}>
        <Card title="Saat dağılımı" sub="Altın = en yoğun · Mavi = en sakin (iş günü 03:00'te başlar)">
          <BarChart height={190} data={a.hours.map((h) => ({ label: String(h.hour).padStart(2, '0'), value: h.orders, sub: `${fmtMoney(h.revenue)} ciro` }))} format={(v) => `${v} sipariş`} />
        </Card>
        <Card title="Haftanın günleri" sub="Seçili dönemdeki toplam sipariş">
          <BarChart height={190} data={a.weekdays.map((w) => ({ label: w.label, value: w.orders, sub: `günlük ort. ${fmtNum1(w.avgOrders)} sipariş` }))} format={(v) => `${v} sipariş`} />
        </Card>
      </Grid>
      {!t.orders && <Empty text="Seçili aralık ve platform için sipariş bulunamadı. Farklı bir tarih aralığı deneyin." />}
    </>
  );
}
