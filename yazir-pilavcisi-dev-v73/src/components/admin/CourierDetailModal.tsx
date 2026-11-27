import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { tl, hhmm } from '@/lib/helpers';
import { PAYMENT_METHOD_LABELS } from '@/lib/constants';
import {
  fillDaily, fmtDec, fmtMin, fmtPct, hourRangeLabel, initials, shortDay, WEEKDAYS_LONG, WEEKDAYS_SHORT, type RangeKey, resolveRange,
} from '@/lib/analytics';
import { useCourierDetail } from '@/hooks/useAnalytics';
import type { CourierLive } from '@/types/database';
import Modal from '@/components/ui/Modal';
import RangePicker from '@/components/analytics/RangePicker';
import { ColumnChart, HBars, HeatStrip, HourChart, LineArea, Stat } from '@/components/analytics/Charts';

export interface RangeCtl {
  key: RangeKey;
  from: string;
  to: string;
  setKey: (k: RangeKey) => void;
  setCustom: (from: string, to: string) => void;
  sla: number;
}

interface Props {
  courier: CourierLive | null;
  ctl: RangeCtl;
  canPoints: boolean;
  onClose: () => void;
  onEdit: (c: CourierLive) => void;
  onChanged: () => void;
}

const VEHICLE: Record<string, string> = { motorcycle: '🛵 Motosiklet', car: '🚗 Araba', bicycle: '🚲 Bisiklet' };
const KIND_LABEL: Record<string, string> = { delivery: 'Teslimat', bonus: 'Prim', penalty: 'Ceza', adjust: 'Düzenleme', payout: 'Prim ödemesi' };

