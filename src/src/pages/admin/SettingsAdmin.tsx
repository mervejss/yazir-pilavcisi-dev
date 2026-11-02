import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { DAY_NAMES } from '@/lib/constants';
import Switch from '@/components/ui/Switch';
import toast from 'react-hot-toast';

export default function SettingsAdmin() {
  const [settings, setSettings] = useState<any>(null);
  const [hours, setHours] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const settRes = await supabase.from('business_settings').select('*').eq('id', 1).single();
      const hourRes = await supabase.from('opening_hours').select('*').order('day_of_week');
      if (settRes.data) setSettings(settRes.data);
      if (hourRes.data) setHours(hourRes.data as any[]);
      setLoading(false);
    };
    fetchData();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase
        .from('business_settings')
        .update({
          name: settings.name,
          phone: settings.phone,
          whatsapp: settings.whatsapp,
          address: settings.address,
          iban: settings.iban,
          iban_holder: settings.iban_holder,
          min_order_amount: Number(settings.min_order_amount),
          delivery_fee: Number(settings.delivery_fee),
          free_delivery_threshold: settings.free_delivery_threshold
            ? Number(settings.free_delivery_threshold)
            : null,
          estimated_delivery_min: Number(settings.estimated_delivery_min),
          estimated_delivery_max: Number(settings.estimated_delivery_max),
          is_accepting_orders: settings.is_accepting_orders,
          enforce_opening_hours: settings.enforce_opening_hours,
        })
        .eq('id', 1);

      if (error) throw error;
      toast.success('İşletme ayarları kaydedildi');
    } catch (err: any) {
      toast.error(err.message || 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const handleHourChange = async (dow: number, patch: any) => {
    try {
      const { error } = await supabase
        .from('opening_hours')
        .update(patch)
        .eq('day_of_week', dow);

      if (error) throw error;
      setHours(hours.map((h) => (h.day_of_week === dow ? { ...h, ...patch } : h)));
      toast.success('Çalışma saati güncellendi');
    } catch (err: any) {
      toast.error(err.message || 'Güncellenemedi');
    }
  };

  if (loading || !settings) return <p className="muted center">Ayarlar yükleniyor...</p>;

  return (
    <>
      <div className="bar">
        <div>
          <h1>İşletme Ayarları ve Çalışma Saatleri</h1>
          <p className="muted" style={{ margin: 0 }}>
            İletişim bilgileri, teslimat limitleri, IBAN ve sipariş kabul kuralları
          </p>
        </div>
      </div>

      <div className="two-panel">
        <form onSubmit={handleSaveSettings} className="form card">
          <h3>Genel İşletme Bilgileri</h3>

          <div className="orow" style={{ background: '#f6f4ee', padding: '0.8rem', borderRadius: '10px' }}>
            <div>
              <b>Online Sipariş Kabulü</b>
              <p className="muted small" style={{ margin: 0 }}>
                Kapatılırsa web sitesinden sipariş verilemez
              </p>
            </div>
            <Switch
              checked={settings.is_accepting_orders}
              onChange={() =>
                setSettings({
                  ...settings,
                  is_accepting_orders: !settings.is_accepting_orders,
                })
              }
              label="Sipariş kabul durumu"
            />
          </div>

          <label>
            İşletme Adı
            <input
              required
              value={settings.name || ''}
              onChange={(e) => setSettings({ ...settings, name: e.target.value })}
            />
          </label>

          <div className="two-col">
            <label>
              Telefon
              <input
                required
                value={settings.phone || ''}
                onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
              />
            </label>
            <label>
              WhatsApp Hattı
              <input
                value={settings.whatsapp || ''}
                onChange={(e) => setSettings({ ...settings, whatsapp: e.target.value })}
              />
            </label>
          </div>

          <label>
            Adres
            <textarea
              rows={2}
              value={settings.address || ''}
              onChange={(e) => setSettings({ ...settings, address: e.target.value })}
            />
          </label>

          <div className="two-col">
            <label>
              IBAN
              <input
                value={settings.iban || ''}
                onChange={(e) => setSettings({ ...settings, iban: e.target.value })}
              />
            </label>
            <label>
              IBAN Alıcı Adı
              <input
                value={settings.iban_holder || ''}
                onChange={(e) => setSettings({ ...settings, iban_holder: e.target.value })}
              />
            </label>
          </div>

          <h3>Teslimat ve Sipariş Limitleri</h3>

          <div className="two-col">
            <label>
              Minimum Sipariş Tutarı (₺)
              <input
                type="number"
                value={settings.min_order_amount}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    min_order_amount: Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              Teslimat Ücreti (₺)
              <input
                type="number"
                value={settings.delivery_fee}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    delivery_fee: Number(e.target.value),
                  })
                }
              />
            </label>
          </div>

          <div className="two-col">
            <label>
              Ücretsiz Teslimat Limiti (₺)
              <input
                type="number"
                value={settings.free_delivery_threshold || ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    free_delivery_threshold: e.target.value ? Number(e.target.value) : null,
                  })
                }
                placeholder="Örn: 300"
              />
            </label>
            <label>
              Tahmini Teslimat Süresi (dk)
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <input
                  type="number"
                  value={settings.estimated_delivery_min}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      estimated_delivery_min: Number(e.target.value),
                    })
                  }
                  style={{ width: '80px' }}
                />
                <span>–</span>
                <input
                  type="number"
                  value={settings.estimated_delivery_max}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      estimated_delivery_max: Number(e.target.value),
                    })
                  }
                  style={{ width: '80px' }}
                />
              </div>
            </label>
          </div>

          <button type="submit" className="btn gold" disabled={saving} style={{ marginTop: '1rem' }}>
            {saving ? 'Kaydediliyor...' : 'Tüm Ayarları Kaydet'}
          </button>
        </form>

        {/* Çalışma Saatleri */}
        <aside className="card" style={{ padding: '1.2rem' }}>
          <h3>Haftalık Çalışma Saatleri</h3>
          <p className="muted small">Gece 03.00'e kadar açık saatler desteklenir.</p>
          <div style={{ display: 'grid', gap: '0.6rem', marginTop: '1rem' }}>
            {hours.map((h) => (
              <div
                key={h.day_of_week}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.4rem 0',
                  borderBottom: '1px solid #eee',
                }}
              >
                <b style={{ width: '90px' }}>{DAY_NAMES[h.day_of_week - 1]}</b>
                <span className="small">
                  {h.open_time.slice(0, 5)} – {h.close_time.slice(0, 5)}
                </span>
                <Switch
                  checked={!h.is_closed}
                  onChange={() => handleHourChange(h.day_of_week, { is_closed: !h.is_closed })}
                  label="Açık/Kapalı"
                />
              </div>
            ))}
          </div>

          <div style={{ marginTop: '2rem', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
            <h4>Platform Entegrasyon Altyapısı (2. Aşama)</h4>
            <p className="muted small">
              Yemeksepeti, Trendyol Yemek, Getir Yemek ve Migros Yemek siparişleri ilerleyen
              aşamada aynı panele bağlanacaktır. Veritabanı tabloları ve sipariş kaynakları hazırdır.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
