import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { SiteReview } from '@/types/database';

interface ReviewsData {
  reviews: SiteReview[];
  loading: boolean;
  stats: {
    totalReviews: number;
    googleReviews: number;
    manualReviews: number;
    averageRating: number | null;
    ratingDistribution: Record<number, number>;
  } | null;
  lastSync: string | null;
}

export function useReviews() {
  const [data, setData] = useState<ReviewsData>({
    reviews: [],
    loading: true,
    stats: null,
    lastSync: null,
  });

  useEffect(() => {
    const fetch = async () => {
      setData((prev) => ({ ...prev, loading: true }));

      try {
        // Fetch all published reviews
        const { data: reviews, error } = await supabase
          .from('site_reviews')
          .select('*')
          .eq('is_published', true)
          .order('sort_order')
          .order('created_at', { ascending: false });

        if (error) throw error;

        const reviewsData = (reviews || []) as unknown as SiteReview[];

        // Calculate stats
        const googleReviews = reviewsData.filter((r) => r.source === 'google');
        const manualReviews = reviewsData.filter((r) => r.source === 'manual' || !r.source);
        const totalReviews = reviewsData.length;

        // Average rating
        const averageRating =
          totalReviews > 0
            ? reviewsData.reduce((sum, r) => sum + r.rating, 0) / totalReviews
            : null;

        // Rating distribution
        const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        reviewsData.forEach((r) => {
          ratingDistribution[r.rating] = (ratingDistribution[r.rating] || 0) + 1;
        });

        // Last sync time from google_reviews_sync_log
        const { data: syncLog } = await supabase
          .from('google_reviews_sync_log')
          .select('completed_at')
          .eq('status', 'success')
          .order('completed_at', { ascending: false })
          .limit(1)
          .single();

        setData({
          reviews: reviewsData,
          loading: false,
          stats: {
            totalReviews,
            googleReviews: googleReviews.length,
            manualReviews: manualReviews.length,
            averageRating,
            ratingDistribution,
          },
          lastSync: syncLog?.completed_at || null,
        });
      } catch (err) {
        console.error('Failed to fetch reviews:', err);
        setData((prev) => ({ ...prev, loading: false }));
      }
    };

    fetch();
  }, []);

  return data;
}