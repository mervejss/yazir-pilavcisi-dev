import { useMemo, useState } from 'react';
import { HOURS_ORDER, WD_SHORT, GRAN_LABELS, seriesBy, type CourierStat } from '@/lib/analyticsData';
import { BarChart, Card, DataTable, DeltaBadge, Empty, Grid, HBarList, KpiCard, PALETTE, Seg, TrendChart, fmtInt, fmtMin, fmtMoney, fmtNum1, type Col } from '../Kit';
import type { TabProps } from './types';

type M = 'deliveries' | 'revenue' | 'avgTotalMin' | 'onTimePct';
const M_LABEL: Record<M, string> = { deliveries: 'Teslimat', revenue: 'Ciro', avgTotalMin: 'Ort. süre', onTimePct: 'Zamanında %' };

export default function CourierTab({ a, cur, range, compare, settings, onSettings, courierNames, gran }: TabProps) {
  const [sel, setSel] = useState<string | null>(null);
  const [metric, setMetric] = useState<M>('deliveries');
  const name = (id: string) => courierNames[id] || `Kurye ·${id.slice(0, 4)}`;
  const cs = a.couriers;
  const tm = a.courierTimings;
  const totalDel = cs.reduce((s, c) => s + c.deliveries, 0);
  const totalRev = cs.reduce((s, c) => s + c.revenue, 0);
  const wAvg = (f: (c: CourierStat) => number | null) => {
    const v = cs.filter((c) => f(c) != null); const w = v.reduce((s, c) => s + c.deliveries, 0);
    return w ? v.reduce((s, c) => s + (f(c) as number) * c.deliveries, 0) / w : null;
  };
  const avgTotal = wAvg((c) => c.avgTotalMin), avgDel = wAvg((c) => c.avgDeliveryMin), onTime = wAvg((c) => c.onTimePct);

  const stacked = useMemo(() => {
    const top = cs.slice(0, 6).map((c) => c.id);
    return { top, ...seriesBy(cur.filter((o) => o.status === 'delivered' && o.courierId && top.includes(o.courierId)), range, gran === 'hour' ? 'day' : gran, (o) => o.courierId) };
  }, [cs, cur, range, gran]);

  const metricVal = (c: CourierStat) => (metric === 'deliveries' ? c.deliveries : metric === 'revenue' ? c.revenue : metric === 'avgTotalMin' ? c.avgTotalMin ?? 0 : c.onTimePct ?? 0);
  const ranked = [...cs].sort((x, y) => (metric === 'avgTotalMin' ? metricVal(x) - metricVal(y) : metricVal(y) - metricVal(x)));
  const fmtM = (v: number) => (metric === 'revenue' ? fmtMoney(v) : metric === 'avgTotalMin' ? fmtMin(v) : metric === 'onTimePct' ? `%${fmtNum1(v, 0)}` : fmtInt(v));
  const det = sel ? cs.find((c) => c.id === sel) : null;

  const cols: Col<CourierStat>[] = [
    { key: 'name', label: 'Kurye', value: (c) => name(c.id), render: (c) => <b>{name(c.id)}</b> },
    { key: 'deliveries', label: 'Teslimat', align: 'right', value: (c) => c.deliveries, render: (c) => <>{fmtInt(c.deliveries)} <DeltaBadge cur={c.deliveries} prev={c.prevDeliveries} compare={compare} /></> },
    { key: 'revenue', label: 'Taşınan ciro', align: 'right', value: (c) => c.revenue, render: (c) => fmtMoney(c.revenue) },
    { key: 'cash', label: 'Nakit tahsilat', align: 'right', value: (c) => c.cash, render: (c) => fmtMoney(c.cash) },
    { key: 'avgTotalMin', label: 'Ort. toplam', align: 'right', value: (c) => c.avgTotalMin, render: (c) => fmtMin(c.avgTotalMin) },
    { key: 'avgDeliveryMin', label: 'Ort. yolda', align: 'right', value: (c) => c.avgDeliveryMin, render: (c) => fmtMin(c.avgDeliveryMin) },
    { key: 'onTime', label: `≤${settings.slaMin} dk`, align: 'right', value: (c) => c.onTimePct, render: (c) => (c.onTimePct == null ? '—' : <span className={c.onTimePct >= 80 ? 'anp-ok' : c.onTimePct >= 60 ? 'anp-warn' : 'anp-bad'}>%{fmtNum1(c.onTimePct, 0)}</span>) },
    { key: 'perDay', label: 'Günlük ort.', align: 'right', value: (c) => c.perDay, render: (c) => fmtNum1(c.perDay) },
    { key: 'days', label: 'Aktif gün', align: 'right', value: (c) => c.activeDays },
  ];

  const pipeline = [
    { label: 'Onay', value: tm.accept, color: '#94a3b8' }, { label: 'Hazırlama', value: tm.prepare, color: '#f59e0b' },
    { label: 'Kurye bekleme', value: tm.waitCourier, color: '#7c4dff' }, { label: 'Yolda', value: tm.delivery, color: '#14b8a6' },
  ];
  const pTotal = pipeline.reduce((s, p) => s + (p.value || 0), 0);

  if (!cs.length && tm.total == null) return <Empty text="Kurye verisi yalnızca canlı sistemden (kurye atanmış, teslim edilmiş) siparişlerden gelir. Seçili aralıkta kayıt bulunamadı." />;

  return (
    <>
      <div className="anp-kpis">
        <KpiCard icon="🛵" label="Çalışan kurye" value={cs.length} sub={`${fmtInt(totalDel)} teslimat`} />
        <KpiCard icon="💰" label="Taşınan ciro" value={fmtMoney(totalRev)} color="#d4af37" sub={`teslimat başı ${fmtMoney(totalDel ? totalRev / totalDel : 0)}`} />
        <KpiCard icon="⏱️" label="Ort. toplam süre" value={fmtMin(avgTotal ?? tm.total)} color="#0ea5e9" sub="sipariş → teslim" />
        <KpiCard icon="🚀" label="Ort. yolda süre" value={fmtMin(avgDel ?? tm.delivery)} color="#14b8a6" sub="yola çıkış → teslim" />
        <KpiCard icon="✅" label={`≤${settings.slaMin} dk teslim`} value={onTime == null ? '—' : `%${fmtNum1(onTime, 0)}`} color="#16a34a" sub="zamanında teslim oranı" />
      </div>

      <Card title="Sipariş yaşam döngüsü (ortalama)" sub="Siparişin hangi aşamada ne kadar beklediği — canlı sistem siparişleri"
        actions={<label className="anp-inline no-print">Hedef süre (dk) <input type="number" min={10} max={120} value={settings.slaMin} onChange={(e) => onSettings({ ...settings, slaMin: Math.max(10, Number(e.target.value) || 45) })} /></label>}>
        {pTotal > 0 ? (
          <>
            <div className="anp-pipe">{pipeline.map((p) => (p.value ? <i key={p.label} style={{ flex: p.value, background: p.color }} title={`${p.label}: ${fmtMin(p.value)}`}>{fmtMin(p.value)}</i> : null))}</div>
            <div className="anp-legend-inline">{pipeline.map((p) => <span key={p.label}><i style={{ background: p.color }} />{p.label} <b>{fmtMin(p.value)}</b></span>)}<span><b>Toplam: {fmtMin(tm.total ?? pTotal)}</b></span></div>
          </>
        ) : <Empty text="Zaman damgalı canlı sipariş yok." />}
      </Card>

      <Grid cols={2}>
        <Card title="Kurye karşılaştırma" actions={<Seg value={metric} onChange={setMetric} options={(Object.keys(M_LABEL) as M[]).map((k) => ({ key: k, label: M_LABEL[k] }))} />}
          sub="Bir kuryeye tıklayın → ayrıntı açılır">
          <HBarList rank activeKey={sel} onPick={(k) => setSel(sel === k ? null : k)} format={fmtM}
            rows={ranked.map((c, i) => ({ key: c.id, label: name(c.id), value: metricVal(c), color: PALETTE[i % PALETTE.length], sub: `${c.deliveries} teslimat · ${fmtMin(c.avgTotalMin)} ort.` }))} />
        </Card>
        <Card title="Teslimat payı (günlük, ilk 6 kurye)">
          <TrendChart type="bar" stacked labels={stacked.labels} longLabels={stacked.longLabels}
            series={stacked.top.map((id, i) => ({ name: name(id), color: PALETTE[i % PALETTE.length], values: stacked.groups[id] || stacked.labels.map(() => 0) }))} />
          <p className="anp-hint">Gruplama: {GRAN_LABELS[gran === 'hour' ? 'day' : gran]}</p>
        </Card>
      </Grid>

      {det && (
        <Card title={`🛵 ${name(det.id)} — ayrıntı`} sub={`${det.deliveries} teslimat · ${fmtMoney(det.revenue)} · en hızlı ${fmtMin(det.fastestMin)} · en yavaş ${fmtMin(det.slowestMin)}`}
          actions={<button type="button" className="anp-mini" onClick={() => setSel(null)}>✕ Kapat</button>}>
          <Grid cols={3}>
            <div><h4 className="anp-h4">Saat dağılımı</h4><BarChart height={150} data={det.hours.map((v, i) => ({ label: String(HOURS_ORDER[i]).padStart(2, '0'), value: v }))} format={(v) => `${v} teslimat`} /></div>
            <div><h4 className="anp-h4">Gün dağılımı</h4><BarChart height={150} data={det.weekdays.map((v, i) => ({ label: WD_SHORT[i], value: v }))} format={(v) => `${v} teslimat`} /></div>
            <div><h4 className="anp-h4">Mahalle</h4><HBarList rows={Object.entries(det.districts).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, v]) => ({ label: k, value: v }))} /></div>
          </Grid>
        </Card>
      )}

      <Card title="Kurye performans tablosu" sub="Başlıklara tıklayarak sıralayın">
        <DataTable rows={cs} cols={cols} pageSize={15} initialSort={{ key: 'deliveries', dir: 'desc' }} csvName="kurye-analizi" onRow={(c) => setSel(c.id)} rowKey={(c) => c.id} empty="Kurye teslimatı yok." />
      </Card>
    </>
  );
}
