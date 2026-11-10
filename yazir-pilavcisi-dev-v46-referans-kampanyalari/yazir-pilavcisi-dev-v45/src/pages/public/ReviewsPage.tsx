import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useMyReviews, type ReviewableOrder } from '@/hooks/useMyReviews';
import { useCountUp } from '@/hooks/useCountUp';
import ReviewModal from '@/components/reviews/ReviewModal';
import { tl } from '@/lib/helpers';
import { useReviews } from '@/hooks/useReviews';
import Stars from '@/components/ui/Stars';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';

/** SQL 21 henüz çalıştırılmadıysa gösterilen eski sayfa (Google + yönetici yorumları) */
function LegacyReviewsPage() {
  const { reviews, loading, stats, lastSync } = useReviews();

  if (loading) return <LoadingSpinner text="Yorumlar yükleniyor..." />;

  const googleReviews = reviews.filter((r) => r.source === 'google');
  const manualReviews = reviews.filter((r) => r.source === 'manual' || !r.source);

  return (
    <main className="page reviews-page">
      <header className="reviews-header">
        <div className="header-content">
          <h1>Müşteri Yorumları</h1>
          <p className="subtitle">
            Google Haritalar'dan çekilen gerçek müşteri deneyimleri
          </p>
        </div>

        {stats && (
          <div className="stats-bar">
            <div className="stat-item">
              <span className="stat-value">{stats.averageRating?.toFixed(1) || '0.0'}</span>
              <span className="stat-label">Ortalama Puan</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <span className="stat-value">{stats.totalReviews || 0}</span>
              <span className="stat-label">Toplam Yorum</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-item">
              <span className="stat-value">{stats.googleReviews || 0}</span>
              <span className="stat-label">Google Yorumu</span>
            </div>
          </div>
        )}

        <div className="header-actions">
          <a
            className="btn gold"
            href="https://maps.app.goo.gl/ZDHmBcFzBpv5X8fs6"
            target="_blank"
            rel="noreferrer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.5rem' }}>
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              <path d="M0 0h24v24H0z" fill="none"/>
            </svg>
            Google'da Değerlendir
          </a>
        </div>

        {lastSync && (
          <p className="last-sync">
            Son güncelleme: {formatDistanceToNow(new Date(lastSync), { addSuffix: true, locale: tr })}
          </p>
        )}
      </header>

      {googleReviews.length === 0 && manualReviews.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📝</div>
          <h3>Henüz yorum yok</h3>
          <p>İlk yorumu siz yazın!</p>
          <a
            className="btn gold"
            href="https://maps.app.goo.gl/ZDHmBcFzBpv5X8fs6"
            target="_blank"
            rel="noreferrer"
          >
            Google'da Yorum Yaz
          </a>
        </div>
      ) : (
        <>
          {googleReviews.length > 0 && (
            <section className="reviews-section">
              <h2 className="section-title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#4285F4">
                  <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.432,0-6.217-2.789-6.217-6.217s2.785-6.217,6.217-6.217c1.736,0,3.235,0.676,4.312,1.731l2.915-2.915C18.249,1.568,15.578,0,12.545,0C7.346,0,3.076,4.254,3.076,9.452c0,2.383,0.961,4.483,2.478,6.018l-2.915,2.915C1.495,16.732,0,13.951,0,10.746C0,6.06,3.79,2.219,8.512,1.305L8.512,1.305z"/>
                  <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.432,0-6.217-2.789-6.217-6.217s2.785-6.217,6.217-6.217c1.736,0,3.235,0.676,4.312,1.731l2.915-2.915C18.249,1.568,15.578,0,12.545,0C7.346,0,3.076,4.254,3.076,9.452c0,2.383,0.961,4.483,2.478,6.018l-2.915,2.915C1.495,16.732,0,13.951,0,10.746C0,6.06,3.79,2.219,8.512,1.305L8.512,1.305z"/>
                </svg>
                Google Yorumları ({googleReviews.length})
              </h2>
              <div className="reviews-grid">
                {googleReviews.map((review) => (
                  <GoogleReviewCard key={review.id} review={review} />
                ))}
              </div>
            </section>
          )}

          {manualReviews.length > 0 && (
            <section className="reviews-section">
              <h2 className="section-title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#FFD700">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
                Web Sitesi Yorumları ({manualReviews.length})
              </h2>
              <div className="reviews-grid">
                {manualReviews.map((review) => (
                  <ManualReviewCard key={review.id} review={review} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <footer className="reviews-footer">
        <p className="muted">
          Yorumlar Google Places API üzerinden otomatik çekilmektedir.
          Her gün gece 03:00'de güncellenir.
        </p>
      </footer>
    </main>
  );
}

interface GoogleReviewCardProps {
  review: any;
}

function GoogleReviewCard({ review }: GoogleReviewCardProps) {
  const reviewDate = review.review_time ? new Date(review.review_time) : new Date(review.created_at);

  return (
    <article className="review-card google">
      <div className="review-header">
        <div className="author-info">
          {review.profile_photo_url && (
            <img
              src={review.profile_photo_url}
              alt={review.author}
              className="author-avatar"
              loading="lazy"
            />
          )}
          <div className="author-details">
            <cite className="author-name">{review.author}</cite>
            {review.relative_time_description && (
              <time className="review-time" dateTime={reviewDate.toISOString()}>
                {review.relative_time_description}
              </time>
            )}
          </div>
        </div>
        <div className="review-rating">
          <Stars rating={review.rating} />
        </div>
      </div>

      <p className="review-text">{review.body}</p>

      {review.language && review.language !== 'tr' && (
        <span className="translated-badge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-7h-2v7.07l-2.54-2.51-.03.03A17.52 17.52 0 0114.07 6H17V4h-7V2H8v2H1c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-7h-2v7.07z"/>
          </svg>
          Çeviri: {review.language}
        </span>
      )}
    </article>
  );
}

interface ManualReviewCardProps {
  review: any;
}

function ManualReviewCard({ review }: ManualReviewCardProps) {
  const reviewDate = new Date(review.created_at);

  return (
    <article className="review-card manual">
      <div className="review-header">
        <div className="author-info">
          <div className="author-avatar placeholder">
            {review.author.charAt(0).toUpperCase()}
          </div>
          <div className="author-details">
            <cite className="author-name">{review.author}</cite>
            <time className="review-time" dateTime={reviewDate.toISOString()}>
              {formatDistanceToNow(reviewDate, { addSuffix: true, locale: tr })}
            </time>
          </div>
        </div>
        <div className="review-rating">
          <Stars rating={review.rating} />
        </div>
      </div>

      <p className="review-text">{review.body}</p>
    </article>
  );
}

/* ======================================================================
 * YENİ YORUMLAR SAYFASI — tüm kaynaklar (web siparişleri, Google, platformlar)
 * ==================================================================== */
interface Summary {
  total_count: number;
  total_avg: number | null;
  distribution: Record<string, number>;
  web_categories: { taste: number | null; delivery: number | null; service: number | null } | null;
  sources: Record<string, { count: number; avg: number }>;
}
interface PubReview {
  id: string;
  source: string;
  author: string;
  rating: number;
  taste: number | null;
  delivery: number | null;
  service: number | null;
  body: string;
  created_at: string;
  photo: string | null;
  reply: string | null;
  replied_at: string | null;
  relative_time: string | null;
  total_count: number;
}

const SOURCES: { code: string; label: string; icon: string; color: string }[] = [
  { code: 'web', label: 'Web Sitesi Siparişleri', icon: '🌐', color: '#d4af37' },
  { code: 'google', label: 'Google', icon: '🔵', color: '#4285f4' },
  { code: 'trendyol', label: 'Trendyol Go', icon: '🟠', color: '#f27a1a' },
  { code: 'yemeksepeti', label: 'Yemeksepeti', icon: '🔴', color: '#fa0050' },
  { code: 'migros', label: 'Migros Yemek', icon: '🟢', color: '#d9480f' },
  { code: 'getir', label: 'Getir Yemek', icon: '🟣', color: '#5d3ebc' },
  { code: 'manual', label: 'Müşteri Görüşleri', icon: '💬', color: '#6b6556' },
];
const PAGE = 12;

function CatBar({ label, icon, value, delay }: { label: string; icon: string; value: number | null; delay: number }) {
  return (
    <div className="rv-cat" style={{ ['--delay' as any]: `${delay}ms` }}>
      <span>{icon} {label}</span>
      <div className="rv-cat-track"><i style={{ width: `${((value || 0) / 5) * 100}%` }} /></div>
      <b>{value ? value.toFixed(1) : '–'}</b>
    </div>
  );
}

function MiniScore({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null;
  return (
    <span className="rv-mini">
      {label} <Stars rating={value} size={13} /> <b>{value.toFixed(1)}</b>
    </span>
  );
}

function ReviewItem({ r, index }: { r: PubReview; index: number }) {
  const src = SOURCES.find((s) => s.code === r.source);
  const date = new Date(r.created_at);
  return (
    <article className={`rv-card src-${r.source}`} style={{ ['--i' as any]: index % PAGE }}>
      <header>
        {r.photo ? (
          <img className="rv-avatar" src={r.photo} alt="" loading="lazy" />
        ) : (
          <span className="rv-avatar ph" style={{ background: src?.color }}>{(r.author || '?').charAt(0).toUpperCase()}</span>
        )}
        <div className="rv-who">
          <b>{r.author}</b>
          <small>
            {r.relative_time || date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </small>
        </div>
        <div className="rv-score">
          <Stars rating={r.rating} size={18} />
          <b>{Number(r.rating).toFixed(1)}</b>
        </div>
      </header>

      {(r.taste != null || r.service != null) && (
        <div className="rv-minis">
          <MiniScore label="😋 Lezzet" value={r.taste} />
          <MiniScore label="🛵 Teslimat" value={r.delivery} />
          <MiniScore label="🤝 Servis" value={r.service} />
        </div>
      )}

      {r.body && <p className="rv-body">{r.body}</p>}

      {r.reply && (
        <div className="rv-reply">
          <b>🍚 Yazır Pilavcısı yanıtı</b>
          <p>{r.reply}</p>
        </div>
      )}

      <footer>
        <span className="rv-src" style={{ ['--c' as any]: src?.color }}>{src?.icon} {src?.label || r.source}</span>
        {r.source === 'web' && <span className="rv-verified">✓ Doğrulanmış sipariş</span>}
      </footer>
    </article>
  );
}

function NewReviewsPage({ onUnavailable }: { onUnavailable: () => void }) {
  const { user } = useAuthStore();
  const mine = useMyReviews();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState('all');
  const [sort, setSort] = useState<'newest' | 'highest' | 'lowest'>('newest');
  const [minStars, setMinStars] = useState(0);
  const [items, setItems] = useState<PubReview[]>([]);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [modalOrder, setModalOrder] = useState<ReviewableOrder | null>(null);

  const loadSummary = async () => {
    const { data, error } = await supabase.rpc('public_review_summary');
    if (error) return onUnavailable();
    setSummary(data as unknown as Summary);
    setLoading(false);
  };
  useEffect(() => {
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadList = async (offset: number, append: boolean) => {
    setListLoading(true);
    const { data, error } = await supabase.rpc('list_public_reviews', {
      p_source: source, p_sort: sort, p_min: minStars, p_limit: PAGE, p_offset: offset,
    });
    setListLoading(false);
    if (error) return;
    const rows = ((data as any[]) || []).map((r) => ({ ...r, rating: Number(r.rating), taste: r.taste != null ? Number(r.taste) : null, delivery: r.delivery != null ? Number(r.delivery) : null, service: r.service != null ? Number(r.service) : null })) as PubReview[];
    setItems((prev) => (append ? [...prev, ...rows] : rows));
    setTotal(rows[0] ? Number(rows[0].total_count) : 0);
  };
  useEffect(() => {
    loadList(0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, sort, minStars]);

  const avg = summary?.total_avg ? Number(summary.total_avg) : 0;
  const count = summary?.total_count ? Number(summary.total_count) : 0;
  const avgAnim = useCountUp(avg, 1100, 1);
  const countAnim = useCountUp(count, 1100, 0);
  const maxDist = useMemo(() => Math.max(1, ...[1, 2, 3, 4, 5].map((n) => Number(summary?.distribution?.[String(n)] || 0))), [summary]);
  const visibleSources = SOURCES.filter((s) => s.code !== 'manual' || (summary?.sources?.manual?.count || 0) > 0);

  if (loading) return <LoadingSpinner text="Yorumlar yükleniyor..." />;

  const cat = summary?.web_categories;

  return (
    <main className="page rv-page">
      {/* ---------- Hero ---------- */}
      <section className="rv-hero">
        <div className="rv-hero-glow" aria-hidden="true" />
        <div className="rv-hero-main">
          <h1>Müşteri Yorumları</h1>
          <p className="muted">Gerçek siparişlerden, gerçek müşterilerden. Web sitesinden sipariş verenlerin lezzet, teslimat ve servis değerlendirmeleri.</p>
          <div className="rv-big">
            <div className="rv-big-score">
              <b>{count ? avgAnim.toFixed(1) : '–'}</b>
              <Stars rating={avg} size={26} />
              <small>{countAnim} yorum</small>
            </div>
            <div className="rv-dist">
              {[5, 4, 3, 2, 1].map((n) => {
                const c = Number(summary?.distribution?.[String(n)] || 0);
                return (
                  <div key={n} className="rv-dist-row">
                    <span>{n} ★</span>
                    <div><i style={{ width: `${(c / maxDist) * 100}%`, ['--d' as any]: `${(5 - n) * 90}ms` }} /></div>
                    <b>{c}</b>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="rv-hero-side">
          <h3>Web Sitesi Siparişleri</h3>
          <p className="muted small">Lezzet, teslimat ve servis ortalaması</p>
          <CatBar icon="😋" label="Lezzet" value={cat?.taste ? Number(cat.taste) : null} delay={0} />
          <CatBar icon="🛵" label="Teslimat" value={cat?.delivery ? Number(cat.delivery) : null} delay={120} />
          <CatBar icon="🤝" label="Servis" value={cat?.service ? Number(cat.service) : null} delay={240} />
          <a className="btn ghost sm" href="https://maps.app.goo.gl/ZDHmBcFzBpv5X8fs6" target="_blank" rel="noreferrer" style={{ marginTop: '0.6rem' }}>
            Google'da da değerlendir ↗
          </a>
        </aside>
      </section>

      {/* ---------- Sipariş sonrası yorum yazma alanı ---------- */}
      <section className="rv-write">
        {!user ? (
          <div className="rv-write-card">
            <div className="rv-write-ico">✍️</div>
            <div>
              <h3>Siz de değerlendirin</h3>
              <p className="muted small">Web sitesinden giriş yapıp sipariş veren müşterilerimiz siparişini teslim aldıktan sonra yorum yazabilir.</p>
            </div>
            <div className="rv-write-actions">
              <Link to="/giris" className="btn gold sm">Giriş Yap</Link>
              <Link to="/kayit" className="btn ghost sm">Kayıt Ol</Link>
            </div>
          </div>
        ) : mine.unavailable ? null : mine.pending.length > 0 ? (
          <div className="rv-write-card pending">
            <div className="rv-write-ico">🔔</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3>Değerlendirmenizi bekleyen {mine.pending.length} siparişiniz var</h3>
              <div className="rv-pending">
                {mine.pending.slice(0, 3).map((o) => (
                  <button type="button" key={o.order_id} className="rv-pending-item" onClick={() => setModalOrder(o)}>
                    <b>#{o.order_no}</b>
                    <span>{o.items ? (o.items.length > 46 ? o.items.slice(0, 46) + '…' : o.items) : tl(o.total)}</span>
                    <em>⭐ Değerlendir</em>
                  </button>
                ))}
              </div>
            </div>
            <Link to="/profil?tab=reviews" className="btn ghost sm">Tümü</Link>
          </div>
        ) : (
          <div className="rv-write-card ok">
            <div className="rv-write-ico">{mine.rows.length ? '🎉' : '🍚'}</div>
            <div>
              <h3>{mine.rows.length ? 'Tüm siparişlerinizi değerlendirdiniz' : 'İlk siparişinizi verin, deneyiminizi paylaşın'}</h3>
              <p className="muted small">{mine.rows.length ? 'Yorumlarınızı profilinizden düzenleyebilir veya silebilirsiniz.' : 'Teslim edilen siparişleriniz burada değerlendirmeye açılır.'}</p>
            </div>
            <Link to={mine.rows.length ? '/profil?tab=reviews' : '/siparis'} className="btn gold sm">{mine.rows.length ? 'Yorumlarım' : 'Sipariş Ver'}</Link>
          </div>
        )}
      </section>

      {/* ---------- Kaynak sekmeleri ---------- */}
      <div className="rv-tabs" role="tablist">
        <button type="button" role="tab" className={source === 'all' ? 'on' : ''} onClick={() => setSource('all')}>
          Tüm Yorumlar <i>{count}</i>
        </button>
        {visibleSources.map((s) => {
          const c = summary?.sources?.[s.code];
          return (
            <button key={s.code} type="button" role="tab" className={source === s.code ? 'on' : ''} onClick={() => setSource(s.code)} style={{ ['--c' as any]: s.color }}>
              {s.icon} {s.label} <i>{c?.count || 0}</i>
              {c?.count ? <small>{Number(c.avg).toFixed(1)} ★</small> : null}
            </button>
          );
        })}
      </div>

      {/* ---------- Filtre ---------- */}
      <div className="rv-filters">
        <label>
          Sırala
          <select value={sort} onChange={(e) => setSort(e.target.value as any)}>
            <option value="newest">En yeni</option>
            <option value="highest">En yüksek puan</option>
            <option value="lowest">En düşük puan</option>
          </select>
        </label>
        <label>
          En az
          <select value={minStars} onChange={(e) => setMinStars(Number(e.target.value))}>
            <option value={0}>Tüm puanlar</option>
            <option value={4}>4 yıldız ve üzeri</option>
            <option value={3}>3 yıldız ve üzeri</option>
            <option value={2}>2 yıldız ve üzeri</option>
          </select>
        </label>
        <span className="muted small">{total} yorum gösteriliyor</span>
      </div>

      {/* ---------- Liste ---------- */}
      {items.length === 0 && !listLoading ? (
        <div className="rv-empty">
          <div>{source === 'web' || source === 'all' ? '📝' : '⏳'}</div>
          <h3>{source === 'all' || source === 'web' ? 'Bu filtrede yorum yok' : `${SOURCES.find((s) => s.code === source)?.label} yorumları (0)`}</h3>
          <p className="muted">{source === 'all' || source === 'web' ? 'İlk yorumu siz yazın!' : 'Bu platformla entegrasyon tamamlandığında yorumlar burada otomatik görünecek.'}</p>
        </div>
      ) : (
        <div className="rv-grid">
          {items.map((r, i) => (
            <ReviewItem key={`${r.source}-${r.id}`} r={r} index={i} />
          ))}
        </div>
      )}
      {items.length < total && (
        <div className="center" style={{ margin: '1.5rem 0' }}>
          <button type="button" className="btn gold" disabled={listLoading} onClick={() => loadList(items.length, true)}>
            {listLoading ? 'Yükleniyor…' : `Daha fazla göster (${total - items.length})`}
          </button>
        </div>
      )}

      <ReviewModal
        order={modalOrder}
        onClose={() => setModalOrder(null)}
        onSaved={() => {
          mine.refetch();
          loadSummary();
          loadList(0, false);
        }}
      />
    </main>
  );
}

export default function ReviewsPage() {
  const [legacy, setLegacy] = useState(false);
  return legacy ? <LegacyReviewsPage /> : <NewReviewsPage onUnavailable={() => setLegacy(true)} />;
}
