import { useState, useMemo } from 'react';
import { useMenu, type MenuProduct } from '@/hooks/useMenu';
import { useCartStore } from '@/stores/cartStore';
import { tl } from '@/lib/helpers';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ProductImage from '@/components/ui/ProductImage';
import toast from 'react-hot-toast';
import {
  UtensilsCrossed,
  ShoppingBag,
  Search,
  Flame,
  Sparkles,
  Info,
} from 'lucide-react';

export default function MenuPage() {
  const { categories, products, loading } = useMenu();
  const addItem = useCartStore((s) => s.addItem);

  // 'all' or specific category ID
  const [activeCat, setActiveCat] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selected, setSelected] = useState<MenuProduct | null>(null);
  const [vi, setVi] = useState<Record<string, number>>({});

  // Filter products by search and category
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = activeCat === 'all' || p.category_id === activeCat;
      const matchSearch =
        !searchQuery.trim() ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [products, activeCat, searchQuery]);

  // Group products by category when in 'all' view and not searching
  const groupedProducts = useMemo(() => {
    if (activeCat !== 'all' || searchQuery.trim()) return null;

    return categories.map((cat) => ({
      category: cat,
      items: products.filter((p) => p.category_id === cat.id),
    })).filter((group) => group.items.length > 0);
  }, [categories, products, activeCat, searchQuery]);

  if (loading) return <LoadingSpinner />;

  const handleAddToCart = (product: MenuProduct, variantIndex: number) => {
    const variant = product.variants[variantIndex] || product.variants[0];
    if (variant) {
      addItem(product, variant);
      toast.success(`${product.name} (${variant.name}) sepete eklendi!`, {
        icon: '🛍️',
        style: {
          borderRadius: '10px',
          background: '#1A1712',
          color: '#FAF8F5',
          border: '1px solid #D4AF37',
        },
      });
    }
  };

  const renderProductCard = (p: MenuProduct) => {
    const idx = vi[p.id] || 0;
    const variant = p.variants[idx] || p.variants[0];

    return (
      <article key={p.id} className={`pcard ${p.is_sold_out ? 'out' : ''}`}>
        <button
          type="button"
          className="ph"
          onClick={() => setSelected(p)}
          aria-label={`${p.name} detaylarını gör`}
        >
          <ProductImage imagePath={p.image_path} emoji={p.emoji} name={p.name} />
          {p.kcal > 0 && (
            <span
              style={{
                position: 'absolute',
                top: 10,
                left: 10,
                background: 'rgba(0,0,0,0.65)',
                backdropFilter: 'blur(4px)',
                color: '#FAF8F5',
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '0.2em 0.6em',
                borderRadius: '999px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
              }}
            >
              <Flame size={12} style={{ color: 'var(--gold)' }} />
              {p.kcal} kcal
            </span>
          )}
        </button>

        <div className="pbody">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
            <h3>{p.name}</h3>
            <button
              type="button"
              onClick={() => setSelected(p)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              title="Besin Değerleri ve Detay"
            >
              <Info size={16} />
            </button>
          </div>

          {p.description && <p className="muted">{p.description}</p>}

          {/* Varyant / Porsiyon Butonları */}
          {p.variants.length > 1 && (
            <div className="seg">
              {p.variants.map((v, i) => (
                <button
                  type="button"
                  key={v.id}
                  className={i === idx ? 'on' : ''}
                  onClick={() => setVi({ ...vi, [p.id]: i })}
                >
                  {v.name}
                </button>
              ))}
            </div>
          )}

          <div className="prow">
            <div>
              <span className="small muted" style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600 }}>
                {variant?.name}
              </span>
              <b className="price">{tl(variant?.price || 0)}</b>
            </div>

            <button
              type="button"
              className="btn gold sm"
              disabled={p.is_sold_out}
              onClick={() => handleAddToCart(p, idx)}
            >
              <ShoppingBag size={15} />
              <span>{p.is_sold_out ? 'Tükendi' : 'Sepete Ekle'}</span>
            </button>
          </div>
        </div>
      </article>
    );
  };

  return (
    <main className="page">
      {/* Başlık & Arama Çubuğu */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', margin: 0 }}>
            <UtensilsCrossed size={36} style={{ color: 'var(--gold)' }} />
            <span>Nefis Lezzet Menüsü</span>
          </h1>
          <p className="muted" style={{ margin: '0.3rem 0 0', fontSize: '1.05rem' }}>
            Hakiki tereyağı ile tane tane dökülen taze lezzetler.
          </p>
        </div>

        {/* Hızlı Arama */}
        <div style={{ position: 'relative', width: '100%', maxWidth: '320px' }}>
          <Search
            size={18}
            style={{
              position: 'absolute',
              left: '14px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder="Ürün veya lezzet ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.7em 1em 0.7em 2.5em',
              borderRadius: '999px',
              border: '1.5px solid var(--line-strong)',
              background: 'var(--card-bg)',
              color: 'var(--text)',
              fontSize: '0.92rem',
            }}
          />
        </div>
      </div>

      {/* Kategori Seçim Sekmeleri (Altın Sarısı Tasarım) */}
      <div className="seg wide">
        <button
          type="button"
          className={activeCat === 'all' ? 'on' : ''}
          onClick={() => setActiveCat('all')}
        >
          <Sparkles size={16} style={{ display: 'inline', marginRight: '6px' }} />
          Tüm Menü ({products.length})
        </button>

        {categories.map((c) => {
          const count = products.filter((p) => p.category_id === c.id).length;
          return (
            <button
              type="button"
              key={c.id}
              className={c.id === activeCat ? 'on' : ''}
              onClick={() => setActiveCat(c.id)}
            >
              {c.name} ({count})
            </button>
          );
        })}
      </div>

      {/* Ürün Listesi - Kategori Kategori Düzenli Görünüm */}
      {groupedProducts ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3.5rem' }}>
          {groupedProducts.map(({ category, items }) => (
            <section key={category.id}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingBottom: '0.8rem',
                  borderBottom: '2px solid var(--gold-border)',
                  marginBottom: '1.8rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div
                    style={{
                      width: '12px',
                      height: '24px',
                      background: 'var(--gold-gradient)',
                      borderRadius: '4px',
                    }}
                  />
                  <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>{category.name}</h2>
                  <span
                    style={{
                      background: 'var(--gold-bg)',
                      color: 'var(--gold)',
                      border: '1px solid var(--gold-border)',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      padding: '0.2em 0.7em',
                      borderRadius: '999px',
                    }}
                  >
                    {items.length} çeşit
                  </span>
                </div>
              </div>

              <div className="grid">
                {items.map((p) => renderProductCard(p))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div>
          {filteredProducts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'var(--card-bg)', borderRadius: 'var(--r)', border: '1px dashed var(--line-strong)' }}>
              <p style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-muted)' }}>
                Aradığınız kriterlere uygun ürün bulunamadı.
              </p>
              <button
                type="button"
                className="btn gold sm"
                style={{ marginTop: '1rem' }}
                onClick={() => {
                  setActiveCat('all');
                  setSearchQuery('');
                }}
              >
                Tüm Menüyü Göster
              </button>
            </div>
          ) : (
            <div className="grid">
              {filteredProducts.map((p) => renderProductCard(p))}
            </div>
          )}
        </div>
      )}

      {/* Ürün Detay & Besin Değerleri Modalı */}
      <Modal open={!!selected} onClose={() => setSelected(null)}>
        {selected && (
          <>
            <div className="ph big" style={{ padding: 0, overflow: 'hidden', borderRadius: '12px', marginBottom: '1rem' }}>
              <ProductImage imagePath={selected.image_path} emoji={selected.emoji} name={selected.name} />
            </div>

            <h2>{selected.name}</h2>
            <p className="muted" style={{ fontSize: '1.05rem' }}>
              {selected.description || 'Geleneksel lezzet, sıcacık ve taze servis.'}
            </p>

            <div
              className="macros"
              style={{
                display: 'flex',
                gap: '1rem',
                margin: '1.4rem 0',
                background: 'var(--surface)',
                padding: '1.2rem',
                borderRadius: '12px',
                border: '1px solid var(--line)',
              }}
            >
              <div>
                <b>{selected.kcal}</b>
                <span className="small muted" style={{ display: 'block' }}>kcal</span>
              </div>
              <div>
                <b>{selected.protein_g}g</b>
                <span className="small muted" style={{ display: 'block' }}>protein</span>
              </div>
              <div>
                <b>{selected.carb_g}g</b>
                <span className="small muted" style={{ display: 'block' }}>karbonhidrat</span>
              </div>
            </div>

            <p className="muted small">
              * Besin değerleri yaklaşık porsiyona göre hesaplanmıştır.
            </p>

            <div className="prow" style={{ marginTop: '1.5rem', display: 'flex', gap: '0.8rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn ghost" onClick={() => setSelected(null)}>
                Kapat
              </button>
              <button
                type="button"
                className="btn gold"
                onClick={() => {
                  const idx = vi[selected.id] || 0;
                  handleAddToCart(selected, idx);
                  setSelected(null);
                }}
              >
                <ShoppingBag size={18} />
                <span>Sepete Ekle — {tl((selected.variants[vi[selected.id] || 0] || selected.variants[0])?.price || 0)}</span>
              </button>
            </div>
          </>
        )}
      </Modal>
    </main>
  );
}
