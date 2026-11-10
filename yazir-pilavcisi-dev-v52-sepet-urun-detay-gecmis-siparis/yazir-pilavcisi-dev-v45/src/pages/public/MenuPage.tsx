import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useMenu, type MenuProduct } from '@/hooks/useMenu';
import { useCartStore } from '@/stores/cartStore';
import { discountedPrice, slugify, tl } from '@/lib/helpers';
import { categoryIcon } from '@/lib/categoryIcon';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Icon from '@/components/ui/Icon';
import ProductCard from '@/components/menu/ProductCard';
import ProductDetailModal from '@/components/menu/ProductDetailModal';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';

export default function MenuPage() {
  const { categories, products, loading } = useMenu();
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const items = useCartStore((s) => s.items);
  const tableToken = useCartStore((s) => s.tableToken);
  const user = useAuthStore((s) => s.user);
  const [referral, setReferral] = useState<any>(null);
  useEffect(() => {
    if (!user) { setReferral(null); return; }
    const refresh = () => supabase.rpc('my_referral').then(({data,error}) => { if (!error) setReferral(data || null); });
    refresh();
    const channel = supabase.channel(`referral-menu-${user.id}`).on('postgres_changes',{event:'*',schema:'public',table:'referral_campaigns'},refresh).subscribe();
    const timer = window.setInterval(refresh, 30000);
    return () => { window.clearInterval(timer); supabase.removeChannel(channel); };
  }, [user]);
  const productDiscount = referral?.is_active && referral.scope === 'product' ? Number(referral.discount || 0) : 0;
  const count = useCartStore((s) => s.count());
  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const displayedTotal = productDiscount > 0
    ? items.reduce((sum, item) => sum + discountedPrice(item.price, productDiscount) * item.quantity, 0)
    : total;

  const [selected, setSelected] = useState<MenuProduct | null>(null);

  // /menu/urun-slug adresi doğrudan ürün detayını açar.
  useEffect(() => {
    if (!slug || loading) { if (!slug) setSelected(null); return; }
    const productId = new URLSearchParams(location.search).get('productId');
    const product = (productId ? products.find((p) => p.id === productId) : undefined) || products.find((p) => (p.slug || slugify(p.name)) === slug);
    if (product) setSelected(product);
    else navigate('/menu', { replace: true });
  }, [slug, location.search, loading, products, navigate]);

  const openProduct = (product: MenuProduct) => {
    const productSlug = product.slug || slugify(product.name);
    setSelected(product);
    navigate(`/menu/${productSlug}`);
  };
  const closeProduct = () => { setSelected(null); if (slug) navigate('/menu'); };
  const [q, setQ] = useState('');
  const [active, setActive] = useState<string>('');
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const groups = useMemo(() => {
    const t = q.trim().toLocaleLowerCase('tr');
    return categories
      .map((c) => ({
        cat: c,
        list: products.filter(
          (p) => p.category_id === c.id && (!t || p.name.toLocaleLowerCase('tr').includes(t) || (p.description || '').toLocaleLowerCase('tr').includes(t)),
        ),
      }))
      .filter((g) => g.list.length > 0);
  }, [categories, products, q]);

  // Kaydırırken hangi kategorinin görünür olduğunu vurgula
  useEffect(() => {
    if (!groups.length || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.getAttribute('data-cat') || '');
      },
      { rootMargin: '-140px 0px -60% 0px', threshold: 0 },
    );
    Object.values(sectionRefs.current).forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, [groups]);

  if (loading) return <LoadingSpinner />;

  const goTo = (id: string) => {
    setActive(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <main className="page menu-page">
      <div className="page-head">
        <div>
          <h1>Menümüz</h1>
          <p className="muted" style={{ margin: 0 }}>
            Kategorilere göre seçin, sepete ekleyin. {products.length} çeşit.
          </p>
        </div>
        {tableToken && (
          <span className="pill ok" title="Bu cihazdan verilen sipariş masanıza işlenir">
            <Icon name="grid" size={15} /> Masa siparişi aktif
          </span>
        )}
      </div>

      <div className="menu-tools">
        <div className="searchbox">
          <Icon name="search" size={18} />
          <input type="search" placeholder="Menüde ara… (ör. tavuk, ayran)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Menüde ara" />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label="Aramayı temizle"><Icon name="x" size={15} /></button>
          )}
        </div>
        <div className="catnav" role="tablist" aria-label="Kategoriler">
          {groups.map(({ cat, list }) => (
            <button key={cat.id} type="button" role="tab" aria-selected={active === cat.id} className={active === cat.id ? 'on' : ''} onClick={() => goTo(cat.id)}>
              <Icon name={categoryIcon(cat.name)} size={16} />
              {cat.name}
              <i>{list.length}</i>
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 && (
        <div className="empty-state">
          <Icon name="search" size={34} />
          <h3>Sonuç bulunamadı</h3>
          <p className="muted">“{q}” için ürün yok. Farklı bir kelime deneyin.</p>
        </div>
      )}

      {groups.map(({ cat, list }) => (
        <section
          key={cat.id}
          className="catsec"
          data-cat={cat.id}
          ref={(el) => {
            sectionRefs.current[cat.id] = el;
          }}
        >
          <header className="catsec-head">
            <span className="catsec-ico"><Icon name={categoryIcon(cat.name)} size={22} /></span>
            <h2>{cat.name}</h2>
            <span className="chip">{list.length} ürün</span>
            <span className="catsec-line" />
          </header>
          <div className="grid">
            {list.map((p) => (
              <ProductCard key={p.id} p={p} onOpen={openProduct} discountPercent={productDiscount} />
            ))}
          </div>
        </section>
      ))}

      {count > 0 && (
        <Link to="/siparis" className="cartbar">
          <span className="cartbar-l"><Icon name="cart" size={20} /> {count} ürün</span>
          <b style={{display:'flex',flexDirection:'column',alignItems:'flex-end',lineHeight:1.2}}>{productDiscount > 0 && <small style={{textDecoration:'line-through',opacity:.65,fontWeight:400}}>{tl(total)}</small>}<span>{tl(displayedTotal)}</span></b>
          <span className="cartbar-r">Sepeti gör <Icon name="arrowRight" size={17} /></span>
        </Link>
      )}

      <ProductDetailModal product={selected} onClose={closeProduct} discountPercent={productDiscount} />
    </main>
  );
}
