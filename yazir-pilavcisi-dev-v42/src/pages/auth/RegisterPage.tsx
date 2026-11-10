import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import Logo from '@/components/ui/Logo';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { signUp, loading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('Şifre en az 6 karakter olmalıdır');
      return;
    }
    try {
      await signUp(email, password, fullName, phone);
      toast.success('Hesabınız oluşturuldu! Hoş geldiniz.');
      navigate('/profil');
    } catch (err: any) {
      toast.error(err.message || 'Kayıt işlemi tamamlanamadı');
    }
  };

  return (
    <div className="login">
      <div className="login-card">
        <Link to="/" style={{ textDecoration: 'none' }}>
          <Logo dark />
        </Link>
        <h1>Müşteri Kaydı</h1>
        <p className="muted">
          Hızlı sipariş vermek, adreslerinizi kaydetmek ve geçmiş siparişlerinizi incelemek için hesap oluşturun.
        </p>
        <form onSubmit={handleSubmit} className="form" style={{ textAlign: 'left' }}>
          <label>
            Ad Soyad
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ahmet Yılmaz"
            />
          </label>
          <label>
            Telefon Numarası
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0540 000 00 00"
            />
          </label>
          <label>
            E-posta Adresi
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ahmet@domain.com"
            />
          </label>
          <label>
            Şifre
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="En az 6 karakter"
            />
          </label>
          <button
            type="submit"
            className="btn gold"
            disabled={loading}
            style={{ width: '100%', marginTop: '0.5rem' }}
          >
            {loading ? 'Hesap Oluşturuluyor...' : 'Kayıt Ol ve Başla'}
          </button>
        </form>

        <div style={{ marginTop: '1rem', fontSize: '0.95rem' }}>
          Zaten hesabınız var mı?{' '}
          <Link to="/giris" style={{ color: 'var(--gold-ink)', fontWeight: 700 }}>
            Giriş Yapın
          </Link>
        </div>

        <Link to="/" className="muted small" style={{ marginTop: '0.5rem' }}>
          ← Ana sayfaya dön
        </Link>
      </div>
    </div>
  );
}
