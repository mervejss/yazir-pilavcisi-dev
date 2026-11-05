import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useCouriers } from '@/hooks/useCouriers';
import { useCourierOverview } from '@/hooks/useAnalytics';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { timeAgo, tl } from '@/lib/helpers';
import { downloadCsv, fmtDec, fmtMin, fmtPct, hourRangeLabel, initials, resolveRange, type RangeKey } from '@/lib/analytics';
import type { CourierLive } from '@/types/database';
import type { CourierOverviewRow } from '@/types/analytics';
import Switch from '@/components/ui/Switch';
import Modal from '@/components/ui/Modal';
import RangePicker from '@/components/analytics/RangePicker';
import { Stat } from '@/components/analytics/Charts';
import CourierDetailModal from '@/components/admin/CourierDetailModal';

type SortKey = 'count' | 'speed' | 'ontime' | 'revenue' | 'points' | 'name';
type View = 'cards' | 'table';

const VEHICLE: Record<string, string> = { motorcycle: '🛵 Motosiklet', car: '🚗 Araba', bicycle: '🚲 Bisiklet' };
const MEDAL = ['🥇', '🥈', '🥉'];

export default function CouriersAdmin() {
  const { profile } = useAuthStore();
  const canPoints = !!profile && ['owner', 'sub_admin'].includes(profile.role);
  const { couriers, refetch } = useCouriers();

  const [rangeKey, setRangeKey] = useState<RangeKey>('7');
  const [cFrom, setCFrom] = useState('');
  const [cTo, setCTo] = useState('');
  const [sla, setSla] = useState(30);
  const [sort, setSort] = useState<SortKey>('count');
  const [view, setView] = useState<View>('cards');
  const [q, setQ] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);

  const range = useMemo(() => resolveRange(rangeKey, cFrom, cTo), [rangeKey, cFrom, cTo]);
  const ov = useCourierOverview(range.from, range.to, sla);

  const [editModal, setEditModal] = useState(false);
  const [selectedCourier, setSelectedCourier] = useState<CourierLive | null>(null);
  const [editForm, setEditForm] = useState({ vehicle_type: 'motorcycle', plate: '', notes: '' });

  const statOf = useMemo(() => {
    const m = new Map<string, CourierOverviewRow>();
    (ov.data || []).forEach((r) => m.set(r.courier_id, r));
    return m;
  }, [ov.data]);

  const rows = useMemo(() => {
    const t = q.trim().toLocaleLowerCase('tr');
    const list = couriers
      .filter((c) => !t || `${c.full_name} ${c.phone || ''} ${c.plate || ''}`.toLocaleLowerCase('tr').includes(t))
      .map((c) => ({ live: c, st: statOf.get(c.courier_id) }));
    const num = (v: number | null | undefined, dflt: number) => (v == null ? dflt : Number(v));
    list.sort((a, b) => {
      if (sort === 'name') return a.live.full_name.localeCompare(b.live.full_name, 'tr');
      if (sort === 'speed') return num(a.st?.avg_delivery_min, 9999) - num(b.st?.avg_delivery_min, 9999);
      if (sort === 'ontime') return num(b.st?.on_time_pct, -1) - num(a.st?.on_time_pct, -1);
      if (sort === 'revenue') return num(b.st?.revenue_carried, 0) - num(a.st?.revenue_carried, 0);
      if (sort === 'points') return num(b.st?.points_balance, 0) - num(a.st?.points_balance, 0);
      return num(b.st?.delivery_count, 0) - num(a.st?.delivery_count, 0);
    });
    return list;
  }, [couriers, statOf, sort, q]);

  // sıralama rozeti: teslimat sayısına göre
  const rankOf = useMemo(() => {
    const ranked = [...(ov.data || [])].filter((r) => r.delivery_count > 0).sort((a, b) => b.delivery_count - a.delivery_count);
    const m = new Map<string, number>();
    ranked.forEach((r, i) => m.set(r.courier_id, i));
    return m;
  }, [ov.data]);

  const team = useMemo(() => {
    const d = ov.data || [];
    const cnt = d.reduce((s, r) => s + Number(r.delivery_count), 0);
    const withAvg = d.filter((r) => r.avg_delivery_min != null && r.delivery_count > 0);
    const wCnt = withAvg.reduce((s, r) => s + Number(r.delivery_count), 0);
    return {
      count: cnt,
      totalMin: d.reduce((s, r) => s + Number(r.total_delivery_min || 0), 0),
      avgMin: wCnt ? withAvg.reduce((s, r) => s + Number(r.avg_delivery_min) * Number(r.delivery_count), 0) / wCnt : null,
      revenue: d.reduce((s, r) => s + Number(r.revenue_carried || 0), 0),
      cash: d.reduce((s, r) => s + Number(r.cash_collected || 0), 0),
      onlineMin: d.reduce((s, r) => s + Number(r.online_minutes || 0), 0),
    };
  }, [ov.data]);

  const onlineNow = couriers.filter((c) => c.is_online).length;
  const activeOrders = couriers.reduce((s, c) => s + Number(c.active_order_count || 0), 0);

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    try {
      const { error } = await supabase.rpc('set_staff_active', { p_user: userId, p_active: !currentActive });
      if (error) throw error;
      toast.success(!currentActive ? 'Kurye aktifleştirildi' : 'Kurye pasifleştirildi');
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'İşlem başarısız');
    }
  };

  const openEdit = async (c: CourierLive) => {
    setSelectedCourier(c);
    setEditForm({ vehicle_type: c.vehicle_type || 'motorcycle', plate: c.plate || '', notes: '' });
    setEditModal(true);
    const { data } = await supabase.from('courier_profiles').select('notes').eq('user_id', c.courier_id).maybeSingle();
    if (data) setEditForm((f) => ({ ...f, notes: (data as any).notes || '' }));
  };

  const handleSaveCourierDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourier) return;
    try {
      const { error } = await supabase
        .from('courier_profiles')
        .update({ vehicle_type: editForm.vehicle_type, plate: editForm.plate || null, notes: editForm.notes || null })
        .eq('user_id', selectedCourier.courier_id);
      if (error) throw error;
      toast.success('Kurye bilgileri güncellendi');
      setEditModal(false);
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Güncellenemedi');
    }
  };

  const exportCsv = () => {
    const head = ['Kurye', 'Telefon', 'Araç', 'Teslimat', 'Taşınan ciro', 'Tahsilat', 'Ort. teslim (dk)', 'Ort. toplam (dk)', 'Toplam teslimat süresi (dk)', 'En hızlı (dk)', 'En yavaş (dk)', 'Zamanında %', 'Çevrimiçi (dk)', 'Aktif gün', 'En yoğun saat', 'Puan', 'Prim ₺'];
    const body = rows.map(({ live, st }) => [
      live.full_name, live.phone || '', live.vehicle_type, st?.delivery_count ?? 0, st?.revenue_carried ?? 0, st?.cash_collected ?? 0,
      st?.avg_delivery_min ?? '', st?.avg_total_min ?? '', st?.total_delivery_min ?? 0, st?.fastest_min ?? '', st?.slowest_min ?? '',
      st?.on_time_pct ?? '', st?.online_minutes ?? 0, st?.active_days ?? 0, st?.peak_hour != null ? hourRangeLabel(st.peak_hour) : '', st?.points_balance ?? 0, st?.bonus_amount ?? 0,
    ]);
    downloadCsv('kurye-performans.csv', [head, ...body]);
  };

  const detailCourier = couriers.find((c) => c.courier_id === detailId) || null;

  return (
    <>
      <div className="bar mx-bar">
        <div>
          <h1>Kurye Yönetimi</h1>
          <p className="muted" style={{ margin: 0 }}>
            Kurye listesi, canlı durum ve detaylı performans analizi: teslimat sayısı, süreler, aktif saatler, prim ve puan
          </p>
        </div>
        <div className="mx-bar-actions">
          <button type="button" className="btn ghost sm" onClick={exportCsv}>⬇ CSV</button>
        </div>
      </div>

      {ov.missing && (
        <div className="note">
          Kurye analizleri için <code>sql/20_courier_customer_analytics.sql</code> dosyasını Supabase SQL Editor'de bir kez çalıştırın.
        </div>
      )}
      {ov.error && !ov.missing && <div className="note">{ov.error}</div>}

      <div className="an-toolbar">
        <RangePicker value={rangeKey} onChange={setRangeKey} from={cFrom} to={cTo} onCustom={(f, t) => { setCFrom(f); setCTo(t); }} />
        <label className="ad-select">
          <span>Zamanında teslim eşiği</span>
          <select value={sla} onChange={(e) => setSla(Number(e.target.value))}>
            {[15, 20, 25, 30, 40, 45, 60].map((m) => <option key={m} value={m}>≤ {m} dk</option>)}
          </select>
        </label>
      </div>

      <div className="an-stats">
        <Stat label="Şu an çevrimiçi" value={`${onlineNow} / ${couriers.length}`} sub={`${activeOrders} aktif paket yolda`} tone={onlineNow > 0 ? 'ok' : undefined} />
        <Stat label="Toplam teslimat" value={team.count} sub="seçili aralıkta" />
        <Stat label="Ort. teslim süresi" value={fmtMin(team.avgMin)} sub="yola çıkış → teslim" />
        <Stat label="Teslimatta geçen süre" value={fmtMin(team.totalMin)} sub="tüm kuryeler toplamı" />
        <Stat label="Taşınan ciro" value={tl(team.revenue)} sub={`kapıda tahsilat ${tl(team.cash)}`} />
        <Stat label="Çevrimiçi süre" value={fmtMin(team.onlineMin)} sub="tüm kuryeler toplamı" />
      </div>

      <div className="ad-toolbar">
        <div className="ad-search"><span>🔍</span><input type="search" placeholder="Kurye adı, telefon veya plaka ara…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <label className="ad-select">
          <span>Sıralama</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="count">En çok teslimat</option>
            <option value="speed">En hızlı (ort. süre)</option>
            <option value="ontime">En yüksek zamanında %</option>
            <option value="revenue">En yüksek ciro</option>
            <option value="points">En çok puan</option>
            <option value="name">İsme göre</option>
          </select>
        </label>
        <div className="an-seg" role="tablist" aria-label="Görünüm">
          <button type="button" className={view === 'cards' ? 'on' : ''} onClick={() => setView('cards')}>Kartlar</button>
          <button type="button" className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>Tablo</button>
        </div>
      </div>

      {couriers.length === 0 && (
        <div className="an-card center muted" style={{ padding: '2rem' }}>
          Kurye bulunamadı. Personel &amp; Roller sekmesinden yeni kurye rolü atayabilirsiniz.
        </div>
      )}

      {view === 'cards' && (
        <div className="cx-grid">
          {rows.map(({ live: c, st }) => {
            const rk = rankOf.get(c.courier_id);
            return (
              <article key={c.courier_id} className={`cx-card${c.is_active ? '' : ' inactive'}`}>
                <header className="cx-top">
                  <div className="cx-avatar">{initials(c.full_name)}<i className={`cx-dot${c.is_online ? ' on' : ''}`} /></div>
                  <div className="cx-id">
                    <b>{c.full_name} {rk != null && rk < 3 && <span title={`${rk + 1}. sıra`}>{MEDAL[rk]}</span>}</b>
                    <small>{VEHICLE[c.vehicle_type] || c.vehicle_type}{c.plate ? ` · ${c.plate}` : ''}</small>
                  </div>
                  <Switch checked={c.is_active} onChange={() => handleToggleActive(c.courier_id, c.is_active)} label="Aktiflik durumu" />
                </header>

                <div className="cx-live">
                  <span className={`cx-pill ${c.is_online ? 'on' : ''}`}>{c.is_online ? 'Konum paylaşıyor' : 'Kapalı'}</span>
                  {c.active_order_count > 0 && <span className="cx-pill busy">🛵 {c.active_order_count} paket üzerinde</span>}
                  <span className="muted small">{c.location_updated_at ? timeAgo(c.location_updated_at) : 'Konum yok'}</span>
                </div>

                <div className="cx-metrics">
                  <div><b>{st?.delivery_count ?? 0}</b><small>Teslimat</small></div>
                  <div><b>{fmtMin(st?.avg_delivery_min)}</b><small>Ort. teslim</small></div>
                  <div><b>{fmtMin(st?.total_delivery_min, { short: true })}</b><small>Toplam süre</small></div>
                  <div><b>{fmtPct(st?.on_time_pct)}</b><small>Zamanında</small></div>
                </div>

                <div className="cx-sub">
                  <span title="En yoğun saat">⏰ {st?.peak_hour != null ? hourRangeLabel(st.peak_hour) : '—'}</span>
                  <span title="Taşınan ciro">💰 {tl(Number(st?.revenue_carried || 0))}</span>
                  <span title="Puan">⭐ {st?.points_balance ?? 0}</span>
                </div>

                <footer className="cx-actions">
                  <button type="button" className="btn gold sm" onClick={() => setDetailId(c.courier_id)}>📊 Detay &amp; Analiz</button>
                  {c.is_online && c.lat != null && <Link to="/admin/harita" className="btn ghost sm">📍 Harita</Link>}
                  <button type="button" className="btn ghost sm" onClick={() => openEdit(c)}>Düzenle</button>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {view === 'table' && (
        <div className="an-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Kurye</th><th>Durum</th><th>Teslimat</th><th>Ort. teslim</th><th>Ort. toplam</th><th>Toplam süre</th><th>En hızlı / yavaş</th>
                <th>Zamanında</th><th>Ciro</th><th>Çevrimiçi</th><th>En yoğun saat</th><th>Puan</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ live: c, st }) => (
                <tr key={c.courier_id} className="row-click" onClick={() => setDetailId(c.courier_id)}>
                  <td><b><i className={`dot${c.is_online ? ' on' : ''}`} />{c.full_name}</b><div className="small muted">{c.phone || '—'}</div></td>
                  <td>{c.is_active ? (c.is_online ? 'Çevrimiçi' : 'Kapalı') : 'Pasif'}</td>
                  <td><b>{st?.delivery_count ?? 0}</b></td>
                  <td>{fmtMin(st?.avg_delivery_min)}</td>
                  <td>{fmtMin(st?.avg_total_min)}</td>
                  <td>{fmtMin(st?.total_delivery_min)}</td>
                  <td>{fmtDec(st?.fastest_min, 0)} / {fmtDec(st?.slowest_min, 0)} dk</td>
                  <td>{fmtPct(st?.on_time_pct)}</td>
                  <td>{tl(Number(st?.revenue_carried || 0))}</td>
                  <td>{fmtMin(st?.online_minutes)}</td>
                  <td>{st?.peak_hour != null ? hourRangeLabel(st.peak_hour) : '—'}</td>
                  <td>{st?.points_balance ? `⭐ ${st.points_balance}` : '—'}</td>
                  <td><button type="button" className="btn ghost sm">Detay</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailCourier && (
        <CourierDetailModal
          courier={detailCourier}
          ctl={{ key: rangeKey, from: cFrom, to: cTo, setKey: setRangeKey, setCustom: (f, t) => { setCFrom(f); setCTo(t); }, sla }}
          canPoints={canPoints}
          onClose={() => setDetailId(null)}
          onEdit={(c) => { setDetailId(null); openEdit(c); }}
          onChanged={() => ov.reload()}
        />
      )}

      {/* Düzenleme Modal */}
      <Modal open={editModal} onClose={() => setEditModal(false)}>
        <h2>Kurye Bilgilerini Düzenle</h2>
        <p className="muted">{selectedCourier?.full_name}</p>
        <form onSubmit={handleSaveCourierDetails} className="form">
          <label>
            Araç Türü
            <select value={editForm.vehicle_type} onChange={(e) => setEditForm({ ...editForm, vehicle_type: e.target.value })}>
              <option value="motorcycle">Motosiklet</option>
              <option value="car">Araba</option>
              <option value="bicycle">Bisiklet</option>
            </select>
          </label>
          <label>
            Plaka
            <input value={editForm.plate} onChange={(e) => setEditForm({ ...editForm, plate: e.target.value })} placeholder="42 YZR 42" />
          </label>
          <label>
            Notlar
            <textarea rows={2} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Ek bilgiler..." />
          </label>
          <div className="prow" style={{ marginTop: '1rem' }}>
            <button type="submit" className="btn gold sm">Kaydet</button>
            <button type="button" className="btn ghost sm" onClick={() => setEditModal(false)}>Vazgeç</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
