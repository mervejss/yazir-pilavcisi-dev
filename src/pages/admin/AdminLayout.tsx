import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useOrders } from '@/hooks/useOrders';
import { useCourierRequests } from '@/hooks/useCourierRequests';
import { ROLE_LABELS } from '@/lib/constants';
import Logo from '@/components/ui/Logo';
import Icon, { type IconName } from '@/components/ui/Icon';
import ThemeToggle from '@/components/ui/ThemeToggle';
import NewOrderModal from '@/components/admin/NewOrderModal';
import { usePlatformPolling } from '@/hooks/usePlatformPolling';
import { useBackTrap } from '@/hooks/useBackTrap';
import { useNewOrderAlerts, ADMIN_ALERT_KEY } from '@/hooks/useNewOrderAlerts';
import AlertHost from '@/components/alerts/AlertHost';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  roles: string[];
  end?: boolean;
}
interface NavGroup {
  key: string;
  label: string;
  icon: IconName;
  items: NavItem[];
}

const ALL = ['owner', 'sub_admin', 'operator'];
const OWNER = ['owner'];
const MGR = ['owner', 'sub_admin'];

/** Özet tek başına üstte durur; geri kalanlar ana başlık → alt başlık şeklinde gruplanır */
const HOME: NavItem = { to: '/admin', label: 'Özet', icon: 'layout', roles: ALL, end: true };

const GROUPS: NavGroup[] = [
  {
    key: 'orders', label: 'Siparişler', icon: 'clipboard',
    items: [
      { to: '/admin/siparisler', label: 'Canlı Siparişler', icon: 'clipboard', roles: ALL },
      { to: '/admin/gecmis-siparisler', label: 'Geçmiş Siparişler', icon: 'clipboard', roles: ALL },
    ],
  },
  {
    key: 'restaurant', label: 'Restoran Yönetimi', icon: 'utensils',
    items: [
      { to: '/admin/masalar', label: 'Masa Düzeni', icon: 'grid', roles: ALL },
      { to: '/admin/menu', label: 'Menü & QR', icon: 'utensils', roles: ALL },
      { to: '/admin/galeri', label: 'Galeri Yönetimi', icon: 'image', roles: ALL },
    ],
  },
  {
    key: 'delivery', label: 'Kurye & Teslimat', icon: 'truck',
    items: [
      { to: '/admin/kuryeler', label: 'Kurye Yönetimi', icon: 'truck', roles: ALL },
      { to: '/admin/harita', label: 'Canlı Harita', icon: 'map', roles: ALL },
    ],
  },
  {
    key: 'customers', label: 'Müşteriler & Pazarlama', icon: 'users',
    items: [
      { to: '/admin/musteriler', label: 'Müşteriler', icon: 'users', roles: ALL },
      { to: '/admin/kuponlar', label: 'Kupon & Kampanya', icon: 'zap', roles: MGR },
      { to: '/admin/yorumlar', label: 'Müşteri Yorumları', icon: 'star', roles: ALL },
      { to: '/admin/google-yorumlar', label: 'Google Yorumları', icon: 'star', roles: OWNER },
      { to: '/admin/geribildirim', label: 'Geri Bildirim', icon: 'message', roles: ALL },
    ],
  },
  {
    key: 'finance', label: 'Finans & Raporlar', icon: 'wallet',
    items: [
      { to: '/admin/analiz', label: 'Raporlar & Analiz', icon: 'chart', roles: OWNER },
      { to: '/admin/finans', label: 'Finans & Net Kâr', icon: 'wallet', roles: OWNER },
      { to: '/admin/odemeler', label: 'Ödemeler (Not Defteri)', icon: 'wallet', roles: OWNER },
    ],
  },
  {
    key: 'integrations', label: 'Entegrasyonlar', icon: 'zap',
    items: [
      { to: '/admin/entegrasyonlar', label: 'Genel Bakış', icon: 'zap', roles: OWNER, end: true },
      { to: '/admin/entegrasyonlar/trendyol', label: '🟠 Trendyol Go', icon: 'zap', roles: OWNER },
      { to: '/admin/entegrasyonlar/yemeksepeti', label: '🔴 Yemeksepeti', icon: 'zap', roles: OWNER },
      { to: '/admin/entegrasyonlar/migros', label: '🟢 Migros Yemek', icon: 'zap', roles: OWNER },
      { to: '/admin/entegrasyonlar/getir', label: '🟣 Getir Yemek', icon: 'zap', roles: OWNER },
      { to: '/admin/entegrasyonlar/diger', label: '🔗 Diğer platformlar', icon: 'zap', roles: OWNER },
    ],
  },
  {
    key: 'system', label: 'Yönetim', icon: 'settings',
    items: [
      { to: '/admin/kullanicilar', label: 'Personel & Roller', icon: 'users', roles: OWNER },
      { to: '/admin/gecmis', label: 'İşlem Geçmişi', icon: 'clipboard', roles: OWNER },
      { to: '/admin/yedekler', label: 'Yedekler', icon: 'download', roles: OWNER },
      { to: '/admin/ayarlar', label: 'İşletme Ayarları', icon: 'settings', roles: OWNER },
    ],
  },
];

