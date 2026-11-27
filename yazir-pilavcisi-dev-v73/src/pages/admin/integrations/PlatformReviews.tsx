import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PLATFORMS, platformByCode } from '@/lib/platforms';
import Stars from '@/components/ui/Stars';
import { Link } from 'react-router-dom';

interface PRev {
  id: string;
  author: string;
  rating: number;
  body: string;
  review_time: string | null;
  created_at: string;
  reply: string | null;
}

/** Platform sayfasında "Yorumlar" bölümü: entegrasyon yorum çekince otomatik dolar, şimdilik (0) */
export function PlatformReviewsSection({ code, index = 7 }: { code: string; index?: number }) {
  const meta = platformByCode(code);
  const [rows, setRows] = useState<PRev[]>([]);
  const [count, setCount] = useState(0);
  const [avg, setAvg] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error, count: c } = await supabase
        .from('platform_reviews')
        .select('*', { count: 'exact' })
        .eq('platform', code)
        .order('review_time', { ascending: false, nullsFirst: false })
        .limit(10);
      if (!error) {
        const list = ((data || []) as any[]).map((r) => ({ ...r, rating: Number(r.rating) })) as PRev[];
        setRows(list);
        setCount(c || list.length);
        setAvg(list.length ? list.reduce((s, r) => s + r.rating, 0) / list.length : null);
      }
      setReady(true);
    })();
  }, [code]);

  return (
    <section className="card int-card rv-int" style={{ marginTop: '1rem' }}>
      <div className="orow">
        <h3 style={{ margin: 0 }}>{index} · Yorumlar <span className="rv-int-count">({count})</span></h3>
        <Link to="/admin/entegrasyonlar" className="btn ghost sm">Tüm platformlar</Link>
      </div>
      <div className="rv-int-stats">
        <div><small>Toplam yorum</small><b>{count}</b></div>
        <div><small>Ortalama puan</small><b>{avg ? avg.toFixed(1) : '–'}</b>{avg ? <Stars rating={avg} size={14} /> : null}</div>
        <div><small>Durum</small><b className="rv-int-state">{count ? 'Aktif' : 'Hazır · bekliyor'}</b></div>
      </div>
      {ready && rows.length === 0 ? (
        <div className="rv-int-empty">
          <span>{meta?.emoji || '💬'}</span>
          <div>
            <b>{meta?.name || code} yorumları (0)</b>
            <p className="muted small" style={{ margin: 0 }}>Entegrasyon bağlanıp yorum çekme açıldığında {meta?.name || 'platform'} yorumları burada ve herkese açık "Yorumlar" sayfasında otomatik listelenir.</p>
          </div>
        </div>
      ) : (
        <div className="rv-int-list">
          {rows.map((r) => (
            <article key={r.id}>
              <div className="orow"><b>{r.author}</b><span><Stars rating={r.rating} size={14} /> {r.rating.toFixed(1)}</span></div>
              {r.body && <p className="small">{r.body}</p>}
              <small className="muted">{new Date(r.review_time || r.created_at).toLocaleDateString('tr-TR')}</small>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/** Genel Bakış: tüm platformların yorum özeti */
export function PlatformReviewsOverview() {
  const [src, setSrc] = useState<Record<string, { count: number; avg: number }>>({});
  useEffect(() => {
    supabase.rpc('public_review_summary').then(({ data }) => {
      const s = (data as any)?.sources;
      if (s) setSrc(s);
    });
  }, []);
  const items = [
    { code: 'web', name: 'Web Sitesi Siparişleri', emoji: '🌐', route: '/admin/yorumlar' },
    { code: 'google', name: 'Google', emoji: '🔵', route: '/admin/google-yorumlar' },
    ...PLATFORMS.map((p) => ({ code: p.code, name: p.name, emoji: p.emoji, route: p.route })),
  ];
  return (
    <section className="rv-int-overview">
      <h3>💬 Yorumlar · Tüm Kaynaklar</h3>
      <div className="rv-int-tiles">
        {items.map((it, i) => {
          const c = src[it.code];
          return (
            <Link key={it.code} to={it.route} className="rv-int-tile" style={{ ['--i' as any]: i }}>
              <span className="e">{it.emoji}</span>
              <b>{it.name}</b>
              <strong>{c?.count || 0}</strong>
              <small>{c?.count ? `${Number(c.avg).toFixed(1)} ★ ortalama` : 'yorum (0)'}</small>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
