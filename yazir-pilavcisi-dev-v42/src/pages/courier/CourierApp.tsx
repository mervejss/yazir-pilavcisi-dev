import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { tl, hhmm, timeAgo, beep, businessDayStart } from '@/lib/helpers';
import { ORDER_STATUS_LABELS } from '@/lib/constants';
import { HAS_GMAPS_KEY, mapsDirUrl, distanceM, fmtKm, type Destination } from '@/lib/googleMaps';
import { useBackTrap } from '@/hooks/useBackTrap';
import { useCourierTracking } from '@/hooks/useCourierTracking';
import RouteMap, { type RouteSummary } from '@/components/maps/RouteMap';
import Icon from '@/components/ui/Icon';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import Modal from '@/components/ui/Modal';
import Logo from '@/components/ui/Logo';
import ThemeToggle from '@/components/ui/ThemeToggle';
import AlertHost from '@/components/alerts/AlertHost';
import OrderDetailSheet from '@/components/courier/OrderDetailSheet';
import CourierSelfStats from '@/components/analytics/CourierSelfStats';
import { useAlertStore } from '@/stores/alertStore';
import toast from 'react-hot-toast';

type Tab = 'all' | 'mine' | 'history' | 'stats';

interface COrder {
  id: string;
  order_no: number;
  status: string;
  created_at: string;
  total: number;
  payment_method: string | null;
  customer_payment_method?: string | null;
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

// Kapıda tahsil edilen yöntemler: müşterinin seçtiği varsayılan gelir, kurye teslim anında güncelleyebilir
const PAY_OPTS: Array<[string, string]> = [['cash_on_delivery', '💵 Nakit'], ['card_on_delivery', '💳 Kart (POS)'], ['iban', '🏦 IBAN']];
const PAY_LABEL: Record<string, string> = { cash_on_delivery: 'Nakit', card_on_delivery: 'Kart (POS)', iban: 'IBAN' };
const changeablePay = (m: string | null | undefined) => !m || m in PAY_LABEL;

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
  const [exitAsk, setExitAsk] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const sheetRef = useRef<string | null>(null);
  const tabRef = useRef<Tab>('mine');
  const exitRef = useRef(false);
  const detailRef = useRef<string | null>(null);
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && navigator.onLine === false);
  const [battery, setBattery] = useState<{ level: number; charging: boolean } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [detailId, setDetailId] = useState<string | null>(null);
  const [payAsk, setPayAsk] = useState<{ o: COrder; deliver: boolean } | null>(null);
  const [payPick, setPayPick] = useState('cash_on_delivery');
  const [payBusy, setPayBusy] = useState(false);
  detailRef.current = detailId;
  const [splitRows, setSplitRows] = useState<Array<{ order_id: string; method: string; amount: number }>>([]);
  sheetRef.current = sheet;
  tabRef.current = tab;
  exitRef.current = exitAsk;
  const [route, setRoute] = useState<Record<string, RouteSummary | null>>({});
  const prevMine = useRef<Set<string> | null>(null);
  const prevOpen = useRef<Set<string> | null>(null);

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
          const o = rows.find((r) => r.id === added[0]);
          useAlertStore.getState().push({
            id: `assigned-${added[0]}`,
            kind: 'assigned',
            title: `🛵 Size yeni paket atandı${o ? ` #${o.order_no}` : ''}`,
            body: o ? `${o.district || ''} · ${tl(o.total)}` : undefined,
          });
        }
      }
      prevMine.current = mineNow;
      // Restorana yeni sipariş düştü (henüz kimsede değil) → tüm kuryelere sesli uyarı
      const openNow = new Set(rows.filter((r) => !r.is_mine && !r.taken_by_other).map((r) => r.id));
      if (prevOpen.current) {
        const fresh = [...openNow].filter((id) => !prevOpen.current!.has(id));
        fresh.forEach((id) => {
          const o = rows.find((r) => r.id === id);
          if (o && o.status === 'new') {
            useAlertStore.getState().push({
              id: `open-${id}`,
              kind: 'open_order',
              title: `📦 Yeni sipariş #${o.order_no}`,
              body: `${o.district || 'Teslimat'} · ${tl(o.total)} — almak için isteyin`,
            });
          }
        });
      }
      prevOpen.current = openNow;
      // Sipariş onaylandı (hazırlanıyor) / başkası aldı / paket yola çıktı → bu cihazda zil susar
      const stillNew = new Set(rows.filter((r) => r.status === 'new' && !r.is_mine && !r.taken_by_other).map((r) => r.id));
      const stillAssigned = new Set(rows.filter((r) => r.is_mine && r.status === 'assigned').map((r) => r.id));
      useAlertStore.getState().dismissWhere(
        (a) => (a.kind === 'open_order' && !stillNew.has(a.id.replace(/^open-/, ''))) || (a.kind === 'assigned' && !stillAssigned.has(a.id.replace(/^assigned-/, ''))),
      );
      setAll(rows);
    }
    setHist(hist);
    // Bugünkü ayrı ödemeler (gün sonu kasası için); SQL 31 yoksa sessizce atlanır
    const { data: sp, error: spErr } = await supabase
      .from('order_split_payments')
      .select('order_id,method,amount')
      .eq('courier_id', profile.id)
      .gte('created_at', businessDayStart().toISOString());
    if (!spErr && sp) setSplitRows(sp as any);
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

  // Teslimde ödeme nasıl alındı? (müşterinin seçtiği hazır gelir; kurye kapıda değiştirebilir)
  const finishDelivery = (o: COrder) => {
    if (changeablePay(o.payment_method)) {
      setPayPick(o.payment_method || 'cash_on_delivery');
      setPayAsk({ o, deliver: true });
      return;
    }
    if (!window.confirm(`#${o.order_no} müşteriye teslim edildi mi?`)) return;
    doDeliver(o);
  };

  const askPayChange = (o: COrder) => {
    setPayPick(o.payment_method || 'cash_on_delivery');
    setPayAsk({ o, deliver: false });
  };

  const submitPay = async () => {
    if (!payAsk) return;
    const { o, deliver } = payAsk;
    setPayBusy(true);
    try {
      if (payPick !== (o.payment_method || '')) {
        const { error } = await supabase.rpc('courier_set_payment', { p_order: o.id, p_method: payPick } as any);
        if (error) {
          toast.error(/courier_set_payment|function|does not exist|schema cache/i.test(error.message)
            ? 'Bu özellik için yönetici sql/32_delete_orders_courier_payment.sql dosyasını çalıştırmalı.' : error.message, { duration: 8000 });
          return;
        }
      }
      if (deliver) await doDeliver(o);
      else {
        toast.success(`Ödeme yöntemi: ${PAY_LABEL[payPick] || payPick}`);
        await load();
      }
      setPayAsk(null);
    } finally {
      setPayBusy(false);
    }
  };

  const doDeliver = async (o: COrder) => {
    setBusy(o.id);
    const { error } = await supabase.rpc('update_order_status', { p_order_id: o.id, p_status: 'delivered' });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success('✓ Sipariş teslim edildi');
    setSheet(null);
    load();
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      if (online) await setOnlineState(false, true);
      await signOut();
    } finally {
      setSigningOut(false);
      setExitAsk(false);
    }
    navigate('/personel-giris', { replace: true });
  };

  // İnternet / pil durumu uyarıları
  useEffect(() => {
    const up = () => setOffline(false);
    const down = () => setOffline(true);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    let bat: any;
    const upd = () => bat && setBattery({ level: Math.round(bat.level * 100), charging: !!bat.charging });
    (navigator as any).getBattery?.().then((b: any) => {
      bat = b;
      upd();
      b.addEventListener('levelchange', upd);
      b.addEventListener('chargingchange', upd);
    }).catch(() => undefined);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      bat?.removeEventListener?.('levelchange', upd);
      bat?.removeEventListener?.('chargingchange', upd);
    };
  }, []);

  // Kurye uygulaması olarak yüklenebilsin (ana ekrana ekle) ve durum çubuğu rengi uyumlu olsun
  useEffect(() => {
    const l = document.createElement('link');
    l.rel = 'manifest';
    l.href = '/kurye.webmanifest';
    document.head.appendChild(l);
    return () => l.remove();
  }, []);

  // Telefondaki GERİ tuşu: önce açık pencere/haritayı kapatır, sonra ana sekmeye döner; uygulamadan ASLA çıkarmaz.
  // (Çıkış yalnızca üstteki çıkış düğmesi + onay ile yapılır.)
  useBackTrap(true, () => {
    if (exitRef.current) return setExitAsk(false);
    if (detailRef.current) return setDetailId(null);
    if (sheetRef.current) return setSheet(null);
    if (tabRef.current !== 'mine') return setTab('mine');
  });

  /* ---------------- Türetilmiş ---------------- */
  const mine = useMemo(() => all.filter((o) => o.is_mine), [all]);

  // Önerilen teslimat sırası: bulunduğum yerden en yakın adres, sonra ona en yakın… (kuş uçuşu, yalnızca öneri)
  const seq = useMemo(() => {
    const map: Record<string, number> = {};
    const left = mine.filter((o) => ['assigned', 'on_the_way'].includes(o.status) && o.lat != null && o.lng != null);
    if (left.length < 2) return map;
    let cur: { lat: number; lng: number } | null = track.position;
    if (!cur) cur = { lat: Number(left[0].lat), lng: Number(left[0].lng) };
    let n = 1;
    const rest = [...left];
    while (rest.length) {
      let bi = 0;
      let bd = Infinity;
      rest.forEach((o, i) => {
        const d = distanceM(cur!, { lat: Number(o.lat), lng: Number(o.lng) });
        if (d < bd) {
          bd = d;
          bi = i;
        }
      });
      const [pick] = rest.splice(bi, 1);
      map[pick.id] = n++;
      cur = { lat: Number(pick.lat), lng: Number(pick.lng) };
    }
    return map;
  }, [mine, track.position]);

  const saveNote = async (o: COrder, text: string) => {
    const next = notes[o.id] === text ? '' : text; // aynı seçeneğe tekrar basınca notu kaldırır
    const { error } = await supabase.rpc('courier_set_note', { p_order: o.id, p_note: next } as any);
    if (error) return toast.error(/function|does not exist/i.test(error.message) ? 'Not için yönetici SQL 30 dosyasını çalıştırmalı' : error.message);
    setNotes((n) => ({ ...n, [o.id]: next }));
    toast.success(next ? 'Not yöneticiye iletildi' : 'Not kaldırıldı');
  };
  const free = useMemo(() => all.filter((o) => !o.is_mine), [all]);
  const todayStart = businessDayStart();
  const todayHist = history.filter((h) => h.delivered_at && new Date(h.delivered_at) >= todayStart);
  const todayCash = todayHist.reduce((sum, h) => {
    const rows = splitRows.filter((r) => r.order_id === h.id);
    const sp = rows.filter((r) => r.method !== 'iban').reduce((a, r) => a + Number(r.amount), 0);
    const spAll = rows.reduce((a, r) => a + Number(r.amount), 0);
    const rest = ['cash_on_delivery', 'card_on_delivery'].includes(h.payment_method) ? Math.max(Number(h.total) - spAll, 0) : 0;
    return sum + sp + rest;
  }, 0);
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
          {seq[o.id] != null && <span className="cr-seq" title="Önerilen teslimat sırası">{seq[o.id]}</span>}
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

        <div className="cr-addr cr-addr-tap" role="button" tabIndex={0} onClick={() => setSheet(o.id)} onKeyDown={(e) => e.key === 'Enter' && setSheet(o.id)} title="Haritada göster">
          <Icon name="mapPin" size={20} />
          <div>
            <b>{o.delivery_address || 'Adres belirtilmemiş'}</b>
            {o.district && <div className="small muted">{o.district}</div>}
            <div className="small cr-pin-state">{o.lat != null && o.lng != null ? '✓ Konum haritada işaretli — dokunup haritada gör' : 'Konum işaretli değil — adres yazıdan bulunur · dokunup haritada gör'}</div>
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
        {['assigned', 'on_the_way'].includes(o.status) && changeablePay(o.payment_method) && (
          <div className="small" style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap', margin: '0.25rem 0 0.5rem' }}>
            <span className="muted">
              {o.customer_payment_method && o.customer_payment_method !== o.payment_method
                ? `Müşteri talebi: ${PAY_LABEL[o.customer_payment_method] || o.customer_payment_method} → şimdi: ${PAY_LABEL[o.payment_method || ''] || '—'}`
                : 'Müşterinin seçtiği yöntem'}
            </span>
            <button type="button" className="linklike small" onClick={() => askPayChange(o)}>Ödeme yöntemini değiştir</button>
          </div>
        )}

        <div className="cr-actions">
          <button type="button" className="btn gold" onClick={() => setDetailId(o.id)}><Icon name="clipboard" size={17} /> Detay · Hesap</button>
          <button type="button" className="btn dark" onClick={() => setSheet(o.id)}><Icon name="map" size={17} /> Haritada göster</button>
          <a className="btn ghost" href={mapsDirUrl(d, track.position)} target="_blank" rel="noreferrer"><Icon name="navigation" size={17} /> Google Haritalar</a>
          {o.customer_phone && <a className="btn ghost" href={`tel:${o.customer_phone}`}><Icon name="phone" size={17} /> Ara</a>}
        </div>

        {['assigned', 'on_the_way'].includes(o.status) && (
          <div className="cr-note" aria-label="Yöneticiye not">
            {['Müşteriye ulaşamadım', 'Adres bulunamadı', 'Kapıda bekliyorum', 'Zil çalışmıyor'].map((t) => (
              <button key={t} type="button" className={notes[o.id] === t ? 'on' : ''} onClick={() => saveNote(o, t)}>{t}</button>
            ))}
          </div>
        )}

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
      <AlertHost storageKey="yz_alert_courier" />
      <Modal open={!!payAsk} onClose={() => !payBusy && setPayAsk(null)} size="sm">
        {payAsk && (
          <>
            <div className="pe-head">
              <div>
                <h2>{payAsk.deliver ? `#${payAsk.o.order_no} teslim edildi mi?` : `#${payAsk.o.order_no} · Ödeme yöntemi`}</h2>
                <p className="muted small">Müşteri başta <b>{PAY_LABEL[payAsk.o.customer_payment_method || payAsk.o.payment_method || ''] || '—'}</b> seçmişti. Kapıda farklı ödediyse yöntemi değiştirin.</p>
              </div>
              <button type="button" className="icon-circle" onClick={() => setPayAsk(null)} disabled={payBusy} aria-label="Kapat">✕</button>
            </div>
            <div className="osd-method" role="radiogroup" aria-label="Ödeme yöntemi">
              {PAY_OPTS.map(([m, l]) => (
                <button key={m} type="button" role="radio" aria-checked={payPick === m} className={payPick === m ? 'on' : ''} onClick={() => setPayPick(m)}>{l}</button>
              ))}
            </div>
            <p style={{ textAlign: 'center', fontWeight: 700, margin: '0.8rem 0' }}>
              {payPick === 'iban' ? 'IBAN / havale — kapıda tahsilat yok' : `${payPick === 'card_on_delivery' ? 'Kart (POS) ile' : 'Nakit'} tahsil edilecek: ${tl(payAsk.o.total)}`}
            </p>
            <button type="button" className="btn gold lg block" disabled={payBusy} onClick={submitPay}>
              {payBusy ? 'Kaydediliyor…' : payAsk.deliver ? '✓ Teslim ettim' : 'Kaydet'}
            </button>
          </>
        )}
      </Modal>
      <OrderDetailSheet orderId={detailId} customerName={mine.find((o) => o.id === detailId)?.customer_name} onClose={() => setDetailId(null)} />
      <ConfirmationModal
        open={exitAsk}
        onClose={() => !signingOut && setExitAsk(false)}
        onConfirm={handleSignOut}
        title="Hesaptan çıkış yapılsın mı?"
        message={online ? 'Çıkış yaparsanız çevrimdışı olursunuz ve yeni sipariş bildirimi almazsınız.' : 'Uygulamadan çıkış yapmak istediğinize emin misiniz?'}
        confirmLabel="Evet, çıkış yap"
        cancelLabel="Hayır, kalayım"
        variant="warning"
        loading={signingOut}
      />
      <header className="cr-head">
        <Logo height={34} />
        <div className="cr-who">
          <small>Kurye</small>
          <b>{profile?.full_name}</b>
        </div>
        <ThemeToggle />
        <button type="button" className="icon-btn cr-out" onClick={() => setExitAsk(true)} aria-label="Çıkış"><Icon name="logout" size={18} /></button>
      </header>

      {offline && <div className="cr-warn" role="alert">📵 İnternet bağlantısı yok — konum ve sipariş güncellemeleri bağlantı gelince devam eder.</div>}
      {battery && battery.level <= 15 && !battery.charging && <div className="cr-warn" role="alert">🔋 Pil %{battery.level} — şarja takın, konum paylaşımı kesilebilir.</div>}
      {online && (track.status === 'denied' || track.status === 'unsupported') && <div className="cr-warn" role="alert">📍 Konum izni kapalı — tarayıcı ayarlarından konuma izin verin, yoksa müşteri sizi haritada göremez.</div>}
      {mine.length > 1 && Object.keys(seq).length > 1 && <div className="cr-warn info">🧭 Önerilen sıra rakamlarla gösterildi (en yakın adresten başlar).</div>}

      {/* Karşılama + bugünün özeti */}
      <section className="cr-hero">
        <div className="cr-hero-hi">
          <small>{new Date().getHours() < 12 ? 'Günaydın' : new Date().getHours() < 18 ? 'İyi günler' : 'İyi akşamlar'}</small>
          <h2>{(profile?.full_name || 'Kurye').split(' ')[0]} 👋</h2>
        </div>
        <div className="cr-hero-stats">
          <div><b>{todayHist.length}</b><small>Bugün teslim</small></div>
          <div><b>{mine.length}</b><small>Üzerimde</small></div>
          <div><b>{tl(todayCash)}</b><small>Bugün tahsilat</small></div>
        </div>
      </section>

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
      {activeOnWay && tab !== 'history' && tab !== 'stats' && !sheet && (
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

        {tab === 'stats' && profile && <CourierSelfStats courierId={profile.id} />}

        {!loading && tab === 'history' && (
          <>
            <div className="cr-stats">
              <div><b>{todayHist.length}</b><small>Bugün teslim</small></div>
              <div><b>{history.length}</b><small>Son teslimatlar</small></div>
              <div><b>{tl(todayCash)}</b><small>Bugün tahsilat</small></div>
            </div>
            <section className="cr-eod">
              <h3>🧾 Gün sonu kasası</h3>
              {(() => {
                // Ayrı ödeme kaydı olan siparişte yönteme göre kayıt, kalan ise siparişin ana yöntemine yazılır
                const tot: Record<string, number> = { cash_on_delivery: 0, card_on_delivery: 0, iban: 0, other: 0 };
                todayHist.forEach((h) => {
                  const rows = splitRows.filter((r) => r.order_id === h.id);
                  const sp = rows.reduce((a, r) => a + Number(r.amount), 0);
                  rows.forEach((r) => (tot[r.method] = (tot[r.method] || 0) + Number(r.amount)));
                  const rest = Math.max(Number(h.total) - sp, 0);
                  const k = ['cash_on_delivery', 'card_on_delivery', 'iban'].includes(h.payment_method) ? h.payment_method : 'other';
                  tot[k] += rest;
                });
                const cash = tot.cash_on_delivery;
                const card = tot.card_on_delivery;
                const paid = tot.iban + tot.other;
                return (
                  <>
                    <div className="dash-row"><span>💵 Kasaya teslim edeceğim nakit</span><b>{tl(cash)}</b></div>
                    <div className="dash-row"><span>💳 Kapıda kart</span><b>{tl(card)}</b></div>
                    <div className="dash-row"><span>🏦 IBAN / önceden ödenmiş</span><b>{tl(Math.max(paid, 0))}</b></div>
                    <div className="dash-row"><span>🛵 Bugünkü teslimat</span><b>{todayHist.length}</b></div>
                  </>
                );
              })()}
            </section>
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
        <button type="button" className={tab === 'stats' ? 'on' : ''} onClick={() => setTab('stats')}>
          <Icon name="chart" size={22} /><span>Performans</span>
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
