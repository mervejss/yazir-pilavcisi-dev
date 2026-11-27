import { useMemo, useState } from 'react';
import { HOURS_ORDER, isExternal } from '@/lib/analyticsData';
import { BarChart, Card, DataTable, Donut, Empty, Grid, HBarList, KpiCard, PALETTE, Seg, fmtInt, fmtMin, fmtMoney, fmtMoneyShort, fmtNum1, type Col } from '../Kit';
import type { TabProps } from './types';

export default function BusinessTab({ a, settings, onSettings, tableUsage }: TabProps) {
  const [dm, setDm] = useState<'orders' | 'revenue'>('orders');
  const rate = (k: string) => settings.commission[k] ?? (isExternal(k) ? 20 : 0);
  const fin = useMemo(() => {
    const rows = a.platforms.map((p) => {
      const commission = p.external ? (p.revenue * rate(p.key)) / 100 : 0;
      const food = (p.revenue * settings.foodCostPct) / 100;
      return { p, commission, food, net: p.revenue - commission, profit: p.revenue - commission - food };
    });
    const ext = rows.filter((r) => r.p.external);
    const own = rows.filter((r) => !r.p.external);
    const extRev = ext.reduce((s, r) => s + r.p.revenue, 0), ownRev = own.reduce((s, r) => s + r.p.revenue, 0);
    const commission = rows.reduce((s, r) => s + r.commission, 0);
    const avgRate = extRev ? (commission / extRev) * 100 : 0;
    return {
      rows, commission, extRev, ownRev, avgRate,
      profit: rows.reduce((s, r) => s + r.profit, 0), net: rows.reduce((s, r) => s + r.net, 0),
      saved: (ownRev * (avgRate || 20)) / 100,
    };
  }, [a.platforms, settings]);

  const finCols: Col<(typeof fin.rows)[number]>[] = [
    { key: 'k', label: 'Kanal', value: (r) => r.p.label, render: (r) => <b><i className="anp-dot" style={{ background: r.p.color }} />{r.p.label}</b> },
    { key: 'rev', label: 'Ciro', align: 'right', value: (r) => r.p.revenue, render: (r) => fmtMoney(r.p.revenue) },
    { key: 'rate', label: 'Komisyon %', align: 'right', value: (r) => (r.p.external ? rate(r.p.key) : 0), render: (r) => (r.p.external
      ? <input className="anp-rate no-print-input" type="number" min={0} max={60} value={rate(r.p.key)} onClick={(e) => e.stopPropagation()}
          onChange={(e) => onSettings({ ...settings, commission: { ...settings.commission, [r.p.key]: Math.max(0, Math.min(60, Number(e.target.value) || 0)) } })} /> : <span className="muted">—</span>) },
    { key: 'com', label: 'Komisyon', align: 'right', value: (r) => r.commission, render: (r) => fmtMoney(r.commission) },
    { key: 'net', label: 'Net ciro', align: 'right', value: (r) => r.net, render: (r) => fmtMoney(r.net) },
    { key: 'food', label: 'Tahmini maliyet', align: 'right', value: (r) => r.food, render: (r) => fmtMoney(r.food) },
    { key: 'profit', label: 'Tahmini kâr', align: 'right', value: (r) => r.profit, render: (r) => <b className={r.profit >= 0 ? 'anp-ok' : 'anp-bad'}>{fmtMoney(r.profit)}</b> },
    { key: 'm', label: 'Marj', align: 'right', value: (r) => (r.p.revenue ? (r.profit / r.p.revenue) * 100 : 0), render: (r) => `%${fmtNum1(r.p.revenue ? (r.profit / r.p.revenue) * 100 : 0, 0)}` },
  ];

  const dist = [...a.districts].sort((x, y) => (dm === 'orders' ? y.orders - x.orders : y.revenue - x.revenue));
  const tableRows = a.tables.map((t) => ({ ...t, usage: tableUsage.find((u) => u.table_number === t.no) }));

  if (!a.totals.delivered) return <Empty text="İşletme analizi için seçili aralıkta sipariş yok." />;

  return (
    <>
      <div className="anp-kpis">
        <KpiCard icon="💰" label="Brüt ciro" value={fmtMoney(a.totals.revenue)} color="#d4af37" />
        <KpiCard icon="💸" label="Ödenen komisyon (tahmini)" value={fmtMoney(fin.commission)} color="#dc2626" sub={`dış platform cirosu ${fmtMoneyShort(fin.extRev)} · ort. %${fmtNum1(fin.avgRate, 0)}`} />
        <KpiCard icon="🏦" label="Net ciro" value={fmtMoney(fin.net)} color="#0ea5e9" sub="komisyon sonrası" />
        <KpiCard icon="📈" label="Tahmini kâr" value={fmtMoney(fin.profit)} color="#16a34a" sub={`ürün maliyeti %${settings.foodCostPct} varsayımıyla`} />
        <KpiCard icon="🎉" label="Kendi kanalından tasarruf" value={fmtMoney(fin.saved)} color="#7c4dff" sub={`${fmtMoneyShort(fin.ownRev)} doğrudan ciro × platform komisyonu`} />
        <KpiCard icon="🚚" label="Toplanan teslimat ücreti" value={fmtMoney(a.totals.deliveryFees)} color="#14b8a6" />
        <KpiCard icon="🏷️" label="Verilen indirim" value={fmtMoney(a.totals.discounts)} color="#f27a1a" />
      </div>

      <Card title="Komisyon ve kârlılık" sub="Komisyon oranlarını ve ürün maliyetini düzenleyebilirsiniz (tarayıcınızda saklanır). Kâr değerleri tahminidir."
        actions={<label className="anp-inline no-print">Ürün maliyeti % <input type="number" min={0} max={90} value={settings.foodCostPct} onChange={(e) => onSettings({ ...settings, foodCostPct: Math.max(0, Math.min(90, Number(e.target.value) || 0)) })} /></label>}>
        <DataTable rows={fin.rows} cols={finCols} pageSize={12} csvName="komisyon-karlilik" rowKey={(r) => r.p.key} />
      </Card>

      <Grid cols={2}>
        <Card title="Ödeme yöntemleri"><Donut slices={a.payments.map((p, i) => ({ label: p.label, value: p.orders, color: PALETTE[i % PALETTE.length] }))} center={fmtInt(a.totals.delivered)} centerSub="sipariş" /></Card>
        <Card title="Ödeme yöntemi cirosu"><HBarList rows={[...a.payments].sort((x, y) => y.revenue - x.revenue).map((p, i) => ({ label: p.label, value: p.revenue, color: PALETTE[i % PALETTE.length], right: '', sub: `${p.orders} sipariş` }))} format={fmtMoney} /></Card>
      </Grid>

      <Grid cols={2}>
        <Card title="📍 Mahalle dağılımı" actions={<Seg value={dm} onChange={setDm} options={[{ key: 'orders', label: 'Sipariş' }, { key: 'revenue', label: 'Ciro' }]} />}>
          <HBarList rank rows={dist.slice(0, 12).map((d) => ({ label: d.label, value: dm === 'orders' ? d.orders : d.revenue, sub: `${d.orders} sipariş · ort. ${fmtMoney(d.avgBasket)}` }))} format={dm === 'orders' ? fmtInt : fmtMoney} />
        </Card>
        <Card title="Sipariş türü"><Donut slices={a.orderTypes.map((o, i) => ({ label: o.label, value: o.orders, color: PALETTE[(i + 3) % PALETTE.length] }))} center={fmtInt(a.totals.delivered)} centerSub="sipariş" /></Card>
      </Grid>

      <Card title="Mahalle tablosu"><DataTable rows={a.districts} pageSize={10} csvName="mahalle-analizi" rowKey={(d) => d.label}
        cols={[
          { key: 'l', label: 'Mahalle', value: (d) => d.label, render: (d) => <b>{d.label}</b> },
          { key: 'o', label: 'Sipariş', align: 'right', value: (d) => d.orders },
          { key: 'r', label: 'Ciro', align: 'right', value: (d) => d.revenue, render: (d) => fmtMoney(d.revenue) },
          { key: 'a', label: 'Ort. sepet', align: 'right', value: (d) => d.avgBasket, render: (d) => fmtMoney(d.avgBasket) },
        ]} /></Card>

      <Card title="🍽️ Masa kullanımı" sub="Sipariş ve ciro canlı sistem siparişlerinden; oturum süresi masa oturumlarından gelir">
        {tableRows.length ? (
          <>
            <BarChart height={180} data={tableRows.map((t) => ({ label: `M${t.no}`, value: t.orders, sub: fmtMoney(t.revenue) }))} format={(v) => `${v} sipariş`} labelEvery={1} />
            <DataTable rows={tableRows} pageSize={10} csvName="masa-kullanimi" rowKey={(t) => String(t.no)}
              cols={[
                { key: 'n', label: 'Masa', value: (t) => t.no, render: (t) => <b>Masa {t.no}</b> },
                { key: 's', label: 'Oturum', align: 'right', value: (t) => t.usage?.session_count ?? null, render: (t) => t.usage?.session_count ?? '—' },
                { key: 'o', label: 'Sipariş', align: 'right', value: (t) => t.orders },
                { key: 'r', label: 'Ciro', align: 'right', value: (t) => t.revenue, render: (t) => fmtMoney(t.revenue) },
                { key: 'a', label: 'Ort. sepet', align: 'right', value: (t) => t.avgBasket, render: (t) => fmtMoney(t.avgBasket) },
                { key: 'd', label: 'Ort. oturum', align: 'right', value: (t) => t.usage?.avg_session_minutes ?? null, render: (t) => fmtMin(t.usage?.avg_session_minutes) },
                { key: 'p', label: 'Yoğun saat', align: 'right', value: (t) => (t.peakSlot != null ? HOURS_ORDER[t.peakSlot] : null), render: (t) => (t.peakSlot != null ? `${String(HOURS_ORDER[t.peakSlot]).padStart(2, '0')}:00` : '—') },
              ]} />
          </>
        ) : <Empty text="Seçili aralık / platformda masa siparişi yok." />}
      </Card>
    </>
  );
}
