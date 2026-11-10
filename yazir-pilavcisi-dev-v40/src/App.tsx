import { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

// Public pages
import PublicLayout from '@/pages/public/PublicLayout';
import Home from '@/pages/public/Home';
const MenuPage = lazy(() => import('@/pages/public/MenuPage'));
const OrderPage = lazy(() => import('@/pages/public/OrderPage'));
const ProfilePage = lazy(() => import('@/pages/public/ProfilePage'));
const BulkPage = lazy(() => import('@/pages/public/BulkPage'));
const ReviewsPage = lazy(() => import('@/pages/public/ReviewsPage'));
const ContactPage = lazy(() => import('@/pages/public/ContactPage'));
const TrackPage = lazy(() => import('@/pages/public/TrackPage'));
const QrMenuPage = lazy(() => import('@/pages/public/QrMenuPage'));
const PilavRestoraniPage = lazy(() => import('@/pages/public/PilavRestoraniPage'));
const GalleryPage = lazy(() => import('@/pages/public/GalleryPage'));

// Auth pages
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage'));
const StaffLoginPage = lazy(() => import('@/pages/auth/StaffLoginPage'));

// Admin pages
const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout'));
const Dashboard = lazy(() => import('@/pages/admin/Dashboard'));
const OrdersBoard = lazy(() => import('@/pages/admin/OrdersBoard'));
const PastOrders = lazy(() => import('@/pages/admin/PastOrders'));
const MenuAdmin = lazy(() => import('@/pages/admin/MenuAdmin'));
const TablesAdmin = lazy(() => import('@/pages/admin/TablesAdmin'));
const CouriersAdmin = lazy(() => import('@/pages/admin/CouriersAdmin'));
const Analytics = lazy(() => import('@/pages/admin/Analytics'));
const FeedbackAdmin = lazy(() => import('@/pages/admin/FeedbackAdmin'));
const UsersAdmin = lazy(() => import('@/pages/admin/UsersAdmin'));
const SettingsAdmin = lazy(() => import('@/pages/admin/SettingsAdmin'));
const LiveMap = lazy(() => import('@/pages/admin/LiveMap'));
const GalleryAdmin = lazy(() => import('@/pages/admin/GalleryAdmin'));
const GoogleReviewsAdmin = lazy(() => import('@/pages/admin/GoogleReviewsAdmin'));
const FinanceAdmin = lazy(() => import('@/pages/admin/FinanceAdmin'));
const PaymentsAdmin = lazy(() => import('@/pages/admin/PaymentsAdmin'));

// Courier pages
const CourierApp = lazy(() => import('@/pages/courier/CourierApp'));
const IntegrationsOverview = lazy(() => import('@/pages/admin/integrations/IntegrationsOverview'));
const PlatformRoutes = () => import('@/pages/admin/integrations/PlatformRoutes');
const TrendyolGoPage = lazy(() => PlatformRoutes().then((m) => ({ default: m.TrendyolGoPage })));
const YemeksepetiPage = lazy(() => PlatformRoutes().then((m) => ({ default: m.YemeksepetiPage })));
const MigrosYemekPage = lazy(() => PlatformRoutes().then((m) => ({ default: m.MigrosYemekPage })));
const GetirYemekPage = lazy(() => PlatformRoutes().then((m) => ({ default: m.GetirYemekPage })));
const OtherPlatformsPage = lazy(() => PlatformRoutes().then((m) => ({ default: m.OtherPlatformsPage })));

const CampaignsPage = lazy(() => import('@/pages/public/CampaignsPage'));
const CustomersAdmin = lazy(() => import('@/pages/admin/CustomersAdmin'));
const CouponsAdmin = lazy(() => import('@/pages/admin/CouponsAdmin'));
const AuditAdmin = lazy(() => import('@/pages/admin/AuditAdmin'));
const BackupsAdmin = lazy(() => import('@/pages/admin/BackupsAdmin'));
const ReviewsAdmin = lazy(() => import('@/pages/admin/ReviewsAdmin'));
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
        <Suspense fallback={<LoadingSpinner />}>
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
                <Route path="pilav-restorani" element={<PilavRestoraniPage />} />
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
        </Suspense>
    );
}