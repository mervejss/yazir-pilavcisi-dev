import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { tl, hhmm, timeAgo, beep, businessDayStart } from '@/lib/helpers';
import { ORDER_STATUS_LABELS } from '@/lib/constants';
import { HAS_GMAPS_KEY, mapsDirUrl, distanceM, fmtKm, type Destination } from '@/lib/googleMaps';
import { useCourierTracking } from '@/hooks/useCourierTracking';
import RouteMap, { type RouteSummary } from '@/components/maps/RouteMap';
import Icon from '@/components/ui/Icon';
import Logo from '@/components/ui/Logo';
import ThemeToggle from '@/components/ui/ThemeToggle';
import toast from 'react-hot-toast';

type Tab = 'all' | 'mine' | 'history';

interface COrder {
  id: string;
  order_no: number;
  status: string;
  created_at: string;
  total: number;
  payment_method: string | null;
  district: string | null;
  is_mine: boolean;
  taken_by_other: boolean;
  courier_first_name: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  note: string | null;
  lat: number | null;
  lng: number | null;
  items: { name: string; variant: string | null; qty: number }[];
  my_request: string | null;
  request_count: number;
}

const dest = (o: COrder): Destination => ({ lat: o.lat, lng: o.lng, address: o.delivery_address ? `${o.delivery_address}${o.district ? ', ' + o.district : ''}` : o.district });

function cashInfo(o: { payment_method: string | null; total: number }) {
  if (o.payment_method === 'cash_on_delivery') return { icon: 'cash' as const, text: `Kapıda NAKİT tahsil et: ${tl(o.total)}`, due: true };
  if (o.payment_method === 'card_on_delivery') return { icon: 'card' as const, text: `Kapıda KART (POS) tahsil et: ${tl(o.total)}`, due: true };
  if (o.payment_method === 'iban') return { icon: 'check' as const, text: 'IBAN / havale — tahsilat yok', due: false };
  return { icon: 'check' as const, text: 'Online ödendi — tahsilat yok', due: false };
}

