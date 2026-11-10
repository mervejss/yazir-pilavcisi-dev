import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { DAY_NAMES } from '@/lib/constants';
import { weekSchedule, businessDateISO, getOpenStatus } from '@/lib/helpers';
import Switch from '@/components/ui/Switch';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/Icon';
import toast from 'react-hot-toast';

type Scope = 'once' | 'always' | null;

interface EditorState {
  dow: number;
  dateISO: string; // Bu günün bir sonraki (veya bugünkü) takvim tarihi
  isToday: boolean;
  open: string; // HH:MM
  close: string; // HH:MM
  closed: boolean;
  scope: Scope;
}

const hm = (t?: string | null) => (t ? t.slice(0, 5) : '');

function dateLabel(dateISO: string) {
  return new Date(dateISO + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
}

function numOrNull(v: any): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** textarea metnini (veya diziyi) temiz mesaj listesine çevirir; boşsa null */
function waLines(v: unknown): string[] | null {
  const arr = Array.isArray(v) ? v : String(v || '').split('\n');
  const l = arr.map((x) => String(x).trim()).filter(Boolean);
  return l.length ? l : null;
}

export default function SettingsAdmin() {
  const [settings, setSettings] = useState<any>(null);
  const [hours, setHours] = useState<any[]>([]);
  const [overrides, setOverrides] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [savingHours, setSavingHours] = useState(false);

  const loadHours = useCallback(async () => {
    const hourRes = await supabase.from('opening_hours').select('*').order('day_of_week');
    const ovRes = await supabase
      .from('opening_hours_overrides')
      .select('*')
      .gte('override_date', businessDateISO())
      .order('override_date');
    if (hourRes.data) setHours(hourRes.data as any[]);
    // 09_hours_overrides.sql henüz çalıştırılmadıysa tablo yoktur → boş liste
    setOverrides(ovRes.error ? [] : ((ovRes.data || []) as any[]));
    return { overridesMissing: !!ovRes.error };
  }, []);

  const [overridesMissing, setOverridesMissing] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const settRes = await supabase.from('business_settings').select('*').eq('id', 1).single();
      if (settRes.data) setSettings(settRes.data);
      const r = await loadHours();
      setOverridesMissing(r.overridesMissing);
      setLoading(false);
    };
    fetchData();
  }, [loadHours]);

  /* ------------------------------------------------------------------ */
  /* İşletme ayarları (genel form)                                       */
  /* ------------------------------------------------------------------ */
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('business_settings')
        .update({
          name: settings.name,
          phone: settings.phone,
          whatsapp: settings.whatsapp,
          address: settings.address,
          iban: settings.iban,
          iban_holder: settings.iban_holder,
          instagram_url: settings.instagram_url?.trim() || null,
          google_maps_url: settings.google_maps_url?.trim() || null,
          google_place_id: settings.google_place_id?.trim() || null,
          lat: numOrNull(settings.lat),
          lng: numOrNull(settings.lng),
          min_order_amount: Number(settings.min_order_amount),
          delivery_fee: Number(settings.delivery_fee),
          free_delivery_threshold: settings.free_delivery_threshold
            ? Number(settings.free_delivery_threshold)
            : null,
          estimated_delivery_min: Number(settings.estimated_delivery_min),
          estimated_delivery_max: Number(settings.estimated_delivery_max),
          is_accepting_orders: settings.is_accepting_orders,
          enforce_opening_hours: settings.enforce_opening_hours,
          ...(settings.wa_widget_enabled !== undefined
            ? {
                wa_widget_enabled: !!settings.wa_widget_enabled,
                wa_catalog_url: settings.wa_catalog_url?.trim() || null,
                wa_quick_messages: waLines(settings.wa_quick_messages),
              }
            : {}),
          ...(settings.loyalty_enabled !== undefined
            ? {
                loyalty_enabled: !!settings.loyalty_enabled,
                loyalty_earn_per_lira: Number(settings.loyalty_earn_per_lira) || 0,
                loyalty_point_value: Number(settings.loyalty_point_value) || 1,
                loyalty_min_redeem: Number(settings.loyalty_min_redeem) || 1,
              }
            : {}),
        })
        .eq('id', 1)
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Kaydedilemedi: bu işlem için yetkiniz yok.');
      toast.success('İşletme ayarları kaydedildi');
    } catch (err: any) {
      toast.error(err.message || 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  /** Açma/kapama anahtarları anında kaydedilir (formu kaydetmeyi unutsanız bile site doğru görünür) */
  const quickToggle = async (field: 'is_accepting_orders' | 'enforce_opening_hours') => {
    const prev = settings[field];
    const next = !prev;
    setSettings({ ...settings, [field]: next });
    try {
      const { data, error } = await supabase
        .from('business_settings')
        .update({ [field]: next })
        .eq('id', 1)
        .select('id');
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('Kaydedilemedi: bu işlem için yetkiniz yok.');
      if (field === 'is_accepting_orders') {
        toast.success(
          next
            ? 'Online sipariş açıldı'
            : 'Online sipariş kapatıldı — sitede "Şu an sipariş almıyoruz" görünecek',
        );
      } else {
        toast.success(next ? 'Çalışma saati dışında sipariş engellenecek' : 'Çalışma saati dışında da sipariş alınabilir');
      }
    } catch (err: any) {
      setSettings((s: any) => ({ ...s, [field]: prev }));
      toast.error(err.message || 'Güncellenemedi');
    }
  };

  /* ------------------------------------------------------------------ */
  /* Çalışma saatleri                                                    */
  /* ------------------------------------------------------------------ */
  const schedule = weekSchedule(hours, overrides);

  const openEditor = (row: ReturnType<typeof weekSchedule>[number], toggleClosed = false) => {
    const eff = row.eff;
    setEditor({
      dow: row.dow,
      dateISO: row.dateISO,
      isToday: row.isToday,
      open: hm(eff?.open_time) || '12:00',
      close: hm(eff?.close_time) || '03:00',
      closed: toggleClosed ? !eff?.is_closed : !!eff?.is_closed,
      scope: null,
    });
  };

  const saveHours = async () => {
    if (!editor) return;
    if (!editor.scope) {
      toast.error('Lütfen değişikliğin ne zaman geçerli olacağını seçin');
      return;
    }
    if (!editor.closed && (!editor.open || !editor.close)) {
      toast.error('Açılış ve kapanış saatini girin');
      return;
    }
    const open = editor.open || '12:00';
    const close = editor.close || '03:00';
    // Kapanış, açılıştan küçük/eşitse ertesi güne sarkar (örn. 12:00 → 03:00)
    const closesNextDay = close <= open;

    setSavingHours(true);
    try {
      if (editor.scope === 'once') {
        // SADECE BU TARİH İÇİN → opening_hours_overrides
        const { data, error } = await supabase
          .from('opening_hours_overrides')
          .upsert(
            {
              override_date: editor.dateISO,
              open_time: open + ':00',
              close_time: close + ':00',
              closes_next_day: closesNextDay,
              is_closed: editor.closed,
            },
            { onConflict: 'override_date' },
          )
          .select();
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Kaydedilemedi: bu işlem için yetkiniz yok.');
        toast.success(`${dateLabel(editor.dateISO)} için saat güncellendi (sadece bu gün)`);
      } else {
        // HER ZAMAN İÇİN → opening_hours (haftalık standart)
        const { data, error } = await supabase
          .from('opening_hours')
          .update({
            open_time: open + ':00',
            close_time: close + ':00',
            closes_next_day: closesNextDay,
            is_closed: editor.closed,
          })
          .eq('day_of_week', editor.dow)
          .select();
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Kaydedilemedi: bu işlem için yetkiniz yok.');
        // Aynı güne özel kalmış geçici değişiklik varsa, kalıcı değişikliği gölgelemesin
        await supabase.from('opening_hours_overrides').delete().eq('override_date', editor.dateISO);
        toast.success(`${DAY_NAMES[editor.dow - 1]} saati kalıcı olarak güncellendi`);
      }
      await loadHours();
      setEditor(null);
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (editor.scope === 'once' && /opening_hours_overrides/.test(msg)) {
        toast.error('Önce 09_hours_overrides.sql dosyasını Supabase SQL Editor\'de çalıştırın.');
      } else {
        toast.error(msg || 'Güncellenemedi');
      }
    } finally {
      setSavingHours(false);
    }
  };

  const removeOverride = async (dateISO: string) => {
    try {
      const { error } = await supabase.from('opening_hours_overrides').delete().eq('override_date', dateISO);
      if (error) throw error;
      toast.success('Özel saat kaldırıldı, haftalık programa dönüldü');
      await loadHours();
    } catch (err: any) {
      toast.error(err.message || 'Kaldırılamadı');
    }
  };

  if (loading || !settings) return <p className="muted center">Ayarlar yükleniyor...</p>;

  const siteStatus = getOpenStatus(hours, overrides, settings.is_accepting_orders);
  const activeOverrides = overrides.filter((o) => o.override_date >= businessDateISO());
  const editorDayName = editor ? DAY_NAMES[editor.dow - 1] : '';
  const editorWhen = editor
    ? editor.isToday
      ? `Bugün (${editorDayName})`
      : `${dateLabel(editor.dateISO)} ${editorDayName}`
    : '';

  return (
    <>
      <div className="bar">
        <div>
          <h1>İşletme Ayarları ve Çalışma Saatleri</h1>
          <p className="muted" style={{ margin: 0 }}>
            İletişim bilgileri, teslimat limitleri, IBAN ve sipariş kabul kuralları
          </p>
        </div>
        <span className={`pill ${siteStatus.open ? 'ok' : 'no'}`} title="Web sitesinde şu an görünen durum">
          <span className="live-dot" /> Sitede şu an: {siteStatus.open ? 'Açık' : siteStatus.paused ? 'Sipariş kapalı' : 'Kapalı'}
        </span>
      </div>

      <div className="two-panel settings-panel">
        <form onSubmit={handleSaveSettings} className="form card">
          <h3>Genel İşletme Bilgileri</h3>

          <div className="orow" style={{ background: '#f6f4ee', padding: '0.8rem', borderRadius: '10px', color: '#14110c' }}>
            <div>
              <b>Online Sipariş Kabulü</b>
              <p className="muted small" style={{ margin: 0 }}>
                Kapatılırsa web sitesinden sipariş verilemez ve sitede "Şu an sipariş almıyoruz" yazar
              </p>
            </div>
            <Switch
              checked={settings.is_accepting_orders}
              onChange={() => quickToggle('is_accepting_orders')}
              label="Sipariş kabul durumu"
            />
          </div>

          <div className="orow" style={{ background: '#f6f4ee', padding: '0.8rem', borderRadius: '10px', color: '#14110c' }}>
            <div>
              <b>Çalışma Saati Dışında Siparişi Engelle</b>
              <p className="muted small" style={{ margin: 0 }}>
                Açıksa, kapalı olduğumuz saatlerde web sitesinden sipariş verilemez
              </p>
            </div>
            <Switch
              checked={!!settings.enforce_opening_hours}
              onChange={() => quickToggle('enforce_opening_hours')}
              label="Çalışma saati dışında siparişi engelle"
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

          {settings.wa_widget_enabled !== undefined ? (
            <fieldset className="wa-admin">
              <legend>💬 WhatsApp penceresi (sitedeki yeşil düğme)</legend>
              <label className="check">
                <input type="checkbox" checked={!!settings.wa_widget_enabled} onChange={(e) => setSettings({ ...settings, wa_widget_enabled: e.target.checked })} />
                Sitede WhatsApp düğmesini göster
              </label>
              <label>
                WhatsApp katalog bağlantısı <span className="muted">(boşsa gösterilmez; örn. https://wa.me/c/90540…)</span>
                <input value={settings.wa_catalog_url || ''} onChange={(e) => setSettings({ ...settings, wa_catalog_url: e.target.value })} placeholder="https://wa.me/c/905403314142" />
              </label>
              <label>
                Hazır mesajlar <span className="muted">(her satır bir seçenek; boşsa varsayılanlar kullanılır)</span>
                <textarea
                  rows={6}
                  value={Array.isArray(settings.wa_quick_messages) ? settings.wa_quick_messages.join('\n') : settings.wa_quick_messages || ''}
                  onChange={(e) => setSettings({ ...settings, wa_quick_messages: e.target.value as any })}
                  placeholder={'Merhaba, şu an açık mısınız?\nMerhaba, sipariş verebilir miyim?'}
                />
              </label>
            </fieldset>
          ) : (
            <div className="note small">WhatsApp penceresi ayarları için <code>sql/28_whatsapp_widget.sql</code> dosyasını çalıştırın.</div>
          )}

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

          <h3>Sosyal Medya ve Harita</h3>

          <label>
            Instagram Adresi
            <input
              value={settings.instagram_url || ''}
              onChange={(e) => setSettings({ ...settings, instagram_url: e.target.value })}
              placeholder="https://www.instagram.com/yazir.pilavcisi/"
            />
          </label>

          <label>
            Google Haritalar Bağlantısı (isteğe bağlı)
            <input
              value={settings.google_maps_url || ''}
              onChange={(e) => setSettings({ ...settings, google_maps_url: e.target.value })}
              placeholder="https://maps.app.goo.gl/..."
            />
          </label>

          <label>
            Google Place ID (Google Yorumları için)
            <input
              value={settings.google_place_id || ''}
              onChange={(e) => setSettings({ ...settings, google_place_id: e.target.value })}
              placeholder="ChIJ... (Google Places API Place ID)"
              style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
            />
          </label>
          <p className="muted small" style={{ margin: '0 0 1rem' }}>
            Google Haritalar bağlantısından otomatik çıkarılır. Yorum çekme çalışmazsa manuel girin.
            <a href="/admin/google-yorumlar" className="btn ghost sm" style={{ marginLeft: '0.5rem', verticalAlign: 'middle' }}>
              Yorumları Yönet
            </a>
          </p>

          <div className="two-col">
            <label>
              Enlem (isteğe bağlı)
              <input
                inputMode="decimal"
                value={settings.lat ?? ''}
                onChange={(e) => setSettings({ ...settings, lat: e.target.value })}
                placeholder="Örn: 37.9201"
              />
            </label>
            <label>
              Boylam (isteğe bağlı)
              <input
                inputMode="decimal"
                value={settings.lng ?? ''}
                onChange={(e) => setSettings({ ...settings, lng: e.target.value })}
                placeholder="Örn: 32.4932"
              />
            </label>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            Enlem/boylam girilirse sitedeki harita tam o noktayı gösterir; girilmezse yukarıdaki adres aranır.
          </p>

          {settings.loyalty_enabled !== undefined && (
            <>
              <h3>⭐ Sadakat Puanı</h3>
              <div className="orow" style={{ background: '#f6f4ee', padding: '0.8rem', borderRadius: '10px', color: '#14110c' }}>
                <div>
                  <b>Puan sistemi</b>
                  <p className="muted small" style={{ margin: 0 }}>Açıkken üye müşteriler teslim edilen siparişlerden puan kazanır ve sepette kullanır</p>
                </div>
                <Switch checked={!!settings.loyalty_enabled} onChange={() => setSettings({ ...settings, loyalty_enabled: !settings.loyalty_enabled })} label="Puan sistemi" />
              </div>
              <div className="two-col">
                <label>
                  Her 1 ₺ için kazanılan puan
                  <input type="number" step="0.01" min={0} value={settings.loyalty_earn_per_lira} onChange={(e) => setSettings({ ...settings, loyalty_earn_per_lira: e.target.value })} />
                  <small className="muted">Örn: 0.05 → her 20 ₺'ye 1 puan</small>
                </label>
                <label>
                  1 puanın indirim değeri (₺)
                  <input type="number" step="0.1" min={0.1} value={settings.loyalty_point_value} onChange={(e) => setSettings({ ...settings, loyalty_point_value: e.target.value })} />
                </label>
              </div>
              <label>
                Kullanım için minimum puan
                <input type="number" min={1} value={settings.loyalty_min_redeem} onChange={(e) => setSettings({ ...settings, loyalty_min_redeem: e.target.value })} />
              </label>
            </>
          )}

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
        <aside className="card hours-card" style={{ padding: '1.2rem' }}>
          <h3>Haftalık Çalışma Saatleri</h3>
          <p className="muted small">
            Gece 03.00'e kadar açık saatler desteklenir. Düzenle simgesine basın; değişikliğin sadece o gün için mi,
            her zaman için mi geçerli olacağını size soracağız.
          </p>

          {overridesMissing && (
            <div className="note" style={{ fontSize: '0.85rem' }}>
              <b>Bir kerelik kurulum gerekli:</b> "Sadece bugün" seçeneğinin çalışması için{' '}
              <code>sql/09_hours_overrides.sql</code> dosyasını Supabase SQL Editor'de çalıştırın.
            </div>
          )}

          <div className="hours-list">
            {schedule.map((r) => {
              const closed = !r.eff || r.eff.is_closed;
              return (
                <div key={r.dow} className={`hours-row${r.isToday ? ' today' : ''}${closed ? ' is-closed' : ''}`}>
                  <div className="hr-day">
                    <b>{DAY_NAMES[r.dow - 1]}</b>
                    {r.isToday && <em className="hr-tag">Bugün</em>}
                    {r.isOverride && <em className="hr-tag alt" title={`${dateLabel(r.dateISO)} için özel saat`}>Özel</em>}
                  </div>
                  <span className="hr-time small">
                    {closed ? 'Kapalı' : `${hm(r.eff!.open_time)} – ${hm(r.eff!.close_time)}`}
                  </span>
                  <Switch
                    checked={!closed}
                    onChange={() => openEditor(r, true)}
                    label={`${DAY_NAMES[r.dow - 1]} açık/kapalı`}
                  />
                  <button
                    type="button"
                    className="icon-circle hr-edit"
                    onClick={() => openEditor(r)}
                    aria-label={`${DAY_NAMES[r.dow - 1]} saatini düzenle`}
                    title="Saati düzenle"
                  >
                    <Icon name="edit" size={15} />
                  </button>
                </div>
              );
            })}
          </div>

          {activeOverrides.length > 0 && (
            <div className="override-list">
              <h4>Geçici (Güne Özel) Değişiklikler</h4>
              {activeOverrides.map((o) => (
                <div key={o.override_date} className="override-item">
                  <div>
                    <b>{dateLabel(o.override_date)}</b>
                    <span className="small muted">
                      {' '}
                      {o.is_closed ? '· Kapalı' : `· ${hm(o.open_time)} – ${hm(o.close_time)}`}
                    </span>
                  </div>
                  <button type="button" className="btn ghost sm" onClick={() => removeOverride(o.override_date)}>
                    Kaldır
                  </button>
                </div>
              ))}
              <p className="muted small" style={{ margin: '0.4rem 0 0' }}>
                Tarih geçince bu değişiklikler kendiliğinden biter, haftalık programa dönülür.
              </p>
            </div>
          )}

          <div style={{ marginTop: '2rem', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
            <h4>Platform Entegrasyon Altyapısı (2. Aşama)</h4>
            <p className="muted small">
              Yemeksepeti, Trendyol Yemek, Getir Yemek ve Migros Yemek siparişleri ilerleyen
              aşamada aynı panele bağlanacaktır. Veritabanı tabloları ve sipariş kaynakları hazırdır.
            </p>
          </div>
        </aside>
      </div>

      {/* Saat düzenleme penceresi: "Sadece bugün mü, her zaman mı?" sorusu burada */}
      <Modal open={!!editor} onClose={() => !savingHours && setEditor(null)}>
        {editor && (
          <div className="hours-editor">
            <h2 style={{ marginTop: 0 }}>{editorDayName} saatini düzenle</h2>
            <p className="muted small" style={{ marginTop: 0 }}>{editorWhen}</p>

            <div className="orow" style={{ margin: '0.8rem 0' }}>
              <div>
                <b>Bu gün açık</b>
                <p className="muted small" style={{ margin: 0 }}>Kapatırsanız o gün site "Şu an kapalıyız" gösterir</p>
              </div>
              <Switch
                checked={!editor.closed}
                onChange={() => setEditor({ ...editor, closed: !editor.closed })}
                label="Bu gün açık"
              />
            </div>

            {!editor.closed && (
              <div className="two-col">
                <label className="fld">
                  Açılış
                  <input
                    type="time"
                    value={editor.open}
                    onChange={(e) => setEditor({ ...editor, open: e.target.value })}
                  />
                </label>
                <label className="fld">
                  Kapanış
                  <input
                    type="time"
                    value={editor.close}
                    onChange={(e) => setEditor({ ...editor, close: e.target.value })}
                  />
                </label>
              </div>
            )}
            {!editor.closed && editor.open && editor.close && editor.close <= editor.open && (
              <p className="muted small" style={{ marginTop: 0 }}>
                Kapanış saati ertesi gün {editor.close} olarak değerlendirilecek.
              </p>
            )}

            <h4 style={{ margin: '1.1rem 0 0.5rem' }}>Bu değişiklik ne zaman geçerli olsun?</h4>
            <div className="scope-options" role="radiogroup" aria-label="Değişikliğin geçerlilik süresi">
              <button
                type="button"
                role="radio"
                aria-checked={editor.scope === 'once'}
                className={`scope-opt${editor.scope === 'once' ? ' on' : ''}`}
                onClick={() => setEditor({ ...editor, scope: 'once' })}
              >
                <Icon name="calendar" size={20} />
                <span>
                  <b>{editor.isToday ? 'Sadece bugün için' : `Sadece ${dateLabel(editor.dateISO)} için`}</b>
                  <small>Geçici. O gün bitince haftalık standart saate otomatik dönülür.</small>
                </span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={editor.scope === 'always'}
                className={`scope-opt${editor.scope === 'always' ? ' on' : ''}`}
                onClick={() => setEditor({ ...editor, scope: 'always' })}
              >
                <Icon name="refresh" size={20} />
                <span>
                  <b>Her zaman için ({editorDayName})</b>
                  <small>Kalıcı. Haftalık standart program güncellenir, her {editorDayName} böyle olur.</small>
                </span>
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.8rem', justifyContent: 'flex-end', marginTop: '1.3rem' }}>
              <button type="button" className="btn ghost" onClick={() => setEditor(null)} disabled={savingHours}>
                Vazgeç
              </button>
              <button type="button" className="btn gold" onClick={saveHours} disabled={savingHours || !editor.scope}>
                {savingHours ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
