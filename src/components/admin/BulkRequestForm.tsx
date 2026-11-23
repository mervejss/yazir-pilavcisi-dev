import { useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { isMissingFn, normalizePhone } from '@/lib/staffCustomers';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';

export const BULK_EVENT_TYPES = ['Cenaze', 'Mevlit', 'Nişan / Düğün', 'İş yeri', 'Diğer'];

/** datetime-local değeri için yerel saatte "yyyy-MM-ddTHH:mm" */
export const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

interface Props {
  onDone: () => void;
  onCancel?: () => void;
}

/** Yönetici adına toplu sipariş talebi oluşturur (web formuyla aynı alanlar; organizasyon türü zorunlu değil). */
export default function BulkRequestForm({ onDone, onCancel }: Props) {
  const { settings } = useBusinessSettings();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ full_name: '', phone: '', event_type: '', people_count: '', delivery_at: '', delivery_address: '', note: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const np = normalizePhone(f.phone);
    if (!f.full_name.trim()) return toast.error('Ad soyad yazın');
    if (!np) return toast.error('Geçerli telefon girin (05xx xxx xx xx)');
    const cnt = parseInt(f.people_count, 10);
    if (!cnt || cnt < 1) return toast.error('Kişi / ürün sayısı girin');
    if (!f.delivery_at) return toast.error('Teslim tarihi ve saatini seçin');
    setBusy(true);
    try {
      const { error } = await supabase.rpc('admin_create_bulk_request', {
        p_name: f.full_name.trim(),
        p_phone: np,
        p_event_type: f.event_type || null,
        p_count: cnt,
        p_delivery_at: new Date(f.delivery_at).toISOString(),
        p_address: f.delivery_address.trim() || null,
        p_note: f.note.trim() || null,
      } as any);
      if (error) {
        if (isMissingFn(error)) throw new Error('Önce sql/46_scheduled_orders_bulk_requests.sql dosyasını çalıştırın.');
        throw error;
      }
      toast.success('Toplu sipariş talebi kaydedildi');
      onDone();
    } catch (err: any) {
      toast.error(err?.message || 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="form bulkform" onSubmit={submit}>
      <p className="muted small" style={{ marginTop: 0 }}>
        Cenaze, mevlit, nişan, iş yeri yemeği… Müşteri adına talep bırakın; menü ve fiyat müşteriyle telefonda netleştirilir.
      </p>
      <div className="two-col">
        <label>Ad soyad<input required value={f.full_name} onChange={set('full_name')} /></label>
        <label>Telefon<input required type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} placeholder="05xx xxx xx xx" /></label>
      </div>
      <label>
        Organizasyon türü <span className="muted small">(isteğe bağlı)</span>
        <select value={f.event_type} onChange={set('event_type')}>
          <option value="">Belirtilmedi</option>
          {BULK_EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </label>
      <div className="two-col">
        <label>Kişi / ürün sayısı<input type="number" min={1} required value={f.people_count} onChange={set('people_count')} /></label>
        <label>Teslim tarihi ve saati<input type="datetime-local" required min={toLocalInput(new Date())} value={f.delivery_at} onChange={set('delivery_at')} /></label>
      </div>
      <label>Teslim adresi<textarea rows={2} value={f.delivery_address} onChange={set('delivery_address')} /></label>
      <label>Not<textarea rows={2} value={f.note} onChange={set('note')} /></label>
      <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="submit" className="btn gold" disabled={busy}>{busy ? 'Kaydediliyor…' : 'Talebi kaydet'}</button>
        {onCancel && <button type="button" className="btn ghost" disabled={busy} onClick={onCancel}>Vazgeç</button>}
      </div>
      {settings?.phone && (
        <p className="muted small">Acil durumlar için doğrudan arayın: <a href={`tel:${settings.phone.replace(/\s/g, '')}`}>{settings.phone}</a></p>
      )}
    </form>
  );
}
