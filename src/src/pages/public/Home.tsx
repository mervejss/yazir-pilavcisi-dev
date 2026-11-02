import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMenu, type MenuProduct } from '@/hooks/useMenu';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { useReviews } from '@/hooks/useReviews';
import { useCartStore } from '@/stores/cartStore';
import { isOpenNow, tl } from '@/lib/helpers';
import Stars from '@/components/ui/Stars';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ProductImage from '@/components/ui/ProductImage';
import toast from 'react-hot-toast';
import {
  ShoppingBag,
  Phone,
  Flame,
  Clock,
  Sparkles,
  Award,
  ChevronRight,
  CheckCircle2,
  Utensils,
  Star,
} from 'lucide-react';

function ProductCard({ p, onOpen }: { p: MenuProduct; onOpen: (p: MenuProduct) => void }) {
  const addItem = useCartStore((s) => s.addItem);
  const [vi, setVi] = useState(0);
  const variant = p.variants[vi] || p.variants[0];

  const handleAddToCart = () => {
    if (variant) {
      addItem(p, variant);
      toast.success(`${p.name} sepete eklendi!`, {
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

  return (
    <article className={`pcard ${p.is_sold_out ? 'out' : ''}`}>
      <button
        type="button"
        className="ph"
        onClick={() => onOpen(p)}
        aria-label={`${p.name} detaylarını incele`}
      >
        <ProductImage imagePath={p.image_path} emoji={p.emoji} name={p.name} />
      </button>

      <div className="pbody">
        <h3>{p.name}</h3>
        {p.description && <p className="muted">{p.description}</p>}

        {p.variants.length > 1 && (
          <div className="seg">
            {p.variants.map((v, i) => (
              <button
                type="button"
                key={v.id}
                className={i === vi ? 'on' : ''}
                onClick={() => setVi(i)}
              >
                {v.name}
              </button>
            ))}
          </div>
        )}

        <div className="prow">
          <b className="price">{tl(variant?.price || 0)}</b>
          <button
            type="button"
            className="btn gold sm"
            disabled={p.is_sold_out}
            onClick={handleAddToCart}
          >
            <ShoppingBag size={15} />
            <span>{p.is_sold_out ? 'Tükendi' : 'Sepete Ekle'}</span>
          </button>
        </div>
      </div>
    </article>
  );
}

function DetailModal({ product, onClose }: { product: MenuProduct | null; onClose: () => void }) {
  const addItem = useCartStore((s) => s.addItem);

  if (!product) return null;
  const variant = product.variants[0];

  const handleAdd = () => {
    if (variant) {
      addItem(product, variant);
      toast.success(`${product.name} sepete eklendi!`);
      onClose();
    }
  };

  return (
    <Modal open={!!product} onClose={onClose}>
      <div className="ph big" style={{ padding: 0, overflow: 'hidden', borderRadius: '12px', marginBottom: '1rem' }}>
        <ProductImage imagePath={product.image_path} emoji={product.emoji} name={product.name} />
      </div>
      <h2>{product.name}</h2>
      <p className="muted" style={{ fontSize: '1.05rem' }}>
        {product.description || 'Geleneksel tereyağlı lezzet, tane tane pirinç, sıcacık servis edilir.'}
      </p>

      <div className="macros" style={{ display: 'flex', gap: '1rem', margin: '1.4rem 0', background: 'var(--surface)', padding: '1rem', borderRadius: '12px' }}>
        <div>
          <b>{product.kcal}</b>
          <span className="small muted" style={{ display: 'block' }}>kcal</span>
        </div>
        <div>
          <b>{product.protein_g}g</b>
          <span className="small muted" style={{ display: 'block' }}>protein</span>
        </div>
        <div>
          <b>{product.carb_g}g</b>
          <span className="small muted" style={{ display: 'block' }}>karbonhidrat</span>
        </div>
      </div>

      <p className="muted small">
        * Besin değerleri yaklaşık porsiyona göre hesaplanmıştır. Alerjen içeriği için bize ulaşabilirsiniz.
      </p>

      <div className="prow" style={{ marginTop: '1.5rem', display: 'flex', gap: '0.8rem', justifyContent: 'flex-end' }}>
        <button type="button" className="btn ghost" onClick={onClose}>
          Kapat
        </button>
        <button type="button" className="btn gold" onClick={handleAdd}>
          <ShoppingBag size={18} />
          <span>Sepete Ekle — {tl(variant?.price || 0)}</span>
        </button>
      </div>
    </Modal>
  );
}

export default function Home() {
  const { products, loading } = useMenu();
  const { settings, hours } = useBusinessSettings();
  const { reviews } = useReviews();
  const [selected, setSelected] = useState<MenuProduct | null>(null);
  const open = isOpenNow(hours);

  if (loading) return <LoadingSpinner />;

  const featured = products.filter((p) => !p.is_daily).slice(0, 4);

  return (
    <main>
      {/* Lüks Hero Bölümü */}
      <section className="hero">
        <div className="hero-txt">
          <span className={`pill ${open ? 'ok' : 'no'}`}>
            <Clock size={14} />
            <span>{open ? 'Şu An Siparişe Açık' : 'Şu An Kapalı (Yarın 11:30)'}</span>
          </span>

          <h1>Tane Tane Tereyağlı Pilav, 15 Dakikada Kapında!</h1>

          <p>
            Konya Selçuklu Yazır'ın meşhur lezzeti. Özel pişirme tekniğiyle tane tane ayrılan pirinç, didiklenmiş taze tavuk,
            kavurma ve enfes tereyağı kokusu. Gece 03:00'e kadar sıcak servis.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem', alignItems: 'center' }}>
            <Link className="btn gold lg" to="/siparis">
              <ShoppingBag size={20} />
              <span>Hemen Sipariş Ver</span>
            </Link>
            <a
              className="btn ghost lg"
              href={`tel:${settings?.phone?.replace(/\s/g, '') || '05403314142'}`}
            >
              <Phone size={18} />
              <span>{settings?.phone || '0540 331 41 42'}</span>
            </a>
          </div>

          {/* Hızlı Avantajlar */}
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '2.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.9rem', fontWeight: 600 }}>
              <Flame size={18} style={{ color: 'var(--gold)' }} />
              <span>Sıcak & Taze Teslimat</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.9rem', fontWeight: 600 }}>
              <Clock size={18} style={{ color: 'var(--gold)' }} />
              <span>15-25 Dk Ortalama</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.9rem', fontWeight: 600 }}>
              <Award size={18} style={{ color: 'var(--gold)' }} />
              <span>%100 Hakiki Tereyağı</span>
            </div>
          </div>
        </div>

        {/* Hero Sağ Vitrin */}
        <div className="hero-card">
          <div className="hero-image-frame" style={{ width: '100%', maxWidth: '440px' }}>
            <img
              src="/logo.jpg"
              alt="Yazır Pilavcısı Vitrin"
              style={{ width: '100%', display: 'block', borderRadius: 'var(--r-lg)' }}
            />
          </div>

          <div className="hero-badge-floating">
            <Sparkles size={28} style={{ color: 'var(--gold)' }} />
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--gold-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Günün Menüsü
              </div>
              <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>Tavuk Pilav + Ayran</div>
              <div style={{ color: 'var(--gold)', fontWeight: 800, fontSize: '1.2rem' }}>130 ₺</div>
            </div>
          </div>
        </div>
      </section>

      {/* Çok Tercih Edilenler / Öne Çıkanlar */}
      <section className="sec">
        <div className="sec-h">
          <h2>
            <Utensils size={24} style={{ color: 'var(--gold)' }} />
            <span>En Sevilen Lezzetlerimiz</span>
          </h2>
          <Link to="/menu">
            <span>Tüm Menüyü İncele</span>
            <ChevronRight size={18} />
          </Link>
        </div>

        <div className="grid">
          {featured.map((p) => (
            <ProductCard key={p.id} p={p} onOpen={setSelected} />
          ))}
        </div>
      </section>

      {/* Nasıl Sipariş Verilir? */}
      <section className="sec alt">
        <div>
          <div className="sec-h" style={{ border: 0, paddingBottom: 0, marginBottom: '1rem' }}>
            <h2>Nasıl Sipariş Verebilirsiniz?</h2>
          </div>
          <div className="steps">
            <div>
              <b className="step-num">1</b>
              <h3>Menüden Seçin</h3>
              <p className="muted">
                Tavuklu, kavurmalı veya kuru fasulyeli pilavınızı ve içeceklerinizi sepetinize ekleyin.
              </p>
            </div>
            <div>
              <b className="step-num">2</b>
              <h3>Adres & Konum Paylaşın</h3>
              <p className="muted">
                İster açık adresinizi yazın, ister tek tıkla konumunuzu gönderin. En hızlı rotayı seçelim.
              </p>
            </div>
            <div>
              <b className="step-num">3</b>
              <h3>Kapıda veya Masada Ödeyin</h3>
              <p className="muted">
                Nakit, kredi kartı veya IBAN ile güvenle ödeyin. Kuryemiz sıcak sıcacık teslim etsin.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Toplu Sipariş / Mevlit / Cemiyet Banner */}
      <section className="sec">
        <div className="sec bulk">
          <div>
            <h2>Cenaze, Mevlit ve Özel Günler İçin Toplu Yemek</h2>
            <p>
              10 kişiden 1000 kişiye kadar özel sıcak termobox ambalajlarda, ayranı ve tatlısıyla vaktinde teslim ediyoruz.
            </p>
          </div>
          <Link className="btn gold lg" to="/toplu" style={{ flexShrink: 0 }}>
            Toplu Yemek Talebi Oluştur
          </Link>
        </div>
      </section>

      {/* Müşteri Yorumları */}
      {reviews.length > 0 && (
        <section className="sec">
          <div className="sec-h">
            <h2>
              <Star size={24} style={{ color: 'var(--gold)', fill: 'var(--gold)' }} />
              <span>Müşterilerimizin Yorumları</span>
            </h2>
            <Link to="/yorumlar">
              <span>Tüm Yorumlar ({reviews.length})</span>
              <ChevronRight size={18} />
            </Link>
          </div>
          <div className="grid3">
            {reviews.slice(0, 3).map((r) => (
              <blockquote key={r.id}>
                <Stars rating={r.rating} />
                <p style={{ fontStyle: 'italic', fontSize: '1rem', lineHeight: 1.6 }}>"{r.body}"</p>
                <cite style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <CheckCircle2 size={16} style={{ color: 'var(--gold)' }} />
                  <span>{r.author}</span>
                </cite>
              </blockquote>
            ))}
          </div>
        </section>
      )}

      {/* Ürün Detay Modalı */}
      <DetailModal product={selected} onClose={() => setSelected(null)} />
    </main>
  );
}