const W_MIN = 210;
const W_MAX = 400;
const W_DEF = 268;
const W_RAIL = 72;

const lsGet = (k: string): string | null => {
  try { return localStorage.getItem(k); } catch { return null; }
};
const lsSet = (k: string, v: string) => {
  try { localStorage.setItem(k, v); } catch { /* yoksay */ }
};

export default function AdminLayout() {
  const { profile, signOut } = useAuthStore();
  const { orders } = useOrders({ statusFilter: ['new'], light: true });
  const { requests: courierRequests } = useCourierRequests({ notify: true });
  const navigate = useNavigate();
  const [quickOpen, setQuickOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  // Panelin ana ekranında geri tuşu oturumu/paneli kapatmasın (çıkış yalnızca çıkış düğmesiyle)
  useBackTrap(pathname === '/admin' || pathname === '/admin/');
  const [width, setWidth] = useState<number>(() => Math.min(W_MAX, Math.max(W_MIN, Number(lsGet('adm.side.w')) || W_DEF)));
  const [collapsed, setCollapsed] = useState<boolean>(() => lsGet('adm.side.c') === '1');
  const [dragging, setDragging] = useState(false);
  const [openG, setOpenG] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(lsGet('adm.side.g') || '{}'); } catch { return {}; }
  });
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 860px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 860px)');
    const h = () => setIsMobile(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  const rail = collapsed && !isMobile;
  const widthRef = useRef(width);
  widthRef.current = width;
  usePlatformPolling(profile?.role === 'owner');
  useNewOrderAlerts(!!profile);

  const role = profile?.role || '';
  const visibleGroups = GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) })).filter((g) => g.items.length > 0);
  const activeGroup = visibleGroups.find((g) => g.items.some((i) => (i.end ? pathname === i.to : pathname === i.to || pathname.startsWith(i.to + '/'))))?.key;
  const isOpen = (k: string) => (openG[k] !== undefined ? openG[k] : k === activeGroup);

  // Gidilen sayfanın grubu otomatik açılır; mobilde menü kapanır
  useEffect(() => {
    if (activeGroup && openG[activeGroup] === false) setOpenG((o) => ({ ...o, [activeGroup]: true }));
    setMenuOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  useEffect(() => {
    lsSet('adm.side.g', JSON.stringify(openG));
  }, [openG]);
  useEffect(() => {
    lsSet('adm.side.c', collapsed ? '1' : '0');
  }, [collapsed]);

  const toggleGroup = (k: string) => setOpenG((o) => ({ ...o, [k]: !isOpen(k) }));
  const allOpen = visibleGroups.every((g) => isOpen(g.key));
  const setAll = (v: boolean) => setOpenG(Object.fromEntries(GROUPS.map((g) => [g.key, v])));

  // Kenarlığı sürükleyerek menü genişliği
  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging(true);
    const onMove = (ev: PointerEvent) => {
      const w = ev.clientX;
      if (w < 150) {
        setCollapsed(true);
      } else {
        setCollapsed(false);
        setWidth(Math.min(W_MAX, Math.max(W_MIN, w)));
      }
    };
    const onUp = () => {
      setDragging(false);
      lsSet('adm.side.w', String(widthRef.current));
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const badgeFor = (to: string) =>
    to === '/admin/siparisler' && newOrdersCount > 0 ? <i className="badge">{newOrdersCount}</i>
    : to === '/admin/harita' && courierRequests.length > 0 ? <i className="badge" title="Bekleyen kurye istekleri">{courierRequests.length}</i>
    : null;

  const handleSignOut = async () => {
    await signOut();
    navigate('/personel-giris', { replace: true });
  };

  const newOrdersCount = orders.length;
  const canCreate = !!profile && ['owner', 'sub_admin', 'operator'].includes(profile.role);

  return (
    <div className={`admin${rail ? ' rail' : ''}${dragging ? ' dragging' : ''}`} style={{ ['--side-w' as any]: `${rail ? W_RAIL : width}px` }}>
      <div className="mbar scope-dark">
        <button type="button" className="mbar-btn" onClick={() => setMenuOpen(true)} aria-label="Menüyü aç"><Icon name="menuIcon" size={22} /></button>
        <Link to="/admin" className="mbar-logo" aria-label="Panel ana sayfa"><Logo height={34} /></Link>
        {canCreate ? (
          <button type="button" className="mbar-btn gold" onClick={() => setQuickOpen(true)} aria-label="Hızlı sipariş"><Icon name="zap" size={20} /></button>
        ) : <span style={{ width: 40 }} />}
      </div>
      {menuOpen && <div className="side-backdrop" onClick={() => setMenuOpen(false)} />}

      <div className="side-shell">
        <aside className={`side scope-dark${menuOpen ? ' open' : ''}${rail ? ' collapsed' : ''}`}>
          <div className="side-top">
            <Link to="/admin" className="side-logo" aria-label="Panel ana sayfa">
              <Logo height={44} />
            </Link>
            <button type="button" className="side-collapse" onClick={() => setCollapsed((v) => !v)} aria-label={rail ? 'Menüyü genişlet' : 'Menüyü daralt'} title={rail ? 'Genişlet' : 'Daralt'}>
              {rail ? '»' : '«'}
            </button>
            <button type="button" className="side-burger" onClick={() => setMenuOpen(false)} aria-label="Menüyü kapat">
              <Icon name="x" size={22} />
            </button>
          </div>

          {canCreate && (
            <button type="button" className="quick-btn" onClick={() => { setQuickOpen(true); setMenuOpen(false); }} title="Hızlı Sipariş">
              <Icon name="zap" size={18} /> <span className="lbl">Hızlı Sipariş</span>
            </button>
          )}

          <nav className="side-nav">
            {profile && HOME.roles.includes(role) && (
              <NavLink to={HOME.to} end={HOME.end} title={HOME.label} className="side-home">
                <span className="side-item"><Icon name={HOME.icon} size={18} className="nav-ico" /><span className="lbl">{HOME.label}</span></span>
              </NavLink>
            )}

            {!rail && visibleGroups.length > 1 && (
              <button type="button" className="nav-expall" onClick={() => setAll(!allOpen)}>{allOpen ? 'Hepsini daralt' : 'Hepsini genişlet'}</button>
            )}

            {visibleGroups.map((g) => {
              const open = rail ? true : isOpen(g.key);
              return (
                <div key={g.key} className={`nav-group${open ? ' is-open' : ''}${activeGroup === g.key ? ' has-active' : ''}`}>
                  {rail ? (
                    <div className="nav-rail-sep" title={g.label} />
                  ) : (
                    <button type="button" className={`nav-group-btn${open ? ' open' : ''}`} onClick={() => toggleGroup(g.key)} aria-expanded={open}>
                      <span className="side-item"><Icon name={g.icon} size={18} className="nav-ico" /><span className="lbl">{g.label}</span></span>
                      <Icon name="chevronDown" size={14} />
                    </button>
                  )}
                  {open && (
                    <div className="nav-children">
                      {g.items.map((item) => (
                        <NavLink key={item.to} to={item.to} end={item.end} className="nav-sub" title={item.label}>
                          <span className="side-item">
                            <Icon name={item.icon} size={rail ? 18 : 15} className="nav-ico" />
                            <span className="lbl">{item.label}</span>
                          </span>
                          {badgeFor(item.to)}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="side-foot">
            <div className="side-user">
              <span className="avatar">{(profile?.full_name || '?').trim().charAt(0).toUpperCase()}</span>
              <span className="lbl">
                <b>{profile?.full_name}</b>
                <small>{ROLE_LABELS[profile?.role || ''] || profile?.role}</small>
              </span>
            </div>
            <ThemeToggle className="side-theme" />
            <Link to="/kurye" target="_blank" rel="noreferrer" title="Kurye ekranını aç">
              <Icon name="truck" size={16} /> <span className="lbl">Kurye ekranını aç</span>
            </Link>
            <Link to="/" target="_blank" rel="noreferrer" title="Siteyi aç">
              <Icon name="home" size={16} /> <span className="lbl">Siteyi aç</span>
            </Link>
            <button type="button" className="linkbtn" onClick={handleSignOut} title="Çıkış yap">
              <Icon name="logout" size={16} /> <span className="lbl">Çıkış yap</span>
            </button>
          </div>
        </aside>
        <div
          className="side-resize"
          role="separator"
          aria-orientation="vertical"
          title="Sürükleyerek boyutlandır · çift tıkla: sıfırla"
          onPointerDown={startDrag}
          onDoubleClick={() => { setCollapsed(false); setWidth(W_DEF); lsSet('adm.side.w', String(W_DEF)); }}
        />
      </div>

      <section className="main">
        <Outlet />
      </section>

      <NewOrderModal open={quickOpen} onClose={() => setQuickOpen(false)} />
      <AlertHost storageKey={ADMIN_ALERT_KEY} defaultLink="/admin/siparisler" />
    </div>
  );
}
