import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

// Public pages
import PublicLayout from '@/pages/public/PublicLayout';
import Home from '@/pages/public/Home';
import MenuPage from '@/pages/public/MenuPage';
import OrderPage from '@/pages/public/OrderPage';
import ProfilePage from '@/pages/public/ProfilePage';
import BulkPage from '@/pages/public/BulkPage';
import ReviewsPage from '@/pages/public/ReviewsPage';
import ContactPage from '@/pages/public/ContactPage';
import TrackPage from '@/pages/public/TrackPage';
import QrMenuPage from '@/pages/public/QrMenuPage';
import GalleryPage from '@/pages/public/GalleryPage';

// Auth pages
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';
import StaffLoginPage from '@/pages/auth/StaffLoginPage';

// Admin pages
import AdminLayout from '@/pages/admin/AdminLayout';
import Dashboard from '@/pages/admin/Dashboard';
import OrdersBoard from '@/pages/admin/OrdersBoard';
import PastOrders from '@/pages/admin/PastOrders';
import MenuAdmin from '@/pages/admin/MenuAdmin';
import TablesAdmin from '@/pages/admin/TablesAdmin';
import CouriersAdmin from '@/pages/admin/CouriersAdmin';
import Analytics from '@/pages/admin/Analytics';
import FeedbackAdmin from '@/pages/admin/FeedbackAdmin';
import UsersAdmin from '@/pages/admin/UsersAdmin';
import SettingsAdmin from '@/pages/admin/SettingsAdmin';
import LiveMap from '@/pages/admin/LiveMap';
import GalleryAdmin from '@/pages/admin/GalleryAdmin';
import GoogleReviewsAdmin from '@/pages/admin/GoogleReviewsAdmin';
import FinanceAdmin from '@/pages/admin/FinanceAdmin';
import PaymentsAdmin from '@/pages/admin/PaymentsAdmin';

// Courier pages
import CourierApp from '@/pages/courier/CourierApp';
import IntegrationsOverview from '@/pages/admin/integrations/IntegrationsOverview';
import {
    TrendyolGoPage, YemeksepetiPage, MigrosYemekPage, GetirYemekPage, OtherPlatformsPage,
} from '@/pages/admin/integrations/PlatformRoutes';

import CampaignsPage from '@/pages/public/CampaignsPage';
import CustomersAdmin from '@/pages/admin/CustomersAdmin';
import CouponsAdmin from '@/pages/admin/CouponsAdmin';
import AuditAdmin from '@/pages/admin/AuditAdmin';
import BackupsAdmin from '@/pages/admin/BackupsAdmin';
import ReviewsAdmin from '@/pages/admin/ReviewsAdmin';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
    const { profile, initialized } = useAuthStore();

    if (!initialized) return <LoadingSpinner />;
    if (!profile) return <Navigate to="/giris" replace />;
    if (allowedRoles && !allowedRoles.includes(profile.role)) {
        return <Navigate to="/" replace />;
    }
    return <>{children}</>;
}

export default function App() {
    const initialize = useAuthStore((s) => s.initialize);

    useEffect(() => {
        initialize();
    }, [initialize]);

    return (
        <Routes>
            {/* Public Routes */}
            <Route element={<PublicLayout />}>
                <Route index element={<Home />} />
                <Route path="menu" element={<MenuPage />} />
                <Route path="siparis" element={<OrderPage />} />
                <Route path="profil" element={<ProfilePage />} />
                <Route path="toplu" element={<BulkPage />} />
                <Route path="galeri" element={<GalleryPage />} />
                <Route path="kampanyalar" element={<CampaignsPage />} />
                <Route path="yorumlar" element={<ReviewsPage />} />
                <Route path="iletisim" element={<ContactPage />} />
                <Route path="takip/:orderId" element={<TrackPage />} />
                <Route path="qr/:token" element={<QrMenuPage />} />
            </Route>

            {/* Auth Routes */}
            <Route path="giris" element={<LoginPage />} />
            <Route path="kayit" element={<RegisterPage />} />
            <Route path="personel-giris" element={<StaffLoginPage />} />

            {/* Admin Panel Routes */}
            <Route
                path="admin"
                element={
                    <ProtectedRoute allowedRoles={['owner', 'sub_admin', 'operator']}>
                        <AdminLayout />
                    </ProtectedRoute>
                }
            >
                <Route index element={<Dashboard />} />
                <Route path="siparisler" element={<OrdersBoard />} />
                <Route path="gecmis-siparisler" element={<PastOrders />} />
                <Route path="menu" element={<MenuAdmin />} />
                <Route path="galeri" element={<GalleryAdmin />} />
                <Route path="musteriler" element={<CustomersAdmin />} />
                <Route path="kuponlar" element={<CouponsAdmin />} />
                <Route path="gecmis" element={<AuditAdmin />} />
                <Route path="yedekler" element={<BackupsAdmin />} />
                <Route path="masalar" element={<TablesAdmin />} />
                <Route path="kuryeler" element={<CouriersAdmin />} />
                <Route path="harita" element={<LiveMap />} />
                <Route path="analiz" element={<Analytics />} />
                <Route path="finans" element={<FinanceAdmin />} />
                <Route path="odemeler" element={<ProtectedRoute allowedRoles={['owner']}><PaymentsAdmin /></ProtectedRoute>} />
                <Route path="geribildirim" element={<FeedbackAdmin />} />
                <Route path="kullanicilar" element={<UsersAdmin />} />
                <Route path="ayarlar" element={<SettingsAdmin />} />
                <Route path="entegrasyonlar" element={<IntegrationsOverview />} />
                <Route path="entegrasyonlar/trendyol" element={<TrendyolGoPage />} />
                <Route path="entegrasyonlar/yemeksepeti" element={<YemeksepetiPage />} />
                <Route path="entegrasyonlar/migros" element={<MigrosYemekPage />} />
                <Route path="entegrasyonlar/getir" element={<GetirYemekPage />} />
                <Route path="entegrasyonlar/diger" element={<OtherPlatformsPage />} />
                <Route path="google-yorumlar" element={<GoogleReviewsAdmin />} />
                <Route path="yorumlar" element={<ReviewsAdmin />} />
            </Route>

            {/* Courier App Route */}
            <Route
                path="kurye"
                element={
                    <ProtectedRoute allowedRoles={['courier', 'owner', 'sub_admin', 'operator']}>
                        <CourierApp />
                    </ProtectedRoute>
                }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}