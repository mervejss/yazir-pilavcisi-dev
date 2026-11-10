import ProductExtras, { BadgeRow } from '@/components/menu/ProductExtras';
import { useEffect, useState } from 'react';
import { useCartStore } from '@/stores/cartStore';
import { discountedPrice, tl } from '@/lib/helpers';
import type { MenuProduct } from '@/hooks/useMenu';
import Modal from '@/components/ui/Modal';
import ProductImage from '@/components/ui/ProductImage';
import Icon from '@/components/ui/Icon';
import toast from 'react-hot-toast';

export default function ProductDetailModal({ product, onClose, discountPercent = 0 }: { product: MenuProduct | null; onClose: () => void; discountPercent?: number }) {
  const addItem = useCartStore((s) => s.addItem);
  const [vi, setVi] = useState(0);

  useEffect(() => setVi(0), [product?.id]);

  if (!product) return null;
  const variant = product.variants[vi];

  return (
    <Modal open={!!product} onClose={onClose}>
      <div className="ph big">
        <ProductImage imagePath={product.image_path} emoji={product.emoji} name={product.name} />
      </div>
      <h2 style={{ marginTop: '1rem' }}>{product.name}</h2>
      <BadgeRow badges={product.badges} />
      <p>{product.description || 'Geleneksel lezzet, sıcacık servis edilir.'}</p>
      <ProductExtras productId={product.id} allergens={product.allergens} />
      {product.variants.length > 1 && (
        <div className="seg" style={{ marginBottom: '0.8rem' }}>
          {product.variants.map((v, i) => (
            <button type="button" key={v.id} className={i === vi ? 'on' : ''} onClick={() => setVi(i)}>
              {v.name} · {tl(discountPercent > 0 ? discountedPrice(v.price, discountPercent) : v.price)}
            </button>
          ))}
        </div>
      )}
      <div className="macros">
        <div><b>{product.kcal}</b><span>kcal</span></div>
        <div><b>{product.protein_g} g</b><span>protein</span></div>
        <div><b>{product.carb_g} g</b><span>karbonhidrat</span></div>
      </div>
      <p className="muted small">Besin değerleri yaklaşık olup porsiyona göre değişebilir. Alerjen bilgisi için bize ulaşın.</p>
      {discountPercent > 0 && variant && <p style={{color:'var(--success)',fontWeight:700}}> %{discountPercent} referans indirimi · <span style={{textDecoration:'line-through',opacity:.6,color:'var(--text-muted)'}}>{tl(variant.price)}</span> → {tl(discountedPrice(variant.price, discountPercent))}</p>}
      <div className="prow">
        <button
          type="button"
          className="btn gold"
          disabled={product.is_sold_out || !variant}
          onClick={() => {
            if (variant) {
              addItem(product, variant);
              toast.success(`${product.name} sepete eklendi`, { icon: '🛒', duration: 1600 });
            }
            onClose();
          }}
        >
          <Icon name="cart" size={17} /> {product.is_sold_out ? 'Tükendi' : `Sepete ekle · ${tl(discountPercent > 0 && variant ? variant.price * (1-discountPercent/100) : variant?.price || 0)}`}
        </button>
        <button type="button" className="btn ghost" onClick={onClose}>Kapat</button>
      </div>
    </Modal>
  );
}
