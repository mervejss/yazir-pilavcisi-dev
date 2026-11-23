import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { formatDateTime } from '@/lib/helpers';
import { plannedLabel, untilLabel } from '@/lib/helpers';
import { fmtPhone } from '@/lib/staffCustomers';
import type { BulkRequest, BulkStatus } from '@/types/database';
import Modal from '@/components/ui/Modal';
import BulkRequestForm from '@/components/admin/BulkRequestForm';
import NewOrderModal, { type OrderPrefill } from '@/components/admin/NewOrderModal';

const STATUS_LABEL: Record<BulkStatus, string> = {
  new: 'Yeni', contacted: 'Arandı', confirmed: 'Onaylandı', done: 'Tamamlandı', cancelled: 'İptal',
};
const STATUS_ORDER: BulkStatus[] = ['new', 'contacted', 'confirmed', 'done', 'cancelled'];

export default function BulkRequestsAdmin() {
  const [rows, setRows] = useState<BulkRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'open' | BulkStatus | 'all'>('open');
  const [showNew, setShowNew] = useState(false);
  const [convert, setConvert] = useState<{ req: BulkRequest; prefill: OrderPrefill } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('bulk_order_requests').select('*').order('delivery_at', { ascending: true }).limit(500);
    if (error) toast.error(error.message);
    setRows((data || []) as BulkRequest[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase.channel('bulk-requests').on('postgres_changes', { event: '*', schema: 'public', table: 'bulk_order_requests' }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { open: 0, all: rows.length };
    for (const r of rows) { c[r.status] = (c[r.status] || 0) + 1; if (r.status === 'new' || r.status === 'contacted' || r.status === 'confirmed') c.open++; }
    return c;
  }, [rows]);

  const shown = rows.filter((r) => filter === 'all' ? true : filter === 'open' ? ['new', 'contacted', 'confirmed'].includes(r.status) : r.status === filter);

  const setStatus = async (r: BulkRequest, status: BulkStatus, extra: Record<string, unknown> = {}) => {
    const { error } = await supabase.from('bulk_order_requests').update({ status, ...extra } as any).eq('id', r.id);
    if (error) return void toast.error(error.message);
    toast.success(`Talep: ${STATUS_LABEL[status]}`);
    load();
  };

  const saveNote = async (r: BulkRequest) => {
    const v = (notes[r.id] ?? r.admin_note ?? '').trim();
    const { error } = await supabase.from('bulk_order_requests').update({ admin_note: v || null } as any).eq('id', r.id);
    if (error) return void toast.error(error.message);
    toast.success('Not kaydedildi');
    load();
  };

  const openConvert = (r: BulkRequest) => {
    const note = [r.event_type ? `${r.event_type} · ${r.people_count} kişi/ürün` : `${r.people_count} kişi/ürün`, r.note].filter(Boolean).join(' — ');
    setConvert({ req: r, prefill: { customer: { name: r.full_name, phone: r.phone }, draft: { address: r.delivery_address, scheduledAt: r.delivery_at, note } } });
  };

  return (
    <div className="page-admin">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>Toplu Sipariş Talepleri</h1>
        <button className="btn gold" onClick={() => setShowNew(true)}>+ Yeni toplu talep</button>
      </div>
      <p className="muted small">Web formundan gelen ve yönetici adına açılan talepler. Müşteriyi arayıp menü/fiyatı netleştirdikten sonra "Siparişe çevir" ile planlı sipariş açabilirsiniz.</p>

      <div className="seg" style={{ flexWrap: 'wrap', margin: '0.5rem 0 1rem' }}>
        {([['open', 'Açık'], ...STATUS_ORDER.map((s) => [s, STATUS_LABEL[s]]), ['all', 'Tümü']] as [string, string][]).map(([k, l]) => (
          <button key={k} type="button" className={filter === k ? 'on' : ''} onClick={() => setFilter(k as any)}>{l} ({counts[k] || 0})</button>
        ))}
      </div>

      {loading ? <p className="muted">Yükleniyor…</p> : shown.length === 0 ? <p className="muted">Bu filtrede talep yok.</p> : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {shown.map((r) => {
            const past = new Date(r.delivery_at).getTime() < Date.now();
            return (
              <div key={r.id} className="card" style={{ padding: '0.9rem 1rem' }}>
                <div className="row" style={{ justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <div>
                    <b>{r.full_name}</b>{' '}
                    <span className={`chip ${r.status === 'new' ? 'plan' : ''}`}>{STATUS_LABEL[r.status]}</span>{' '}
                    <span className="chip">{r.source === 'admin' ? 'Yönetici' : 'Web'}</span>{' '}
                    {r.event_type && <span className="chip">{r.event_type}</span>}
                    <div className="small">
                      <a href={`tel:${r.phone}`}>{fmtPhone(r.phone) || r.phone}</a> · <b>{r.people_count}</b> kişi/ürün
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div><b>⏰ {plannedLabel(r.delivery_at)}</b></div>
                    <div className={`small ${past && !['done', 'cancelled'].includes(r.status) ? 'late' : 'muted'}`}>{untilLabel(r.delivery_at)}</div>
                  </div>
                </div>
                {r.delivery_address && <p className="small" style={{ margin: '0.4rem 0 0' }}>📍 {r.delivery_address}</p>}
                {r.note && <p className="small muted" style={{ margin: '0.25rem 0 0' }}>“{r.note}”</p>}
                <p className="small muted" style={{ margin: '0.25rem 0 0' }}>Alındı: {formatDateTime(r.created_at)}{r.contacted_at ? ` · Arandı: ${formatDateTime(r.contacted_at)}` : ''}</p>

                <div className="row" style={{ gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
                  <input
                    style={{ flex: '1 1 220px' }}
                    placeholder="Yönetici notu (menü, fiyat, görüşme özeti…)"
                    value={notes[r.id] ?? r.admin_note ?? ''}
                    onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                    onBlur={() => (notes[r.id] ?? r.admin_note ?? '') !== (r.admin_note ?? '') && saveNote(r)}
                  />
                  <select value={r.status} onChange={(e) => setStatus(r, e.target.value as BulkStatus)}>
                    {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  </select>
                  {r.order_id ? (
                    <span className="chip">Siparişe çevrildi</span>
                  ) : !['done', 'cancelled'].includes(r.status) && (
                    <button className="btn ghost" onClick={() => openConvert(r)}>Siparişe çevir</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={showNew} onClose={() => setShowNew(false)} size="wide">
        <h2>Yeni toplu talep</h2>
        <BulkRequestForm onDone={() => { setShowNew(false); load(); }} onCancel={() => setShowNew(false)} />
      </Modal>

      <NewOrderModal
        open={!!convert}
        prefill={convert?.prefill}
        onClose={() => setConvert(null)}
        onCreated={(res) => {
          if (convert && res?.order_id) setStatus(convert.req, 'confirmed', { order_id: res.order_id });
          setConvert(null);
        }}
      />
    </div>
  );
}
