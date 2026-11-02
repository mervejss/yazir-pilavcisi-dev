import { useReviews } from '@/hooks/useReviews';
import Stars from '@/components/ui/Stars';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function ReviewsPage() {
    const { reviews, loading } = useReviews();

    if (loading) return <LoadingSpinner />;

    return (
        <main className="page">
            <h1>Yorumlar</h1>
            <p className="muted">Google'daki müşterilerimizin değerlendirmeleri.</p>
            <div className="grid3">
                {reviews.map((r) => (
                    <blockquote key={r.id}>
                        <Stars rating={r.rating} />
                        <p>{r.body}</p>
                        <cite>{r.author}</cite>
                    </blockquote>
                ))}
            </div>
            <p style={{ marginTop: '2rem' }}>
                <a
                    className="btn gold"
                    href="https://maps.app.goo.gl/Tf2wJ8uikpfpU2LB6"
                    target="_blank"
                    rel="noreferrer"
                >
                    ⭐ Google'da bizi değerlendirin
                </a>
            </p>
        </main>
    );
}