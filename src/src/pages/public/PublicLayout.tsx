import { useState, useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Logo from '@/components/ui/Logo';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { useCartStore } from '@/stores/cartStore';
import { useAuthStore } from '@/stores/authStore';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { DAY_NAMES } from '@/lib/constants';
import toast from 'react-hot-toast';
import type { LucideIcon } from 'lucide-react';
import {
  UtensilsCrossed,
  ShoppingBag,
  Users,
  Images,
  Star,
  Phone,
  User,
  LogOut,
  Menu,
  X,
  MapPin,
  MessageCircle,
} from 'lucide-react';

interface NavLinkItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV_LINKS: NavLinkItem[] = [
  { to: '/menu', label: 'Menü', icon: UtensilsCrossed },
  { to: '/siparis', label: 'Sipariş Ver', icon: ShoppingBag },
  { to: '/toplu', label: 'Toplu Sipariş', icon: Users },
  { to: '/galeri', label: 'Galeri', icon: Images },
  { to: '/yorumlar', label: 'Yorumlar', icon: Star },
  { to: '/iletisim', label: 'İletişim', icon: Phone },
];

export default function PublicLayout() {
  const cartCount = useCartStore((s) => s.count());
  const { user, profile, signOut } = useAuthStore();
  const [navOpen, setNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { settings, hours } = useBusinessSettings();

  useEffect(() => {
    window.scrollTo(0, 0);
    setNavOpen(false);
  }, [pathname]);

  // Handle navbar scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    toast.success('Başarıyla çıkış yapıldı');
    navigate('/');
  };

  return (
    <div className="site">
      {/* Üst Şık Navbar */}
      <header className={`top ${scrolled ? 'scrolled' : ''}`}>
        <Link to="/" className="logo-link" title="Yazır Pilavcısı Ana Sayfa">
          <Logo size="md" />
        </Link>

        {/* Desktop ve Mobil Linkler */}
        <nav className={navOpen ? 'open' : ''}>
          {NAV_LINKS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')}>
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
          {user && (
            <NavLink to="/profil" className={({ isActive }) => (isActive ? 'active' : '')}>
              <User size={18} />
              <span>Profilim</span>
            </NavLink>
          )}
        </nav>

        {/* Sağ Bölüm: Tema & Kullanıcı & Sepet */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginLeft: 'auto' }}>
          <ThemeToggle />

          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Link to="/profil" className="user-menu-pill" title="Profilim">
                <User size={15} style={{ color: 'var(--gold)' }} />
                <span>{profile?.full_name ? profile.full_name.split(' ')[0] : 'Hesabım'}</span>
              </Link>
              <button
                type="button"
                className="btn ghost sm"
                style={{ padding: '0.4em 0.8em', fontSize: '0.8rem' }}
                onClick={handleSignOut}
                title="Çıkış Yap"
              >
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <Link to="/giris" className="btn ghost sm">
                Giriş
              </Link>
              <Link to="/kayit" className="btn gold sm">
                Kayıt Ol
              </Link>
            </div>
          )}

          {/* Sepet Butonu */}
          <Link className="cart-header-btn" to="/siparis" title="Sepete Git">
            <ShoppingBag size={18} />
            <span>Sepet</span>
            <span className="cart-badge">{cartCount}</span>
          </Link>

          {/* Mobil Menü Butonu */}
          <button
            type="button"
            className="burger"
            onClick={() => setNavOpen(!navOpen)}
            aria-label="Menüyü aç/kapat"
          >
            {navOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      {/* Ana İçerik */}
      <Outlet />

      {/* Şık Altın Temalı Footer */}
      <footer className="foot">
        <div className="foot-inner">
          <div>
            <div style={{ marginBottom: '1.2rem' }}>
              <Logo size="md" />
            </div>
            <p style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginTop: '0.8rem' }}>
              <MapPin size={18} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: '3px' }} />
              <span>{settings?.address || 'Yazır Mah. Şehit Erkan Özbalcı Sk. 20/B, Selçuklu / Konya'}</span>
            </p>
            <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.6rem' }}>
              <Phone size={18} style={{ color: 'var(--gold)' }} />
              <a href={`tel:${settings?.phone?.replace(/\s/g, '') || '05403314142'}`}>
                {settings?.phone || '0540 331 41 42'}
              </a>
            </p>
            {settings?.whatsapp && (
              <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.6rem' }}>
                <MessageCircle size={18} style={{ color: '#25D366' }} />
                <a
                  href={`https://wa.me/${settings.whatsapp.replace(/\s/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#25D366', fontWeight: 600 }}
                >
                  WhatsApp Sipariş Hattı
                </a>
              </p>
            )}
          </div>

          <div>
            <h4>Çalışma Saatleri</h4>
            {hours && hours.length > 0 ? (
              hours.map((h) => (
                <div key={h.day_of_week} className="hrow">
                  <span>{DAY_NAMES[h.day_of_week - 1]}</span>
                  <span style={{ fontWeight: 600, color: h.is_closed ? '#EF4444' : 'var(--gold-bright)' }}>
                    {h.is_closed ? 'Kapalı' : `${h.open_time.slice(0, 5)} - ${h.close_time.slice(0, 5)}`}
                  </span>
                </div>
              ))
            ) : (
              <p className="muted">Her gün 11:30 - 03:00</p>
            )}
          </div>

          <div>
            <h4>Hızlı Bağlantılar</h4>
            <p>
              <Link to="/menu" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <UtensilsCrossed size={15} style={{ color: 'var(--gold)' }} />
                Nefis Pilav Menümüz
              </Link>
            </p>
            <p>
              <Link to="/toplu" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <Users size={15} style={{ color: 'var(--gold)' }} />
                Mevlit & Toplu Yemek
              </Link>
            </p>
            <p>
              <Link to="/galeri" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                <Images size={15} style={{ color: 'var(--gold)' }} />
                Restoran & Lezzet Galerisi
              </Link>
            </p>
            <p style={{ marginTop: '1.2rem' }}>
              <Link
                to="/personel-giris"
                style={{
                  color: 'var(--gold-bright)',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                🔐 Personel & Kurye Portalı
              </Link>
            </p>
            {settings?.google_maps_url && (
              <p style={{ marginTop: '0.5rem' }}>
                <a href={settings.google_maps_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.85rem' }}>
                  📍 Google Haritalar Konumu
                </a>
              </p>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'center', marginTop: '3rem', paddingTop: '1.5rem', borderTop: '1px solid #1E1A14', fontSize: '0.85rem', color: '#7E7667' }}>
          © {new Date().getFullYear()} Yazır Pilavcısı. Tüm hakları saklıdır. Tane tane lezzet garantisi.
        </div>
      </footer>
    </div>
  );
}
