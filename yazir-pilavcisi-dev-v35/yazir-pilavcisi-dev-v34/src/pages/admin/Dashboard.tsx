import { useMemo } from 'react';
import { useOrders } from '@/hooks/useOrders';
import { tl, hhmm, businessDayStart } from '@/lib/helpers';
import { PAYMENT_METHOD_LABELS } from '@/lib/constants';
import Kpi from '@/components/ui/Kpi';
import StatusBadge from '@/components/ui/StatusBadge';
import SourceChip from '@/components/ui/SourceChip';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function Dashboard() {
  const { orders, loading } = useOrders();

  const stats = useMemo(() => {
    const todayStart = businessDayStart();
    const todayOrders = orders.filter((o) => new Date(o.created_at) >= todayStart);
    const validOrders = todayOrders.filter((o) => o.status !== 'cancelled');
    const revenue = validOrders.reduce((sum, o) => sum + Number(o.total), 0);
    const activeOrders = orders.filter(
      (o) => !['delivered', 'cancelled'].includes(o.status),
    );

    return {
      todayCount: todayOrders.length,
      revenue,
      avgBasket: validOrders.length > 0 ? revenue / validOrders.length : 0,
      activeCount: activeOrders.length,
    };
  }, [orders]);

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
