import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PLATFORMS } from '@/lib/platforms';
import { useIntegrations } from '@/hooks/useIntegrations';
import { STATUS_TEXT, fmtDT } from './PlatformPage';
import { PlatformReviewsOverview } from './PlatformReviews';

export default function IntegrationsOverview() {
  const { rows, loading } = useIntegrations();
  const [stats, setStats] = useState<Record<string, { today: number; open: number }>>({});

  useEffect(() => {
    supabase.rpc('platform_order_stats').then(({ data }) => {
      const m: Record<string, { today: number; open: number }> = {};
      ((data as any[]) || []).forEach((s) => { m[s.source] = { today: Number(s.today_count), open: Number(s.open_count) }; });
      setStats(m);
    });
  }, []);

  return (
    <>
      <div className="bar">
        <div>
          <h1>Entegrasyonlar</h1>
          <p className="muted" style={{ margin: 0 }}>
            Her platformun kendi sayfası ve kendi bağlantısı vardır. Birindeki hata diğerlerinin siparişlerini etkilemez.
          </p>
        </div>
      </div>
      {loading ? <div className="muted">Yükleniyor…</div> : (
        <div className="int-cards">
          {PLATFORMS.map((p) => {
            const r = rows.find((x) => x.platform === p.code);
            const st = STATUS_TEXT[r?.status || 'not_connected'];
            const s = stats[p.code];
            return (
              <Link key={p.code} to={p.route} className="card int-tile">
                <div className="orow">
                  <b className="int-tile-title">{p.emoji} {p.name}</b>
                  <span className={`st-pill ${st.cls}`}>{st.label}</span>
                </div>
                <p className="small muted">{p.blurb}</p>
                <dl className="int-dl">
                  <dt>Entegrasyon</dt><dd>{r?.is_enabled ? 'Açık' : 'Kapalı'}{!p.implemented && ' · hazırlık'}</dd>
                  <dt>Son işlem</dt><dd>{fmtDT(r?.last_ok_at)}</dd>
                  <dt>Bugün / açık</dt><dd>{s ? `${s.today} / ${s.open}` : '0 / 0'}</dd>
                </dl>
                {r?.last_error && <p className="small int-err">⚠ {r.last_error}</p>}
              </Link>
            );
          })}
        </div>
      )}
      <PlatformReviewsOverview />
    </>
  );
}
