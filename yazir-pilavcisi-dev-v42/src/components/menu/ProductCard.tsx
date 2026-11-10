import { useState } from 'react';
import { useCartStore } from '@/stores/cartStore';
import { tl } from '@/lib/helpers';
import type { MenuProduct } from '@/hooks/useMenu';
import ProductImage from '@/components/ui/ProductImage';
import Icon from '@/components/ui/Icon';
import { BadgeRow } from '@/components/menu/ProductExtras';
import toast from 'react-hot-toast';

export default function ProductCard({ p, onOpen }: { p: MenuProduct; onOpen: (p: MenuProduct) => void }) {
  const addItem = useCartStore((s) => s.addItem);
  const [vi, setVi] = useState(0);
  const variant = p.variants[vi];

  const add = () => {
    if (!variant) return;
    addItem(p, variant);
    toast.success(`${p.name} sepete eklendi`, { icon: '🛒', duration: 1600 });
  };

  return (
    <article className={`pcard${p.is_sold_out ? ' out' : ''}`}>
      <button type="button" className="ph" onClick={() => onOpen(p)} aria-label={`${p.name} detay`}>
        <ProductImage imagePath={p.image_path} emoji={p.emoji} name={p.name} />
        {p.is_sold_out && <span className="ribbon">Tükendi</span>}
        {!p.is_sold_out && p.is_daily && <span className="ribbon day">Günün ürünü</span>}
      </button>
      <div className="pbody">
        <h3>{p.name}</h3>
        <BadgeRow badges={p.badges} />
        {p.description && <p className="muted clamp2">{p.description}</p>}
        {p.variants.length > 1 && (
          <div className="seg">
            {p.variants.map((v, i) => (
              <button type="button" key={v.id} className={i === vi ? 'on' : ''} onClick={() => setVi(i)}>
                {v.name}
              </button>
            ))}
          </div>
        )}
        <div className="prow">
          <b className="price">{tl(variant?.price || 0)}</b>
          <button type="button" className="btn gold sm" disabled={p.is_sold_out || !variant} onClick={add}>
            <Icon name="plus" size={15} /> {p.is_sold_out ? 'Tükendi' : 'Sepete ekle'}
          </button>
        </div>
      </div>
    </article>
  );
}
