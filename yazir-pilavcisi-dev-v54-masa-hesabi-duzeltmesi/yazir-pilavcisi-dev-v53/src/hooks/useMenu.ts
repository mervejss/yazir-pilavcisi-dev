import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Category, Product, ProductVariant } from '@/types/database';

export interface MenuProduct extends Product {
  variants: ProductVariant[];
  categoryName: string;
}

export function useMenu() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMenu = useCallback(async () => {
    try {
      const [catRes, prodRes, varRes] = await Promise.all([
        supabase
            .from('categories')
            .select('*')
            .eq('is_active', true)
            .order('sort_order'),
        supabase
            .from('products')
            .select('*')
            .eq('is_active', true)
            .order('sort_order'),
        supabase
            .from('product_variants')
            .select('*')
            .eq('is_active', true)
            .order('sort_order'),
      ]);

      const cats = (catRes.data || []) as unknown as Category[];
      const prods = (prodRes.data || []) as unknown as Product[];
      const vars = (varRes.data || []) as unknown as ProductVariant[];

      setCategories(cats);
      setProducts(
          prods.map((p) => ({
            ...p,
            variants: vars.filter((v) => v.product_id === p.id),
            categoryName: cats.find((c) => c.id === p.category_id)?.name || '',
          })),
      );
    } catch (err) {
      console.error('Menu fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMenu();

    const channelName = `menu-changes-${Math.random()}`;
    const channel = supabase.channel(channelName);

    channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => fetchMenu())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'product_variants' }, () => fetchMenu())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, () => fetchMenu())
        .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchMenu]);

  return { categories, products, loading, refetch: fetchMenu };
}