import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useCartStore } from '@/stores/cartStore';
import { useAuthStore } from '@/stores/authStore';
import { useCustomerAddresses } from '@/hooks/useCustomerAddresses';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { supabase } from '@/lib/supabase';
import { tl } from '@/lib/helpers';
import { PAYMENT_METHOD_LABELS } from '@/lib/constants';
import ProductImage from '@/components/ui/ProductImage';
import toast from 'react-hot-toast';
import {
  Bike,
  Store,
  MapPin,
  CreditCard,
  Banknote,
  Send,
  CheckCircle,
  Plus,
  Minus,
  Trash2,
  Clock,
  Sparkles,
  ShoppingBag,
} from 'lucide-react';

interface OrderResult {
  order_id: string;
  order_no: number;
  total: number;
  status: string;
}

export default function OrderPage() {
  const { items, changeQty, clearCart, total, tableToken } = useCartStore();
  const { user, profile } = useAuthStore();
  const { addresses } = useCustomerAddresses();
  const { settings } = useBusinessSettings();
  const cartTotal = total();

  // Order type: delivery vs pickup
  const [orderType, setOrderType] = useState<'delivery' | 'pickup'>('delivery');
  const [selectedAddrId, setSelectedAddrId] = useState<string>('custom');
  const [form, setForm] = useState({
    name: profile?.full_name || '',
    phone: profile?.phone || '',
    address: '',
    district: 'Yazır',
    note: '',
    payment: 'cash_on_delivery' as string,
    saveAddress: false,
    addressTitle: 'Ev',
  });
  const [loc, setLoc] = useState<[number, number] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<OrderResult | null>(null);

  // Sync profile data
  useEffect(() => {
    if (profile) {
      setForm((f) => ({
        ...f,
        name: f.name || profile.full_name || '',
        phone: f.phone || profile.phone || '',
      }));
    }
  }, [profile]);

  // Set default address
  useEffect(() => {
    if (addresses.length > 0 && selectedAddrId === 'custom') {
      const def = addresses.find((a) => a.is_default) || addresses[0];
      setSelectedAddrId(def.id);
      setForm((f) => ({
        ...f,
        address: def.full_address,
        district: def.district || 'Yazır',
      }));
      if (def.lat && def.lng) {
        setLoc([Number(def.lat), Number(def.lng)]);
      }
    }
  }, [addresses]);

  const handleSelectSavedAddress = (addrId: string) => {
    setSelectedAddrId(addrId);
    if (addrId === 'custom') {
      setForm((f) => ({ ...f, address: '', district: 'Yazır' }));
      setLoc(null);
    } else {
      const selected = addresses.find((a) => a.id === addrId);
      if (selected) {
        setForm((f) => ({
          ...f,
          address: selected.full_address,
          district: selected.district || 'Yazır',
        }));
        if (selected.lat && selected.lng) {
          setLoc([Number(selected.lat), Number(selected.lng)]);
        }
      }
    }
  };

  const locate = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => {
          setLoc([p.coords.latitude, p.coords.longitude]);
          toast.success('GPS Konumunuz başarıyla eklendi!', { icon: '📍' });
        },
        () => toast.error('Konum alınamadı, lütfen tarayıcı izinlerini kontrol edin.'),
      );
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      toast.error('Sepetinizde ürün bulunmuyor');
      return;
    }

    setSubmitting(true);
    try {
      const isDineIn = !!tableToken;
      const actualType = isDineIn ? 'dine_in' : orderType;

      const { data, error } = await supabase.rpc('place_order', {
        p_customer: {
          name: form.name.trim() || (actualType === 'pickup' ? 'Gel-Al Müşteri' : 'Müşteri'),
          phone: form.phone.trim() || (actualType === 'pickup' ? '05000000000' : '05000000000'),
          address: actualType === 'delivery' ? form.address : '',
          district: actualType === 'delivery' ? form.district : '',
          lat: loc?.[0] || null,
          lng: loc?.[1] || null,
          address_title: form.addressTitle,
        },
        p_items: items.map((i) => ({
          variant_id: i.variantId,
          quantity: i.quantity,
        })),
        p_payment: isDineIn ? null : form.payment,
        p_note: form.note || null,
        p_table_token: tableToken || null,
        p_save_address: form.saveAddress && user != null,
      });

      if (error) throw error;
      setResult(data as unknown as OrderResult);
      clearCart();
      toast.success('Siparişiniz başarıyla mutfağa iletildi!', { icon: '✨' });
    } catch (err: any) {
      toast.error(err.message || 'Sipariş gönderilemedi, lütfen tekrar deneyin.');
    } finally {
      setSubmitting(false);
    }
  };

  // Sipariş Başarılı Ekranı
  if (result) {
    return (
      <main className="page narrow center" style={{ padding: '4rem 1.5rem' }}>
        <div
          style={{
            width: '84px',
            height: '84px',
            background: 'var(--gold-gradient)',
            color: '#0F0C08',
            borderRadius: '50%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem',
            boxShadow: 'var(--gold-glow)',
          }}
        >
          <CheckCircle size={48} />
        </div>

        <h1 style={{ marginBottom: '0.4rem' }}>Siparişiniz Alındı!</h1>
        <p style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--gold)', margin: '0.6rem 0 1.2rem' }}>
          Sipariş No: #{result.order_no} — Toplam: {tl(result.total)}
        </p>

        <div style={{ background: 'var(--card-bg)', border: '1.5px solid var(--gold-border)', borderRadius: 'var(--r)', padding: '1.8rem', maxWidth: '520px', margin: '0 auto 2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', justifyContent: 'center', marginBottom: '0.8rem', color: 'var(--text)' }}>
            <Clock size={20} style={{ color: 'var(--gold)' }} />
            <b style={{ fontSize: '1.1rem' }}>Tahmini Teslimat: {settings?.estimated_delivery_min || 15}-{settings?.estimated_delivery_max || 25} Dakika</b>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: '0.95rem' }}>
            Siparişiniz mutfağımıza iletildi. Tane tane tereyağlı pilavınız sıcacık hazırlanıyor ve kuryemize teslim edilecek.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to={`/takip/${result.order_id}`} className="btn gold lg">
            <Sparkles size={18} />
            <span>Siparişimi Canlı Takip Et</span>
          </Link>
          <Link to="/" className="btn ghost lg">
            Ana Sayfaya Dön
          </Link>
        </div>
      </main>
    );
  }

  // Sepet Boş Ekranı
  if (items.length === 0) {
    return (
      <main className="page narrow center" style={{ padding: '5rem 1.5rem' }}>
        <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--gold-bg)', color: 'var(--gold)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
          <ShoppingBag size={40} />
        </div>
        <h1>Sepetiniz Henüz Boş</h1>
        <p className="muted" style={{ fontSize: '1.1rem', maxWidth: '440px', margin: '0.5rem auto 2rem' }}>
          Yazır'ın meşhur tereyağlı pilavı, çorbaları ve tatlıları arasından dilediğinizi seçin.
        </p>
        <Link to="/menu" className="btn gold lg">
          Menüye Göz At
        </Link>
      </main>
    );
  }

  const deliveryFee = settings && !tableToken && orderType === 'delivery' ? settings.delivery_fee : 0;
  const isFreeDelivery = settings?.free_delivery_threshold && cartTotal >= settings.free_delivery_threshold;
  const finalTotal = cartTotal + (isFreeDelivery ? 0 : deliveryFee);

  return (
    <main className="page two">
      {/* Sol: Sipariş Formu */}
      <section>
        <h1 style={{ fontSize: '1.9rem', marginBottom: '1.2rem' }}>
          {tableToken ? 'Masada Sipariş Tamamla' : 'Siparişinizi Tamamlayın'}
        </h1>

        {/* Sipariş Tipi (Eve Teslimat vs Gel-Al) */}
        {!tableToken && (
          <div className="order-type-picker">
            <div
              className={`order-type-card ${orderType === 'delivery' ? 'selected' : ''}`}
              onClick={() => setOrderType('delivery')}
            >
              <Bike size={32} style={{ color: orderType === 'delivery' ? 'var(--gold)' : 'var(--text-muted)' }} />
              <div>
                <b>Adrese Teslimat</b>
                <span className="small muted" style={{ display: 'block' }}>Kuryemiz kapınıza getirsin</span>
              </div>
            </div>

            <div
              className={`order-type-card ${orderType === 'pickup' ? 'selected' : ''}`}
              onClick={() => setOrderType('pickup')}
            >
              <Store size={32} style={{ color: orderType === 'pickup' ? 'var(--gold)' : 'var(--text-muted)' }} />
              <div>
                <b>Restorandan Gel-Al</b>
                <span className="small muted" style={{ display: 'block' }}>Paket yaptırıp alın</span>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={submit} className="form">
          {/* İsim & Telefon */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <label>
              Ad Soyad {orderType === 'pickup' ? '(İsteğe Bağlı)' : '*'}
              <input
                required={orderType === 'delivery'}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Örn: Ahmet Yılmaz"
              />
            </label>

            <label>
              Telefon Numarası {orderType === 'pickup' ? '(İsteğe Bağlı)' : '*'}
              <input
                required={orderType === 'delivery'}
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="05xx xxx xx xx"
              />
            </label>
          </div>

          {/* Adrese Teslimat Detayları */}
          {!tableToken && orderType === 'delivery' && (
            <>
              {addresses.length > 0 && (
                <label>
                  Kayıtlı Adresleriniz
                  <select
                    value={selectedAddrId}
                    onChange={(e) => handleSelectSavedAddress(e.target.value)}
                  >
                    {addresses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title} — {a.full_address.slice(0, 45)}...
                      </option>
                    ))}
                    <option value="custom">+ Farklı Yeni Adres Gir</option>
                  </select>
                </label>
              )}

              {selectedAddrId === 'custom' && (
                <>
                  <label>
                    Mahalle / Semt
                    <input
                      required
                      value={form.district}
                      onChange={(e) => setForm({ ...form, district: e.target.value })}
                      placeholder="Yazır, Bosna Hersek, Kosova, Sancak..."
                    />
                  </label>

                  <label>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Açık Adres *</span>
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={locate}
                        style={{ padding: '0.25em 0.7em', fontSize: '0.8rem' }}
                      >
                        <MapPin size={13} style={{ color: 'var(--gold)' }} />
                        <span>{loc ? 'Konum Alındı ✓' : 'Konumumu Bul (GPS)'}</span>
                      </button>
                    </div>
                    <textarea
                      required
                      rows={3}
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      placeholder="Cadde, sokak, bina no, kat, daire no..."
                    />
                  </label>
                </>
              )}
            </>
          )}

          {/* Sipariş Notu */}
          <label>
            Sipariş Notu (İsteğe Bağlı)
            <input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Örn: Zile basmayın lütfen, acı biber turşusu bol olsun..."
            />
          </label>

          {/* Ödeme Yöntemi */}
          {!tableToken && (
            <fieldset>
              <legend>Ödeme Yöntemi</legend>
              <div style={{ display: 'grid', gap: '0.6rem' }}>
                <label className="radio">
                  <input
                    type="radio"
                    name="pay"
                    checked={form.payment === 'cash_on_delivery'}
                    onChange={() => setForm({ ...form, payment: 'cash_on_delivery' })}
                  />
                  <Banknote size={18} style={{ color: 'var(--gold)' }} />
                  <b>Kapıda Nakit Ödeme</b>
                </label>

                <label className="radio">
                  <input
                    type="radio"
                    name="pay"
                    checked={form.payment === 'card_on_delivery'}
                    onChange={() => setForm({ ...form, payment: 'card_on_delivery' })}
                  />
                  <CreditCard size={18} style={{ color: 'var(--gold)' }} />
                  <b>Kapıda Kredi / Banka Kartı (POS)</b>
                </label>

                <label className="radio">
                  <input
                    type="radio"
                    name="pay"
                    checked={form.payment === 'iban'}
                    onChange={() => setForm({ ...form, payment: 'iban' })}
                  />
                  <Send size={18} style={{ color: 'var(--gold)' }} />
                  <b>Banka Havalesi / IBAN ile Ödeme</b>
                </label>
              </div>

              {form.payment === 'iban' && settings?.iban && (
                <div style={{ marginTop: '0.8rem', padding: '1rem', background: 'var(--surface)', borderRadius: 'var(--r-sm)', border: '1px dashed var(--gold)' }}>
                  <b style={{ color: 'var(--gold-text)' }}>IBAN: {settings.iban}</b>
                  {settings.iban_holder && <div>Hesap Sahibi: <b>{settings.iban_holder}</b></div>}
                  <span className="small muted" style={{ display: 'block', marginTop: '0.4rem' }}>
                    * Lütfen dekont açıklama kısmına adınızı veya telefonunuzu yazınız.
                  </span>
                </div>
              )}
            </fieldset>
          )}

          <button
            type="submit"
            className="btn gold lg"
            disabled={submitting}
            style={{ marginTop: '0.5rem', width: '100%', fontSize: '1.1rem' }}
          >
            {submitting ? 'Siparişiniz İletiliyor...' : `Siparişi Onayla (${tl(finalTotal)})`}
          </button>
        </form>
      </section>

      {/* Sağ: Yapışık Sepet Özeti */}
      <aside className="cart">
        <h2>
          <span>Sepetiniz</span>
          <span className="pill ok" style={{ fontSize: '0.8rem' }}>{items.length} Ürün</span>
        </h2>

        <div style={{ maxHeight: '420px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          {items.map((i) => (
            <div key={i.key} className="crow">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                <ProductImage imagePath={i.image_path} emoji={i.emoji} name={i.productName} size="sm" />
                <div>
                  <b style={{ fontSize: '0.95rem' }}>{i.productName}</b>
                  {i.variantName && <div className="small muted">{i.variantName}</div>}
                </div>
              </div>

              <div className="qty">
                <button type="button" onClick={() => changeQty(i.key, -1)}>
                  {i.quantity === 1 ? <Trash2 size={13} style={{ color: '#EF4444' }} /> : <Minus size={13} />}
                </button>
                <span className="qty-input">{i.quantity}</span>
                <button type="button" onClick={() => changeQty(i.key, 1)}>
                  <Plus size={13} />
                </button>
              </div>

              <b style={{ color: 'var(--gold)', minWidth: '65px', textAlign: 'right' }}>
                {tl(i.quantity * i.price)}
              </b>
            </div>
          ))}
        </div>

        {/* Ara Toplam & Teslimat Ücreti */}
        <div style={{ marginTop: '1rem', paddingTop: '0.8rem', borderTop: '1px solid var(--line)' }}>
          <div className="crow" style={{ padding: '0.35rem 0', border: 0 }}>
            <span className="muted">Ara Toplam</span>
            <b>{tl(cartTotal)}</b>
          </div>

          {!tableToken && orderType === 'delivery' && (
            <div className="crow" style={{ padding: '0.35rem 0', border: 0 }}>
              <span className="muted">Teslimat Ücreti</span>
              <span>
                {isFreeDelivery ? (
                  <span style={{ color: 'var(--success)', fontWeight: 700 }}>Ücretsiz</span>
                ) : (
                  tl(deliveryFee)
                )}
              </span>
            </div>
          )}

          <div className="crow total">
            <span>Ödenecek Tutar</span>
            <b>{tl(finalTotal)}</b>
          </div>
        </div>
      </aside>
    </main>
  );
}
