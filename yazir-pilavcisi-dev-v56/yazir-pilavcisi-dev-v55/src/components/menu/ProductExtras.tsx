import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { ALLERGENS, BADGES, tagInfo } from '@/lib/menuTags';
import { tl } from '@/lib/helpers';
import type { ProductOptionGroup } from '@/types/database';

/** Kart üzerinde küçük rozetler */
export function BadgeRow({ badges }: { badges?: string[] | null }) {
  if (!badges || badges.length === 0) return null;
  return (
    <div className="tag-row">
      {badges.map((b) => {
        const t = tagInfo(BADGES, b);
        return (
          <span key={b} className={`tag-badge b-${t.key}`}>
            {t.emoji} {t.label}
          </span>
        );
      })}
    </div>
  );
}

/** Detay penceresi: alerjen uyarısı + ürün seçenekleri (ekstra et, soğansız…) */
export default function ProductExtras({ productId, allergens }: { productId: string; allergens?: string[] | null }) {
  const [groups, setGroups] = useState<ProductOptionGroup[]>([]);

  useEffect(() => {
    let off = false;
    supabase
      .from('product_option_groups')
      .select('*, product_options(*)')
      .eq('product_id', productId)
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data, error }) => {
        if (off || error || !data) return;
        setGroups(
          (data as any[]).map((g) => ({
            ...g,
            options: ((g.product_options || []) as any[]).filter((o) => o.is_active).sort((a, b) => a.sort_order - b.sort_order),
          })),
        );
      });
    return () => {
      off = true;
    };
  }, [productId]);

  const hasAllergens = allergens && allergens.length > 0;
  if (!hasAllergens && groups.length === 0) return null;

  return (
    <div className="extras">
      {hasAllergens && (
        <div className="allergen-box" role="note">
          <b>⚠️ Alerjen uyarısı</b>
          <div className="tag-row">
            {allergens!.map((a) => {
              const t = tagInfo(ALLERGENS, a);
              return (
                <span key={a} className="tag-allergen">
                  {t.emoji} {t.label}
                </span>
              );
            })}
          </div>
        </div>
      )}
      {groups.map((g) => (
        <div key={g.id} className="opt-group">
          <b>
            {g.name} <small className="muted">{g.is_required ? '(zorunlu)' : '(isteğe bağlı)'}{g.max_select > 1 ? ` · en fazla ${g.max_select}` : ''}</small>
          </b>
          <div className="tag-row">
            {(g.options || []).map((o) => (
              <span key={o.id} className="opt-chip">
                {o.name}
                {Number(o.price_delta) !== 0 && <em>{Number(o.price_delta) > 0 ? '+' : ''}{tl(Number(o.price_delta))}</em>}
              </span>
            ))}
          </div>
        </div>
      ))}
      {groups.length > 0 && <p className="muted small">Seçenek tercihlerinizi sipariş notuna yazabilirsiniz.</p>}
    </div>
  );
}
