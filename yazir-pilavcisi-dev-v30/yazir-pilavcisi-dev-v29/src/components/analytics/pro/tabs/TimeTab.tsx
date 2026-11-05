import { useMemo, useState } from 'react';
import {
  GRAN_LABELS, HOURS_ORDER, WD_LONG, WD_SHORT, buildTrend, hh, hourSlot, longKey, platformColor, platformLabel, bizKey, weekdayOfKey,
  type Gran,
} from '@/lib/analyticsData';
import { BarChart, Card, DataTable, Donut, Empty, Grid, HBarList, Heatmap, Seg, TrendChart, fmtInt, fmtMoney, fmtNum1, fmtMoneyShort, type Col } from '../Kit';
import type { TabProps } from './types';

const PARTS = [
  { label: '🌅 Sabah (03–11)', from: 3, to: 11, color: '#f59e0b' },
  { label: '☀️ Öğle (11–15)', from: 11, to: 15, color: '#d4af37' },
  { label: '🌤️ İkindi (15–18)', from: 15, to: 18, color: '#14b8a6' },
  { label: '🌇 Akşam (18–22)', from: 18, to: 22, color: '#7c4dff' },
  { label: '🌙 Gece (22–03)', from: 22, to: 27, color: '#0ea5e9' },
];

export default function TimeTab({ a, cur, prev, range, compare, gran, onGran }: TabProps) {
  const [hm, setHm] = useState<'orders' | 'revenue'>('orders');
  const [wdMode, setWdMode] = useState<'total' | 'avg'>('total');
  const [selSlot, setSelSlot] = useState<number | null>(null);
  const [selWd, setSelWd] = useState<number | null>(null);
  const trend = useMemo(() => buildTrend(cur, prev, range, gran), [cur, prev, range, gran]);
  const grans: Gran[] = ['hour', 'day', 'week', 'month'];

  const valid = useMemo(() => cur.filter((o) => o.status === 'delivered'), [cur]);
  const drill = useMemo(() => {
    if (selSlot == null && selWd == null) return null;
    const list = valid.filter((o) => (selSlot == null || hourSlot(o.ts) === selSlot) && (selWd == null || weekdayOfKey(bizKey(o.ts)) === selWd));
    const plat = new Map<string, number>();
    const prod = new Map<string, number>();
    list.forEach((o) => { plat.set(o.platform, (plat.get(o.platform) || 0) + 1); o.items.forEach((i) => prod.set(i.name, (prod.get(i.name) || 0) + i.qty)); });
    return {
      n: list.length, revenue: list.reduce((s, o) => s + o.total, 0),
      plat: [...plat.entries()].sort((x, y) => y[1] - x[1]),
      prod: [...prod.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6),
    };
  }, [valid, selSlot, selWd]);

  const matrix = hm === 'orders' ? a.heat : a.heatRev;
  const cells = useMemo(() => {
    const out: { wd: number; slot: number; v: number }[] = [];
    a.heat.forEach((row, wd) => row.forEach((v, slot) => out.push({ wd, slot, v })));
    const activeSlots = new Set(a.hours.filter((h) => h.orders > 0).map((h) => h.slot));
    const wdActive = new Set(a.weekdays.filter((w) => w.occurrences > 0 && w.orders > 0).map((w) => w.wd));
    const busiest = [...out].sort((x, y) => y.v - x.v).filter((c) => c.v > 0).slice(0, 5);
    // En sakin: yalnızca satış yapılan saat aralığı ve satış olan günlerde (kapalı saatler sakin sayılmaz)
    const first = Math.min(...[...activeSlots, 99]), last = Math.max(...[...activeSlots, -1]);
    const quiet = out.filter((c) => c.slot >= first && c.slot <= last && wdActive.has(c.wd)).sort((x, y) => x.v - y.v).slice(0, 5);
    return { busiest, quiet };
  }, [a]);

  const partData = PARTS.map((p) => {
    let orders = 0, revenue = 0;
    a.hours.forEach((h) => {
      const hr = h.hour < 3 ? h.hour + 24 : h.hour;
      if (hr >= p.from && hr < p.to) { orders += h.orders; revenue += h.revenue; }
    });
    return { ...p, orders, revenue };
  });

  const dayCols: Col<(typeof a.days)[number]>[] = [
    { key: 'day', label: 'Gün', value: (d) => d.key, render: (d) => longKey(d.key) },
    { key: 'orders', label: 'Sipariş', align: 'right', value: (d) => d.orders },
    { key: 'revenue', label: 'Ciro', align: 'right', value: (d) => d.revenue, render: (d) => fmtMoney(d.revenue) },
    { key: 'avg', label: 'Ort. sepet', align: 'right', value: (d) => (d.orders ? d.revenue / d.orders : 0), render: (d) => fmtMoney(d.orders ? d.revenue / d.orders : 0) },
    { key: 'cancelled', label: 'İptal', align: 'right', value: (d) => d.cancelled },
  ];

  const hourData = a.hours.map((h) => ({ label: String(h.hour).padStart(2, '0'), value: hm === 'orders' ? h.orders : h.revenue, sub: `${h.orders} sipariş · ${fmtMoney(h.revenue)}` }));
  const wdData = a.weekdays.map((w) => ({ label: w.label, value: wdMode === 'total' ? (hm === 'orders' ? w.orders : w.revenue) : (hm === 'orders' ? w.avgOrders : w.avgRevenue), sub: `${w.occurrences} gün · toplam ${w.orders} sipariş` }));
  const money = hm === 'revenue';

  if (!a.totals.delivered) return <Empty text="Zaman analizi için seçili aralıkta sipariş yok." />;

  return (
    <>
      <div className="anp-note">⏱️ Tüm saatler <b>İstanbul saatine</b> göredir. İş günü <b>03:00</b>'te başlar: gece 00:00–02:59 arası siparişler bir önceki iş gününe yazılır.</div>

      <Card title="Sipariş trendi" sub="Saatlik / günlük / haftalık / aylık gruplama"
        actions={<Seg value={gran} onChange={onGran} options={grans.map((g) => ({ key: g, label: GRAN_LABELS[g] }))} />}>
        <TrendChart labels={trend.labels} longLabels={trend.longLabels} type="bar" height={250}
          series={[{ name: 'Sipariş', color: '#d4af37', values: trend.orders }, ...(compare ? [{ name: 'Önceki dönem', color: '#94a3b8', dashed: true, values: trend.prevOrders }] : [])]} />
      </Card>

      <div className="anp-toolbar no-print">
        <Seg value={hm} onChange={setHm} options={[{ key: 'orders', label: 'Sipariş adedi' }, { key: 'revenue', label: 'Ciro' }]} />
        {(selSlot != null || selWd != null) && <button type="button" className="anp-mini" onClick={() => { setSelSlot(null); setSelWd(null); }}>✕ Seçimi temizle</button>}
        <span className="anp-hint">İpucu: Bir saat çubuğuna, gün çubuğuna veya ısı haritası hücresine tıklayın → o dilimin detayı açılır.</span>
      </div>

      <Grid cols={2}>
        <Card title="Saat bazlı dağılım" sub="Altın: en yoğun saat · Mavi: en sakin saat">
          <BarChart data={hourData} format={money ? fmtMoneyShort : (v) => `${v} sipariş`} activeIndex={selSlot} onPick={(i) => setSelSlot(selSlot === i ? null : i)} />
        </Card>
        <Card title="Haftanın günleri" actions={<Seg value={wdMode} onChange={setWdMode} options={[{ key: 'total', label: 'Toplam' }, { key: 'avg', label: 'Günlük ort.' }]} />}>
          <BarChart data={wdData} format={money ? fmtMoneyShort : (v) => (wdMode === 'avg' ? fmtNum1(v) + ' sipariş' : `${v} sipariş`)} activeIndex={selWd} onPick={(i) => setSelWd(selWd === i ? null : i)} />
        </Card>
      </Grid>

      {drill && (
        <Card title={`🔎 Seçili dilim: ${selWd != null ? WD_LONG[selWd] : 'Tüm günler'}${selSlot != null ? ` · ${hh(HOURS_ORDER[selSlot])}–${hh((HOURS_ORDER[selSlot] + 1) % 24)}` : ''}`}
          sub={`${drill.n} sipariş · ${fmtMoney(drill.revenue)} ciro`}>
          <Grid cols={2}>
            <div><h4 className="anp-h4">Kanal kırılımı</h4>
              <HBarList rows={drill.plat.map(([k, v]) => ({ label: platformLabel(k), value: v, color: platformColor(k) }))} empty="Veri yok." /></div>
            <div><h4 className="anp-h4">Bu dilimde en çok satanlar</h4>
              <HBarList rank rows={drill.prod.map(([k, v]) => ({ label: k, value: v, right: ' adet' }))} empty="Veri yok." /></div>
          </Grid>
        </Card>
      )}

      <Card title="🔥 Yoğunluk haritası (gün × saat)" sub="Koyu / kırmızı = daha yoğun. Hücreye tıklayarak detay görün.">
        <Heatmap matrix={matrix} rows={WD_SHORT} cols={HOURS_ORDER.map((h) => String(h).padStart(2, '0'))}
          format={money ? fmtMoneyShort : fmtInt} unit={money ? '' : 'sipariş'}
          active={selWd != null && selSlot != null ? { r: selWd, c: selSlot } : null}
          onPick={(r, c) => { if (selWd === r && selSlot === c) { setSelWd(null); setSelSlot(null); } else { setSelWd(r); setSelSlot(c); } }} />
      </Card>

      <Grid cols={2}>
        <Card title="🏆 En yoğun 5 zaman dilimi">
          <HBarList rank rows={cells.busiest.map((c) => ({ key: `${c.wd}-${c.slot}`, label: `${WD_LONG[c.wd]} ${hh(HOURS_ORDER[c.slot])}`, value: c.v, right: ' sipariş', color: '#d4af37' }))} />
        </Card>
        <Card title="🧊 En sakin 5 zaman dilimi" sub="Satış yapılan saat aralığı ve açık günler içinde">
          <HBarList rows={cells.quiet.map((c) => ({ key: `${c.wd}-${c.slot}`, label: `${WD_LONG[c.wd]} ${hh(HOURS_ORDER[c.slot])}`, value: c.v, right: ' sipariş', color: '#0ea5e9' }))} max={Math.max(1, cells.busiest[0]?.v || 1)} />
        </Card>
      </Grid>

      <Grid cols={2}>
        <Card title="Günün bölümlerine göre sipariş">
          <Donut slices={partData.map((p) => ({ label: p.label, value: p.orders, color: p.color, sub: fmtMoney(p.revenue) }))} center={fmtInt(a.totals.delivered)} centerSub="sipariş" />
        </Card>
        <Card title="Günün bölümlerine göre ciro">
          <Donut slices={partData.map((p) => ({ label: p.label, value: p.revenue, color: p.color }))} format={fmtMoneyShort} center={fmtMoneyShort(a.totals.revenue)} centerSub="ciro" />
        </Card>
      </Grid>

      <Card title="Gün gün döküm" sub="Başlığa tıklayarak sıralayın (en iyi / en kötü günleri bulun)">
        <DataTable rows={a.days} cols={dayCols} pageSize={10} initialSort={{ key: 'revenue', dir: 'desc' }} csvName="gun-gun-dokum" rowKey={(d) => d.key} />
      </Card>
    </>
  );
}
