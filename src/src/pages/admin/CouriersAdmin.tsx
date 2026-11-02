import { useState } from 'react';
import { useCouriers } from '@/hooks/useCouriers';
import { supabase } from '@/lib/supabase';
import { timeAgo } from '@/lib/helpers';
import Switch from '@/components/ui/Switch';
import Modal from '@/components/ui/Modal';
import toast from 'react-hot-toast';

export default function CouriersAdmin() {
  const { couriers, refetch } = useCouriers();
  const [selectedCourier, setSelectedCourier] = useState<any | null>(null);
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    vehicle_type: 'motorcycle',
    plate: '',
    notes: '',
  });

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    try {
      const { error } = await supabase.rpc('set_staff_active', {
        p_user: userId,
        p_active: !currentActive,
      });
      if (error) throw error;
      toast.success(!currentActive ? 'Kurye aktifleştirildi' : 'Kurye pasifleştirildi');
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'İşlem başarısız');
    }
  };

  const handleSaveCourierDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourier) return;

    try {
      const { error } = await supabase
        .from('courier_profiles')
        .update({
          vehicle_type: editForm.vehicle_type,
          plate: editForm.plate || null,
          notes: editForm.notes || null,
        })
        .eq('user_id', selectedCourier.courier_id);

      if (error) throw error;
      toast.success('Kurye bilgileri güncellendi');
      setEditModal(false);
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Güncellenemedi');
    }
  };

  return (
    <>
      <div className="bar">
        <div>
          <h1>Kurye Yönetimi</h1>
          <p className="muted" style={{ margin: 0 }}>
            Kurye listesi, araç bilgileri, çevrimiçi durumları ve performans takibi
          </p>
        </div>
      </div>

      <table className="tbl">
        <thead>
          <tr>
            <th>Kurye Adı</th>
            <th>Telefon</th>
            <th>Araç & Plaka</th>
            <th>Çevrimiçi</th>
            <th>Aktif Sipariş</th>
            <th>Son Konum</th>
            <th>Hesap Durumu</th>
            <th>İşlemler</th>
          </tr>
        </thead>
        <tbody>
          {couriers.map((c) => (
            <tr key={c.courier_id}>
              <td>
                <b>
                  <i className={`dot${c.is_online ? ' on' : ''}`} />
                  {c.full_name}
                </b>
              </td>
              <td>{c.phone || '—'}</td>
              <td>
                {c.vehicle_type === 'motorcycle'
                  ? '🛵 Motosiklet'
                  : c.vehicle_type === 'car'
                  ? '🚗 Araba'
                  : '🚲 Bisiklet'}
                {c.plate && ` (${c.plate})`}
              </td>
              <td>
                <span className={`st ${c.is_online ? 'delivered' : 'new'}`}>
                  {c.is_online ? 'Çevrimiçi' : 'Çevrimdışı'}
                </span>
              </td>
              <td>
                <b>{c.active_order_count}</b> paket
              </td>
              <td>
                {c.location_updated_at ? (
                  <span className="small muted">{timeAgo(c.location_updated_at)}</span>
                ) : (
                  <span className="small muted">Konum yok</span>
                )}
              </td>
              <td>
                <Switch
                  checked={c.is_active}
                  onChange={() => handleToggleActive(c.courier_id, c.is_active)}
                  label="Aktiflik durumu"
                />
              </td>
              <td>
                <button
                  type="button"
                  className="btn ghost sm"
                  style={{ padding: '0.3em 0.6em', fontSize: '0.8rem' }}
                  onClick={() => {
                    setSelectedCourier(c);
                    setEditForm({
                      vehicle_type: c.vehicle_type || 'motorcycle',
                      plate: c.plate || '',
                      notes: '',
                    });
                    setEditModal(true);
                  }}
                >
                  Düzenle
                </button>
              </td>
            </tr>
          ))}
          {couriers.length === 0 && (
            <tr>
              <td colSpan={8} className="center muted" style={{ padding: '2rem' }}>
                Kurye bulunamadı. Kullanıcılar sekmesinden yeni kurye rolü atayabilirsiniz.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Düzenleme Modal */}
      <Modal open={editModal} onClose={() => setEditModal(false)}>
        <h2>Kurye Bilgilerini Düzenle</h2>
        <p className="muted">{selectedCourier?.full_name}</p>
        <form onSubmit={handleSaveCourierDetails} className="form">
          <label>
            Araç Türü
            <select
              value={editForm.vehicle_type}
              onChange={(e) => setEditForm({ ...editForm, vehicle_type: e.target.value })}
            >
              <option value="motorcycle">Motosiklet</option>
              <option value="car">Araba</option>
              <option value="bicycle">Bisiklet</option>
            </select>
          </label>
          <label>
            Plaka
            <input
              value={editForm.plate}
              onChange={(e) => setEditForm({ ...editForm, plate: e.target.value })}
              placeholder="42 YZR 42"
            />
          </label>
          <label>
            Notlar
            <textarea
              rows={2}
              value={editForm.notes}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              placeholder="Ek bilgiler..."
            />
          </label>
          <div className="prow" style={{ marginTop: '1rem' }}>
            <button type="submit" className="btn gold sm">
              Kaydet
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setEditModal(false)}>
              Vazgeç
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
