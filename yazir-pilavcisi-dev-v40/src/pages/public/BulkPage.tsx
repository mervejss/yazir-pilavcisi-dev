import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import toast from 'react-hot-toast';

export default function BulkPage() {
  const { settings } = useBusinessSettings();
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    event_type: 'Cenaze',
    people_count: '',
    delivery_at: '',
    delivery_address: '',
    note: '',
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase.from('bulk_order_requests').insert({
        full_name: form.full_name,
        phone: form.phone,
        event_type: form.event_type,
        people_count: parseInt(form.people_count, 10),
        delivery_at: new Date(form.delivery_at).toISOString(),
        delivery_address: form.delivery_address,
        note: form.note || null,
      });
      if (error) throw error;
      setSent(true);
      toast.success('Talebiniz alındı');
    } catch (err: any) {
      toast.error(err.message || 'Gönderilemedi');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page narrow">
      <h1>Toplu sipariş</h1>
      <p>Cenaze, mevlit, nişan, iş yeri yemeği… Talebinizi bırakın, sizi arayıp menüyü ve fiyatı birlikte netleştirelim.</p>
      {sent ? (
        <div className="note big">Talebiniz alındı. En kısa sürede sizi arayacağız.</div>
      ) : (
        <form className="form" onSubmit={submit}>
          <label>Ad soyad<input required value={form.full_name} onChange={set('full_name')} /></label>
          <label>Telefon<input required type="tel" value={form.phone} onChange={set('phone')} /></label>
          <label>
            Organizasyon türü
            <select value={form.event_type} onChange={set('event_type')}>
              <option>Cenaze</option><option>Mevlit</option><option>Nişan / Düğün</option>
              <option>İş yeri</option><option>Diğer</option>
            </select>
          </label>
          <div className="two-col">
            <label>
              Kişi sayısı
              <input
                type="number"
                min={settings?.bulk_order_min_people || 10}
                required
                value={form.people_count}
                onChange={set('people_count')}
              />
            </label>
            <label>
              Teslim tarihi ve saati
              <input
                type="datetime-local"
                required
                value={form.delivery_at}
                onChange={set('delivery_at')}
              />
            </label>
          </div>
          <label>Teslim adresi<textarea rows={3} required value={form.delivery_address} onChange={set('delivery_address')} /></label>
          <label>Not<textarea rows={2} value={form.note} onChange={set('note')} /></label>
          <button type="submit" className="btn gold" disabled={submitting}>
            {submitting ? 'Gönderiliyor...' : 'Talebi gönder'}
          </button>
          <p className="muted small">
            Acil durumlar için doğrudan arayın:{' '}
            <a href={`tel:${settings?.phone?.replace(/\s/g, '') || ''}`}>{settings?.phone}</a>
          </p>
        </form>
      )}
    </main>
  );
}
