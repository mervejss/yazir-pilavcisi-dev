import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { tl } from '@/lib/helpers';
import { useCountUp } from '@/hooks/useCountUp';

type Period = '7' | '30' | '90' | '365' | 'all';
const PERIODS: { k: Period; l: string }[] = [
  { k: '7', l: '7 gün' },
  { k: '30', l: '30 gün' },
  { k: '90', l: '90 gün' },
  { k: '365', l: '12 ay' },
  { k: 'all', l: 'Tümü' },
];

interface Row {
  id: string; code: string; title: string; discount_type: string; is_active: boolean;
  uses: number; discount_total: number; revenue: number; gross: number; customers: number; new_customers: number; avg_basket: number; last_used: string | null;
}

function Kpi({ label, value, sub, money, tone }: { label: string; value: number; sub?: string; money?: boolean; tone?: string }) {
  const v = useCountUp(value, 900, money ? 0 : 0);
  return (
    <div className={`cr-kpi ${tone || ''}`}>
      <small>{label}</small>
      <b>{money ? tl(v) : Math.round(v).toLocaleString('tr-TR')}</b>
      {sub && <span>{sub}</span>}
    </div>
  );
}

export default function CouponReport() {
  const [period, setPeriod] = useState<Period>('30');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [sort, setSort] = useState<'revenue' | 'uses' | 'discount_total' | 'roi'>('revenue');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const to = new Date(Date.now() + 864e5);
      const from = period === 'all' ? new Date('2020-01-01') : new Date(Date.now() - Number(period) * 864e5);
      const { data: d, error } = await supabase.rpc('coupon_report', { p_from: from.toISOString(), p_to: to.toISOString() });
      if (error) setMissing(true);
      else {
        setMissing(false);
        setData(d);
      }
      setLoading(false);
    })();
  }, [period]);

  const rows: Row[] = useMemo(
    () => ((data?.coupons || []) as any[]).map((r) => ({ ...r, discount_total: Number(r.discount_total), revenue: Number(r.revenue), gross: Number(r.gross), avg_basket: Number(r.avg_basket) })),
    [data],
  );
  const roi = (r: Row) => (r.discount_total > 0 ? r.revenue / r.discount_total : 0);
  const sorted = [...rows].sort((a, b) => (sort === 'roi' ? roi(b) - roi(a) : Number(b[sort]) - Number(a[sort])));
  const used = sorted.filter((r) => r.uses > 0);
  const t = data?.totals || {};
  const share = t.orders ? (Number(t.coupon_orders) / Number(t.orders)) * 100 : 0;
  const maxRev = Math.max(1, ...rows.map((r) => r.revenue));
  const daily: any[] = data?.daily || [];
  const maxDay = Math.max(1, ...daily.map((d) => Number(d.uses)));
  const best = used[0];
  const bestRoi = [...used].sort((a, b) => roi(b) - roi(a))[0];
  const mostNew = [...used].sort((a, b) => b.new_customers - a.new_customers)[0];
  const basketLift = Number(t.avg_basket_other) > 0 ? ((Number(t.avg_basket_coupon) - Number(t.avg_basket_other)) / Number(t.avg_basket_other)) * 100 : 0;

  return (
    <section className="cr-wrap">
      <div className="ch-head">
        <div>
          <h2 style={{ margin: 0 }}>📈 Kupon Kullanım Raporu</h2>
          <p className="muted small" style={{ margin: 0 }}>Hangi kampanya ne kadar sipariş ve ciro getirdi, ne kadar indirim maliyeti oluştu?</p>
        </div>
        <div className="seg">
          {PERIODS.map((p) => (
            <button key={p.k} type="button" className={period === p.k ? 'on' : ''} onClick={() => setPeriod(p.k)}>{p.l}</button>
          ))}
        </div>
      </div>

      {missing && <div className="note">Rapor için <code>sql/21_order_reviews_coupon_report.sql</code> dosyasını Supabase SQL Editor'de çalıştırın.</div>}
      {loading ? (
        <p className="muted center" style={{ padding: '2rem' }}>Rapor hazırlanıyor…</p>
      ) : !data ? null : (
        <>
          <div className="cr-kpis">
            <Kpi label="Kuponlu sipariş" value={Number(t.coupon_orders || 0)} sub={`tüm siparişlerin %${share.toFixed(0)}'i`} tone="gold" />
            <Kpi label="Kuponlu ciro" value={Number(t.coupon_revenue || 0)} money sub="indirim sonrası tahsil edilen" tone="ok" />
            <Kpi label="Verilen indirim" value={Number(t.discount_total || 0)} money sub="kampanya maliyeti" tone="bad" />
            <Kpi label="Ort. sepet (kuponlu)" value={Number(t.avg_basket_coupon || 0)} money sub={`kuponsuz: ${tl(Number(t.avg_basket_other || 0))}`} />
            <Kpi label="Puanla indirim" value={Number(t.points_value || 0)} money sub={`${Number(t.points_used || 0)} puan kullanıldı`} />
          </div>

          <div className="cr-insights">
            {best && <div className="cr-ins" style={{ ['--i' as any]: 0 }}><span>🏆</span><div><small>En çok ciro getiren</small><b>{best.code}</b><em>{tl(best.revenue)} · {best.uses} sipariş</em></div></div>}
            {bestRoi && roi(bestRoi) > 0 && <div className="cr-ins" style={{ ['--i' as any]: 1 }}><span>💎</span><div><small>En verimli (ciro/indirim)</small><b>{bestRoi.code}</b><em>1 ₺ indirimle {roi(bestRoi).toFixed(1)} ₺ ciro</em></div></div>}
            {mostNew && mostNew.new_customers > 0 && <div className="cr-ins" style={{ ['--i' as any]: 2 }}><span>🆕</span><div><small>En çok yeni müşteri</small><b>{mostNew.code}</b><em>{mostNew.new_customers} ilk sipariş</em></div></div>}
            {Number(t.avg_basket_other) > 0 && Number(t.avg_basket_coupon) > 0 && <div className="cr-ins" style={{ ['--i' as any]: 3 }}><span>{basketLift >= 0 ? '📈' : '📉'}</span><div><small>Sepet etkisi</small><b>{basketLift >= 0 ? '+' : ''}{basketLift.toFixed(0)}%</b><em>kuponlu sepet, kuponsuza göre</em></div></div>}
          </div>

          <div className="ch-card">
            <h3>Kampanya bazında ciro ve indirim
              <span className="ch-legend"><i style={{ background: 'var(--gold-deep)' }} /> Ciro <i style={{ background: '#dc2626' }} /> İndirim</span>
            </h3>
            {used.length === 0 && <p className="muted small">Bu dönemde kupon kullanılmamış.</p>}
            {used.map((r, i) => (
              <div key={r.id} className="cr-bar" style={{ ['--i' as any]: i }}>
                <span className="n"><code>{r.code}</code> <small className="muted">{r.title}</small></span>
                <div className="tracks">
                  <div><i className="rev" style={{ width: `${(r.revenue / maxRev) * 100}%` }} /></div>
                  <div><i className="dis" style={{ width: `${(r.discount_total / maxRev) * 100}%` }} /></div>
                </div>
                <span className="v"><b>{tl(r.revenue)}</b><small>−{tl(r.discount_total)}</small></span>
              </div>
            ))}
          </div>

          {daily.length > 0 && (
            <div className="ch-card">
              <h3>Günlük kupon kullanımı</h3>
              <div className="cr-daily">
                {daily.map((d, i) => (
                  <div key={d.day} className="cr-day" title={`${new Date(d.day).toLocaleDateString('tr-TR')}: ${d.uses} kullanım · ${tl(Number(d.revenue))} ciro · −${tl(Number(d.discount))}`} style={{ ['--i' as any]: i }}>
                    <i style={{ height: `${(Number(d.uses) / maxDay) * 100}%` }} />
                    <small>{String(d.day).slice(8)}</small>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="ch-card">
            <h3>Ayrıntılı tablo
              <span className="seg">
                {([['revenue', 'Ciro'], ['uses', 'Kullanım'], ['discount_total', 'İndirim'], ['roi', 'Verimlilik']] as const).map(([k, l]) => (
                  <button key={k} type="button" className={sort === k ? 'on' : ''} onClick={() => setSort(k)}>{l}</button>
                ))}
              </span>
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead><tr><th>Kupon</th><th>Durum</th><th>Kullanım</th><th>Müşteri</th><th>Yeni müşteri</th><th>Brüt</th><th>İndirim</th><th>Ciro</th><th>Ort. sepet</th><th>Verimlilik</th><th>Son kullanım</th></tr></thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.id} className={r.uses ? '' : 'cr-zero'}>
                      <td><code>{r.code}</code><br /><small className="muted">{r.title}</small></td>
                      <td>{r.is_active ? <span className="cp-st ok">Aktif</span> : <span className="cp-st mute">Pasif</span>}</td>
                      <td><b>{r.uses}</b></td>
                      <td>{r.customers}</td>
                      <td>{r.new_customers}</td>
                      <td>{tl(r.gross)}</td>
                      <td className="down">{r.discount_total ? `−${tl(r.discount_total)}` : '—'}</td>
                      <td><b>{tl(r.revenue)}</b></td>
                      <td>{r.uses ? tl(r.avg_basket) : '—'}</td>
                      <td>{r.discount_total ? `${roi(r).toFixed(1)}×` : '—'}</td>
                      <td>{r.last_used ? new Date(r.last_used).toLocaleDateString('tr-TR') : '—'}</td>
                    </tr>
                  ))}
                  {sorted.length === 0 && <tr><td colSpan={11} className="center muted" style={{ padding: '2rem' }}>Kupon yok.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="muted small" style={{ margin: '0.6rem 0 0' }}>Ciro = indirim sonrası tahsil edilen sipariş tutarı (iptaller hariç). Verimlilik = ciro ÷ verilen indirim.</p>
          </div>
        </>
      )}
    </section>
  );
}
