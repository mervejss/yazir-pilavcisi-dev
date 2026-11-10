import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import '@/styles/finance.css';
import {
  GRAN_LABELS, GROUP_META, channelGroup, isValid, platformColor, platformLabel, seriesBy,
  type AOrder, type ChannelGroup, type Gran,
} from '@/lib/analyticsData';
import { money2 } from '@/lib/finance';
import { Card, DataTable, Donut, Empty, Grid, HBarList, KpiCard, Seg, TrendChart, fmtInt, fmtMoney, fmtMoneyShort, fmtNum1, type Col } from '../Kit';
import type { TabProps } from './types';

/** Tek siparişin ekonomisi */
interface Econ { revenue: number; refund: number; commission: number; deductions: number; cost: number; profit: number }
interface Row extends Econ {
  key: string; label: string; color: string; group: ChannelGroup; orders: number; real: boolean;
}
const ZERO = (): Econ => ({ revenue: 0, refund: 0, commission: 0, deductions: 0, cost: 0, profit: 0 });
const addTo = (t: Econ, e: Econ) => { t.revenue += e.revenue; t.refund += e.refund; t.commission += e.commission; t.deductions += e.deductions; t.cost += e.cost; t.profit += e.profit; };
const margin = (e: Econ) => (e.revenue > 0 ? (e.profit / e.revenue) * 100 : 0);