export default function CourierApp() {
  const { profile, signOut } = useAuthStore();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('mine');
  const [all, setAll] = useState<COrder[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(false);
  const [onlineLoaded, setOnlineLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [route, setRoute] = useState<Record<string, RouteSummary | null>>({});
  const prevMine = useRef<Set<string> | null>(null);

  const track = useCourierTracking(online);

  // "Ana ekrana ekle" ile uygulama gibi kurulabilsin (yalnızca kurye ekranında manifest eklenir)
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = '/kurye.webmanifest';
    document.head.appendChild(link);
    return () => link.remove();
  }, []);

  /* ---------------- Veri ---------------- */
  const load = useCallback(async () => {
    if (!profile) return;
    const [{ data: list, error }, { data: hist }] = await Promise.all([
      supabase.rpc('courier_list_orders'),
      supabase
        .from('orders')
        .select('id,order_no,customer_name,delivery_address,district,total,payment_method,delivered_at,created_at,order_items(product_name,quantity)')
        .eq('courier_id', profile.id)
        .eq('status', 'delivered')
        .order('delivered_at', { ascending: false })
        .limit(60),
    ]);
    if (error) {
      if (/courier_list_orders/.test(error.message)) toast.error('Kurye ekranı için 10_courier_live_tracking.sql dosyasını Supabase’de çalıştırın.', { id: 'sqlneed', duration: 8000 });
    } else {
      const rows = (list || []) as COrder[];
      // yeni atanan paket bildirimi
      const mineNow = new Set(rows.filter((r) => r.is_mine).map((r) => r.id));
      if (prevMine.current) {
        const added = [...mineNow].filter((id) => !prevMine.current!.has(id));
        if (added.length) {
          beep();
          navigator.vibrate?.([200, 100, 200]);
          toast.success('🛵 Size yeni paket atandı!', { duration: 5000 });
        }
      }
      prevMine.current = mineNow;
      setAll(rows);
    }
    setHist(hist);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);
  const setHist = (h: any) => h && setHistory(h);

  useEffect(() => {
    load();
    const iv = setInterval(load, 15000);
    const ch = supabase
      .channel(`courier-app-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courier_order_requests' }, () => load())
      .subscribe();
    return () => {
      clearInterval(iv);
      supabase.removeChannel(ch);
    };
  }, [load]);

  // Çevrimiçi (konum paylaşımı) durumunu sunucudan oku
  useEffect(() => {
    if (!profile) return;
    supabase
      .from('courier_profiles')
      .select('is_online')
      .eq('user_id', profile.id)
      .maybeSingle()
      .then(({ data }) => {
        setOnline(!!data?.is_online);
        setOnlineLoaded(true);
      });
  }, [profile?.id]);

  /* ---------------- İşlemler ---------------- */
  const setOnlineState = async (next: boolean, silent = false) => {
    const { error } = await supabase.rpc('set_courier_online', { p_online: next });
    if (error) {
      toast.error(error.message || 'Durum değiştirilemedi');
      return false;
    }
    setOnline(next);
    if (!silent) toast.success(next ? 'Konum paylaşımı AÇIK — yönetici sizi haritada görebilir' : 'Konum paylaşımı KAPALI — haritada görünmüyorsunuz');
    return true;
  };

  const requestOrder = async (o: COrder) => {
    setBusy(o.id);
    const { error } = await supabase.rpc('courier_request_order', { p_order_id: o.id });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`#${o.order_no} için istek gönderildi. Yönetici onaylayınca size atanacak.`);
    load();
  };
  const cancelRequest = async (o: COrder) => {
    setBusy(o.id);
    await supabase.rpc('courier_cancel_request', { p_order_id: o.id });
    setBusy(null);
    toast('İstek geri çekildi');
    load();
  };

  const startDelivery = async (o: COrder) => {
    setBusy(o.id);
    try {
      if (!online) await setOnlineState(true, true); // yola çıkarken konum paylaşımı otomatik açılır
      const { error } = await supabase.rpc('update_order_status', { p_order_id: o.id, p_status: 'on_the_way' });
      if (error) throw error;
      toast.success('🛵 Yola çıktınız — konumunuz yöneticiye canlı iletiliyor');
      setSheet(o.id);
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Güncellenemedi');
    } finally {
      setBusy(null);
    }
  };

  const finishDelivery = async (o: COrder) => {
    if (!window.confirm(`#${o.order_no} müşteriye teslim edildi mi?`)) return;
    setBusy(o.id);
    const { error } = await supabase.rpc('update_order_status', { p_order_id: o.id, p_status: 'delivered' });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success('✓ Sipariş teslim edildi');
    setSheet(null);
    load();
  };

  const handleSignOut = async () => {
    if (online) await setOnlineState(false, true);
    await signOut();
    navigate('/personel-giris');
  };

  /* ---------------- Türetilmiş ---------------- */
  const mine = useMemo(() => all.filter((o) => o.is_mine), [all]);
  const free = useMemo(() => all.filter((o) => !o.is_mine), [all]);
  const todayStart = businessDayStart();
  const todayHist = history.filter((h) => h.delivered_at && new Date(h.delivered_at) >= todayStart);
  const todayCash = todayHist.filter((h) => ['cash_on_delivery', 'card_on_delivery'].includes(h.payment_method)).reduce((s, h) => s + Number(h.total), 0);
  const sheetOrder = mine.find((o) => o.id === sheet) || null;
  const activeOnWay = mine.find((o) => o.status === 'on_the_way') || null;

  const trackText =
    track.status === 'sharing'
      ? `Canlı konum iletiliyor${track.lastSent ? ` · ${hhmm(track.lastSent.getTime())}` : ''}`
      : track.status === 'starting'
        ? 'GPS konumu bekleniyor…'
        : track.status === 'denied'
          ? 'Konum izni reddedildi — tarayıcı ayarlarından izin verin'
          : track.status === 'unsupported'
            ? 'Bu cihaz GPS desteklemiyor'
            : track.status === 'error'
              ? 'Konum gönderilemedi, tekrar deneniyor…'
              : 'Kapalı — yönetici sizi göremez';

  /* ---------------- Kartlar ---------------- */
  const itemsText = (o: COrder) => o.items.map((i) => `${i.qty}× ${i.name}${i.variant ? ` (${i.variant})` : ''}`).join(', ');

  const FreeCard = ({ o }: { o: COrder }) => (
    <article className={`cr-card${o.taken_by_other ? ' dim' : ''}`}>
      <div className="cr-card-top">
        <b>#{o.order_no}</b>
        <span className={`st ${o.status}`}>{ORDER_STATUS_LABELS[o.status]}</span>
        <span className="muted small">{timeAgo(o.created_at)}</span>
      </div>
      <div className="cr-loc"><Icon name="mapPin" size={16} /> {o.district || 'Mahalle belirtilmedi'}</div>
      <p className="cr-items">{itemsText(o)}</p>
      <div className="cr-card-foot">
        <b className="cr-price">{tl(o.total)}</b>
        {o.taken_by_other ? (
          <span className="chip"><Icon name="truck" size={13} /> {o.courier_first_name} götürüyor</span>
        ) : o.my_request ? (
          <button type="button" className="btn ghost sm" disabled={busy === o.id} onClick={() => cancelRequest(o)}>İsteği geri çek</button>
        ) : (
          <button type="button" className="btn gold" disabled={busy === o.id} onClick={() => requestOrder(o)}>
            <Icon name="check" size={16} /> Paketi ben alıyorum
          </button>
        )}
      </div>
      {!o.taken_by_other && o.my_request && <div className="cr-pending"><Icon name="clock" size={14} /> İstek gönderildi — yönetici onayı bekleniyor</div>}
      {!o.taken_by_other && !o.my_request && o.request_count > 0 && <div className="small muted">{o.request_count} kurye bu paketi istiyor</div>}
    </article>
  );

  const MineCard = ({ o }: { o: COrder }) => {
    const cash = cashInfo(o);
    const onWay = o.status === 'on_the_way';
    const d = dest(o);
    const meters = track.position && o.lat != null && o.lng != null ? distanceM(track.position, { lat: o.lat, lng: o.lng }) : null;
    const rs = route[o.id];
    return (
      <article className={`cr-card mine${onWay ? ' onway' : ''}`}>
        <div className="cr-card-top">
          <b>#{o.order_no}</b>
          <span className={`st ${o.status}`}>{ORDER_STATUS_LABELS[o.status]}</span>
          <span className="muted small">{hhmm(o.created_at)}</span>
        </div>

        <div className="cr-cust">
          <div className="cr-cust-name"><Icon name="user" size={16} /> {o.customer_name || 'Müşteri'}</div>
          {o.customer_phone && (
            <a className="cr-phone" href={`tel:${o.customer_phone}`}><Icon name="phone" size={16} /> {o.customer_phone}</a>
          )}
        </div>

        <div className="cr-addr">
          <Icon name="mapPin" size={20} />
          <div>
            <b>{o.delivery_address || 'Adres belirtilmemiş'}</b>
            {o.district && <div className="small muted">{o.district}</div>}
            {(rs || meters != null) && (
              <div className="cr-eta">
                {rs ? `${rs.distance} · ${rs.duration}` : `Kuş uçuşu ${fmtKm(meters!)}`}
              </div>
            )}
          </div>
        </div>

        <p className="cr-items">{itemsText(o)}</p>
        {o.note && <div className="note small">Not: {o.note}</div>}
        <div className={`cr-cash${cash.due ? ' due' : ''}`}><Icon name={cash.icon} size={18} /> {cash.text}</div>

        <div className="cr-actions">
          <button type="button" className="btn dark" onClick={() => setSheet(o.id)}><Icon name="map" size={17} /> Haritada göster</button>
          <a className="btn ghost" href={mapsDirUrl(d, track.position)} target="_blank" rel="noreferrer"><Icon name="navigation" size={17} /> Google Haritalar</a>
          {o.customer_phone && <a className="btn ghost" href={`tel:${o.customer_phone}`}><Icon name="phone" size={17} /> Ara</a>}
        </div>

        {o.status === 'assigned' && (
          <button type="button" className="btn gold lg block" disabled={busy === o.id} onClick={() => startDelivery(o)}>
            <Icon name="truck" size={20} /> Paketi aldım · Yola çık
          </button>
        )}
        {onWay && (
          <button type="button" className="btn gold lg block" disabled={busy === o.id} onClick={() => finishDelivery(o)}>
            <Icon name="check" size={20} /> Müşteriye teslim ettim
          </button>
        )}
        {['new', 'preparing', 'ready'].includes(o.status) && (
          <div className="cr-pending"><Icon name="clock" size={14} /> Sipariş mutfakta hazırlanıyor. Hazır olunca yola çıkabilirsiniz.</div>
        )}
      </article>
    );
  };

  return (
    <div className="cr-app">
      <header className="cr-head">
        <Logo height={34} />
        <div className="cr-who">
          <small>Kurye</small>
          <b>{profile?.full_name}</b>
        </div>
        <ThemeToggle />
        <button type="button" className="icon-btn cr-out" onClick={handleSignOut} aria-label="Çıkış"><Icon name="logout" size={18} /></button>
      </header>

      {/* Konum paylaşımı: en üstte aç/kapat */}
      <section className={`cr-share${online ? ' on' : ''}`}>
        <div className="cr-share-txt">
          <b><Icon name="navigation" size={17} /> Konum paylaşımı: {online ? 'AÇIK' : 'KAPALI'}</b>
          <small className={track.status === 'denied' || track.status === 'error' ? 'bad' : ''}>{trackText}</small>
          {online && (
            <div className="cr-chips">
              {track.accuracy != null && <span className="chip">±{Math.round(track.accuracy)} m</span>}
              <span className={`chip${track.wakeLock ? ' gold' : ''}`}>{track.wakeLock ? 'Ekran açık kalıyor' : 'Ekranı açık tutun'}</span>
            </div>
          )}
        </div>
        <button
          type="button"
          className={`cr-switch${online ? ' on' : ''}`}
          disabled={!onlineLoaded}
          onClick={() => setOnlineState(!online)}
          aria-pressed={online}
          aria-label="Konum paylaşımını aç/kapat"
        >
          <i />
        </button>
      </section>
      {online && <div className="cr-bgnote">Konumun sürekli iletilmesi için bu sayfayı açık bırakın ve ekranı kilitlemeyin. Tarayıcılar kilitli/arka plan durumunda GPS'i durdurabilir.</div>}

      {/* Yoldaki sipariş: üstte canlı mini harita */}
      {activeOnWay && tab !== 'history' && !sheet && (
        <section className="cr-live">
          <div className="cr-live-head">
            <b><Icon name="truck" size={17} /> Yoldaki paket #{activeOnWay.order_no}</b>
            <button type="button" className="btn gold sm" onClick={() => setSheet(activeOnWay.id)}>Büyüt</button>
          </div>
          <RouteMap
            origin={track.position}
            destination={dest(activeOnWay)}
            orderLabel={`#${activeOnWay.order_no}`}
            height="210px"
            onSummary={(s) => setRoute((r) => ({ ...r, [activeOnWay.id]: s }))}
          />
        </section>
      )}

      <main className="cr-main">
        {loading && <div className="cr-empty"><div className="gold-spinner" /></div>}

        {!loading && tab === 'all' && (
          <>
            <div className="cr-sec-title">Tüm aktif siparişler <span>{all.length}</span></div>
            {all.length === 0 && <div className="cr-empty"><Icon name="clipboard" size={38} /><p>Şu an aktif teslimat siparişi yok.</p></div>}
            {free.map((o) => <FreeCard key={o.id} o={o} />)}
            {mine.length > 0 && <div className="cr-sec-title">Benim siparişlerim <span>{mine.length}</span></div>}
            {mine.map((o) => <MineCard key={o.id} o={o} />)}
          </>
        )}

        {!loading && tab === 'mine' && (
          <>
            <div className="cr-sec-title">Benim aktif siparişlerim <span>{mine.length}</span></div>
            {mine.length === 0 && (
              <div className="cr-empty">
                <Icon name="truck" size={40} />
                <p>Üzerinizde paket yok.</p>
                <button type="button" className="btn gold" onClick={() => setTab('all')}>Tüm siparişlere bak</button>
              </div>
            )}
            {mine.map((o) => <MineCard key={o.id} o={o} />)}
          </>
        )}

        {!loading && tab === 'history' && (
          <>
            <div className="cr-stats">
              <div><b>{todayHist.length}</b><small>Bugün teslim</small></div>
              <div><b>{history.length}</b><small>Son teslimatlar</small></div>
              <div><b>{tl(todayCash)}</b><small>Bugün tahsilat</small></div>
            </div>
            <div className="cr-sec-title">Teslim ettiğim siparişler</div>
            {history.length === 0 && <div className="cr-empty"><Icon name="clock" size={38} /><p>Henüz teslim edilmiş sipariş yok.</p></div>}
            {history.map((h) => (
              <article key={h.id} className="cr-card hist">
                <div className="cr-card-top">
                  <b>#{h.order_no}</b>
                  <span className="st delivered">Teslim edildi</span>
                  <span className="muted small">{h.delivered_at ? `${new Date(h.delivered_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })} ${hhmm(h.delivered_at)}` : ''}</span>
                </div>
                <div className="small"><b>{h.customer_name || 'Müşteri'}</b> · {h.district || h.delivery_address}</div>
                <p className="cr-items">{(h.order_items || []).map((i: any) => `${i.quantity}× ${i.product_name}`).join(', ')}</p>
                <b className="cr-price">{tl(h.total)}</b>
              </article>
            ))}
          </>
        )}
      </main>

      <nav className="cr-tabs">
        <button type="button" className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>
          <Icon name="clipboard" size={22} /><span>Tüm Siparişler</span>{all.length > 0 && <i>{all.length}</i>}
        </button>
        <button type="button" className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>
          <Icon name="truck" size={22} /><span>Benimkiler</span>{mine.length > 0 && <i>{mine.length}</i>}
        </button>
        <button type="button" className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>
          <Icon name="clock" size={22} /><span>Geçmiş</span>
        </button>
      </nav>

      {/* Tam ekran harita + yol tarifi */}
      {sheetOrder && (
        <div className="cr-sheet" role="dialog" aria-modal="true">
          <div className="cr-sheet-head">
            <div>
              <b>#{sheetOrder.order_no} · {sheetOrder.customer_name || 'Müşteri'}</b>
              <div className="small muted">{ORDER_STATUS_LABELS[sheetOrder.status]}</div>
            </div>
            <button type="button" className="icon-btn" onClick={() => setSheet(null)} aria-label="Kapat"><Icon name="x" size={18} /></button>
          </div>
          <div className="cr-sheet-map">
            <RouteMap
              origin={track.position}
              destination={dest(sheetOrder)}
              orderLabel={`#${sheetOrder.order_no}`}
              height="100%"
              onSummary={(s) => setRoute((r) => ({ ...r, [sheetOrder.id]: s }))}
            />
          </div>
          <div className="cr-sheet-panel">
            {route[sheetOrder.id] && (
              <div className="cr-route-sum">
                <div><b>{route[sheetOrder.id]!.duration}</b><small>Tahmini süre</small></div>
                <div><b>{route[sheetOrder.id]!.distance}</b><small>Mesafe</small></div>
              </div>
            )}
            {!online && <div className="cr-pending">Konum paylaşımı kapalı — yol çizimi için üstten açın.</div>}
            {!HAS_GMAPS_KEY && <div className="cr-pending">Detaylı yol çizimi için “Google Haritalar” düğmesini kullanın.</div>}
            <div className="cr-addr">
              <Icon name="mapPin" size={20} />
              <div>
                <b>{sheetOrder.delivery_address || 'Adres belirtilmemiş'}</b>
                {sheetOrder.district && <div className="small muted">{sheetOrder.district}</div>}
              </div>
            </div>
            <div className="cr-actions">
              <a className="btn dark" href={mapsDirUrl(dest(sheetOrder), track.position)} target="_blank" rel="noreferrer"><Icon name="navigation" size={17} /> Google Haritalar'da aç</a>
              {sheetOrder.customer_phone && <a className="btn ghost" href={`tel:${sheetOrder.customer_phone}`}><Icon name="phone" size={17} /> {sheetOrder.customer_phone}</a>}
            </div>
            {sheetOrder.status === 'assigned' && (
              <button type="button" className="btn gold lg block" disabled={busy === sheetOrder.id} onClick={() => startDelivery(sheetOrder)}><Icon name="truck" size={20} /> Paketi aldım · Yola çık</button>
            )}
            {sheetOrder.status === 'on_the_way' && (
              <button type="button" className="btn gold lg block" disabled={busy === sheetOrder.id} onClick={() => finishDelivery(sheetOrder)}><Icon name="check" size={20} /> Müşteriye teslim ettim</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