export default function CourierDetailModal({ courier, ctl, canPoints, onClose, onEdit, onChanged }: Props) {
  const range = useMemo(() => resolveRange(ctl.key, ctl.from, ctl.to), [ctl.key, ctl.from, ctl.to]);
  const { data, loading, missing, error, reload } = useCourierDetail(courier?.courier_id || null, range.from, range.to, ctl.sla);
  const [adj, setAdj] = useState({ kind: 'bonus', points: '', amount: '', note: '' });
  const [saving, setSaving] = useState(false);

  const s = data?.summary;

  const daily = useMemo(() => {
    if (!data) return { values: [] as number[], labels: [] as string[] };
    const rows = fillDaily(data.daily, range.from, range.to, (day) => ({ day, count: 0, revenue: 0, avg_min: null }));
    return { values: rows.map((r) => Number(r.count)), labels: rows.map((r) => shortDay(r.day)) };
  }, [data, range.from, range.to]);

  if (!courier) return null;

  const perDay = s && s.active_days > 0 ? s.delivery_count / s.active_days : null;
  const perOnlineHour = s && s.online_minutes > 0 ? s.delivery_count / (s.online_minutes / 60) : null;
  const peakHour = data ? [...data.hourly].sort((a, b) => b.count - a.count)[0] : null;
  const peakDow = data ? [...data.weekday].sort((a, b) => b.count - a.count)[0] : null;
  const onTimeTone = s?.on_time_pct == null ? undefined : s.on_time_pct >= 85 ? 'ok' : s.on_time_pct >= 65 ? 'warn' : 'bad';

  const submitPoints = async () => {
    const pts = parseInt(adj.points || '0', 10) || 0;
    const amt = parseFloat((adj.amount || '0').replace(',', '.')) || 0;
    if (!pts && !amt) return void toast.error('Puan veya prim tutarı girin');
    const sign = adj.kind === 'penalty' ? -1 : 1;
    setSaving(true);
    const { data: bal, error: err } = await supabase.rpc('admin_courier_points', {
      p_courier: courier.courier_id,
      p_points: sign * Math.abs(pts),
      p_amount: sign * Math.abs(amt),
      p_kind: adj.kind,
      p_note: adj.note || null,
    });
    setSaving(false);
    if (err) return void toast.error(err.message);
    toast.success(`Kaydedildi. Yeni puan bakiyesi: ${bal}`);
    setAdj({ kind: 'bonus', points: '', amount: '', note: '' });
    reload();
    onChanged();
  };

  return (
    <Modal open onClose={onClose} size="xl">
      <div className="cdm">
        <div className="cdm-head">
          <div className="cx-avatar lg">{initials(courier.full_name)}</div>
          <div className="cdm-title">
            <h2>
              {courier.full_name}
              <span className={`cx-pill ${courier.is_online ? 'on' : ''}`}>{courier.is_online ? 'Çevrimiçi' : 'Çevrimdışı'}</span>
              {!courier.is_active && <span className="cx-pill off">Hesap pasif</span>}
            </h2>
            <p className="muted small">
              {VEHICLE[courier.vehicle_type] || courier.vehicle_type}
              {courier.plate ? ` · ${courier.plate}` : ''}
              {courier.phone ? ` · ${courier.phone}` : ''}
            </p>
          </div>
          <div className="cdm-actions">
            {courier.phone && <a className="btn ghost sm" href={`tel:${courier.phone}`}>📞 Ara</a>}
            <button type="button" className="btn ghost sm" onClick={() => onEdit(courier)}>Düzenle</button>
            <button type="button" className="icon-circle" onClick={onClose} aria-label="Kapat">✕</button>
          </div>
        </div>

        <RangePicker value={ctl.key} onChange={ctl.setKey} from={ctl.from} to={ctl.to} onCustom={ctl.setCustom} />

        {missing && (
          <div className="note">Kurye analizi için <code>sql/20_courier_customer_analytics.sql</code> dosyasını Supabase SQL Editor'de bir kez çalıştırın.</div>
        )}
        {error && !missing && <div className="note">{error}</div>}
        {loading && !data && <p className="muted center" style={{ padding: '2rem' }}>Analiz yükleniyor…</p>}

        {s && data && (
          <>
            <div className="an-stats">
              <Stat label="Teslim edilen paket" value={s.delivery_count} sub={s.ranked_couriers > 0 && s.delivery_count > 0 ? `${s.rank}. sıra / ${s.ranked_couriers} kurye` : 'seçili aralıkta'} />
              <Stat label="Ort. teslim süresi" value={fmtMin(s.avg_delivery_min)} sub="yola çıkış → teslim" />
              <Stat label="Teslimatta geçen toplam süre" value={fmtMin(s.total_delivery_min)} sub="tüm paketler toplamı" />
              <Stat label="Zamanında teslim" value={fmtPct(s.on_time_pct)} sub={`≤ ${ctl.sla} dk eşiği`} tone={onTimeTone} />
              <Stat label="Ort. toplam süre" value={fmtMin(s.avg_total_min)} sub="atama → teslim" />
              <Stat label="Ort. alma süresi" value={fmtMin(s.avg_pickup_wait_min)} sub="atama → yola çıkış" />
              <Stat label="En hızlı / en yavaş" value={`${fmtMin(s.fastest_min)} / ${fmtMin(s.slowest_min)}`} sub="tek teslimat" />
              <Stat label="Taşınan ciro" value={tl(Number(s.revenue))} sub={`ort. paket ${tl(Number(s.avg_order_value))}`} />
              <Stat label="Kapıda tahsilat" value={tl(Number(s.cash_collected))} sub={`nakit ${tl(Number(s.cash_only))} · kart ${tl(Number(s.card_only))}`} />
              <Stat label="Çevrimiçi süre" value={fmtMin(s.online_minutes)} sub={`${s.session_count} oturum${perOnlineHour != null ? ` · saatte ${fmtDec(perOnlineHour)} paket` : ''}`} />
              <Stat label="Aktif gün" value={s.active_days} sub={perDay != null ? `günde ort. ${fmtDec(perDay)} paket` : '—'} />
              <Stat label="Yeniden atama / iptal" value={`${s.reassigned_count} / ${s.cancelled_count}`} sub="kuryeden alınan paketler" tone={s.reassigned_count + s.cancelled_count > 0 ? 'warn' : undefined} />
            </div>

            <div className="an-grid2">
              <section className="an-card">
                <h4>🕒 Hangi saatlerde aktif?</h4>
                <p className="muted small">Teslimatların saate göre dağılımı (İstanbul saati){peakHour && peakHour.count > 0 ? ` · en yoğun: ${hourRangeLabel(peakHour.hour)}` : ''}</p>
                <HourChart data={data.hourly} />
                <HeatStrip data={data.hourly} />
              </section>
              <section className="an-card">
                <h4>📅 Haftanın günleri</h4>
                <p className="muted small">{peakDow && peakDow.count > 0 ? `En yoğun gün: ${WEEKDAYS_LONG[peakDow.dow - 1]}` : 'Gün bazlı dağılım'}</p>
                <ColumnChart
                  items={data.weekday.map((w) => ({ label: WEEKDAYS_SHORT[w.dow - 1], value: Number(w.count), sub: w.avg_min != null ? `ort. ${fmtMin(w.avg_min)}` : undefined }))}
                />
                <p className="muted small" style={{ marginTop: '0.6rem' }}>
                  Saat başına ortalama teslim süresi en yüksek olan: {(() => {
                    const worst = [...data.hourly].filter((h) => h.count > 0 && h.avg_min != null).sort((a, b) => Number(b.avg_min) - Number(a.avg_min))[0];
                    return worst ? `${hourRangeLabel(worst.hour)} (${fmtMin(worst.avg_min)})` : '—';
                  })()}
                </p>
              </section>
            </div>

            <section className="an-card">
              <h4>📈 Günlük teslimat trendi</h4>
              <LineArea points={daily.values} labels={daily.labels} />
            </section>

            <div className="an-grid2">
              <section className="an-card">
                <h4>📍 En çok gittiği bölgeler</h4>
                <HBars
                  rows={data.districts.map((d) => ({ label: d.district, value: Number(d.count), note: d.avg_min != null ? `ort. ${fmtMin(d.avg_min)}` : undefined }))}
                  format={(v) => `${v} paket`}
                />
              </section>

              <section className="an-card">
                <h4>🏅 Prim & puan</h4>
                <div className="an-points">
                  <div><small>Puan bakiyesi</small><b>⭐ {s.points_balance}</b></div>
                  <div><small>Birikmiş prim</small><b>{tl(Number(s.bonus_amount))}</b></div>
                </div>
                {canPoints ? (
                  <div className="an-adj">
                    <div className="an-adj-row">
                      <select value={adj.kind} onChange={(e) => setAdj({ ...adj, kind: e.target.value })} aria-label="Tür">
                        <option value="bonus">+ Prim / ödül</option>
                        <option value="penalty">− Ceza / kesinti</option>
                        <option value="payout">Prim ödemesi (düş)</option>
                        <option value="adjust">Düzeltme</option>
                      </select>
                      <input type="number" placeholder="Puan" value={adj.points} onChange={(e) => setAdj({ ...adj, points: e.target.value })} />
                      <input type="number" step="0.01" placeholder="₺ tutar" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} />
                    </div>
                    <input placeholder="Not (örn: yoğun saatte ekstra mesai)" value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} />
                    <button type="button" className="btn gold sm" disabled={saving} onClick={submitPoints}>Kaydet</button>
                  </div>
                ) : (
                  <p className="muted small">Puan / prim düzenleme yetkiniz yok.</p>
                )}
                <div className="cu-ledger">
                  {data.points.map((l) => (
                    <div key={l.id}>
                      <span>{new Date(l.created_at).toLocaleDateString('tr-TR')} · {KIND_LABEL[l.kind] || l.kind}{l.note ? ` · ${l.note}` : ''}</span>
                      <b className={l.points + Number(l.amount) >= 0 ? 'up' : 'down'}>
                        {l.points ? `${l.points > 0 ? '+' : ''}${l.points} puan` : ''}{l.points && Number(l.amount) ? ' · ' : ''}{Number(l.amount) ? tl(Number(l.amount)) : ''}
                      </b>
                    </div>
                  ))}
                  {data.points.length === 0 && <small className="muted">Henüz puan/prim hareketi yok.</small>}
                </div>
              </section>
            </div>

            <section className="an-card">
              <h4>🧾 Son teslimatlar ({data.recent.length})</h4>
              <div className="an-scroll">
                <table className="tbl">
                  <thead>
                    <tr><th>Sipariş</th><th>Müşteri / Bölge</th><th>Atama</th><th>Yola çıkış</th><th>Teslim</th><th>Yoldaki süre</th><th>Toplam süre</th><th>Tutar</th></tr>
                  </thead>
                  <tbody>
                    {data.recent.map((r) => (
                      <tr key={r.order_id}>
                        <td><b>#{r.order_no}</b></td>
                        <td>{r.customer_name || 'Misafir'}<div className="small muted">{r.district || r.address || ''}</div></td>
                        <td>{r.assigned_at ? hhmm(r.assigned_at) : '—'}</td>
                        <td>{r.picked_up_at ? hhmm(r.picked_up_at) : '—'}</td>
                        <td>{new Date(r.delivered_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })} {hhmm(r.delivered_at)}</td>
                        <td><b>{fmtMin(r.delivery_min)}</b></td>
                        <td>{fmtMin(r.total_min)}</td>
                        <td>{tl(Number(r.total))}<div className="small muted">{PAYMENT_METHOD_LABELS[r.payment_method || ''] || ''}</div></td>
                      </tr>
                    ))}
                    {data.recent.length === 0 && <tr><td colSpan={8} className="center muted" style={{ padding: '1.4rem' }}>Bu aralıkta teslimat yok.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </Modal>
  );
}
