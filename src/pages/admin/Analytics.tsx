import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { tl } from '@/lib/helpers';
import { SOURCE_COLORS } from '@/lib/constants';
import Kpi from '@/components/ui/Kpi';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function Analytics() {
  const [daysBack, setDaysBack] = useState<number>(30);
  const [loading, setLoading] = useState(true);

  // Report States
  const [summary, setSummary] = useState<any>({
    order_count: 0,
    delivered_count: 0,
    cancelled_count: 0,
    revenue: 0,
    avg_basket: 0,
    peak_hour: 13,
  });
  const [daily, setDaily] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [bySource, setBySource] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [districts, setDistricts] = useState<any[]>([]);
  const [courierPerf, setCourierPerf] = useState<any[]>([]);
  const [tableUsage, setTableUsage] = useState<any[]>([]);
  const [timings, setTimings] = useState<any>(null);

  const [estCommissionRate, setEstCommissionRate] = useState<number>(20);

  useEffect(() => {
    const fetchReports = async () => {
      setLoading(true);
      const to = new Date();
      const from = new Date(Date.now() - daysBack * 864e5);
      const p_from = from.toISOString();
      const p_to = to.toISOString();

      try {
        const sumRes = await supabase.rpc('report_summary', { p_from, p_to });
        const dailyRes = await supabase.rpc('report_daily', { p_from, p_to });
        const prodRes = await supabase.rpc('report_top_products', { p_from, p_to, p_limit: 10 });
        const srcRes = await supabase.rpc('report_by_source', { p_from, p_to });
        const payRes = await supabase.rpc('report_payment_breakdown', { p_from, p_to });
        const distRes = await supabase.rpc('report_by_district', { p_from, p_to });
        const courRes = await supabase.rpc('report_courier_performance', { p_from, p_to });
        const tableRes = await supabase.rpc('report_table_usage', { p_from, p_to });
        const timeRes = await supabase.rpc('report_order_timings', { p_from, p_to });

        if (sumRes.data && (sumRes.data as any)[0]) setSummary((sumRes.data as any)[0]);
        if (dailyRes.data) setDaily(dailyRes.data as any[]);
        if (prodRes.data) setTopProducts(prodRes.data as any[]);
        if (srcRes.data) setBySource(srcRes.data as any[]);
        if (payRes.data) setPayments(payRes.data as any[]);
        if (distRes.data) setDistricts(distRes.data as any[]);
        if (courRes.data) setCourierPerf(courRes.data as any[]);
        if (tableRes.data) setTableUsage(tableRes.data as any[]);
        if (timeRes.data && (timeRes.data as any)[0]) setTimings((timeRes.data as any)[0]);
      } catch (err) {
        console.error('Reports fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [daysBack]);

  if (loading) return <LoadingSpinner text="Raporlar ve analizler yükleniyor..." />;

  const maxDaily = Math.max(1, ...daily.map((d) => Number(d.order_count)));
  const maxProd = Math.max(1, ...topProducts.map((p) => Number(p.quantity)));
  const maxDist = Math.max(1, ...districts.map((d) => Number(d.order_count)));

  const platformRevenue = bySource
    .filter((s) => s.is_platform)
    .reduce((sum, s) => sum + Number(s.revenue), 0);
  const ownRevenue = bySource
    .filter((s) => !s.is_platform)
    .reduce((sum, s) => sum + Number(s.revenue), 0);
  const savedCommission = (ownRevenue * estCommissionRate) / 100;

  return (
    <>
      <div className="bar">
        <div>
          <h1>Raporlar ve İşletme Analizi</h1>
          <p className="muted" style={{ margin: 0 }}>
            Detaylı ciro, ürün, teslimat süresi ve kurye performans raporları
          </p>
        </div>
        <div className="seg">
          <button
            type="button"
            className={daysBack === 7 ? 'on' : ''}
            onClick={() => setDaysBack(7)}
          >
            Son 7 Gün
          </button>
          <button
            type="button"
            className={daysBack === 30 ? 'on' : ''}
            onClick={() => setDaysBack(30)}
          >
            Son 30 Gün
          </button>
          <button
            type="button"
            className={daysBack === 90 ? 'on' : ''}
            onClick={() => setDaysBack(90)}
          >
            Son 3 Ay
          </button>
        </div>
      </div>

      <div className="kpis">
        <Kpi label="Toplam Sipariş" value={summary.order_count || 0} />
        <Kpi label="Toplam Ciro" value={tl(summary.revenue || 0)} />
        <Kpi label="Ortalama Sepet" value={tl(summary.avg_basket || 0)} />
        <Kpi
          label="En Yoğun Saat"
          value={summary.peak_hour != null ? `${String(summary.peak_hour).padStart(2, '0')}:00` : '—'}
        />
      </div>

      {/* Ortalama Süreler */}
      {timings && (
        <div className="card">
          <h3>Ortalama Sipariş ve Teslimat Süreleri</h3>
          <div className="kpis" style={{ margin: 0 }}>
            <Kpi label="Hazırlama Süresi" value={`${timings.avg_prepare_min || 0} dk`} />
            <Kpi label="Kurye Bekleme" value={`${timings.avg_wait_courier_min || 0} dk`} />
            <Kpi label="Yolda Geçen Süre" value={`${timings.avg_delivery_min || 0} dk`} />
            <Kpi label="Toplam Teslimat" value={`${timings.avg_total_min || 0} dk`} />
          </div>
        </div>
      )}

      {/* Günlük Sipariş Grafiği */}
      <div className="card">
        <h3>Günlük Sipariş Dağılımı</h3>
        <div className="bars">
          {daily.map((x, i) => (
            <div
              key={i}
              className="b"
              title={`${x.day}: ${x.order_count} sipariş, ${tl(x.revenue)}`}
            >
              <i style={{ height: `${(Number(x.order_count) / maxDaily) * 100}%` }} />
            </div>
          ))}
        </div>
        <p className="muted small" style={{ marginTop: '0.5rem' }}>
          Çubukların üzerine gelerek günün sipariş adedi ve cirosunu görebilirsiniz.
        </p>
      </div>

      <div className="three">
        {/* En Çok Satan Ürünler */}
        <div className="card">
          <h3>En Çok Satan Ürünler</h3>
          {topProducts.slice(0, 7).map((p) => (
            <div key={p.product_id} className="hbar">
              <span>{p.product_name}</span>
              <i style={{ width: `${(Number(p.quantity) / maxProd) * 100}%` }} />
              <b>{p.quantity}</b>
            </div>
          ))}
          {topProducts.length === 0 && <p className="muted small">Kayıt bulunamadı.</p>}
        </div>

        {/* Mahalleye Göre Dağılım */}
        <div className="card">
          <h3>Mahalleye Göre Dağılım</h3>
          {districts.slice(0, 7).map((d) => (
            <div key={d.district} className="hbar">
              <span>{d.district}</span>
              <i style={{ width: `${(Number(d.order_count) / maxDist) * 100}%` }} />
              <b>{d.order_count}</b>
            </div>
          ))}
          {districts.length === 0 && <p className="muted small">Kayıt bulunamadı.</p>}
        </div>

        {/* Ödeme Yöntemleri */}
        <div className="card">
          <h3>Ödeme Yöntemleri</h3>
          {payments.map((p) => (
            <div key={p.payment_method} className="hbar">
              <span>{p.payment_method || 'Belirtilmemiş'}</span>
              <i style={{ width: '60%' }} />
              <b>{p.order_count}</b>
            </div>
          ))}
          {payments.length === 0 && <p className="muted small">Kayıt bulunamadı.</p>}
        </div>
      </div>

      {/* Sipariş Kaynakları & Komisyon Analizi */}
      <div className="card">
        <h3>Sipariş Kaynakları ve Komisyon Tasarruf Analizi</h3>
        <div style={{ margin: '1rem 0' }}>
          {bySource.map((s) => (
            <div key={s.source} className="hbar">
              <span>{s.label || s.source}</span>
              <i
                style={{
                  width: `${(Number(s.order_count) / Math.max(1, summary.order_count)) * 100}%`,
                  background: SOURCE_COLORS[s.source.toLowerCase()] || '#6b6556',
                }}
              />
              <b>{s.order_count}</b>
            </div>
          ))}
        </div>
        <div className="note" style={{ marginTop: '1rem' }}>
          Platform Cirosu: <b>{tl(platformRevenue)}</b> · Doğrudan (Web/Telefon/Masa) Ciro:{' '}
          <b>{tl(ownRevenue)}</b>
          <br />
          Tahmini Platform Komisyon Oranı: %
          <input
            type="number"
            className="rate"
            value={estCommissionRate}
            onChange={(e) => setEstCommissionRate(Number(e.target.value))}
          />{' '}
          ile kendi sisteminiz sayesinde yaklaşık <b>{tl(savedCommission)}</b> komisyon
          ödemekten kurtuldunuz!
        </div>
      </div>

      {/* Kurye Performansı */}
      <div className="card">
        <h3>Kurye Performans Tablosu</h3>
        <table className="tbl">
          <thead>
            <tr>
              <th>Kurye Adı</th>
              <th>Teslimat Adedi</th>
              <th>Taşıdığı Ciro</th>
              <th>Ort. Toplam Süre</th>
              <th>Ort. Teslim Süresi</th>
            </tr>
          </thead>
          <tbody>
            {courierPerf.map((c) => (
              <tr key={c.courier_id}>
                <td>
                  <b>{c.courier_name}</b>
                </td>
                <td>{c.delivery_count} paket</td>
                <td>{tl(c.revenue_carried)}</td>
                <td>{c.avg_total_minutes || '—'} dk</td>
                <td>{c.avg_delivery_minutes || '—'} dk</td>
              </tr>
            ))}
            {courierPerf.length === 0 && (
              <tr>
                <td colSpan={5} className="center muted">
                  Bu dönemde teslimat kaydı bulunmuyor.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Masa Kullanım Raporu */}
      <div className="card">
        <h3>Masa Kullanım İstatistikleri</h3>
        <table className="tbl">
          <thead>
            <tr>
              <th>Masa</th>
              <th>Oturum Sayısı</th>
              <th>Toplam Sipariş</th>
              <th>Üretilen Ciro</th>
              <th>Ort. Oturum Süresi</th>
            </tr>
          </thead>
          <tbody>
            {tableUsage.map((t) => (
              <tr key={t.table_id}>
                <td>
                  <b>Masa {t.table_number}</b>
                </td>
                <td>{t.session_count} kez</td>
                <td>{t.order_count}</td>
                <td>{tl(t.revenue)}</td>
                <td>{t.avg_session_minutes || 0} dk</td>
              </tr>
            ))}
            {tableUsage.length === 0 && (
              <tr>
                <td colSpan={5} className="center muted">
                  Bu dönemde masa kullanım kaydı bulunmuyor.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
