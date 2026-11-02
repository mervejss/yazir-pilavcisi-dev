import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useOrders } from '@/hooks/useOrders';
import { ROLE_LABELS } from '@/lib/constants';
import Logo from '@/components/ui/Logo';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  ClipboardList,
  LayoutGrid,
  Truck,
  MapPin,
  UtensilsCrossed,
  Images,
  BarChart3,
  MessageSquare,
  Users,
  Settings,
  ExternalLink,
  LogOut,
  Smartphone,
} from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  roles: string[];
  end?: boolean;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/admin', label: 'Özet Tablo', roles: ['owner', 'sub_admin', 'operator'], end: true, icon: LayoutDashboard },
  { to: '/admin/siparisler', label: 'Siparişler', roles: ['owner', 'sub_admin', 'operator'], icon: ClipboardList },
  { to: '/admin/masalar', label: 'Masa Düzeni', roles: ['owner', 'sub_admin', 'operator'], icon: LayoutGrid },
  { to: '/admin/kuryeler', label: 'Kurye Yönetimi', roles: ['owner', 'sub_admin', 'operator'], icon: Truck },
  { to: '/admin/harita', label: 'Canlı Harita', roles: ['owner', 'sub_admin', 'operator'], icon: MapPin },
  { to: '/admin/menu', label: 'Menü & QR', roles: ['owner', 'sub_admin', 'operator'], icon: UtensilsCrossed },
  { to: '/admin/galeri', label: 'Galeri Yönetimi', roles: ['owner', 'sub_admin', 'operator'], icon: Images },
  { to: '/admin/analiz', label: 'Raporlar & Analiz', roles: ['owner'], icon: BarChart3 },
  { to: '/admin/geribildirim', label: 'Geri Bildirim', roles: ['owner', 'sub_admin', 'operator'], icon: MessageSquare },
  { to: '/admin/kullanicilar', label: 'Personel & Roller', roles: ['owner'], icon: Users },
  { to: '/admin/ayarlar', label: 'İşletme Ayarları', roles: ['owner'], icon: Settings },
];

export default function AdminLayout() {
  const { profile, signOut } = useAuthStore();
  const { orders } = useOrders({ statusFilter: ['new'] });
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/giris');
  };

  const newOrdersCount = orders.length;

  return (
    <div className="admin">
      <aside className="side">
        {/* Üst Logo Kutusu */}
        <div className="logo-box">
          <Link to="/" target="_blank" rel="noreferrer" title="Siteyi Yeni Sekmede Aç">
            <Logo size="sm" showText={true} />
          </Link>
        </div>

        {/* Menü Linkleri */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {NAV_ITEMS.filter((item) => profile && item.roles.includes(profile.role)).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'active' : '')}>
                <Icon size={18} />
                <span>{item.label}</span>
                {item.label === 'Siparişler' && newOrdersCount > 0 && (
                  <i className="badge">{newOrdersCount}</i>
                )}
              </NavLink>
            );
          })}
        </div>

        {/* Sidebar Alt Bilgiler */}
        <div className="side-foot">
          <div style={{ display: 'flex', flexDirection: 'column', padding: '0.2rem 0.5rem' }}>
            <span style={{ fontWeight: 700, color: '#FAF8F5' }}>{profile?.full_name}</span>
            <small style={{ color: 'var(--gold)' }}>{ROLE_LABELS[profile?.role || ''] || profile?.role}</small>
          </div>

          <Link to="/kurye" target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Smartphone size={15} style={{ color: 'var(--gold)' }} />
            <span>Kurye Ekranı</span>
          </Link>

          <Link to="/" target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ExternalLink size={15} style={{ color: 'var(--gold)' }} />
            <span>Müşteri Sitesi</span>
          </Link>

          <button type="button" className="linkbtn" onClick={handleSignOut} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <LogOut size={15} />
            <span>Güvenli Çıkış</span>
          </button>
        </div>
      </aside>

      <section className="main">
        <Outlet />
      </section>
    </div>
  );
}
