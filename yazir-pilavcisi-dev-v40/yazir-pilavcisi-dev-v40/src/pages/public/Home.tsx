import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMenu, type MenuProduct } from '@/hooks/useMenu';
import { categoryIcon } from '@/lib/categoryIcon';
import ProductCard from '@/components/menu/ProductCard';
import ProductDetailModal from '@/components/menu/ProductDetailModal';
import Icon from '@/components/ui/Icon';
import Logo from '@/components/ui/Logo';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { useReviews } from '@/hooks/useReviews';
import Stars from '@/components/ui/Stars';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { openWhatsApp } from '@/components/public/WhatsAppWidget';
import { FAQ, SITE_ADDRESS_FULL } from '@/lib/faq';
import { useCampaigns, CampaignCard } from '@/pages/public/CampaignsPage';

export default function Home() {
  const { items: campaigns } = useCampaigns();
  const { categories, products, loading } = useMenu();
  const { settings, status } = useBusinessSettings();
  const { reviews } = useReviews();
  const [selected, setSelected] = useState<MenuProduct | null>(null);
  const open = status.open;

  if (loading) return <LoadingSpinner />;

  const featured = products.filter((p) => !p.is_daily).slice(0, 4);

  return (
    <main>
      <section className="hero">
        <div className="hero-bg" aria-hidden="true" />
        <div className="hero-txt">
          <span className={`pill ${open ? 'ok' : 'no'}`}>
            <span className="live-dot" /> {status.label}
          </span>
          {!open && status.detail && <p className="closed-note">{status.detail}</p>}
          <h1>
            Yazır'da tane tane pilav, <span className="gold-text">15 dakikada</span> kapında.
          </h1>
          <p>
            Konya Yazır'ın pilav restoranı. Tavuk, et, körili, kuru fasulyeli… Gece 03.00'e kadar kendi kuryelerimizle sıcak sıcak getiriyoruz.
          </p>
          <div className="prow">
            <Link className="btn gold lg" to="/siparis">
              <Icon name="bag" size={19} /> Sipariş ver
            </Link>
            <Link className="btn ghost lg" to="/menu">
              <Icon name="utensils" size={19} /> Menüyü gör
            </Link>
            <a className="btn ghost lg" href={`tel:${settings?.phone?.replace(/\s/g, '') || '05403314142'}`}>
              <Icon name="phone" size={19} /> {settings?.phone || '0540 331 41 42'}
            </a>
          </div>
        </div>
        <div className="hero-card">
          <div className="hero-emblem"><Logo mark /></div>
          <div className="ticket">
            <small>Açılışa özel</small>
            <b>Tavuk pilav + ayran</b>
            <strong>170 ₺</strong>
          </div>
        </div>
      </section>

      <section className="perks">
        <div><Icon name="zap" size={26} /><b>Hızlı teslimat</b><span>Ortalama {settings?.estimated_delivery_min || 15}–{settings?.estimated_delivery_max || 25} dk</span></div>
        <div><Icon name="flame" size={26} /><b>Sıcacık servis</b><span>Siparişe özel hazırlanır</span></div>
        <div><Icon name="wallet" size={26} /><b>Kapıda ödeme</b><span>Nakit, kart veya IBAN</span></div>
        <div><Icon name="clock" size={26} /><b>Gece 03:00'e kadar</b><span>Geç saatte de yanınızdayız</span></div>
      </section>

      {categories.length > 0 && (
        <section className="sec">
          <div className="sec-h">
            <h2>Kategoriler</h2>
            <Link to="/menu">Tüm menü <Icon name="arrowRight" size={16} /></Link>
          </div>
          <div className="catcards">
            {categories.map((c) => (
              <Link key={c.id} to="/menu" className="catcard">
                <span className="catcard-ico"><Icon name={categoryIcon(c.name)} size={26} /></span>
                <b>{c.name}</b>
                <small>{products.filter((p) => p.category_id === c.id).length} ürün</small>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="sec">
        <div className="sec-h">
          <h2>Çok sipariş edilenler</h2>
          <Link to="/menu">Tüm menü <Icon name="arrowRight" size={16} /></Link>
        </div>
        <div className="grid">
          {featured.map((p) => (
            <ProductCard key={p.id} p={p} onOpen={setSelected} />
          ))}
        </div>
      </section>

      {campaigns.length > 0 && (
        <section className="sec">
          <div className="sec-h">
            <h2>
              <Icon name="tag" size={24} /> Kupon Kodları &amp; Kampanyalar
            </h2>
            <Link to="/kampanyalar">
              Tümünü gör <Icon name="arrowRight" size={16} />
            </Link>
          </div>
          <div className="camp-grid">
            {campaigns.slice(0, 3).map((c) => (
              <CampaignCard key={c.id} c={c} />
            ))}
          </div>
        </section>
      )}

      <section className="sec alt">
        <h2>Nasıl sipariş verilir?</h2>
        <div className="steps">
          <div><b>1</b><Icon name="utensils" size={26} className="step-ico" /><h3>Menüden seç</h3><p>Porsiyonu ve içeceği sepete ekle.</p></div>
          <div><b>2</b><Icon name="mapPin" size={26} className="step-ico" /><h3>Adresini ve konumunu gönder</h3><p>Adres yazabilir, konumunu da paylaşabilirsin.</p></div>
          <div><b>3</b><Icon name="wallet" size={26} className="step-ico" /><h3>Kapında ödeme</h3><p>Nakit, kart ya da IBAN. Platform tercih edersen linkler hazır.</p></div>
        </div>
      </section>

      <section className="sec seo-about" aria-labelledby="about-h">
        <h2 id="about-h">Yazır Pilavcısı: Konya Yazır'ın Pilav Restoranı</h2>
        <p>
          Yazır Pilavcısı, Konya'nın Selçuklu ilçesindeki Yazır mahallesinde, {SITE_ADDRESS_FULL} adresinde hizmet veren bir pilav restoranıdır.
          Tane tane, gevrek pilavı; tavuk, et, körili ve kuru fasulyeli çeşitleriyle siparişe özel hazırlar, soğumadan kapınıza getiririz.
          Yazır ve çevresinde pilav arayanlar için hem restoranda yemek hem de online paket servis ve gel-al seçeneği sunuyoruz.
        </p>
        <h3>Neden Yazır Pilavcısı?</h3>
        <ul className="seo-list">
          <li><b>Kendi kuryelerimiz:</b> siparişiniz aracı bir platform olmadan, doğrudan bizim ekibimizle gelir.</li>
          <li><b>Canlı sipariş takibi:</b> kuryenin haritadaki konumunu, kalan mesafeyi ve tahmini varış süresini takip sayfasından görürsünüz.</li>
          <li><b>Geç saate kadar açık:</b> gece 03:00'e kadar sipariş alırız; güncel saatler sayfanın altındadır.</li>
          <li><b>Kolay ödeme:</b> kapıda nakit, kart veya IBAN / havale.</li>
          <li><b>Hızlı iletişim:</b> telefon ve WhatsApp hattımızdan menü, adres ve teslimat süresi hakkında anında bilgi alabilirsiniz.</li>
        </ul>
        <h3>Toplu ve özel gün siparişleri</h3>
        <p>
          Cenaze, mevlit, düğün ve iş yeri yemekleri gibi kalabalık organizasyonlar için toplu pilav siparişi alıyoruz.
          Kişi sayısı ve teslim saatini <Link to="/toplu">toplu sipariş formuna</Link> yazmanız yeterli; sizi arayıp fiyat ve teslimatı netleştiririz.
        </p>
        <p>
          Menümüzü incelemek için <Link to="/menu">online menüye</Link>, restoranımız hakkında ayrıntılar için{' '}
          <Link to="/pilav-restorani">Yazır pilav restoranı sayfasına</Link> göz atabilir, müşterilerimizin <Link to="/yorumlar">yorumlarını</Link> okuyabilirsiniz.
        </p>
      </section>

      <section className="sec seo-faq" aria-labelledby="faq-h">
        <h2 id="faq-h">Sık Sorulan Sorular</h2>
        <div className="faq-list">
          {FAQ.map((f) => (
            <details key={f.q} className="faq-item">
              <summary><h3>{f.q}</h3></summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="sec wa-promo">
        <div>
          <h2>💬 WhatsApp ile hızlı sipariş</h2>
          <p>Menüyü iste, "açık mısınız?" diye sor, konumunu gönder — hazır mesajlarla tek dokunuşta yazın.</p>
        </div>
        <button type="button" className="btn wa-btn" onClick={openWhatsApp}><Icon name="message" size={18} /> WhatsApp'tan yaz</button>
      </section>

      <section className="sec bulk">
        <div>
          <h2>Cenaze, mevlit ve özel günler için toplu yemek</h2>
          <p>Kişi sayısını ve teslim saatini yazın, sizi arayıp fiyatı netleştirelim.</p>
        </div>
        <Link className="btn gold" to="/toplu"><Icon name="users" size={18} /> Toplu sipariş talebi</Link>
      </section>

      {reviews.length > 0 && (
        <section className="sec">
          <div className="sec-h">
            <h2>Müşterilerimiz ne diyor?</h2>
            <Link to="/yorumlar">Tüm yorumlar</Link>
          </div>
          <div className="grid3">
            {reviews.slice(0, 3).map((r) => (
              <blockquote key={r.id}>
                <Stars rating={r.rating} />
                <p>{r.body}</p>
                <cite>{r.author}</cite>
              </blockquote>
            ))}
          </div>
        </section>
      )}

      <ProductDetailModal product={selected} onClose={() => setSelected(null)} />
    </main>
  );
}
