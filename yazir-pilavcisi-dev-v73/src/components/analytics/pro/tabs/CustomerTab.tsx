import { fmtDateTimeIst, type CustomerStat } from '@/lib/analyticsData';
import { BarChart, Card, DataTable, Donut, Empty, Grid, HBarList, KpiCard, fmtInt, fmtMoney, fmtMoneyShort, fmtNum1, type Col } from '../Kit';
import type { TabProps } from './types';

export default function CustomerTab({ a }: TabProps) {
  const c = a.customers;
  if (!c.identified) return <Empty text="Seçili aralıkta tanınan (üyelik/telefon bilgisi olan) müşteri yok. Platform ve Excel kayıtlarında müşteri bilgisi bulunmaz." />;
  const cols: Col<CustomerStat>[] = [
    { key: 'name', label: 'Müşteri', value: (x) => x.name, render: (x) => <b>{x.name}</b> },
    { key: 'phone', label: 'Telefon', value: (x) => x.phone },
    { key: 'orders', label: 'Sipariş', align: 'right', value: (x) => x.orders },
    { key: 'spent', label: 'Toplam harcama', align: 'right', value: (x) => x.spent, render: (x) => fmtMoney(x.spent) },
    { key: 'avg', label: 'Ort. sepet', align: 'right', value: (x) => x.avgBasket, render: (x) => fmtMoney(x.avgBasket) },
    { key: 'interval', label: 'Ort. aralık', align: 'right', value: (x) => x.intervalDays, render: (x) => (x.intervalDays == null ? '—' : `${fmtNum1(x.intervalDays)} gün`) },
    { key: 'last', label: 'Son sipariş', value: (x) => x.last, render: (x) => fmtDateTimeIst(x.last) },
  ];
  const identifiedShare = a.totals.delivered ? (c.identified ? ((a.totals.delivered - c.anonymousOrders) / a.totals.delivered) * 100 : 0) : 0;
  return (
    <>
      <div className="anp-kpis">
        <KpiCard icon="👥" label="Tanınan müşteri" value={fmtInt(c.identified)} sub={`siparişlerin %${fmtNum1(identifiedShare, 0)}'i`} />
        <KpiCard icon="🔁" label="Tekrar eden müşteri" value={fmtInt(c.repeat)} color="#16a34a" sub={`tekrar oranı %${fmtNum1(c.repeatRate, 0)}`} />
        <KpiCard icon="🌱" label="Yeni müşteri" value={fmtInt(c.newCustomers)} color="#0ea5e9" sub="önceki dönemde sipariş vermemiş" />
        <KpiCard icon="↩️" label="Geri dönen" value={fmtInt(c.returningFromPrev)} color="#7c4dff" sub="önceki dönemden gelenler" />
        <KpiCard icon="🧾" label="Müşteri başı sipariş" value={fmtNum1(c.avgOrdersPerCustomer)} color="#f27a1a" />
        <KpiCard icon="💳" label="Müşteri başı harcama" value={fmtMoney(c.avgLifetime)} color="#d4af37" />
        <KpiCard icon="⏳" label="Ort. sipariş aralığı" value={c.avgInterval == null ? '—' : `${fmtNum1(c.avgInterval)} gün`} color="#14b8a6" sub="tekrar edenlerde" />
        <KpiCard icon="🕶️" label="Tanınmayan sipariş" value={fmtInt(c.anonymousOrders)} color="#6b7280" sub="platform / misafir" />
      </div>
      <Grid cols={2}>
        <Card title="Müşteri segmentleri" sub="Seçili dönemdeki sipariş sayısına göre">
          <Donut slices={c.segments.map((s) => ({ label: s.label, value: s.count, color: s.color }))} center={fmtInt(c.identified)} centerSub="müşteri" />
        </Card>
        <Card title="Segment cirosu">
          <HBarList rows={c.segments.map((s) => ({ label: s.label, value: s.revenue, color: s.color, right: '', sub: `${s.count} müşteri` }))} format={fmtMoneyShort} />
        </Card>
      </Grid>
      <Grid cols={2}>
        <Card title="Sipariş sıklığı"><BarChart height={200} mark={false} data={c.freq.map((f) => ({ label: f.label, value: f.count, sub: fmtMoney(f.revenue) }))} format={(v) => `${v} müşteri`} labelEvery={1} /></Card>
        <Card title="Harcama aralıkları"><BarChart height={200} mark={false} data={c.bands.map((f) => ({ label: f.label, value: f.count }))} format={(v) => `${v} müşteri`} labelEvery={1} /></Card>
      </Grid>
      <Card title="🏅 En değerli müşteriler" sub="Toplam harcamaya göre — satıra tıklamak gerekmez, tablo sıralanabilir ve aranabilir">
        <DataTable rows={c.list} cols={cols} pageSize={12} initialSort={{ key: 'spent', dir: 'desc' }} csvName="musteri-analizi" rowKey={(x) => x.key} />
      </Card>
    </>
  );
}
