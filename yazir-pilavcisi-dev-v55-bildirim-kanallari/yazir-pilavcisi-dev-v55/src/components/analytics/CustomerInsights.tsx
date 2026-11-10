import { tl } from '@/lib/helpers';
import { PAYMENT_METHOD_LABELS } from '@/lib/constants';
import { fmtDec, fmtMin, hourRangeLabel, WEEKDAYS_LONG, WEEKDAYS_SHORT } from '@/lib/analytics';
import { useCustomerDetail } from '@/hooks/useAnalytics';
import { ColumnChart, HBars, HourChart, Stat } from '@/components/analytics/Charts';

/** Tek müşterinin davranış profili (müşteri detay penceresinde) */
export default function CustomerInsights({ customerId }: { customerId: string }) {
  const { data, loading, missing, error } = useCustomerDetail(customerId);
  if (missing) return <div className="note">Müşteri analizi için <code>sql/20_courier_customer_analytics.sql</code> dosyasını çalıştırın.</div>;
  if (error) return <div className="note">{error}</div>;
  if (loading && !data) return <p className="muted small">Analiz yükleniyor…</p>;
  if (!data) return null;

  const s = data.summary;
  const peakHour = [...data.hourly].sort((a, b) => b.count - a.count)[0];
  const peakDow = [...data.weekday].sort((a, b) => b.count - a.count)[0];
  const fav = data.favorite_products[0];
  const dayWord = s.days_since_last == null ? '—' : s.days_since_last === 0 ? 'bugün' : `${s.days_since_last} gün önce`;

  return (
    <section className="pe-sec" style={{ marginTop: '1rem' }}>
      <h4>📊 Müşteri davranış analizi</h4>
      <div className="an-stats compact">
        <Stat label="Teslim edilen" value={s.delivered_count} sub={`${s.cancelled_count} iptal`} />
        <Stat label="Max sepet" value={tl(Number(s.max_basket))} sub={`ort. ${tl(Number(s.avg_basket))}`} />
        <Stat label="Son sipariş" value={dayWord} sub={s.first_order_at ? `ilk: ${new Date(s.first_order_at).toLocaleDateString('tr-TR')}` : '—'} />
        <Stat label="Sipariş sıklığı" value={s.avg_interval_days != null ? `${fmtDec(s.avg_interval_days, 1)} gün` : '—'} sub="iki sipariş arası" />
        <Stat label="Tercih ettiği saat" value={peakHour && peakHour.count > 0 ? hourRangeLabel(peakHour.hour) : '—'} sub={peakDow && peakDow.count > 0 ? WEEKDAYS_LONG[peakDow.dow - 1] : ''} />
        <Stat label="Ort. bekleme" value={fmtMin(s.avg_wait_min)} sub={`paket ${s.delivery_orders} · gel-al ${s.pickup_orders} · masa ${s.dine_in_orders}`} />
      </div>

      {fav && <p className="small" style={{ margin: '0.2rem 0 0.8rem' }}>⭐ En sevdiği ürün: <b>{fav.name}</b> ({fav.qty} adet, {fav.orders} siparişte)</p>}

      <div className="an-grid2">
        <div>
          <h5 className="an-sub">Sipariş saatleri</h5>
          <HourChart data={data.hourly} unit="sipariş" />
        </div>
        <div>
          <h5 className="an-sub">Haftanın günleri</h5>
          <ColumnChart items={data.weekday.map((w) => ({ label: WEEKDAYS_SHORT[w.dow - 1], value: Number(w.count) }))} />
        </div>
      </div>

      <div className="an-grid2" style={{ marginTop: '0.8rem' }}>
        <div>
          <h5 className="an-sub">Aylık harcama (son 12 ay)</h5>
          <ColumnChart
            height={130}
            items={data.monthly.map((m) => ({ label: m.month.slice(5), value: Number(m.spent), sub: `${m.count} sipariş` }))}
            format={(v) => `${Math.round(v)} ₺`}
          />
        </div>
        <div>
          <h5 className="an-sub">Favori ürünler</h5>
          <HBars rows={data.favorite_products.slice(0, 6).map((p) => ({ label: p.name, value: Number(p.qty), note: tl(Number(p.spent)) }))} format={(v) => `${v} adet`} />
        </div>
      </div>

      <div className="an-grid3" style={{ marginTop: '0.8rem' }}>
        <div>
          <h5 className="an-sub">Ödeme tercihi</h5>
          <HBars rows={data.payments.map((p) => ({ label: PAYMENT_METHOD_LABELS[p.method] || p.method, value: Number(p.count) }))} />
        </div>
        <div>
          <h5 className="an-sub">Bölgeler</h5>
          <HBars rows={data.districts.map((d) => ({ label: d.district, value: Number(d.count) }))} />
        </div>
        <div>
          <h5 className="an-sub">Götüren kuryeler</h5>
          <HBars rows={data.couriers.map((c) => ({ label: c.name, value: Number(c.count) }))} format={(v) => `${v} paket`} empty="Paket siparişi yok." />
        </div>
      </div>
    </section>
  );
}
