import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useCustomerAddresses } from '@/hooks/useCustomerAddresses';
import { useCustomerOrders } from '@/hooks/useCustomerOrders';
import { useCartStore } from '@/stores/cartStore';
import { tl, formatDateTime } from '@/lib/helpers';
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@/lib/constants';
import StatusBadge from '@/components/ui/StatusBadge';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import LoyaltyCard from '@/components/LoyaltyCard';
import { useMyReviews, type ReviewableOrder } from '@/hooks/useMyReviews';
import ReviewModal from '@/components/reviews/ReviewModal';
import Stars from '@/components/ui/Stars';
import toast from 'react-hot-toast';
import { homeForRole, isPanelRole } from '@/lib/roleHome';

function CustomerProfile() {
  const { profile, user, signOut, updateProfile } = useAuthStore();
  const { addresses, addAddress, deleteAddress, updateAddress } = useCustomerAddresses();
  const { orders, loading: ordersLoading } = useCustomerOrders();
  const addItem = useCartStore((s) => s.addItem);
  const navigate = useNavigate();

  const [tab, setTab] = useState<'orders' | 'addresses' | 'info' | 'reviews'>(() =>
    new URLSearchParams(window.location.search).get('tab') === 'reviews' ? 'reviews' : 'orders',
  );
  const myReviews = useMyReviews();
  const [reviewOrder, setReviewOrder] = useState<ReviewableOrder | null>(null);
  const reviewByOrder = (id: string) => myReviews.rows.find((r) => r.order_id === id) || null;

  // Profile Edit State
  const [editingInfo, setEditingInfo] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [savingInfo, setSavingInfo] = useState(false);

  // Address Modal State
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [addressForm, setAddressForm] = useState({
    title: 'Ev',
    district: 'Yazır',
    full_address: '',
    lat: null as number | null,
    lng: null as number | null,
    is_default: false,
  });
  const [locLoading, setLocLoading] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    toast.success('Oturum kapatıldı');
    navigate('/');
  };

  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingInfo(true);
    try {
      await updateProfile(fullName, phone);
      toast.success('Profil bilgileriniz güncellendi');
      setEditingInfo(false);
    } catch (err: any) {
      toast.error(err.message || 'Güncellenemedi');
    } finally {
      setSavingInfo(false);
    }
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      toast.error('Tarayıcınız konum servisini desteklemiyor');
      return;
    }
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setAddressForm((f) => ({
          ...f,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }));
        setLocLoading(false);
        toast.success('Konum başarıyla alındı!');
      },
      () => {
        setLocLoading(false);
        toast.error('Konum alınamadı, lütfen izinleri kontrol edin');
      },
    );
  };

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addressForm.full_address.trim()) {
      toast.error('Lütfen açık adresinizi yazın');
      return;
    }
    try {
      await addAddress(addressForm);
      toast.success('Yeni adresiniz kaydedildi');
      setAddressModalOpen(false);
      setAddressForm({
        title: 'Ev',
        district: 'Yazır',
        full_address: '',
        lat: null,
        lng: null,
        is_default: false,
      });
    } catch (err: any) {
      toast.error(err.message || 'Adres kaydedilemedi');
    }
  };

  // Reorder complete order
  const handleRepeatOrder = (order: any) => {
    if (!order.order_items || order.order_items.length === 0) return;
    order.order_items.forEach((item: any) => {
      addItem(
        {
          id: item.product_id || item.id,
          name: item.product_name,
          category_id: '',
          slug: '',
          description: '',
          emoji: '🍚',
          image_path: null,
          kcal: 0,
          protein_g: 0,
          carb_g: 0,
          is_daily: false,
          is_active: true,
          is_sold_out: false,
          sort_order: 0,
          created_at: '',
          updated_at: '',
        },
        {
          id: item.variant_id || item.id,
          product_id: item.product_id || item.id,
          name: item.variant_name || '1 porsiyon',
          price: Number(item.unit_price),
          sort_order: 0,
          is_active: true,
          created_at: '',
          updated_at: '',
        },
      );
    });
    toast.success('Sipariş içeriği sepete eklendi!');
    navigate('/siparis');
  };

  // Add single item from past order
  const handleAddSingleItem = (item: any) => {
    addItem(
      {
        id: item.product_id || item.id,
        name: item.product_name,
        category_id: '',
        slug: '',
        description: '',
        emoji: '🍚',
        image_path: null,
        kcal: 0,
        protein_g: 0,
        carb_g: 0,
        is_daily: false,
        is_active: true,
        is_sold_out: false,
        sort_order: 0,
        created_at: '',
        updated_at: '',
      },
      {
        id: item.variant_id || item.id,
        product_id: item.product_id || item.id,
        name: item.variant_name || '1 porsiyon',
        price: Number(item.unit_price),
        sort_order: 0,
        is_active: true,
        created_at: '',
        updated_at: '',
      },
    );
    toast.success(`${item.product_name} sepete eklendi`);
  };

  if (!user) {
    return (
      <main className="page narrow center">
        <h1>Profilime Erişmek İçin Giriş Yapın</h1>
        <p className="muted">
          Siparişlerinizi takip etmek ve kayıtlı adreslerinizi görmek için lütfen müşteri hesabınıza giriş yapın.
        </p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1.5rem' }}>
          <Link to="/giris" className="btn gold">
            Giriş Yap
          </Link>
          <Link to="/kayit" className="btn ghost">
            Kayıt Ol
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="bar" style={{ flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1>Müşteri Profilim</h1>
          <LoyaltyCard />
          <p className="muted" style={{ margin: 0 }}>
            {profile?.full_name} · {profile?.email || user.email}
          </p>
        </div>
        <button
          type="button"
          className="btn sm"
          style={{ background: 'var(--danger-bg)', color: 'var(--danger-text)', border: '1px solid var(--danger)' }}
          onClick={handleSignOut}
        >
          Çıkış Yap
        </button>
      </div>

      {/* Tabs */}
      <div className="seg wide" style={{ marginBottom: '1.5rem' }}>
        <button
          type="button"
          className={tab === 'orders' ? 'on' : ''}
          onClick={() => setTab('orders')}
        >
          📦 Geçmiş Siparişlerim ({orders.length})
        </button>
        {!myReviews.unavailable && (
          <button type="button" className={tab === 'reviews' ? 'on' : ''} onClick={() => setTab('reviews')}>
            ⭐ Değerlendirmelerim{myReviews.pending.length > 0 ? ` (${myReviews.pending.length} bekliyor)` : ''}
          </button>
        )}
        <button
          type="button"
          className={tab === 'addresses' ? 'on' : ''}
          onClick={() => setTab('addresses')}
        >
          📍 Kayıtlı Adreslerim ({addresses.length})
        </button>
        <button
          type="button"
          className={tab === 'info' ? 'on' : ''}
          onClick={() => {
            setFullName(profile?.full_name || '');
            setPhone(profile?.phone || '');
            setTab('info');
          }}
        >
          👤 Hesap Bilgilerim
        </button>
      </div>

      {/* TAB 1: GEÇMİŞ SİPARİŞLER */}
      {tab === 'orders' && (
        <section>
          {ordersLoading ? (
            <LoadingSpinner text="Siparişleriniz yükleniyor..." />
          ) : orders.length === 0 ? (
            <div className="card center" style={{ padding: '3rem 1rem' }}>
              <h3>Henüz verilmiş bir siparişiniz bulunmuyor.</h3>
              <p className="muted">Nefis tereyağlı pilavlarımızdan dilediğinizi hemen sipariş verebilirsiniz.</p>
              <Link to="/menu" className="btn gold" style={{ marginTop: '1rem' }}>
                Menüyü İncele & Sipariş Ver
              </Link>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '1.2rem' }}>
              {orders.map((o) => (
                <div key={o.id} className="card" style={{ padding: '1.4rem' }}>
                  <div className="orow" style={{ flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.8rem' }}>
                    <div>
                      <b style={{ fontSize: '1.2rem' }}>Sipariş #{o.order_no}</b>
                      <span className="muted small" style={{ marginLeft: '0.6rem' }}>
                        {formatDateTime(o.created_at)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <StatusBadge status={o.status} />
                      <b className="price" style={{ fontSize: '1.3rem' }}>
                        {tl(o.total)}
                      </b>
                    </div>
                  </div>

                  {o.delivery_address && (
                    <p className="small muted" style={{ margin: '0.3rem 0' }}>
                      📍 Teslimat Adresi: {o.delivery_address} {o.district ? `(${o.district})` : ''}
                    </p>
                  )}

                  <p className="small muted" style={{ margin: '0.3rem 0' }}>
                    Ödeme: {PAYMENT_METHOD_LABELS[o.payment_method || ''] || o.payment_method || 'Kapıda Nakit'}
                  </p>

                  {/* Kalemler */}
                  <div style={{ background: 'var(--surface)', borderRadius: '10px', padding: '0.8rem', margin: '0.8rem 0' }}>
                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem' }}>Sipariş Kalemleri:</h4>
                    {o.order_items?.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.35rem 0',
                          borderBottom: '1px solid var(--line)',
                          fontSize: '0.9rem',
                        }}
                      >
                        <span>
                          <b>{item.quantity}×</b> {item.product_name}
                          {item.variant_name && <small className="muted"> ({item.variant_name})</small>}
                        </span>
                        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                          <span>{tl(item.line_total || item.unit_price * item.quantity)}</span>
                          <button
                            type="button"
                            className="btn ghost sm"
                            style={{ padding: '0.2em 0.6em', fontSize: '0.75rem' }}
                            onClick={() => handleAddSingleItem(item)}
                            title="Bu ürünü tek başına sepete ekle"
                          >
                            + Sepete Ekle
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Butonlar */}
                  <div className="prow" style={{ marginTop: '1rem', gap: '0.6rem' }}>
                    <Link to={`/takip/${o.id}`} className="btn ghost sm">
                      Canlı Durumu Takip Et →
                    </Link>
                    <button
                      type="button"
                      className="btn gold sm"
                      onClick={() => handleRepeatOrder(o)}
                    >
                      🔁 Tüm Siparişi Tekrarla
                    </button>
                    {o.status === 'delivered' && (o as any).source === 'web' && !myReviews.unavailable && (() => {
                      const rv = reviewByOrder(o.id);
                      if (!rv) return null;
                      return (
                        <button type="button" className={`btn sm ${rv.review_id ? 'ghost' : 'gold'} rv-order-btn`} onClick={() => setReviewOrder(rv)}>
                          {rv.review_id ? <>⭐ {(((rv.taste_rating || 0) + (rv.service_rating || 0) + (rv.delivery_rating || 0)) / (rv.delivery_rating ? 3 : 2)).toFixed(1)} · Yorumu düzenle</> : '⭐ Siparişi değerlendir'}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* TAB: DEĞERLENDİRMELERİM */}
      {tab === 'reviews' && (
        <section className="rv-mine">
          {myReviews.loading ? (
            <LoadingSpinner text="Yükleniyor..." />
          ) : myReviews.rows.length === 0 ? (
            <div className="card center" style={{ padding: '3rem 1rem' }}>
              <h3>Henüz değerlendirebileceğiniz bir siparişiniz yok</h3>
              <p className="muted">Web sitesinden verdiğiniz siparişler teslim edildikten sonra burada görünür.</p>
              <Link to="/menu" className="btn gold" style={{ marginTop: '1rem' }}>Menüyü İncele & Sipariş Ver</Link>
            </div>
          ) : (
            <>
              {myReviews.pending.length > 0 && (
                <>
                  <h3 className="rv-mine-h">⏳ Değerlendirme bekleyenler</h3>
                  <div className="rv-mine-grid">
                    {myReviews.pending.map((o, i) => (
                      <article key={o.order_id} className="rv-mine-card pending" style={{ ['--i' as any]: i }}>
                        <div><b>Sipariş #{o.order_no}</b><small className="muted">{formatDateTime(o.delivered_at || o.created_at)}</small></div>
                        <p className="small muted">{o.items || ''}</p>
                        <button type="button" className="btn gold sm" onClick={() => setReviewOrder(o)}>⭐ Değerlendir</button>
                      </article>
                    ))}
                  </div>
                </>
              )}
              {myReviews.done.length > 0 && (
                <>
                  <h3 className="rv-mine-h">✅ Yorumlarım</h3>
                  <div className="rv-mine-grid">
                    {myReviews.done.map((o, i) => {
                      const overall = ((o.taste_rating || 0) + (o.service_rating || 0) + (o.delivery_rating || 0)) / (o.delivery_rating ? 3 : 2);
                      return (
                        <article key={o.order_id} className="rv-mine-card" style={{ ['--i' as any]: i }}>
                          <div className="orow">
                            <b>Sipariş #{o.order_no}</b>
                            <span className="rv-score"><Stars rating={overall} size={16} /> <b>{overall.toFixed(1)}</b></span>
                          </div>
                          <div className="rv-minis">
                            <span className="rv-mini">😋 {o.taste_rating?.toFixed(1)}</span>
                            {o.delivery_rating != null && <span className="rv-mini">🛵 {o.delivery_rating.toFixed(1)}</span>}
                            <span className="rv-mini">🤝 {o.service_rating?.toFixed(1)}</span>
                            {!o.is_published && <span className="rv-mini hid">Yönetici tarafından gizlendi</span>}
                          </div>
                          {o.comment && <p className="rv-body">{o.comment}</p>}
                          {o.admin_reply && <div className="rv-reply"><b>🍚 İşletme yanıtı</b><p>{o.admin_reply}</p></div>}
                          <button type="button" className="btn ghost sm" onClick={() => setReviewOrder(o)}>✏️ Düzenle / Sil</button>
                        </article>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </section>
      )}

      {/* TAB 2: KAYITLI ADRESLER */}
      {tab === 'addresses' && (
        <section>
          <div className="bar">
            <h3>Kayıtlı Teslimat Adreslerim</h3>
            <button
              type="button"
              className="btn gold sm"
              onClick={() => setAddressModalOpen(true)}
            >
              + Yeni Adres Ekle
            </button>
          </div>

          <div className="grid">
            {addresses.map((a) => (
              <div key={a.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div className="orow">
                  <b>📍 {a.title}</b>
                  {a.is_default && (
                    <span className="pill ok" style={{ fontSize: '0.75rem', margin: 0 }}>
                      Varsayılan
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: '0.92rem', color: 'var(--text)' }}>
                  {a.full_address}
                </p>
                {a.district && <span className="small muted">Bölge: {a.district}</span>}
                {a.lat && a.lng && (
                  <span className="small muted">
                    🌐 Harita Pini: {Number(a.lat).toFixed(4)}, {Number(a.lng).toFixed(4)}
                  </span>
                )}

                <div className="prow" style={{ marginTop: 'auto', paddingTop: '0.8rem' }}>
                  {!a.is_default && (
                    <button
                      type="button"
                      className="btn ghost sm"
                      style={{ fontSize: '0.75rem', padding: '0.3em 0.6em' }}
                      onClick={() => updateAddress(a.id, { is_default: true })}
                    >
                      Varsayılan Yap
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn sm"
                    style={{ background: 'var(--danger-bg)', color: 'var(--danger-text)', fontSize: '0.75rem', padding: '0.3em 0.6em' }}
                    onClick={() => {
                      if (window.confirm('Bu adresi silmek istediğinize emin misiniz?')) {
                        deleteAddress(a.id);
                      }
                    }}
                  >
                    Sil
                  </button>
                </div>
              </div>
            ))}
            {addresses.length === 0 && (
              <div className="card center" style={{ gridColumn: '1 / -1', padding: '2.5rem' }}>
                <p className="muted">Henüz kayıtlı bir adresiniz bulunmuyor.</p>
                <button
                  type="button"
                  className="btn gold sm"
                  onClick={() => setAddressModalOpen(true)}
                >
                  İlk Adresinizi Ekleyin
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* TAB 3: HESAP BİLGİLERİM */}
      {tab === 'info' && (
        <section className="card narrow" style={{ maxWidth: '540px' }}>
          <h3>Kişisel Bilgiler</h3>
          <p className="muted small">Siparişlerinizde ve fatura işlemlerinizde bu bilgiler kullanılır.</p>

          <form onSubmit={handleSaveInfo} className="form" style={{ marginTop: '1rem' }}>
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
                required
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0540 000 00 00"
              />
            </label>
            <label>
              Kayıtlı E-posta (Değiştirilemez)
              <input disabled value={profile?.email || user.email || ''} style={{ opacity: 0.6 }} />
            </label>

            <button type="submit" className="btn gold" disabled={savingInfo} style={{ marginTop: '0.5rem' }}>
              {savingInfo ? 'Kaydediliyor...' : 'Bilgilerimi Güncelle'}
            </button>
          </form>
        </section>
      )}

      {/* Yeni Adres Ekle Modal */}
      <Modal open={addressModalOpen} onClose={() => setAddressModalOpen(false)}>
        <h2>Yeni Teslimat Adresi Ekle</h2>
        <p className="muted small">Adresinizi ve konumunuzu kaydederek sonraki siparişlerinizi tek tıkla verebilirsiniz.</p>

        <form onSubmit={handleSaveAddress} className="form">
          <div className="two-col">
            <label>
              Adres Başlığı
              <input
                required
                value={addressForm.title}
                onChange={(e) => setAddressForm({ ...addressForm, title: e.target.value })}
                placeholder="Örn: Evim, İşyeri, Annem"
              />
            </label>
            <label>
              Semt / Mahalle
              <input
                value={addressForm.district}
                onChange={(e) => setAddressForm({ ...addressForm, district: e.target.value })}
                placeholder="Yazır, Bosna Hersek..."
              />
            </label>
          </div>

          <label>
            Açık Adres (Sokak, Bina No, Kat, Daire)
            <textarea
              required
              rows={3}
              value={addressForm.full_address}
              onChange={(e) => setAddressForm({ ...addressForm, full_address: e.target.value })}
              placeholder="Mahalle, Cadde, Sokak, No: 12 Kat: 3 Daire: 7"
            />
          </label>

          <div className="locrow" style={{ marginTop: '0.3rem' }}>
            <button
              type="button"
              className="btn ghost sm"
              onClick={handleLocateMe}
              disabled={locLoading}
            >
              {locLoading ? 'Konum Alınıyor...' : '📍 Harita Konumumu Ekle'}
            </button>
            {addressForm.lat && addressForm.lng && (
              <span className="small muted">
                ✓ GPS Eklendi ({addressForm.lat.toFixed(4)}, {addressForm.lng.toFixed(4)})
              </span>
            )}
          </div>

          <label className="radio" style={{ marginTop: '0.5rem' }}>
            <input
              type="checkbox"
              checked={addressForm.is_default}
              onChange={(e) => setAddressForm({ ...addressForm, is_default: e.target.checked })}
            />
            Bu adresi varsayılan teslimat adresi olarak ayarla
          </label>

          <div className="prow" style={{ marginTop: '1.2rem' }}>
            <button type="submit" className="btn gold">
              Adresi Kaydet
            </button>
            <button type="button" className="btn ghost" onClick={() => setAddressModalOpen(false)}>
              Vazgeç
            </button>
          </div>
        </form>
      </Modal>
      <ReviewModal order={reviewOrder} onClose={() => setReviewOrder(null)} onSaved={myReviews.refetch} />
    </main>
  );
}

/** Personel / kurye hesapları müşteri profilini kullanamaz: kendi paneline döner.
 *  (Müşteri olarak sipariş vermek isteyen personel ayrı bir e-posta ile müşteri hesabı açmalıdır.) */
export default function ProfilePage() {
  const role = useAuthStore((s) => s.profile?.role);
  if (isPanelRole(role)) {
    return <StaffBounce to={homeForRole(role)} />;
  }
  return <CustomerProfile />;
}

function StaffBounce({ to }: { to: string }) {
  useEffect(() => {
    toast('Personel hesapları müşteri profilini kullanmaz. Müşteri olarak sipariş vermek için ayrı bir e-posta ile müşteri hesabı açın.', { icon: 'ℹ️', duration: 6000, id: 'staff-bounce' });
  }, []);
  return <Navigate to={to} replace />;
}
