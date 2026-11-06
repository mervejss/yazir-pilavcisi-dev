import { useState, useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Logo from '@/components/ui/Logo';
import ThemeToggle from '@/components/ui/ThemeToggle';
import Icon, { type IconName } from '@/components/ui/Icon';
import { useCartStore } from '@/stores/cartStore';
import { useAuthStore } from '@/stores/authStore';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { DAY_NAMES } from '@/lib/constants';
import { weekSchedule } from '@/lib/helpers';
import { contactLinks, whatsappLink } from '@/lib/contact';
import toast from 'react-hot-toast';

const LINKS: [string, string, IconName][] = [
  ['/', 'Ana Sayfa', 'home'],
  ['/menu', 'Menü', 'utensils'],
  ['/siparis', 'Sipariş Ver', 'bag'],
  ['/kampanyalar', 'Kampanyalar', 'tag'],
  ['/toplu', 'Toplu Sipariş', 'users'],
  ['/galeri', 'Galeri', 'image'],
  ['/yorumlar', 'Yorumlar', 'star'],
  ['/iletisim', 'İletişim', 'phone'],
];

export default function PublicLayout() {
  const cartCount = useCartStore((s) => s.count());
  const { user, profile, signOut } = useAuthStore();
  const [navOpen, setNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { settings, hours, overrides, status, loading } = useBusinessSettings();

  useEffect(() => {
    window.scrollTo(0, 0);
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    toast.success('Çıkış yapıldı');
    navigate('/');
  };

  const phone = settings?.phone || '0540 331 41 42';
  const { address, instagramUrl, instagramHandle, mapEmbedUrl, mapOpenUrl, mapDirUrl } = contactLinks(settings);
  const schedule = weekSchedule(hours, overrides);
  const showClosedBanner = !loading && !status.open && (status.paused || hours.length > 0);

  return (
    <div className="site">
      <header className={`top scope-dark${scrolled ? ' scrolled' : ''}`}>
        <Link to="/" className="brand" aria-label="Yazır Pilavcısı ana sayfa">
          <Logo />
        </Link>

        <nav className={navOpen ? 'open' : ''} aria-label="Ana menü">
          {LINKS.map(([to, label, icon], i) => (
            <NavLink key={to} to={to} end={to === '/'} style={{ ['--i' as any]: i }}>
              <Icon name={icon} size={17} className="nav-ico" />
              <span>{label}</span>
            </NavLink>
          ))}
          {user && (
            <NavLink to="/profil" style={{ ['--i' as any]: LINKS.length }}>
              <Icon name="user" size={17} className="nav-ico" />
              <span>Profilim</span>
            </NavLink>
          )}
        </nav>

        <div className="top-actions">
          <ThemeToggle />

          {user ? (
            <>
              <Link to="/profil" className="user-menu-pill" title="Profilim">
                <Icon name="user" size={15} /> {profile?.full_name ? profile.full_name.split(' ')[0] : 'Hesabım'}
              </Link>
              <button type="button" className="icon-circle" onClick={handleSignOut} title="Çıkış yap" aria-label="Çıkış yap">
                <Icon name="logout" size={16} />
              </button>
            </>
          ) : (
            <div className="auth-links">
              <Link to="/giris" className="btn ghost sm">
                Giriş
              </Link>
              <Link to="/kayit" className="btn gold sm">
                Kayıt Ol
              </Link>
            </div>
          )}

          <Link className="btn gold sm cart-btn" to="/siparis" aria-label={`Sepet, ${cartCount} ürün`}>
            <Icon name="cart" size={17} />
            <span className="cart-text">Sepet</span>
            <b key={cartCount} className={`cart-badge${cartCount ? ' has' : ''}`}>{cartCount}</b>
          </Link>

          <button
            type="button"
            className="burger"
            onClick={() => setNavOpen(!navOpen)}
            aria-label={navOpen ? 'Menüyü kapat' : 'Menüyü aç'}
            aria-expanded={navOpen}
          >
            <Icon name={navOpen ? 'x' : 'menuIcon'} size={24} />
          </button>
        </div>
      </header>

      {showClosedBanner && (
        <div className="closed-banner scope-dark" role="status">
          <Icon name="clock" size={17} />
          <b>{status.label}</b>
          {status.detail && <span>· {status.detail}</span>}
        </div>
      )}

      <Outlet />

      <footer className="site-footer scope-dark">
        <div className="sf-inner">
          <div className="sf-top">
            {/* Marka + iletişim */}
            <div className="sf-brand">
              <Logo height={64} />
              <p className="sf-slogan">{settings?.slogan || 'Tane tane pilav, 15 dakikada kapında.'}</p>
              <ul className="sf-contact">
                <li>
                  <a href={`tel:${phone.replace(/\s/g, '')}`} className="foot-link">
                    <Icon name="phone" size={16} /> {phone}
                  </a>
                </li>
                {settings?.whatsapp && (
                  <li>
                    <a href={whatsappLink(settings.whatsapp) || '#'} target="_blank" rel="noreferrer" className="foot-link">
                      <Icon name="message" size={16} /> WhatsApp hattı
                    </a>
                  </li>
                )}
                <li>
                  <a href={instagramUrl} target="_blank" rel="noreferrer" className="foot-link">
                    <Icon name="instagram" size={16} /> {instagramHandle}
                  </a>
                </li>
              </ul>
            </div>

            {/* Bağlantılar */}
            <nav className="sf-links" aria-label="Site bağlantıları">
              <h4><Icon name="arrowRight" size={17} /> Bağlantılar</h4>
              <Link to="/menu" className="foot-link"><Icon name="utensils" size={15} /> Online Menü</Link>
              <Link to="/galeri" className="foot-link"><Icon name="image" size={15} /> Restoran Galerisi</Link>
              <Link to="/toplu" className="foot-link"><Icon name="users" size={15} /> Toplu Yemek Talebi</Link>
              <Link to="/iletisim" className="foot-link"><Icon name="phone" size={15} /> İletişim</Link>
              <Link to="/personel-giris" className="foot-link strong">
                <Icon name="lock" size={15} /> Personel &amp; Kurye Girişi
              </Link>
            </nav>

            {/* Çalışma saatleri (geniş, sağa dayalı) */}
            <div className="sf-hours">
              <div className="sf-hours-head">
                <h4><Icon name="clock" size={17} /> Çalışma Saatleri</h4>
                <span className={`pill ${status.open ? 'ok' : 'no'}`}>
                  <span className="live-dot" /> {status.label}
                </span>
              </div>
              <ul className="sf-hours-list">
                {schedule.map((r) => (
                  <li key={r.dow} className={`${r.isToday ? 'today' : ''}${r.eff?.is_closed ? ' closed' : ''}`}>
                    <span className="d">
                      {DAY_NAMES[r.dow - 1]}
                      {r.isToday && <em className="tag">Bugün</em>}
                      {r.isOverride && <em className="tag alt">Özel saat</em>}
                    </span>
                    <span className="t">
                      {!r.eff || r.eff.is_closed ? 'Kapalı' : `${r.eff.open_time.slice(0, 5)} – ${r.eff.close_time.slice(0, 5)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Adres + Google Harita */}
          <div className="sf-location">
            <div className="sf-address">
              <h4><Icon name="mapPin" size={18} /> Bizi Bulun</h4>
              <div className="sf-address-line">
                <span className="sf-pin"><Icon name="mapPin" size={20} /></span>
                <address>{address}</address>
              </div>
              <div className="sf-address-actions">
                <a className="btn gold sm" href={mapDirUrl} target="_blank" rel="noreferrer">
                  <Icon name="navigation" size={15} /> Yol tarifi al
                </a>
                <a className="btn ghost sm" href={mapOpenUrl} target="_blank" rel="noreferrer">
                  <Icon name="external" size={15} /> Haritada aç
                </a>
              </div>

              <div className="sf-social">
                <h5>Bizi sosyal medyada takip edin</h5>
                <a className="sf-insta" href={instagramUrl} target="_blank" rel="noreferrer" aria-label="Instagram'da bizi takip edin">
                  <Icon name="instagram" size={22} />
                  <span>
                    <b>Instagram</b>
                    <small>{instagramHandle}</small>
                  </span>
                </a>
              </div>
            </div>
            <div className="sf-map">
              <iframe
                title="Yazır Pilavcısı konumu — Google Harita"
                src={mapEmbedUrl}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>
          </div>

          <div className="sf-bottom">
            <p>© {new Date().getFullYear()} H&amp;M Software Studio · Tüm hakları saklıdır.</p>
            <p>
              <a href="mailto:hmsoftwarestudio@gmail.com" className="foot-link">
                <Icon name="mail" size={14} /> hmsoftwarestudio@gmail.com
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
