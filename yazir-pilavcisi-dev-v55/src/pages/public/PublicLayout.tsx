import { useState, useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Logo from '@/components/ui/Logo';
import ThemeToggle from '@/components/ui/ThemeToggle';
import Icon, { type IconName } from '@/components/ui/Icon';
import { useCartStore } from '@/stores/cartStore';
import { useAuthStore } from '@/stores/authStore';
import { homeForRole, isPanelRole } from '@/lib/roleHome';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { DAY_NAMES } from '@/lib/constants';
import { weekSchedule, discountedPrice, tl } from '@/lib/helpers';
import { contactLinks, whatsappLink } from '@/lib/contact';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import WhatsAppWidget from '@/components/public/WhatsAppWidget';
import Seo from '@/components/seo/Seo';
import InstallPrompt from '@/components/public/InstallPrompt';

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
  const cartItems = useCartStore((s) => s.items);
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const { user, profile, signOut } = useAuthStore();
  const [navOpen, setNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [headerReferral, setHeaderReferral] = useState<any>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const accountCloseTimer = useRef<number | null>(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { settings, hours, overrides, status, loading } = useBusinessSettings();
  // Personel/kurye: "Profilim" yerine kendi paneline giden bağlantı (müşteri profiline düşmesin)
  const panel = isPanelRole(profile?.role);
  const accountPath = panel ? homeForRole(profile?.role) : '/profil';
  const accountLabel = panel ? (profile?.role === 'courier' ? 'Kurye Paneli' : 'Yönetim Paneli') : 'Profilim';
  const referralPercent = headerReferral?.is_active ? Number(headerReferral.discount || 0) : 0;
  const referralDiscount = referralPercent > 0
    ? headerReferral?.scope === 'product'
      ? cartItems.reduce((sum, item) => sum + (item.price - discountedPrice(item.price, referralPercent)) * item.quantity, 0)
      : headerReferral?.scope === 'cart'
        ? Math.round((cartTotal * referralPercent / 100 + Number.EPSILON) * 100) / 100
        : 0
    : 0;
  const headerNetTotal = Math.max(cartTotal - referralDiscount, 0);

  useEffect(() => {
    window.scrollTo(0, 0);
    setNavOpen(false);
    setAccountMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setNavOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navOpen]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!user || panel) { setHeaderReferral(null); return; }
    let alive = true;
    const refreshReferral = async () => {
      const { data, error } = await supabase.rpc('my_referral');
      if (alive && !error) setHeaderReferral(data || null);
    };
    refreshReferral();
    const channel = supabase.channel(`header-referral-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'referral_campaigns' }, refreshReferral)
      .subscribe();
    const timer = window.setInterval(refreshReferral, 30000);
    return () => { alive = false; window.clearInterval(timer); supabase.removeChannel(channel); };
  }, [user?.id, panel]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) setAccountMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setAccountMenuOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown); };
  }, [accountMenuOpen]);

  const openAccountMenu = () => {
    if (accountCloseTimer.current) window.clearTimeout(accountCloseTimer.current);
    setAccountMenuOpen(true);
  };
  const scheduleAccountMenuClose = () => {
    if (accountCloseTimer.current) window.clearTimeout(accountCloseTimer.current);
    accountCloseTimer.current = window.setTimeout(() => setAccountMenuOpen(false), 1000);
  };

  const handleSignOut = async () => {
    setAccountMenuOpen(false);
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
      <Seo settings={settings} hours={hours} />
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
            <NavLink to={accountPath} style={{ ['--i' as any]: LINKS.length }}>
              <Icon name="user" size={17} className="nav-ico" />
              <span>{accountLabel}</span>
            </NavLink>
          )}
          {/* Mobilde giriş / kayıt / çıkış menünün içinde (üst çubukta yer kalmadığı için) */}
          <div className="nav-auth" style={{ ['--i' as any]: LINKS.length + 1 }}>
            {user ? (
              <button type="button" className="btn ghost" onClick={handleSignOut}>
                <Icon name="logout" size={16} /> Çıkış yap
              </button>
            ) : (
              <>
                <Link to="/giris" className="btn ghost">Giriş yap</Link>
                <Link to="/kayit" className="btn gold">Kayıt ol</Link>
              </>
            )}
          </div>
        </nav>
        {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} aria-hidden="true" />}

        <div className="top-actions">
          <Link
            className="header-cart-summary"
            to="/siparis"
            aria-label={`Sepetim: ${cartCount} ürün, ${tl(headerNetTotal)}`}
            title="Sepetimi görüntüle"
          >
            <span className="hcs-icon"><Icon name="cart" size={18} /></span>
            <span className="hcs-content">
              <b className="hcs-count">Sepetim · {cartCount} ürün</b>
              <span className="hcs-prices">
                {referralDiscount > 0 && <del>{tl(cartTotal)}</del>}
                <strong>{tl(headerNetTotal)}</strong>
              </span>
            </span>
            <span className="hcs-go">Sepeti gör</span>
          </Link>

          <ThemeToggle />

          {user ? (
            panel ? (
              <Link to={accountPath} className="user-menu-pill" title={accountLabel}>
                <Icon name="user" size={15} /> {accountLabel}
              </Link>
            ) : (
              <div
                className={`account-dropdown${accountMenuOpen ? ' open' : ''}`}
                ref={accountMenuRef}
                onMouseEnter={() => { if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) openAccountMenu(); }}
                onMouseLeave={() => { if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) scheduleAccountMenuClose(); }}
              >
                <button
                  type="button"
                  className="user-menu-pill account-trigger"
                  title="Hesap menüsünü aç"
                  aria-haspopup="true"
                  aria-expanded={accountMenuOpen}
                  onClick={() => setAccountMenuOpen((open) => !open)}
                >
                  <Icon name="user" size={15} />
                  <span>{profile?.full_name ? profile.full_name.split(' ')[0] : 'Hesabım'}</span>
                  <Icon name="chevronDown" size={14} />
                </button>
                <div className="account-dropdown-menu" role="menu">
                  <div className="account-dropdown-head">
                    <b>{profile?.full_name || 'Müşteri'}</b>
                    <span>{profile?.email || user.email || ''}</span>
                  </div>
                  <Link role="menuitem" to="/profil" onClick={() => setAccountMenuOpen(false)}><Icon name="user" size={16} /> Profilim</Link>
                  <Link role="menuitem" to="/profil?tab=orders" onClick={() => setAccountMenuOpen(false)}><Icon name="receipt" size={16} /> Geçmiş Siparişlerim</Link>
                  <Link role="menuitem" to="/profil?tab=reviews" onClick={() => setAccountMenuOpen(false)}><Icon name="star" size={16} /> Değerlendirmelerim</Link>
                  <Link role="menuitem" to="/profil?tab=addresses" onClick={() => setAccountMenuOpen(false)}><Icon name="mapPin" size={16} /> Kayıtlı Adreslerim</Link>
                  <Link role="menuitem" to="/profil?tab=referrals" onClick={() => setAccountMenuOpen(false)}><Icon name="tag" size={16} /> Referans</Link>
                  <Link role="menuitem" to="/profil?tab=info" onClick={() => setAccountMenuOpen(false)}><Icon name="settings" size={16} /> Hesap Bilgilerim</Link>
                  <button type="button" role="menuitem" onClick={handleSignOut}><Icon name="logout" size={16} /> Çıkış Yap</button>
                </div>
              </div>
            )
          ) : (
            <div className="auth-links">
              <Link to="/giris" className="btn ghost sm">Giriş</Link>
              <Link to="/kayit" className="btn gold sm">Kayıt Ol</Link>
            </div>
          )}

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

      <WhatsAppWidget settings={settings} open={status.open} statusLabel={status.label} />

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
              <h2><Icon name="arrowRight" size={17} /> Bağlantılar</h2>
              <Link to="/menu" className="foot-link"><Icon name="utensils" size={15} /> Online Menü</Link>
              <InstallPrompt />
              <Link to="/pilav-restorani" className="foot-link"><Icon name="home" size={15} /> Yazır Pilav Restoranı</Link>
              <Link to="/kampanyalar" className="foot-link"><Icon name="tag" size={15} /> Kampanyalar</Link>
              <Link to="/yorumlar" className="foot-link"><Icon name="star" size={15} /> Müşteri Yorumları</Link>
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
                <h2><Icon name="clock" size={17} /> Çalışma Saatleri</h2>
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
              <h2><Icon name="mapPin" size={18} /> Bizi Bulun</h2>
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
                <h3>Bizi sosyal medyada takip edin</h3>
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
