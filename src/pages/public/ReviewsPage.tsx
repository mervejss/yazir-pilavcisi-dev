import { useReviews } from '@/hooks/useReviews';
import Stars from '@/components/ui/Stars';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';

export default function ReviewsPage() {
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