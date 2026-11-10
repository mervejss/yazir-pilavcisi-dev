import { useMemo, useState } from 'react';
import { tl } from '@/lib/helpers';
import { ORDER_TYPE_LABELS, PAYMENT_METHOD_LABELS, SOURCE_LABELS } from '@/lib/constants';
import { downloadCsv, fillDaily, fmtDec, fmtMin, fmtPct, hourRangeLabel, resolveRange, shortDay, WEEKDAYS_LONG, WEEKDAYS_SHORT, type RangeKey } from '@/lib/analytics';
import { useCustomerOverview } from '@/hooks/useAnalytics';
import RangePicker from '@/components/analytics/RangePicker';
import { ColumnChart, HBars, HeatStrip, HourChart, LineArea, SplitBar, Stat } from '@/components/analytics/Charts';

interface Props {
  onOpenCustomer: (customerId: string) => void;
}

/** Müşteri tabanı analizi: kim, ne zaman, ne kadar, ne sipariş ediyor */
export default function CustomerAnalyticsPanel({ onOpenCustomer }: Props) {
  const [key, setKey] = useState<RangeKey>('30');
  const [cFrom, setCFrom] = useState('');
  const [cTo, setCTo] = useState('');
  const [metric, setMetric] = useState<'count' | 'revenue'>('count');
  const range = useMemo(() => resolveRange(key, cFrom, cTo), [key, cFrom, cTo]);
  const { data, loading, missing, error } = useCustomerOverview(range.from, range.to);

  const daily = useMemo(() => {
    if (!data) return { values: [] as number[], labels: [] as string[] };
    const rows = fillDaily(data.daily, range.from, range.to, (day) => ({ day, count: 0, revenue: 0, customers: 0 }));
    return { values: rows.map((r) => Number(metric === 'count' ? r.count : r.revenue)), labels: rows.map((r) => shortDay(r.day)) };
  }, [data, range.from, range.to, metric]);

  if (missing) {
    return <div className="note">Müşteri analizi için <code>sql/20_courier_customer_analytics.sql</code> dosyasını Supabase SQL Editor'de bir kez çalıştırın.</div>;
  }

  const s = data?.summary;
  const seg = data?.segments;
  const peakHour = data ? [...data.hourly].sort((a, b) => b.count - a.count)[0] : null;
  const peakDow = data ? [...data.weekday].sort((a, b) => b.count - a.count)[0] : null;
  const memberShare = s && Number(s.revenue) > 0 ? (Number(s.member_revenue) / Number(s.revenue)) * 100 : null;

  const exportTop = () => {
    if (!data) return;
    downloadCsv('en-iyi-musteriler.csv', [
      ['Müşteri', 'Telefon', 'Sipariş', 'Harcama'],
      ...data.top_customers.map((c) => [c.name, c.phone || '', c.orders, c.spent]),
    ]);
  };

  return (
    <div className="ca">
      <div className="an-toolbar">
        <RangePicker value={key} onChange={setKey} from={cFrom} to={cTo} onCustom={(f, t) => { setCFrom(f); setCTo(t); }} />
      </div>
      {error && <div className="note">{error}</div>}
      {loading && !data && <p className="muted center" style={{ padding: '2rem' }}>Analiz yükleniyor…</p>}

      {s && seg && data && (
        <>
          <div className="an-stats">
            <Stat label="Sipariş veren müşteri" value={s.active_customers} sub={`${s.order_count} sipariş · ${s.guest_orders} misafir`} />
            <Stat label="Yeni müşteri" value={s.new_customers} sub={`${s.first_time_buyers} kişi ilk siparişini verdi`} tone="ok" />
            <Stat label="Tekrar gelen" value={s.returning_customers} sub="daha önce de sipariş vermişti" />
            <Stat label="Tekrar sipariş oranı" value={fmtPct(s.repeat_rate)} sub="tüm zamanlar · 2+ sipariş" />
            <Stat label="Ciro" value={tl(Number(s.revenue))} sub={memberShare != null ? `üyelerden %${Math.round(memberShare)}` : '—'} />
            <Stat label="Ort. sepet" value={tl(Number(s.avg_basket))} sub={`müşteri başı ${fmtDec(s.avg_orders_per_active, 1)} sipariş`} />
            <Stat label="Ort. müşteri değeri" value={tl(Number(s.avg_lifetime_value))} sub="tüm zamanlar · müşteri başına" />
            <Stat label="İki sipariş arası" value={s.avg_days_between_orders != null ? `${fmtDec(s.avg_days_between_orders, 1)} gün` : '—'} sub="ortalama" />
            <Stat label="Ort. bekleme" value={fmtMin(s.avg_wait_min)} sub="sipariş → teslim" />
            <Stat label="İptal" value={s.cancelled_orders} sub="seçili aralıkta" tone={s.cancelled_orders > 0 ? 'warn' : undefined} />
            <Stat label="Üye sayısı" value={s.members} sub={`toplam ${s.total_customers} kayıt`} />
            <Stat label="Dağıtılmış puan" value={s.points_outstanding} sub="müşteri bakiyeleri" />
          </div>

          <div className="an-grid2">
            <section className="an-card">
              <h4>👥 Müşteri segmentleri</h4>
              <p className="muted small">Tüm zamanlara göre (aralıktan bağımsız)</p>
              <SplitBar
                parts={[
                  { label: '👑 VIP', value: seg.vip, color: '#d4af37' },
                  { label: 'Sadık (5+)', value: seg.loyal, color: '#16a34a' },
                  { label: 'Düzenli (2-4)', value: seg.regular, color: '#2563eb' },
                  { label: 'Tek sipariş', value: seg.one_time, color: '#8b5cf6' },
                  { label: 'Hiç sipariş yok', value: seg.never_ordered, color: '#9a968a' },
                ]}
              />
              <div className="an-chips">
                <span className="chip">😴 Uyuyan (45+ gün): <b>{seg.sleeping}</b></span>
                <span className="chip">🆕 Yeni (14 gün): <b>{seg.new_14d}</b></span>
              </div>
            </section>

            <section className="an-card">
              <h4>🕒 Hangi saatlerde sipariş veriyorlar?</h4>
              <p className="muted small">{peakHour && peakHour.count > 0 ? `En yoğun: ${hourRangeLabel(peakHour.hour)}` : 'Saatlik dağılım'} · İstanbul saati</p>
              <HourChart data={data.hourly} unit="sipariş" />
              <HeatStrip data={data.hourly} />
            </section>
          </div>

          <section className="an-card">
            <div className="an-card-head">
              <h4>📈 Günlük sipariş trendi</h4>
              <div className="an-seg">
                <button type="button" className={metric === 'count' ? 'on' : ''} onClick={() => setMetric('count')}>Sipariş</button>
                <button type="button" className={metric === 'revenue' ? 'on' : ''} onClick={() => setMetric('revenue')}>Ciro</button>
              </div>
            </div>
            <LineArea points={daily.values} labels={daily.labels} format={(v) => (metric === 'revenue' ? `${v} ₺` : String(v))} />
          </section>

          <div className="an-grid2">
            <section className="an-card">
              <h4>📅 Haftanın günleri</h4>
              <p className="muted small">{peakDow && peakDow.count > 0 ? `En yoğun gün: ${WEEKDAYS_LONG[peakDow.dow - 1]}` : 'Gün bazlı dağılım'}</p>
              <ColumnChart items={data.weekday.map((w) => ({ label: WEEKDAYS_SHORT[w.dow - 1], value: Number(w.count), sub: tl(Number(w.revenue || 0)) }))} />
            </section>
            <section className="an-card">
              <h4>📍 Sipariş gelen bölgeler</h4>
              <HBars rows={data.districts.map((d) => ({ label: d.district, value: Number(d.count), note: tl(Number(d.revenue)) }))} format={(v) => `${v} sipariş`} />
            </section>
          </div>

          <div className="an-grid3">
            <section className="an-card">
              <h4>💳 Ödeme türleri</h4>
              <HBars rows={data.payments.map((p) => ({ label: PAYMENT_METHOD_LABELS[p.method] || p.method, value: Number(p.count), note: tl(Number(p.revenue)) }))} />
            </section>
            <section className="an-card">
              <h4>🛍️ Sipariş tipi</h4>
              <HBars rows={data.order_types.map((p) => ({ label: ORDER_TYPE_LABELS[p.type] || p.type, value: Number(p.count), note: tl(Number(p.revenue)) }))} />
            </section>
            <section className="an-card">
              <h4>📲 Kaynak</h4>
              <HBars rows={data.sources.map((p) => ({ label: SOURCE_LABELS[p.source] || p.source, value: Number(p.count), note: tl(Number(p.revenue)) }))} />
            </section>
          </div>

          <div className="an-grid2">
            <section className="an-card">
              <h4>🍽️ En çok sipariş edilen ürünler</h4>
              <HBars rows={data.top_products.map((p) => ({ label: p.name, value: Number(p.qty), note: tl(Number(p.revenue)) }))} format={(v) => `${v} adet`} />
            </section>
            <section className="an-card">
              <div className="an-card-head">
                <h4>👑 En çok harcayan müşteriler</h4>
                <button type="button" className="btn ghost sm" onClick={exportTop}>⬇ CSV</button>
              </div>
              <div className="an-rank">
                {data.top_customers.map((c, i) => (
                  <button type="button" key={c.customer_id} className="an-rank-row" onClick={() => onOpenCustomer(c.customer_id)}>
                    <span className="an-rank-no">{i + 1}</span>
                    <span className="an-rank-name"><b>{c.name || 'İsimsiz'}</b><small>{c.phone || '—'}</small></span>
                    <span className="an-rank-val"><b>{tl(Number(c.spent))}</b><small>{c.orders} sipariş</small></span>
                  </button>
                ))}
                {data.top_customers.length === 0 && <p className="muted small an-empty">Bu aralıkta kayıtlı müşteri siparişi yok.</p>}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
