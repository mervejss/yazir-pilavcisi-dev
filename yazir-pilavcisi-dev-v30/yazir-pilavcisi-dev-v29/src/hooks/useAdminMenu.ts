import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Category, Product, ProductVariant, ProductOptionGroup, ProductOption } from '@/types/database';

export interface AdminProduct extends Product {
  variants: ProductVariant[];
  categoryName: string;
  optionGroups: ProductOptionGroup[];
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
      const [catRes, prodRes, varRes, grpRes, optRes] = await Promise.all([
        supabase.from('categories').select('*').order('sort_order'),
        supabase.from('products').select('*').order('sort_order'),
        supabase.from('product_variants').select('*').order('sort_order'),
        supabase.from('product_option_groups').select('*').order('sort_order'),
        supabase.from('product_options').select('*').order('sort_order'),
      ]);
      // 16_menu_extras_backup_audit.sql çalıştırılmadıysa tablolar yoktur → boş kabul et
      const groups = (grpRes.error ? [] : grpRes.data || []) as unknown as ProductOptionGroup[];
      const opts = (optRes.error ? [] : optRes.data || []) as unknown as ProductOption[];
      const cats = (catRes.data || []) as unknown as Category[];
      const prods = (prodRes.data || []) as unknown as Product[];
      const vars = (varRes.data || []) as unknown as ProductVariant[];
      setCategories(cats);
      setProducts(
        prods.map((p) => ({
          ...p,
          variants: vars.filter((v) => v.product_id === p.id),
          categoryName: cats.find((c) => c.id === p.category_id)?.name || '—',
          optionGroups: groups
            .filter((g) => g.product_id === p.id)
            .map((g) => ({ ...g, options: opts.filter((o) => o.group_id === g.id) })),
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_option_groups' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_options' }, () => fetchAll())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAll]);

  return { categories, products, loading, refetch: fetchAll };
}
