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
  const { settings, status } = useBusinessSettings();
  // Sahip siparişi kapattıysa VEYA "çalışma saati dışında engelle" açıkken kapalıysak sipariş verilemez
  const orderBlocked = status.paused || (!!settings?.enforce_opening_hours && status.outsideHours);
  const cartTotal = total();

  // ---- Kupon & sadakat puanı ----
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<{ code: string; discount: number; title: string } | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [loyalty, setLoyalty] = useState<any>(null);
  const [usePoints, setUsePoints] = useState(false);
  const deliveryFee = settings && !tableToken ? (settings.free_delivery_threshold && cartTotal >= settings.free_delivery_threshold ? 0 : settings.delivery_fee) : 0;
  const couponDiscount = coupon ? Math.min(coupon.discount, cartTotal + deliveryFee) : 0;
  const afterCoupon = Math.max(cartTotal + deliveryFee - couponDiscount, 0);
  const pointValue = Number(loyalty?.point_value || 1);
  const pointsAvail = Number(loyalty?.points || 0);
  const canUsePoints = !!loyalty?.enabled && !tableToken && !!user && pointsAvail >= Number(loyalty?.min_redeem || 1);
  const pointsToUse = canUsePoints && usePoints ? Math.min(pointsAvail, Math.ceil(afterCoupon / pointValue)) : 0;
  const pointsDiscount = pointsToUse ? Math.min(pointsToUse * pointValue, afterCoupon) : 0;
  const grandTotal = Math.max(afterCoupon - pointsDiscount, 0);

  useEffect(() => {
    if (!user) return;
    supabase.rpc('my_loyalty').then(({ data, error }) => {
      if (!error && data) setLoyalty(data);
    });
  }, [user]);

  // Sepet değişince kupon tutarını yeniden doğrula
  useEffect(() => {
    if (!coupon) return;
    supabase
      .rpc('validate_coupon', { p_code: coupon.code, p_subtotal: cartTotal, p_phone: form.phone || null })
      .then(({ data }: any) => {
        if (data?.ok) setCoupon({ code: coupon.code, discount: Number(data.discount), title: data.title || '' });
        else {
          setCoupon(null);
          if (data?.error) toast.error(data.error);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartTotal]);

  const applyCoupon = async () => {
    const code = couponInput.trim();
    if (!code) return;
    setCouponBusy(true);
    const { data, error } = await supabase.rpc('validate_coupon', { p_code: code, p_subtotal: cartTotal, p_phone: form.phone || null });
    setCouponBusy(false);
    if (error) return void toast.error('Kupon sistemi için 15_coupons_loyalty.sql dosyasının çalıştırılması gerekiyor');
    const r: any = data;
    if (!r?.ok) return void toast.error(r?.error || 'Kupon geçersiz');
    setCoupon({ code: code.toUpperCase(), discount: Number(r.discount), title: r.title || '' });
    toast.success(`Kupon uygulandı: −${tl(Number(r.discount))}`);
  };

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

  // Profile data sync
  useEffect(() => {
    if (profile) {
      setForm((f) => ({
        ...f,
        name: f.name || profile.full_name || '',
        phone: f.phone || profile.phone || '',
      }));
    }
  }, [profile]);

  // Set default address if available
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
          toast.success('Konumunuz eklendi!');
        },
        () => toast.error('Konum alınamadı, lütfen izin verin'),
      );
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;
    if (orderBlocked) {
      toast.error(status.label + '. ' + status.detail);
      return;
    }

    setSubmitting(true);
    try {
      const useExtra = !tableToken && (!!coupon || pointsToUse > 0);
      const { data, error } = await supabase.rpc(useExtra ? 'place_order_with_coupon' : 'place_order', {
        p_customer: {
          name: form.name,
          phone: form.phone,
          address: form.address,
          district: form.district,
          lat: loc?.[0] || null,
          lng: loc?.[1] || null,
          address_title: form.addressTitle,
        },
        p_items: items.map((i) => ({
          variant_id: i.variantId,
          quantity: i.quantity,
        })),
        p_payment: tableToken ? null : form.payment,
        p_note: form.note || null,
        p_table_token: tableToken || null,
        p_save_address: form.saveAddress && user != null,
        ...(useExtra ? { p_coupon: coupon?.code || null, p_use_points: pointsToUse } : {}),
      } as any);

      if (error) throw error;
      setResult(data as unknown as OrderResult);
      clearCart();
      toast.success('Siparişiniz başarıyla alındı!');
    } catch (err: any) {
      toast.error(err.message || 'Sipariş gönderilemedi');
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <main className="page narrow center">
        <div className="ok-big">✓</div>
        <h1>Siparişiniz Alındı!</h1>
        <p style={{ fontSize: '1.2rem', margin: '0.8rem 0' }}>
          Sipariş No: <b>#{result.order_no}</b> · Toplam: <b>{tl(result.total)}</b>
        </p>
        <p className="muted" style={{ maxWidth: '480px', margin: '0 auto 1.5rem auto' }}>
          Siparişiniz mutfağa iletildi ve hazırlanmaya başlandı. Tahmini teslimat süresi{' '}
          <b>{settings?.estimated_delivery_min || 15}–{settings?.estimated_delivery_max || 25} dakika</b>dır.
        </p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <Link className="btn gold" to={`/takip/${result.order_id}`}>
            Siparişimi Canlı Takip Et
          </Link>
          <Link className="btn ghost" to="/">
            Ana Sayfaya Dön
          </Link>
        </div>
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="page narrow center">
        <h1>Sepetiniz Boş</h1>
        <p className="muted">Tane tane lezzetli pilavlarımızdan dilediğinizi menüden seçebilirsiniz.</p>
        <Link className="btn gold" to="/menu" style={{ marginTop: '1rem' }}>
          Menüye Git
        </Link>
      </main>
    );
  }

  return (
    <main className="page two">
      <section>
        <h1>{tableToken ? 'Masa Siparişini Tamamla' : 'Siparişi Tamamla'}</h1>

        {/* Giriş Yapmamış Misafir İçin Önemli Bilgilendirme Uyarısı */}
        {!user && !tableToken && (
          <div className="note alert-callout" style={{ marginBottom: '1.5rem', lineHeight: '1.6' }}>
            <b>⚠️ Misafir Olarak Sipariş Veriyorsunuz</b>
            <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.92rem' }}>
              Siparişiniz sorunsuz alınacaktır; ancak müşteri girişi yapmadığınız için sipariş geçmişiniz ve adres bilgileriniz kaydedilmez.
              Gelecek siparişlerinizde tekrar adres girmemek ve siparişinizi anlık takip edebilmek için{' '}
              <Link to="/giris">Giriş Yapın</Link> veya <Link to="/kayit">Kayıt Olun</Link>.
            </p>
          </div>
        )}

        {orderBlocked && (
          <div className="note closed-order-note" role="alert">
            <b>{status.label}.</b> {status.detail} Sepetiniz kaydedildi, açıldığımızda sipariş verebilirsiniz.
          </div>
        )}
        <form onSubmit={submit} className="form">
          {!tableToken && (
            <>
              {/* Kayıtlı Adres Seçimi (Giriş Yapmış Müşteri İçin) */}
              {user && addresses.length > 0 && (
                <div style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--line)' }}>
                  <b style={{ display: 'block', marginBottom: '0.6rem' }}>📍 Kayıtlı Adreslerinizden Seçin:</b>
                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                    {addresses.map((a) => (
                      <label
                        key={a.id}
                        className="radio"
                        style={{
                          background: selectedAddrId === a.id ? 'var(--card-bg)' : 'transparent',
                          border: `1.5px solid ${selectedAddrId === a.id ? 'var(--gold)' : 'var(--line)'}`,
                          borderRadius: '8px',
                          padding: '0.6rem 0.8rem',
                        }}
                      >
                        <input
                          type="radio"
                          name="addrPick"
                          checked={selectedAddrId === a.id}
                          onChange={() => handleSelectSavedAddress(a.id)}
                        />
                        <div>
                          <b>{a.title}</b> {a.is_default && <span className="small muted">(Varsayılan)</span>}
                          <div className="small muted">{a.full_address} ({a.district || 'Yazır'})</div>
                        </div>
                      </label>
                    ))}
                    <label
                      className="radio"
                      style={{
                        background: selectedAddrId === 'custom' ? 'var(--card-bg)' : 'transparent',
                        border: `1.5px solid ${selectedAddrId === 'custom' ? 'var(--gold)' : 'var(--line)'}`,
                        borderRadius: '8px',
                        padding: '0.6rem 0.8rem',
                      }}
                    >
                      <input
                        type="radio"
                        name="addrPick"
                        checked={selectedAddrId === 'custom'}
                        onChange={() => handleSelectSavedAddress('custom')}
                      />
                      <span>+ Farklı bir adres gir</span>
                    </label>
                  </div>
                </div>
              )}

              <div className="two-col">
                <label>
                  Ad Soyad
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Adınız ve Soyadınız"
                  />
                </label>
                <label>
                  Telefon Numarası
                  <input
                    required
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="05xx xxx xx xx"
                  />
                </label>
              </div>

              {(selectedAddrId === 'custom' || !user) && (
                <>
                  <label>
                    Mahalle / Semt
                    <input
                      required
                      value={form.district}
                      onChange={(e) => setForm({ ...form, district: e.target.value })}
                      placeholder="Yazır, Bosna Hersek, Kosova..."
                    />
                  </label>
                  <label>
                    Açık Adres (Cadde, Sokak, Bina No, Kat, Daire)
                    <textarea
                      required
                      rows={3}
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      placeholder="Mahalle, Cadde, Sokak, Bina ve Kapı Numarası"
                    />
                  </label>
                  <div className="locrow">
                    <button type="button" className="btn ghost sm" onClick={locate}>
                      📍 Harita / GPS Konumumu Ekle
                    </button>
                    {loc && (
                      <span className="small muted">
                        ✓ Konum eklendi ({loc[0].toFixed(4)}, {loc[1].toFixed(4)})
                      </span>
                    )}
                  </div>
                  {user && (
                    <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                      <label className="radio" style={{ margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={form.saveAddress}
                          onChange={(e) => setForm({ ...form, saveAddress: e.target.checked })}
                        />
                        Bu adresi profilime kaydet
                      </label>
                      {form.saveAddress && (
                        <input
                          style={{ width: '130px', padding: '0.4em' }}
                          value={form.addressTitle}
                          onChange={(e) => setForm({ ...form, addressTitle: e.target.value })}
                          placeholder="Adres İsmi (İş)"
                        />
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          <label>
            Sipariş Notu (İsteğe bağlı)
            <input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Örn: Zile basmayın lütfen, acı sos ekleyin"
            />
          </label>

          {!tableToken && (
            <fieldset>
              <legend>Ödeme Yöntemi</legend>
              {['cash_on_delivery', 'card_on_delivery', 'iban'].map((m) => (
                <label key={m} className="radio">
                  <input
                    type="radio"
                    name="pay"
                    checked={form.payment === m}
                    onChange={() => setForm({ ...form, payment: m })}
                  />
                  <b>{PAYMENT_METHOD_LABELS[m]}</b>
                </label>
              ))}
              {form.payment === 'iban' && settings?.iban && (
                <div className="note" style={{ marginTop: '0.8rem', fontSize: '0.9rem' }}>
                  <b>IBAN Bilgisi:</b> {settings.iban}
                  {settings.iban_holder && <> · {settings.iban_holder}</>}
                  <br />
                  <span className="small muted">
                    Havale/EFT açıklama kısmına lütfen adınızı yazınız. Ödeme kontrol edilince siparişiniz yola çıkar.
                  </span>
                </div>
              )}
            </fieldset>
          )}

          <button type="submit" className="btn gold" disabled={submitting || orderBlocked} style={{ fontSize: '1.05rem', padding: '0.9em' }}>
            {orderBlocked ? status.label : submitting ? 'Sipariş İletiliyor...' : `Siparişi Onayla · ${tl(cartTotal + (settings && !tableToken ? settings.delivery_fee : 0))}`}
          </button>
        </form>
      </section>

      {/* Sepet Özeti */}
      <aside className="cart">
        <h2>Sepetiniz</h2>
        <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
          {items.map((i) => (
            <div key={i.key} className="crow" style={{ alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <ProductImage imagePath={i.image_path} emoji={i.emoji} name={i.productName} size="sm" />
                <div>
                  <b>{i.productName}</b>
                  {i.variantName && <div className="small muted">{i.variantName}</div>}
                </div>
              </div>
              <div className="qty">
                <button type="button" onClick={() => changeQty(i.key, -1)}>−</button>
                <input
                  type="number"
                  min={1}
                  className="qty-input"
                  value={i.quantity}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val >= 1) {
                      changeQty(i.key, val - i.quantity);
                    }
                  }}
                />
                <button type="button" onClick={() => changeQty(i.key, 1)}>+</button>
              </div>
              <b style={{ color: 'var(--gold-ink)' }}>{tl(i.quantity * i.price)}</b>
            </div>
          ))}
        </div>

        {!tableToken && (
          <div className="coupon-box">
            {coupon ? (
              <div className="coupon-ok">
                <span>🎟️ <b>{coupon.code}</b> uygulandı{coupon.title ? ` · ${coupon.title}` : ''}</span>
                <button type="button" className="linkbtn" onClick={() => { setCoupon(null); setCouponInput(''); }}>Kaldır</button>
              </div>
            ) : (
              <div className="coupon-form">
                <input
                  placeholder="Kupon kodu"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), applyCoupon())}
                  aria-label="Kupon kodu"
                />
                <button type="button" className="btn ghost sm" onClick={applyCoupon} disabled={couponBusy || !couponInput.trim()}>
                  {couponBusy ? '…' : 'Uygula'}
                </button>
              </div>
            )}
            <a className="small" href="/kampanyalar" target="_blank" rel="noreferrer">Güncel kampanyaları gör →</a>
          </div>
        )}

        {canUsePoints && (
          <label className="points-box">
            <input type="checkbox" checked={usePoints} onChange={(e) => setUsePoints(e.target.checked)} />
            <span>
              ⭐ <b>{pointsAvail}</b> puanımı kullan <small className="muted">(1 puan = {tl(pointValue)})</small>
              {usePoints && pointsToUse > 0 && <em> −{tl(pointsDiscount)}</em>}
            </span>
          </label>
        )}

        {settings && settings.delivery_fee > 0 && !tableToken && (
          <div className="crow">
            <span>Teslimat Ücreti</span>
            <span />
            <span>
              {deliveryFee === 0 ? <span style={{ color: 'var(--success)', fontWeight: 700 }}>Ücretsiz</span> : tl(settings.delivery_fee)}
            </span>
          </div>
        )}
        {couponDiscount > 0 && (
          <div className="crow">
            <span>Kupon indirimi</span>
            <span />
            <span style={{ color: 'var(--success)', fontWeight: 700 }}>−{tl(couponDiscount)}</span>
          </div>
        )}
        {pointsDiscount > 0 && (
          <div className="crow">
            <span>Puan indirimi</span>
            <span />
            <span style={{ color: 'var(--success)', fontWeight: 700 }}>−{tl(pointsDiscount)}</span>
          </div>
        )}

        <div className="crow total">
          <span>Genel Toplam</span>
          <b>{tl(grandTotal)}</b>
        </div>
      </aside>
    </main>
  );
}
