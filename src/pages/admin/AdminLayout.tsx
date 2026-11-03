import { useState } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useOrders } from '@/hooks/useOrders';
import { useCourierRequests } from '@/hooks/useCourierRequests';
import { ROLE_LABELS } from '@/lib/constants';
import Logo from '@/components/ui/Logo';
import Icon, { type IconName } from '@/components/ui/Icon';
import ThemeToggle from '@/components/ui/ThemeToggle';
import NewOrderModal from '@/components/admin/NewOrderModal';
import { usePlatformPolling } from '@/hooks/usePlatformPolling';
import { useNewOrderAlerts, ADMIN_ALERT_KEY } from '@/hooks/useNewOrderAlerts';
import AlertHost from '@/components/alerts/AlertHost';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  roles: string[];
  end?: boolean;
}

const ALL = ['owner', 'sub_admin', 'operator'];

const NAV_ITEMS: NavItem[] = [
  { to: '/admin', label: 'Özet', icon: 'layout', roles: ALL, end: true },
  { to: '/admin/siparisler', label: 'Siparişler', icon: 'clipboard', roles: ALL },
  { to: '/admin/masalar', label: 'Masa Düzeni', icon: 'grid', roles: ALL },
  { to: '/admin/kuryeler', label: 'Kurye Yönetimi', icon: 'truck', roles: ALL },
  { to: '/admin/harita', label: 'Canlı Harita', icon: 'map', roles: ALL },
  { to: '/admin/menu', label: 'Menü & QR', icon: 'utensils', roles: ALL },
  { to: '/admin/musteriler', label: 'Müşteriler', icon: 'users', roles: ALL },
  { to: '/admin/kuponlar', label: 'Kupon & Kampanya', icon: 'zap', roles: ['owner', 'sub_admin'] },
  { to: '/admin/galeri', label: 'Galeri Yönetimi', icon: 'image', roles: ALL },
  { to: '/admin/analiz', label: 'Raporlar & Analiz', icon: 'chart', roles: ['owner'] },
  { to: '/admin/geribildirim', label: 'Geri Bildirim', icon: 'message', roles: ALL },
  { to: '/admin/google-yorumlar', label: 'Google Yorumları', icon: 'star', roles: ['owner'] },
  { to: '/admin/kullanicilar', label: 'Personel & Roller', icon: 'users', roles: ['owner'] },
  { to: '/admin/gecmis', label: 'İşlem Geçmişi', icon: 'clipboard', roles: ['owner'] },
  { to: '/admin/yedekler', label: 'Yedekler', icon: 'download', roles: ['owner'] },
  { to: '/admin/ayarlar', label: 'İşletme Ayarları', icon: 'settings', roles: ['owner'] },
];

// "Entegrasyonlar" grubu: her platformun ayrı sayfası vardır
const INTEGRATION_ITEMS: NavItem[] = [
  { to: '/admin/entegrasyonlar', label: 'Genel Bakış', icon: 'zap', roles: ['owner'], end: true },
  { to: '/admin/entegrasyonlar/trendyol', label: '🟠 Trendyol Go', icon: 'zap', roles: ['owner'] },
  { to: '/admin/entegrasyonlar/yemeksepeti', label: '🔴 Yemeksepeti', icon: 'zap', roles: ['owner'] },
  { to: '/admin/entegrasyonlar/migros', label: '🟢 Migros Yemek', icon: 'zap', roles: ['owner'] },
  { to: '/admin/entegrasyonlar/getir', label: '🟣 Getir Yemek', icon: 'zap', roles: ['owner'] },
  { to: '/admin/entegrasyonlar/diger', label: '🔗 Diğer platformlar', icon: 'zap', roles: ['owner'] },
];

export default function AdminLayout() {
  const { profile, signOut } = useAuthStore();
  const { orders } = useOrders({ statusFilter: ['new'] });
  const { requests: courierRequests } = useCourierRequests({ notify: true });
  const navigate = useNavigate();
  const [quickOpen, setQuickOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [intOpen, setIntOpen] = useState(() => window.location.pathname.startsWith('/admin/entegrasyonlar'));
  usePlatformPolling(profile?.role === 'owner');
  useNewOrderAlerts(!!profile);

  const handleSignOut = async () => {
    await signOut();
    navigate('/giris');
  };

  const newOrdersCount = orders.length;
  const canCreate = !!profile && ['owner', 'sub_admin', 'operator'].includes(profile.role);

  return (
    <div className="admin">
      <aside className={`side scope-dark${menuOpen ? ' open' : ''}`}>
        <div className="side-top">
          <Link to="/admin" className="side-logo" aria-label="Panel ana sayfa">
            <Logo height={44} />
          </Link>
          <button type="button" className="side-burger" onClick={() => setMenuOpen((v) => !v)} aria-label="Menü">
            <Icon name={menuOpen ? 'x' : 'menuIcon'} size={22} />
          </button>
        </div>

        {canCreate && (
          <button type="button" className="quick-btn" onClick={() => setQuickOpen(true)}>
            <Icon name="zap" size={18} /> Hızlı Sipariş
          </button>
        )}

        <nav className="side-nav" onClick={() => setMenuOpen(false)}>
          {NAV_ITEMS.filter((item) => profile && item.roles.includes(profile.role)).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              <span className="side-item">
                <Icon name={item.icon} size={18} className="nav-ico" />
                {item.label}
              </span>
              {item.to === '/admin/siparisler' && newOrdersCount > 0 && <i className="badge">{newOrdersCount}</i>}
              {item.to === '/admin/harita' && courierRequests.length > 0 && <i className="badge" title="Bekleyen kurye istekleri">{courierRequests.length}</i>}
            </NavLink>
          ))}
          {profile?.role === 'owner' && (
            <div className="nav-group">
              <button type="button" className={`nav-group-btn${intOpen ? ' open' : ''}`}
                onClick={(e) => { e.stopPropagation(); setIntOpen((v) => !v); }}>
                <span className="side-item"><Icon name="zap" size={18} className="nav-ico" />Entegrasyonlar</span>
                <Icon name="chevronDown" size={14} />
              </button>
              {intOpen && INTEGRATION_ITEMS.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className="nav-sub">
                  <span className="side-item">{item.label}</span>
                </NavLink>
              ))}
            </div>
          )}
        </nav>

        <div className="side-foot">
          <div className="side-user">
            <span className="avatar">{(profile?.full_name || '?').trim().charAt(0).toUpperCase()}</span>
            <span>
              <b>{profile?.full_name}</b>
              <small>{ROLE_LABELS[profile?.role || ''] || profile?.role}</small>
            </span>
          </div>
          <ThemeToggle className="side-theme" />
          <Link to="/kurye" target="_blank" rel="noreferrer">
            <Icon name="truck" size={16} /> Kurye ekranını aç
          </Link>
          <Link to="/" target="_blank" rel="noreferrer">
            <Icon name="home" size={16} /> Siteyi aç
          </Link>
          <button type="button" className="linkbtn" onClick={handleSignOut}>
            <Icon name="logout" size={16} /> Çıkış yap
          </button>
        </div>
      </aside>

      <section className="main">
        <Outlet />
      </section>

      <NewOrderModal open={quickOpen} onClose={() => setQuickOpen(false)} />
      <AlertHost storageKey={ADMIN_ALERT_KEY} defaultLink="/admin/siparisler" />
    </div>
  );
}
