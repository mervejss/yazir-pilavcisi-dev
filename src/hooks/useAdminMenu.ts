import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Category, Product, ProductVariant } from '@/types/database';

export interface AdminProduct extends Product {
  variants: ProductVariant[];
  categoryName: string;
}

/**
 * Yönetici menü verisi: pasif (gizli) ürün, kategori ve porsiyonlar DAHİL (müşteri tarafındaki useMenu bunları saklar).
 */
export function useAdminMenu() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [catRes, prodRes, varRes] = await Promise.all([
        supabase.from('categories').select('*').order('sort_order'),
        supabase.from('products').select('*').order('sort_order'),
        supabase.from('product_variants').select('*').order('sort_order'),
      ]);
      const cats = (catRes.data || []) as unknown as Category[];
      const prods = (prodRes.data || []) as unknown as Product[];
      const vars = (varRes.data || []) as unknown as ProductVariant[];
      setCategories(cats);
      setProducts(
        prods.map((p) => ({
          ...p,
          variants: vars.filter((v) => v.product_id === p.id),
          categoryName: cats.find((c) => c.id === p.category_id)?.name || '—',
        })),
      );
    } catch (err) {
      console.error('Admin menu fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel(`admin-menu-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_variants' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => fetchAll())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAll]);

  return { categories, products, loading, refetch: fetchAll };
}
