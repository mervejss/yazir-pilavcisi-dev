import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import SystemHealth from '@/components/dashboard/SystemHealth';
import OrderHeat from '@/components/dashboard/OrderHeat';
import { useOrders } from '@/hooks/useOrders';
import { tl, hhmm, businessDayStart, beep } from '@/lib/helpers';
import { PAYMENT_METHOD_LABELS, SOURCE_LABELS } from '@/lib/constants';
import Kpi from '@/components/ui/Kpi';
import StatusBadge from '@/components/ui/StatusBadge';
import SourceChip from '@/components/ui/SourceChip';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function Dashboard() {
  const { orders, loading } = useOrders();

  const { settings } = useBusinessSettings();
  const [couriers, setCouriers] = useState<Array<{ id: string; name: string; online: boolean }>>([]);
  const [now, setNow] = useState(Date.now());
  const alerted = useRef<Set<string>>(new Set());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let off = false;
    (async () => {
      const [{ data: p }, { data: c }] = await Promise.all([
        supabase.from('profiles').select('id, full_name').eq('role', 'courier'),
        supabase.from('courier_profiles').select('user_id, is_online'),
      ]);
      if (off) return;
      const on = new Map((c || []).map((r: any) => [r.user_id, !!r.is_online]));
      setCouriers(((p as any[]) || []).map((r) => ({ id: r.id, name: r.full_name || 'Kurye', online: on.get(r.id) || false })));
    })();
    return () => {
      off = true;
    };
  }, []);

  const stats = useMemo(() => {
    const todayStart = businessDayStart();
    const todayOrders = orders.filter((o) => new Date(o.created_at) >= todayStart);
    const validOrders = todayOrders.filter((o) => o.status !== 'cancelled');
    const revenue = validOrders.reduce((sum, o) => sum + Number(o.total), 0);
    const activeOrders = orders.filter((o) => !['delivered', 'cancelled'].includes(o.status));

    const prod = new Map<string, number>();
    const pay = new Map<string, number>();
    const src = new Map<string, number>();
    const dist = new Map<string, number>();
    const hours = Array<number>(24).fill(0);
    validOrders.forEach((o) => {
      o.items.forEach((i) => prod.set(i.product_name, (prod.get(i.product_name) || 0) + Number(i.quantity)));
      const pm = PAYMENT_METHOD_LABELS[o.payment_method || ''] || o.payment_method || '—';
      pay.set(pm, (pay.get(pm) || 0) + Number(o.total));
      src.set(SOURCE_LABELS[o.source] || o.source, (src.get(SOURCE_LABELS[o.source] || o.source) || 0) + 1);
      if (o.order_type === 'delivery' && o.district) dist.set(o.district, (dist.get(o.district) || 0) + 1);
      hours[new Date(o.created_at).getHours()]++;
    });
    const top = (m: Map<string, number>, n = 5) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

    // Kurye performansı (bugün, teslim edilenler)
    const perf = new Map<string, { n: number; mins: number; mn: number }>();
    todayOrders.forEach((o) => {
      if (o.status !== 'delivered' || !o.courier_id || !o.delivered_at) return;
      const from = o.picked_up_at || o.assigned_at || o.created_at;
      const m = (new Date(o.delivered_at).getTime() - new Date(from).getTime()) / 60000;
      const r = perf.get(o.courier_id) || { n: 0, mins: 0, mn: 0 };
      r.n++;
      if (m > 0 && m < 240) {
        r.mins += m;
        r.mn++;
      }
      perf.set(o.courier_id, r);
    });

    return {
      todayCount: todayOrders.length,
      revenue,
      avgBasket: validOrders.length > 0 ? revenue / validOrders.length : 0,
      activeCount: activeOrders.length,
      cancelled: todayOrders.length - validOrders.length,
      delivered: todayOrders.filter((o) => o.status === 'delivered').length,
      topProducts: top(prod),
      pay: top(pay),
      src: top(src),
      dist: top(dist),
      hours,
      perf,
    };
  }, [orders]);

  // Geciken siparişler: hazırlıkta/hazır/atandı > tahmini azami süre, yolda > azami + 15 dk
  const limitMin = Number(settings?.estimated_delivery_max || 25);
  const late = useMemo(
    () =>
      orders.filter((o) => {
        if (['delivered', 'cancelled'].includes(o.status)) return false;
        const age = (now - new Date(o.created_at).getTime()) / 60000;
        return o.status === 'on_the_way' ? age > limitMin + 15 : age > limitMin + 5;
      }),
    [orders, now, limitMin],
  );
  useEffect(() => {
    const fresh = late.filter((o) => !alerted.current.has(o.id));
    if (fresh.length) {
      fresh.forEach((o) => alerted.current.add(o.id));
      beep();
    }
  }, [late]);

  if (loading) return <LoadingSpinner />;

  return (
    <>
      <h1>Bugün</h1>
      <div className="kpis">
        <Kpi label="Bugünkü sipariş" value={stats.todayCount} />
        <Kpi label="Bugünkü ciro" value={tl(stats.revenue)} />
        <Kpi label="Ortalama sepet" value={tl(stats.avgBasket)} />
        <Kpi label="Aktif sipariş" value={stats.activeCount} sub="hazırlanan ve yolda" />
      </div>

      {late.length > 0 && (
        <div className="late-banner" role="alert">
          <b>⏰ {late.length} sipariş gecikti</b>
          <span>
            {late.slice(0, 6).map((o) => `#${o.order_no} (${Math.round((now - new Date(o.created_at).getTime()) / 60000)} dk)`).join(' · ')}
          </span>
          <Link className="btn gold sm" to="/admin/siparisler">Siparişlere git</Link>
        </div>
      )}

      <div className="kpis">
        <Kpi label="Teslim edilen" value={stats.delivered} />
        <Kpi label="İptal" value={stats.cancelled} />
        <Kpi label="Çevrimiçi kurye" value={`${couriers.filter((c) => c.online).length} / ${couriers.length}`} />
        <Kpi label="Gecikme sınırı" value={`${limitMin + 5} dk`} sub="uyarı eşiği" />
      </div>

      <div className="dash-grid">
        <section className="card">
          <h3>🏆 Bugün en çok satanlar</h3>
          {stats.topProducts.length === 0 && <p className="muted small">Henüz veri yok.</p>}
          {stats.topProducts.map(([n, q]) => (
            <div key={n} className="dash-row"><span>{n}</span><b>{q} adet</b></div>
          ))}
        </section>
        <section className="card">
          <h3>💳 Ödeme dağılımı</h3>
          {stats.pay.length === 0 && <p className="muted small">Henüz veri yok.</p>}
          {stats.pay.map(([n, v]) => (
            <div key={n} className="dash-row"><span>{n}</span><b>{tl(v)}</b></div>
          ))}
        </section>
        <section className="card">
          <h3>📲 Kaynak</h3>
          {stats.src.length === 0 && <p className="muted small">Henüz veri yok.</p>}
          {stats.src.map(([n, v]) => (
            <div key={n} className="dash-row"><span>{n}</span><b>{v} sipariş</b></div>
          ))}
        </section>
        <section className="card">
          <h3>📍 Mahalle (bugün)</h3>
          {stats.dist.length === 0 && <p className="muted small">Henüz veri yok.</p>}
          {stats.dist.map(([n, v]) => (
            <div key={n} className="dash-row"><span>{n}</span><b>{v}</b></div>
          ))}
        </section>
      </div>

      <section className="card dash-solo">
        <h3>🕒 Saat saat sipariş (bugün)</h3>
        <div className="hour-bars" aria-label="Saatlik sipariş dağılımı">
          {stats.hours.map((n, h) => (
            <div key={h} className="hb" title={`${h}:00 — ${n} sipariş`}>
              <i style={{ height: `${(n / Math.max(...stats.hours, 1)) * 100}%` }} />
              <small>{h % 3 === 0 ? h : ''}</small>
            </div>
          ))}
        </div>
      </section>

      {couriers.length > 0 && (
        <section className="card dash-solo">
          <h3>🛵 Kurye performansı (bugün)</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>Kurye</th><th>Durum</th><th>Teslimat</th><th>Ort. süre</th></tr></thead>
              <tbody>
                {couriers.map((c) => {
                  const r = stats.perf.get(c.id);
                  return (
                    <tr key={c.id}>
                      <td><b>{c.name}</b></td>
                      <td>{c.online ? '🟢 Çevrimiçi' : '⚪ Çevrimdışı'}</td>
                      <td>{r?.n || 0}</td>
                      <td>{r && r.mn > 0 ? `${Math.round(r.mins / r.mn)} dk` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="small muted">Ayrıntılı kurye analizi için Analiz sayfasına bakın.</p>
        </section>
      )}

      <OrderHeat />
      <SystemHealth />

      <h2>Son siparişler</h2>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>No</th>
              <th>Saat</th>
              <th>Müşteri</th>
              <th>Kaynak</th>
              <th>Mahalle</th>
              <th>Ödeme</th>
              <th>Durum</th>
              <th>Tutar</th>
            </tr>
          </thead>
          <tbody>
            {orders.slice(0, 15).map((o) => (
              <tr key={o.id}>
                <td>
                  <b>#{o.order_no}</b>
                </td>
                <td>{hhmm(o.created_at)}</td>
                <td>{o.customer_name || 'Misafir'}</td>
                <td>
                  <SourceChip source={o.source} extRef={o.external_ref} />
                </td>
                <td>{o.district || '—'}</td>
                <td>{PAYMENT_METHOD_LABELS[o.payment_method || ''] || o.payment_method || '—'}</td>
                <td>
                  <StatusBadge status={o.status} />
                </td>
                <td>
                  <b>{tl(o.total)}</b>
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={8} className="center muted" style={{ padding: '2rem' }}>
                  Henüz sipariş bulunmuyor.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
