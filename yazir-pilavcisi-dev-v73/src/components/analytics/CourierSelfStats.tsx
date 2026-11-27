import { useMemo, useState } from 'react';
import { tl, hhmm } from '@/lib/helpers';
import { fillDaily, fmtMin, fmtPct, hourRangeLabel, resolveRange, shortDay, type RangeKey } from '@/lib/analytics';
import { useCourierDetail } from '@/hooks/useAnalytics';
import { ColumnChart, HourChart, LineArea } from '@/components/analytics/Charts';

const OPTS: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Bugün' },
  { key: '7', label: '7 gün' },
  { key: '30', label: '30 gün' },
  { key: 'month', label: 'Bu ay' },
];

/** Kuryenin kendi performans ekranı (telefon) */
export default function CourierSelfStats({ courierId }: { courierId: string }) {
  const [key, setKey] = useState<RangeKey>('7');
  const range = useMemo(() => resolveRange(key), [key]);
  const { data, loading, missing, error } = useCourierDetail(courierId, range.from, range.to, 30);

  const s = data?.summary;
  const daily = useMemo(() => {
    if (!data) return { values: [] as number[], labels: [] as string[] };
    const rows = fillDaily(data.daily, range.from, range.to, (day) => ({ day, count: 0, revenue: 0, avg_min: null }));
    return { values: rows.map((r) => Number(r.count)), labels: rows.map((r) => shortDay(r.day)) };
  }, [data, range.from, range.to]);
  const peak = data ? [...data.hourly].sort((a, b) => b.count - a.count)[0] : null;

  return (
    <div className="cs">
      <div className="cs-pills">
        {OPTS.map((o) => (
          <button key={o.key} type="button" className={key === o.key ? 'on' : ''} onClick={() => setKey(o.key)}>{o.label}</button>
        ))}
      </div>

      {missing && <div className="cr-pending">Performans verisi için yönetici SQL güncellemesini çalıştırmalı.</div>}
      {error && !missing && <div className="cr-pending">{error}</div>}
      {loading && !data && <div className="cr-empty"><div className="gold-spinner" /></div>}

      {s && data && (
        <>
          <div className="cs-hero">
            <div><b>{s.delivery_count}</b><small>Teslimat</small></div>
            <div><b>{fmtMin(s.avg_delivery_min)}</b><small>Ort. teslim süresi</small></div>
            <div><b>{fmtMin(s.total_delivery_min, { short: true })}</b><small>Yolda geçen süre</small></div>
            <div><b>{fmtPct(s.on_time_pct)}</b><small>Zamanında</small></div>
          </div>

          <div className="cs-list">
            <div><span>Kapıda tahsilat</span><b>{tl(Number(s.cash_collected))}</b></div>
            <div><span>Taşıdığım ciro</span><b>{tl(Number(s.revenue))}</b></div>
            <div><span>En hızlı / en yavaş</span><b>{fmtMin(s.fastest_min)} / {fmtMin(s.slowest_min)}</b></div>
            <div><span>Çevrimiçi süre</span><b>{fmtMin(s.online_minutes)}</b></div>
            <div><span>En yoğun saatim</span><b>{peak && peak.count > 0 ? hourRangeLabel(peak.hour) : '—'}</b></div>
            <div><span>Sıralamam</span><b>{s.delivery_count > 0 ? `${s.rank}. / ${s.ranked_couriers}` : '—'}</b></div>
          </div>

          <div className="cs-points">
            <div><small>⭐ Puanım</small><b>{s.points_balance}</b></div>
            <div><small>💰 Birikmiş prim</small><b>{tl(Number(s.bonus_amount))}</b></div>
          </div>

          <section className="cs-card">
            <h4>Saatlere göre teslimatlarım</h4>
            <HourChart data={data.hourly} />
          </section>
          <section className="cs-card">
            <h4>Günlük teslimat</h4>
            <LineArea points={daily.values} labels={daily.labels} height={160} />
          </section>
          <section className="cs-card">
            <h4>Haftanın günleri</h4>
            <ColumnChart height={120} items={data.weekday.map((w, i) => ({ label: ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'][i], value: Number(w.count) }))} />
          </section>

          {data.points.length > 0 && (
            <section className="cs-card">
              <h4>Puan / prim hareketlerim</h4>
              <div className="cu-ledger">
                {data.points.slice(0, 8).map((l) => (
                  <div key={l.id}>
                    <span>{new Date(l.created_at).toLocaleDateString('tr-TR')}{l.note ? ` · ${l.note}` : ''}</span>
                    <b className={l.points + Number(l.amount) >= 0 ? 'up' : 'down'}>{l.points ? `${l.points > 0 ? '+' : ''}${l.points}` : ''}{l.points && Number(l.amount) ? ' · ' : ''}{Number(l.amount) ? tl(Number(l.amount)) : ''}</b>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="cs-card">
            <h4>Son teslimatlarım</h4>
            {data.recent.slice(0, 10).map((r) => (
              <div key={r.order_id} className="cs-row">
                <b>#{r.order_no}</b>
                <span>{r.district || r.customer_name || '—'}</span>
                <span className="muted small">{hhmm(r.delivered_at)}</span>
                <b className="cs-min">{fmtMin(r.delivery_min)}</b>
              </div>
            ))}
            {data.recent.length === 0 && <p className="muted small">Bu aralıkta teslimat yok.</p>}
          </section>
        </>
      )}
    </div>
  );
}
