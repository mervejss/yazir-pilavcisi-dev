import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { SiteReview } from '@/types/database';

export function useReviews() {
  const [reviews, setReviews] = useState<SiteReview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
          .from('site_reviews')
          .select('*')
          .eq('is_published', true)
          .order('sort_order')
          .order('created_at', { ascending: false });
      if (data) setReviews(data as unknown as SiteReview[]);
      setLoading(false);
    };
    fetch();
  }, []);

  return { reviews, loading };
}