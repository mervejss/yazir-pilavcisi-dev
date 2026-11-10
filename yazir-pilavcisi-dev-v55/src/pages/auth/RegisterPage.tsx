import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import Logo from '@/components/ui/Logo';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';

export default function RegisterPage() {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [partnerBusinesses, setPartnerBusinesses] = useState<any[]>([]);
  useEffect(() => { supabase.rpc('public_referral_campaigns').then(({data,error}) => { if (!error) setPartnerBusinesses(data || []); }); }, []);
  const { signUp, loading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('Şifre en az 6 karakter olmalıdır');
      return;
    }
    try {
      await signUp(email, password, fullName, phone, referralCode);
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
            Referans Kodu (isteğe bağlı)
            <input
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
              placeholder="Varsa referans kodunuzu girin"
              autoCapitalize="characters"
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

        {partnerBusinesses.length > 0 && (
          <section style={{marginTop:'1.25rem',textAlign:'left',paddingTop:'1rem',borderTop:'1px solid var(--border)'}}>
            <h3 style={{fontSize:'1rem',marginBottom:'.5rem'}}>🤝 Anlaşmalı Olduğumuz İşletmeler</h3>
            {partnerBusinesses.map((b,i)=><div key={`${b.business_name}-${i}`} style={{display:'flex',justifyContent:'space-between',gap:'.5rem',padding:'.4rem 0',fontSize:'.88rem'}}>
              <b>{b.business_name}</b><span className="muted">Üye %{b.customer_discount} · Personel %{b.staff_discount}</span>
            </div>)}
          </section>
        )}

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