export default function ProfitTab({ a, cur, range, settings, fin, finSettings, gran, onGran }: TabProps) {
  const [metric, setMetric] = useState<'revenue' | 'profit'>('profit');

  // Trendyol: Cari Hesap Ekstresi'nden GERÇEK oranlar (varsa). Yoksa ayarlardaki tahmini komisyon.
  const tr = useMemo(() => {
    if (!fin) return null;
    const sales = fin.gross.sale + fin.gross.delivery;
    if (sales <= 0) return null;
    const cl = (v: number) => Math.max(0, Math.min(0.6, v));
    return {
      comm: cl(fin.rawCommission / sales),
      refund: cl(-(fin.gross.return + fin.gross.discount) / sales),
      ded: cl((fin.deductions.total - fin.deductions.stoppage) / sales),   // stopaj gider değil (vergiden mahsup)
    };
  }, [fin]);

  const econOf = useMemo(() => (o: AOrder): Econ => {
    const own = channelGroup(o.platform) === 'inside';
    const rev = o.total;
    let refund = 0, commission = 0, deductions = 0;
    if (!own) {
      if (o.platform === 'trendyol' && tr) { commission = rev * tr.comm; refund = rev * tr.refund; deductions = rev * tr.ded; }
      else commission = (rev * (settings.commission[o.platform] ?? 20)) / 100;
    }
    const base = Math.max(rev - refund, 0);
    const cost = (base * (finSettings.foodCostPct + finSettings.otherCostPct)) / 100 + finSettings.packagingPerOrder
      + (own && o.orderType === 'delivery' ? finSettings.courierPerOrder : 0);
    return { revenue: rev, refund, commission, deductions, cost, profit: rev - refund - commission - deductions - cost };
  }, [tr, settings.commission, finSettings]);

  const valid = useMemo(() => cur.filter(isValid), [cur]);

  const { rows, groups, total } = useMemo(() => {
    const map = new Map<string, Row>();
    const groups: Record<ChannelGroup, Row> = {
      inside: { ...ZERO(), key: 'inside', label: GROUP_META.inside.label, color: GROUP_META.inside.color, group: 'inside', orders: 0, real: false },
      outside: { ...ZERO(), key: 'outside', label: GROUP_META.outside.label, color: GROUP_META.outside.color, group: 'outside', orders: 0, real: false },
    };
    const total = ZERO();
    let totalOrders = 0;
    for (const o of valid) {
      const e = econOf(o);
      const g = channelGroup(o.platform);
      const r = map.get(o.platform) || { ...ZERO(), key: o.platform, label: platformLabel(o.platform), color: platformColor(o.platform), group: g, orders: 0, real: o.platform === 'trendyol' && !!tr };
      addTo(r, e); r.orders++; map.set(o.platform, r);
      addTo(groups[g], e); groups[g].orders++;
      addTo(total, e); totalOrders++;
    }
    return { rows: [...map.values()].sort((x, y) => y.revenue - x.revenue), groups, total: { ...total, orders: totalOrders } };
  }, [valid, econOf, tr]);

  const trend = useMemo(() => {
    const by = (m: (o: AOrder) => number) => seriesBy(valid, range, gran, (o) => channelGroup(o.platform), m);
    return metric === 'revenue' ? by((o) => o.total) : by((o) => econOf(o).profit);
  }, [valid, range, gran, metric, econOf]);

  const topByGroup = useMemo(() => {
    const out: Record<ChannelGroup, { name: string; qty: number; revenue: number }[]> = { inside: [], outside: [] };
    (['inside', 'outside'] as ChannelGroup[]).forEach((g) => {
      const m = new Map<string, { name: string; qty: number; revenue: number }>();
      valid.filter((o) => channelGroup(o.platform) === g).forEach((o) => o.items.forEach((i) => {
        const e = m.get(i.name) || { name: i.name, qty: 0, revenue: 0 }; e.qty += i.qty; e.revenue += i.total; m.set(i.name, e);
      }));
      out[g] = [...m.values()].sort((x, y) => y.qty - x.qty).slice(0, 8);
    });
    return out;
  }, [valid]);

  if (!a.totals.delivered) return <Empty text="Kâr analizi için seçili aralıkta (ve kanalda) teslim edilmiş sipariş yok." />;

  const grans: Gran[] = range.days <= 1 ? ['hour'] : range.days <= 14 ? ['day'] : range.days <= 62 ? ['day', 'week'] : ['day', 'week', 'month'];
  const fmt = metric === 'revenue' ? fmtMoney : (v: number) => fmtMoney(v);
  const leaks = total.commission + total.deductions + total.refund;

  const cols: Col<Row>[] = [
    { key: 'k', label: 'Kanal', value: (r) => r.label, render: (r) => <b><i className="anp-dot" style={{ background: r.color }} />{r.label}</b> },
    { key: 'g', label: 'Grup', value: (r) => r.group, render: (r) => <span className="muted">{GROUP_META[r.group].emoji} {GROUP_META[r.group].label}</span> },
    { key: 'o', label: 'Sipariş', align: 'right', value: (r) => r.orders, render: (r) => fmtInt(r.orders) },
    { key: 'rev', label: 'Ciro', align: 'right', value: (r) => r.revenue, render: (r) => fmtMoney(r.revenue) },
    { key: 'ref', label: 'İade/indirim', align: 'right', value: (r) => r.refund, render: (r) => (r.refund ? fmtMoney(r.refund) : '—') },
    { key: 'com', label: 'Komisyon', align: 'right', value: (r) => r.commission, render: (r) => (r.commission ? <>{fmtMoney(r.commission)} <small className="muted">%{fmtNum1(r.revenue ? (r.commission / r.revenue) * 100 : 0, 1)}</small></> : <span className="muted">—</span>) },
    { key: 'ded', label: 'Platform kesintisi', align: 'right', value: (r) => r.deductions, render: (r) => (r.deductions ? fmtMoney(r.deductions) : '—') },
    { key: 'cost', label: 'Maliyet', align: 'right', value: (r) => r.cost, render: (r) => fmtMoney(r.cost) },
    { key: 'pr', label: 'Net kâr', align: 'right', value: (r) => r.profit, render: (r) => <b className={r.profit >= 0 ? 'anp-ok' : 'anp-bad'}>{fmtMoney(r.profit)}</b> },
    { key: 'm', label: 'Marj', align: 'right', value: (r) => margin(r), render: (r) => `%${fmtNum1(margin(r), 1)}` },
    { key: 'po', label: 'Kâr/sipariş', align: 'right', value: (r) => (r.orders ? r.profit / r.orders : 0), render: (r) => fmtMoney(r.orders ? r.profit / r.orders : 0) },
    { key: 'src', label: 'Veri', value: (r) => (r.real ? 'gerçek' : 'tahmini'), render: (r) => (r.real ? <span className="anp-ok" title="Trendyol Cari Hesap Ekstresi oranları">gerçek</span> : <span className="muted">{r.group === 'inside' ? 'komisyonsuz' : 'tahmini'}</span>) },
  ];

  const GroupCard = ({ g }: { g: ChannelGroup }) => {
    const r = groups[g], m = GROUP_META[g];
    const share = total.revenue ? (r.revenue / total.revenue) * 100 : 0;
    return (
      <Card title={<span><i className="anp-dot" style={{ background: m.color }} /> {m.emoji} {m.label}</span>} sub={m.hint}>
        {r.orders === 0 ? <Empty text="Bu grupta sipariş yok." /> : (
          <div className="fin-kv">
            <span>Sipariş</span><b>{fmtInt(r.orders)} <small className="muted">(%{fmtNum1(total.orders ? (r.orders / total.orders) * 100 : 0, 0)})</small></b>
            <span>Ciro</span><b>{money2(r.revenue)} <small className="muted">(%{fmtNum1(share, 0)})</small></b>
            <span>Ortalama sepet</span><b>{money2(r.orders ? r.revenue / r.orders : 0)}</b>
            <span>İade / indirim</span><b className="neg">{money2(-r.refund)}</b>
            <span>Platform komisyonu</span><b className="neg">{money2(-r.commission)}</b>
            <span>Diğer platform kesintisi</span><b className="neg">{money2(-r.deductions)}</b>
            <span>Maliyet (ürün + ambalaj + kurye + diğer)</span><b className="neg">{money2(-r.cost)}</b>
            <span className="strong">NET KÂR</span><b className={r.profit >= 0 ? 'pos' : 'neg'}>{money2(r.profit)}</b>
            <span>Marj · sipariş başı kâr</span><b>%{fmtNum1(margin(r), 1)} · {money2(r.orders ? r.profit / r.orders : 0)}</b>
          </div>
        )}
      </Card>
    );
  };

  return (
    <>
      <div className={`anp-banner ${tr ? '' : 'err'}`}>
        {tr
          ? <>✅ Trendyol için <b>gerçek</b> Cari Hesap oranları kullanılıyor: komisyon %{fmtNum1(tr.comm * 100, 1)} · iade+indirim %{fmtNum1(tr.refund * 100, 1)} · diğer kesinti %{fmtNum1(tr.ded * 100, 1)} (stopaj hariç). Diğer platformlar tahmini komisyonla hesaplanır.</>
          : <>ℹ️ Trendyol finans verisi bu aralıkta yok → komisyon ayarlardaki tahmini orandan hesaplanıyor. <Link to="/admin/finans">Finans sayfasından “Trendyol’dan çek”</Link> yapınca gerçek rakamlara döner.</>}
        {' '}Maliyet: ürün %{finSettings.foodCostPct}{finSettings.otherCostPct ? ` + diğer %${finSettings.otherCostPct}` : ''}, ambalaj {money2(finSettings.packagingPerOrder)}/sipariş{finSettings.courierPerOrder ? `, kendi kurye ${money2(finSettings.courierPerOrder)}/paket sipariş` : ''}.
        {' '}<Link to="/admin/finans">Maliyet ayarlarını değiştir →</Link>
      </div>

      <div className="anp-kpis">
        <KpiCard icon="🧾" label="Toplam sipariş" value={fmtInt(total.orders)} color="#0ea5e9" sub={`ort. sepet ${fmtMoney(total.orders ? total.revenue / total.orders : 0)}`} />
        <KpiCard icon="💰" label="Toplam ciro" value={fmtMoney(total.revenue)} color="#d4af37" sub={`iç %${fmtNum1(total.revenue ? (groups.inside.revenue / total.revenue) * 100 : 0, 0)} · dış %${fmtNum1(total.revenue ? (groups.outside.revenue / total.revenue) * 100 : 0, 0)}`} />
        <KpiCard icon="💸" label="Komisyon + platform kesintisi" value={fmtMoney(total.commission + total.deductions)} color="#dc2626" sub={`komisyon ${fmtMoneyShort(total.commission)} · kesinti ${fmtMoneyShort(total.deductions)}`} />
        <KpiCard icon="↩️" label="İade / indirim" value={fmtMoney(total.refund)} color="#f27a1a" sub="Trendyol gerçek iade+kupon oranıyla" />
        <KpiCard icon="🍽️" label="Maliyet" value={fmtMoney(total.cost)} color="#7c4dff" sub={`ürün %${finSettings.foodCostPct} + ambalaj/kurye`} />
        <KpiCard icon="📈" label="NET KÂR" value={fmtMoney(total.profit)} color={total.profit >= 0 ? '#16a34a' : '#dc2626'} sub={`marj %${fmtNum1(margin(total), 1)}`} />
        <KpiCard icon="🪙" label="Sipariş başı net kâr" value={fmtMoney(total.orders ? total.profit / total.orders : 0)} color="#14b8a6" />
        <KpiCard icon="🕳️" label="Cironun kaçağı" value={`%${fmtNum1(total.revenue ? (leaks / total.revenue) * 100 : 0, 1)}`} color="#a16207" sub="komisyon + kesinti + iade" />
      </div>

      <Grid cols={2}>
        <GroupCard g="inside" />
        <GroupCard g="outside" />
      </Grid>

      <Card title="Kanal bazında kârlılık" sub="Restoran içi: masa servisi, gel-al, telefon, online (web) · Restoran dışı: komisyonlu platformlar. Başlıklara tıklayarak sıralayın.">
        <DataTable rows={rows} cols={cols} pageSize={12} csvName="kanal-karlilik" rowKey={(r) => r.key} initialSort={{ key: 'rev', dir: 'desc' }} />
      </Card>

      <Grid cols={2}>
        <Card title="Ciro payı — iç / dış">
          <Donut slices={(['inside', 'outside'] as ChannelGroup[]).map((g) => ({ label: GROUP_META[g].label, value: groups[g].revenue, color: GROUP_META[g].color }))}
            format={fmtMoneyShort} center={fmtMoneyShort(total.revenue)} centerSub="toplam ciro" />
        </Card>
        <Card title="Net kâr payı — kanallar" sub="Zarar eden kanallar listede negatif görünür">
          <HBarList rows={[...rows].sort((x, y) => y.profit - x.profit).map((r) => ({ label: r.label, value: r.profit, color: r.profit >= 0 ? r.color : '#dc2626', sub: `${fmtInt(r.orders)} sipariş · marj %${fmtNum1(margin(r), 0)}` }))} format={fmtMoney} />
        </Card>
      </Grid>

      <Card title={metric === 'profit' ? 'Net kâr trendi — Restoran içi / dışı' : 'Ciro trendi — Restoran içi / dışı'}
        actions={<>
          <Seg value={metric} onChange={setMetric} options={[{ key: 'profit', label: 'Net kâr' }, { key: 'revenue', label: 'Ciro' }]} />
          {grans.length > 1 && <Seg value={gran} onChange={onGran} options={grans.map((g) => ({ key: g, label: GRAN_LABELS[g] }))} />}
        </>}>
        <TrendChart type="bar" stacked={metric === 'revenue'} labels={trend.labels} longLabels={trend.longLabels} format={fmt}
          series={(['inside', 'outside'] as ChannelGroup[]).map((g) => ({ name: GROUP_META[g].label, color: GROUP_META[g].color, values: trend.groups[g] || trend.labels.map(() => 0) }))} />
      </Card>

      <Grid cols={2}>
        <Card title="🏠 Restoran içi — en çok satanlar"><HBarList rank rows={topByGroup.inside.map((x) => ({ label: x.name, value: x.qty, right: ' adet', sub: fmtMoney(x.revenue) }))} empty="Ürün verisi yok." /></Card>
        <Card title="🛵 Restoran dışı — en çok satanlar"><HBarList rank rows={topByGroup.outside.map((x) => ({ label: x.name, value: x.qty, right: ' adet', sub: fmtMoney(x.revenue) }))} empty="Ürün verisi yok." /></Card>
      </Grid>

      {fin && (
        <Card title="🟠 Trendyol — gerçek cari hesap rakamları" sub="Bu aralıktaki Trendyol finansal kayıtlarının toplamı (Finans sayfasıyla aynı).">
          <div className="fin-kv">
            <span>Müşteri satışı</span><b>{money2(fin.gross.sale + fin.gross.delivery)}</b>
            <span>Komisyon (KDV dahil)</span><b className="neg">{money2(-fin.rawCommission)}</b>
            <span>İade + indirim</span><b className="neg">{money2(fin.gross.return + fin.gross.discount)}</b>
            <span>Hakediş</span><b>{money2(fin.payout)}</b>
            <span>Diğer kesintiler (stopaj, hizmet bedeli, faturalar)</span><b className="neg">{money2(-fin.deductions.total)}</b>
            <span className="strong">Hesabıma geçecek</span><b>{money2(fin.cashAfter)}</b>
            <span className="strong">Net kâr (Finans sayfası)</span><b className={fin.netProfit >= 0 ? 'pos' : 'neg'}>{money2(fin.netProfit)}</b>
          </div>
          <p className="anp-hint" style={{ marginTop: 8 }}>Finans kayıtları teslimden sonra oluştuğundan bu rakamlar panel cirosundan biraz farklı olabilir; yukarıdaki kanal tablosu gerçek oranları panel siparişlerine uygular.</p>
        </Card>
      )}
    </>
  );
}
