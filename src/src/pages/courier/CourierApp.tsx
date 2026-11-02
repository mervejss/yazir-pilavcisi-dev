import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { tl, hhmm } from '@/lib/helpers';
import toast from 'react-hot-toast';

export default function CourierApp() {
  const { profile, signOut } = useAuthStore();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'active' | 'done'>('active');
  const [orders, setOrders] = useState<any[]>([]);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [locSharing, setLocSharing] = useState<boolean>(false);

  const fetchCourierOrders = async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('courier_id', profile.id)
      .order('created_at', { ascending: false });
    if (data) setOrders(data);
  };

  useEffect(() => {
    fetchCourierOrders();

    const channel = supabase
      .channel('courier-orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          fetchCourierOrders();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile]);

  // GPS Canlı Konum Takibi
  useEffect(() => {
    if (!isOnline) {
      setLocSharing(false);
      return;
    }

    if (!navigator.geolocation) return;

    let watchId: number;
    try {
      watchId = navigator.geolocation.watchPosition(
        async (pos) => {
          setLocSharing(true);
          try {
            await supabase.rpc('update_courier_location', {
              p_lat: pos.coords.latitude,
              p_lng: pos.coords.longitude,
              p_accuracy: pos.coords.accuracy || null,
              p_speed: pos.coords.speed || null,
              p_heading: pos.coords.heading || null,
              p_battery: null,
            });
          } catch (err) {
            console.error('Location update error:', err);
          }
        },
        (err) => {
          console.warn('Geolocation error:', err);
          setLocSharing(false);
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
      );
    } catch (e) {
      console.warn(e);
    }

    return () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
    };
  }, [isOnline]);

  const toggleOnline = async () => {
    const nextState = !isOnline;
    try {
      await supabase.rpc('set_courier_online', { p_online: nextState });
      setIsOnline(nextState);
      toast.success(nextState ? 'Çevrimiçi oldunuz' : 'Çevrimdışı oldunuz');
    } catch (err: any) {
      toast.error(err.message || 'Durum değiştirilemedi');
    }
  };

  const handleUpdateStatus = async (orderId: string, newStatus: 'on_the_way' | 'delivered') => {
    try {
      const { error } = await supabase.rpc('update_order_status', {
        p_order_id: orderId,
        p_status: newStatus,
      });
      if (error) throw error;
      toast.success(
        newStatus === 'on_the_way'
          ? '🛵 Paket teslim alındı, yola çıktınız!'
          : '✓ Sipariş teslim edildi!',
      );
      fetchCourierOrders();
    } catch (err: any) {
      toast.error(err.message || 'Durum güncellenemedi');
    }
  };

  const handleSignOut = async () => {
    await signOut();
    toast.success('Kurye oturumu kapatıldı');
    navigate('/personel-giris');
  };

  const activeOrders = orders.filter((o) => ['assigned', 'on_the_way'].includes(o.status));
  const doneOrders = orders.filter((o) => o.status === 'delivered').slice(0, 20);
  const currentList = tab === 'active' ? activeOrders : doneOrders;

  const getCashInstruction = (o: any) => {
    if (o.payment_method === 'cash_on_delivery') {
      return `💵 Kapıda Nakit Tahsil Et: ${tl(o.total)}`;
    }
    if (o.payment_method === 'card_on_delivery') {
      return `💳 Kapıda POS Kart Tahsil Et: ${tl(o.total)}`;
    }
    if (o.payment_method === 'iban') {
      return '🏦 Havale/IBAN (Tahsilat yok, ödendi)';
    }
    return '📱 Platform Online (Tahsilat yok, ödendi)';
  };

  return (
    <div className="courier-bg">
      <div className="phone">
        <header>
          <div>
            <small style={{ color: 'var(--text-muted)' }}>Kurye Paneli</small>
            <b style={{ fontSize: '1.1rem' }}>{profile?.full_name}</b>
          </div>
          <button
            type="button"
            className={`pill ${isOnline ? 'ok' : 'no'}`}
            style={{ border: 0, cursor: 'pointer', margin: 0 }}
            onClick={toggleOnline}
          >
            {isOnline ? '🟢 Çevrimiçi' : '⚪ Çevrimdışı'}
          </button>
        </header>

        {isOnline && (
          <div style={{ fontSize: '0.8rem', color: locSharing ? '#8be28f' : '#ff9c8a', textAlign: 'center' }}>
            {locSharing ? '📍 Canlı GPS konumu merkeze iletiliyor' : '⚠️ GPS konumu bekleniyor...'}
          </div>
        )}

        <div className="seg wide" style={{ margin: '0.4rem 0' }}>
          <button
            type="button"
            className={tab === 'active' ? 'on' : ''}
            onClick={() => setTab('active')}
          >
            Aktif Paketler ({activeOrders.length})
          </button>
          <button
            type="button"
            className={tab === 'done' ? 'on' : ''}
            onClick={() => setTab('done')}
          >
            Bugün Teslim ({doneOrders.length})
          </button>
        </div>

        <div className="clist">
          {currentList.length === 0 && (
            <p className="muted center" style={{ padding: '3rem 1rem' }}>
              {tab === 'active'
                ? 'Şu an üzerinizde paket bulunmuyor. Size yeni paket atandığında burada görünecektir.'
                : 'Bugün henüz teslim edilmiş sipariş yok.'}
            </p>
          )}

          {currentList.map((o) => (
            <div key={o.id} className="ccard">
              <div className="orow">
                <b>
                  #{o.order_no} · {o.customer_name || 'Misafir'}
                </b>
                <span className="small muted">{hhmm(o.created_at)}</span>
              </div>

              <p className="addr">{o.delivery_address || 'Adres belirtilmemiş'}</p>
              {o.district && <div className="small muted">Mahalle: {o.district}</div>}

              <p className="small muted" style={{ margin: '0.2rem 0' }}>
                {o.order_items?.map((i: any) => `${i.quantity}× ${i.product_name}`).join(', ')}
              </p>

              {o.note && <p className="note small">Not: {o.note}</p>}

              <p className="cash">{getCashInstruction(o)}</p>

              {o.status !== 'delivered' && (
                <div className="cbtns">
                  <a
                    className="btn gold"
                    target="_blank"
                    rel="noreferrer"
                    href={
                      o.lat && o.lng
                        ? `https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}`
                        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.delivery_address || '')}`
                    }
                  >
                    🗺️ Haritada Aç
                  </a>
                  {o.customer_phone ? (
                    <a className="btn ghost dark" href={`tel:${o.customer_phone}`}>
                      📞 Ara
                    </a>
                  ) : (
                    <span className="btn ghost dark" style={{ opacity: 0.5 }}>
                      No Yok
                    </span>
                  )}
                </div>
              )}

              {o.status === 'assigned' && (
                <button
                  type="button"
                  className="btn dark"
                  onClick={() => handleUpdateStatus(o.id, 'on_the_way')}
                >
                  🛵 Restorandan Teslim Aldım (Yola Çık)
                </button>
              )}

              {o.status === 'on_the_way' && (
                <button
                  type="button"
                  className="btn gold"
                  onClick={() => handleUpdateStatus(o.id, 'delivered')}
                >
                  ✓ Müşteriye Teslim Ettim
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          className="linkbtn center"
          style={{ marginTop: 'auto', color: 'var(--text-muted)', fontSize: '0.85rem' }}
          onClick={handleSignOut}
        >
          Oturumu Kapat (Çıkış)
        </button>
      </div>
    </div>
  );
}
