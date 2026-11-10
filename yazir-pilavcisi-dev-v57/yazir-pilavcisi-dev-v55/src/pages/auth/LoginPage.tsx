import { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import Logo from '@/components/ui/Logo';
import { afterLoginPath, isPanelRole } from '@/lib/roleHome';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { signIn, loading } = useAuthStore();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const profile0 = useAuthStore((s) => s.profile);
  const initialized = useAuthStore((s) => s.initialized);

  // Personel / kurye hesabı zaten açıksa müşteri girişinde bekletme: kendi paneline git
  useEffect(() => {
    if (initialized && profile0 && isPanelRole(profile0.role)) navigate(afterLoginPath(profile0.role, from), { replace: true });
  }, [initialized, profile0, navigate, from]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signIn(email, password);
      let profile = useAuthStore.getState().profile;
      if (!profile) {
        await useAuthStore.getState().fetchProfile();
        profile = useAuthStore.getState().profile;
      }
      // Admin / operatör / kurye hesapları müşteri profiline DEĞİL, kendi paneline gider
      if (profile && isPanelRole(profile.role)) {
        toast.success('Personel hesabı: panele yönlendiriliyorsunuz.');
        navigate(afterLoginPath(profile.role, from), { replace: true });
        return;
      }
      toast.success('Giriş başarılı! Hoş geldiniz.');
      navigate('/profil');
    } catch (err: any) {
      toast.error(err.message || 'E-posta veya şifre hatalı');
    }
  };

  return (
    <div className="login">
      <div className="login-card">
        <Link to="/" style={{ textDecoration: 'none' }}>
          <Logo dark />
        </Link>
        <h1>Müşteri Girişi</h1>
        <p className="muted">
          Siparişlerinizi takip etmek, kayıtlı adreslerinizi yönetmek ve hızlı sipariş vermek için giriş yapın.
        </p>
        <form onSubmit={handleSubmit} className="form" style={{ textAlign: 'left' }}>
          <label>
            E-posta Adresi
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ornek@domain.com"
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
            {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>

        <div style={{ marginTop: '1rem', fontSize: '0.95rem' }}>
          Hesabınız yok mu?{' '}
          <Link to="/kayit" style={{ color: 'var(--gold-ink)', fontWeight: 700 }}>
            Kayıt Olun
          </Link>
        </div>

        <div style={{ borderTop: '1px solid var(--line)', paddingTop: '1rem', marginTop: '0.5rem' }}>
          <Link to="/personel-giris" className="muted small">
            Restoran personeli veya kurye misiniz? <b>Personel Girişi →</b>
          </Link>
        </div>

        <Link to="/" className="muted small" style={{ marginTop: '0.5rem' }}>
          ← Ana sayfaya dön
        </Link>
      </div>
    </div>
  );
}
