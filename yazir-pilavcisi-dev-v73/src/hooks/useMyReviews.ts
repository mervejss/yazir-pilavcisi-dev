import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

export interface ReviewableOrder {
  order_id: string;
  order_no: number;
  order_type: string;
  created_at: string;
  delivered_at: string | null;
  total: number;
  items: string | null;
  review_id: string | null;
  taste_rating: number | null;
  delivery_rating: number | null;
  service_rating: number | null;
  comment: string | null;
  is_published: boolean | null;
  admin_reply: string | null;
  review_updated_at: string | null;
}

/** Giriş yapmış müşterinin teslim edilmiş WEB siparişleri ve bunlara yazdığı yorumlar */
export function useMyReviews() {
  const { user } = useAuthStore();
  const [rows, setRows] = useState<ReviewableOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const refetch = useCallback(async () => {
    if (!user) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.rpc('my_reviewable_orders');
    if (error) setUnavailable(true);
    else {
      setUnavailable(false);
      setRows(((data as any[]) || []).map((r) => ({
        ...r,
        total: Number(r.total),
        taste_rating: r.taste_rating != null ? Number(r.taste_rating) : null,
        delivery_rating: r.delivery_rating != null ? Number(r.delivery_rating) : null,
        service_rating: r.service_rating != null ? Number(r.service_rating) : null,
      })) as ReviewableOrder[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const pending = rows.filter((r) => !r.review_id);
  const done = rows.filter((r) => !!r.review_id);
  return { rows, pending, done, loading, unavailable, refetch };
}
