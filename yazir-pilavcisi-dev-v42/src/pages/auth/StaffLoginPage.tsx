import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import Logo from '@/components/ui/Logo';
import { afterLoginPath, isPanelRole } from '@/lib/roleHome';
import toast from 'react-hot-toast';

export default function StaffLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { signIn, loading } = useAuthStore();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const profile0 = useAuthStore((s) => s.profile);
  const initialized = useAuthStore((s) => s.initialized);

  // Zaten giriş yapılmışsa tekrar şifre sorma: doğrudan paneline git
  useEffect(() => {
    if (!initialized || !profile0) return;
    if (isPanelRole(profile0.role)) navigate(afterLoginPath(profile0.role, from), { replace: true });
  }, [initialized, profile0, navigate, from]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signIn(email, password);
      // Profil kontrolü
      let profile = useAuthStore.getState().profile;
      if (!profile) {
        await useAuthStore.getState().fetchProfile();
        profile = useAuthStore.getState().profile;
      }
      if (!profile) {
        toast.error('Kullanıcı profili okunamadı. Lütfen 00_quick_fix.sql scriptini Supabase SQL Editor\'da çalıştırdığınızdan emin olun.');
        return;
      }

      if (profile.role === 'courier') {
        toast.success(`Hoş geldin Kurye ${profile.full_name}!`);
        navigate(afterLoginPath(profile.role, from), { replace: true });
      } else if (isPanelRole(profile.role)) {
        toast.success(`Yönetim paneline hoş geldiniz, ${profile.full_name}`);
        navigate(afterLoginPath(profile.role, from), { replace: true });
      } else {
        // Müşteri hesabı personel portalında kalmasın
        await useAuthStore.getState().signOut();
        toast.error('Bu portal yalnızca personele ve kuryelere aittir. Müşteri girişini kullanın.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Personel girişi başarısız');
    }
  };

  return (
    <div className="login" style={{ background: '#191612' }}>
      <div className="login-card" style={{ border: '2px solid var(--gold)', maxWidth: '420px' }}>
        <div style={{ margin: 'auto' }}>
          <Logo dark />
        </div>
        <h1 style={{ fontSize: '1.8rem', margin: '0.4rem 0' }}>Personel & Kurye Portalı</h1>
        <p className="muted small">
          İşletme Sahibi, Operatör, Kasa ve Kurye hesapları için güvenli giriş
        </p>

        <form onSubmit={handleSubmit} className="form" style={{ textAlign: 'left', marginTop: '0.5rem' }}>
          <label>
            Personel E-postası
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="personel@yazirpilavcisi.com"
            />
          </label>
          <label>
            Şifre
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </label>
          <button
            type="submit"
            className="btn gold"
            disabled={loading}
            style={{ width: '100%', marginTop: '0.5rem' }}
          >
            {loading ? 'Doğrulanıyor...' : 'Personel Girişi Yap'}
          </button>
        </form>

        <div style={{ borderTop: '1px solid var(--line)', paddingTop: '1rem', marginTop: '1rem' }}>
          <Link to="/giris" className="muted small">
            Müşteri misiniz? <b>Müşteri Girişine Dön ←</b>
          </Link>
        </div>

        <Link to="/" className="muted small">
          ← Ana sayfaya dön
        </Link>
      </div>
    </div>
  );
}
