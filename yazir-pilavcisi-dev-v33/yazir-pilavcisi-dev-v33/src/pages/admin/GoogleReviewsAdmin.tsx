import { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { formatDateTime } from '@/lib/helpers';
import toast from 'react-hot-toast';
import Icon from '@/components/ui/Icon';
import Switch from '@/components/ui/Switch';

interface SyncLogEntry {
  id: number;
  place_id: string;
  reviews_fetched: number;
  reviews_new: number;
  reviews_updated: number;
  status: 'success' | 'partial' | 'error';
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

interface SyncStatus {
  place_id: string;
  reviews_fetched: number;
  reviews_new: number;
  reviews_updated: number;
  status: 'success' | 'partial' | 'error';
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  total_google_reviews: number;
}

interface BusinessSettings {
  google_maps_url: string | null;
  google_place_id: string | null;
}

export default function GoogleReviewsAdmin() {
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [settings, setSettings] = useState<BusinessSettings>({ google_maps_url: '', google_place_id: '' });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [placeIdInput, setPlaceIdInput] = useState('');
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load sync logs
      const { data: logs } = await supabase
        .from('google_reviews_sync_log')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(20);
      if (logs) setSyncLogs(logs as unknown as SyncLogEntry[]);

      // Load latest sync status
      const { data: status } = await supabase
        .from('google_reviews_sync_status')
        .select('*')
        .single();
      if (status) setSyncStatus(status as unknown as SyncStatus);

      // Load business settings
      const { data: businessSettings } = await supabase
        .from('business_settings')
        .select('google_maps_url, google_place_id')
        .eq('id', 1)
        .single();
      if (businessSettings) {
        setSettings({
          google_maps_url: businessSettings.google_maps_url || '',
          google_place_id: businessSettings.google_place_id || '',
        });
        // Extract place_id from URL if not stored
        if (!businessSettings.google_place_id && businessSettings.google_maps_url) {
          const extracted = extractPlaceIdFromUrl(businessSettings.google_maps_url);
          if (extracted) setPlaceIdInput(extracted);
        }
      }
    } catch (err) {
      console.error('Failed to load Google reviews admin data:', err);
      toast.error('Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const extractPlaceIdFromUrl = (url: string): string | null => {
    if (url.startsWith('ChIJ') || url.startsWith('Ei') || url.startsWith('GhI')) {
      return url;
    }
    const dataMatch = url.match(/[?&]data=([^&]+)/);
    if (dataMatch) {
      const decoded = decodeURIComponent(dataMatch[1]);
      const placeIdMatch = decoded.match(/!16s([^!]+)/);
      if (placeIdMatch) return placeIdMatch[1];
      const altMatch = decoded.match(/!1s([^!]+)/);
      if (altMatch) return altMatch[1];
    }
    return null;
  };

  const handleManualSync = async () => {
    const placeId = placeIdInput.trim() || settings.google_place_id || extractPlaceIdFromUrl(settings.google_maps_url || '');

    if (!placeId) {
      toast.error('Google Place ID bulunamadı. Ayarlar sayfasından Google Haritalar bağlantısını girin veya buraya Place ID yapıştırın.');
      return;
    }

    setSyncing(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/google-reviews-sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ place_id: placeId }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success(`${result.reviews_new} yeni, ${result.reviews_updated} güncellenen yorum`);
        loadData();
      } else {
        toast.error(result.error_message || 'Senkronizasyon başarısız');
      }
    } catch (err) {
      console.error('Sync error:', err);
      toast.error('Senkronizasyon sırasında hata oluştu');
    } finally {
      setSyncing(false);
    }
  };

  const handleSavePlaceId = async () => {
    const placeId = placeIdInput.trim();
    if (!placeId) {
      toast.error('Place ID boş olamaz');
      return;
    }

    try {
      const { error } = await supabase
        .from('business_settings')
        .update({ google_place_id: placeId })
        .eq('id', 1);

      if (error) throw error;
      toast.success('Place ID kaydedildi');
      loadData();
    } catch (err) {
      toast.error('Kaydedilemedi');
    }
  };

  const handleAutoSyncToggle = () => {
    const next = !autoSyncEnabled;
    setAutoSyncEnabled(next);
    toast(next ? 'Otomatik senkronizasyon etkinleştirildi (cron job manuel ayarlanmalı)' : 'Otomatik senkronizasyon devre dışı');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'var(--success)';
      case 'partial': return 'var(--orange)';
      case 'error': return 'var(--danger)';
      default: return 'var(--text-muted)';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'success': return 'Başarılı';
      case 'partial': return 'Kısmi';
      case 'error': return 'Hata';
      default: return status;
    }
  };

  if (loading) {
    return <div className="center" style={{ padding: '3rem' }}>Yükleniyor...</div>;
  }

  return (
    <>
      <div className="bar">
        <div>
          <h1>Google Yorumları Yönetimi</h1>
          <p className="muted" style={{ margin: 0 }}>
            Google Places API'den yorumları çekme, senkronizasyon durumu ve ayarlar
          </p>
        </div>
        <div className="orow" style={{ gap: '1rem' }}>
          <button
            type="button"
            className="btn gold"
            onClick={handleManualSync}
            disabled={syncing}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Icon name="refresh" size={18} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
            {syncing ? 'Senkronize Ediliyor...' : 'Şimdi Senkronize Et'}
          </button>
        </div>
      </div>

      <div className="two-panel settings-panel">
        {/* Sol Panel: Ayarlar ve Durum */}
        <div className="form card" style={{ display: 'grid', gap: '1.5rem' }}>
          <h3>Google Places Yapılandırması</h3>

          <div style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--line)' }}>
            <h4 style={{ margin: '0 0 0.8rem' }}>Google Place ID</h4>
            <p className="muted small" style={{ margin: '0 0 1rem' }}>
              Google Haritalar URL'sinden otomatik çıkarılır. Manuel girmek için aşağıyı kullanın.
            </p>

            <div className="two-col">
              <label>
                Google Haritalar Bağlantısı
                <input
                  readOnly
                  value={settings.google_maps_url || 'Ayarlanmamış'}
                  style={{ background: 'var(--surface)', cursor: 'not-allowed' }}
                />
              </label>
              <label>
                Çıkarılan Place ID
                <input
                  readOnly
                  value={extractPlaceIdFromUrl(settings.google_maps_url || '') || 'Bulunamadı'}
                  style={{ background: 'var(--surface)', cursor: 'not-allowed', fontFamily: 'monospace', fontSize: '0.85rem' }}
                />
              </label>
            </div>

            <label style={{ marginTop: '1rem' }}>
              Manuel Place ID (isteğe bağlı)
              <input
                value={placeIdInput}
                onChange={(e) => setPlaceIdInput(e.target.value)}
                placeholder="ChIJ... (Google Places API Place ID)"
                style={{ fontFamily: 'monospace' }}
              />
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="button" className="btn ghost sm" onClick={handleSavePlaceId}>
                <Icon name="save" size={14} /> Kaydet
              </button>
              <span className="muted small" style={{ alignSelf: 'center' }}>
                Veritabanında <code>google_place_id</code> kolonu eklenmeli
              </span>
            </div>
          </div>

          <div style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--line)' }}>
            <h4 style={{ margin: '0 0 0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Icon name="clock" size={18} /> Otomatik Senkronizasyon
            </h4>
            <div className="orow" style={{ alignItems: 'center' }}>
              <div>
                <b>Her gün gece 03:00 UTC</b>
                <p className="muted small" style={{ margin: 0 }}>
                  Supabase pg_cron ile otomatik çalışır. Edge Function tetiklenir.
                </p>
              </div>
              <Switch
                checked={autoSyncEnabled}
                onChange={handleAutoSyncToggle}
                label="Otomatik senkronizasyon"
              />
            </div>
            <p className="muted small" style={{ margin: '0.5rem 0 0' }}>
              Cron job kurulumu için: <code>sql/13_google_reviews_cron.sql</code> dosyasını Supabase SQL Editor'de çalıştırın.
            </p>
          </div>

          {/* Sync Status Card */}
          {syncStatus && (
            <div style={{ background: 'var(--surface)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--line)' }}>
              <h4 style={{ margin: '0 0 0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Icon name="info" size={18} /> Son Senkronizasyon Durumu
              </h4>
              <div className="two-col">
                <div>
                  <p className="muted small" style={{ margin: '0 0 0.3rem' }}>Toplam Google Yorumu</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--gold-ink)' }}>{syncStatus.total_google_reviews}</p>
                </div>
                <div>
                  <p className="muted small" style={{ margin: '0 0 0.3rem' }}>Son Çekilen</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: '800' }}>{syncStatus.reviews_fetched}</p>
                </div>
              </div>
              <div className="two-col" style={{ marginTop: '0.8rem' }}>
                <div>
                  <p className="muted small" style={{ margin: '0 0 0.3rem' }}>Yeni Eklenen</p>
                  <p style={{ fontSize: '1.2rem', fontWeight: '700', color: 'var(--success)' }}>{syncStatus.reviews_new}</p>
                </div>
                <div>
                  <p className="muted small" style={{ margin: '0 0 0.3rem' }}>Güncellenen</p>
                  <p style={{ fontSize: '1.2rem', fontWeight: '700', color: 'var(--orange)' }}>{syncStatus.reviews_updated}</p>
                </div>
              </div>
              <div style={{ marginTop: '0.8rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <span
                  style={{
                    padding: '0.3rem 0.8rem',
                    borderRadius: '999px',
                    fontSize: '0.8rem',
                    fontWeight: '700',
                    background: getStatusColor(syncStatus.status),
                    color: '#fff',
                  }}
                >
                  {getStatusLabel(syncStatus.status)}
                </span>
                {syncStatus.error_message && (
                  <span className="muted small" style={{ color: 'var(--danger)' }}>
                    {syncStatus.error_message}
                  </span>
                )}
                <time className="muted small">
                  {formatDateTime(syncStatus.completed_at || syncStatus.started_at)}
                </time>
              </div>
            </div>
          )}

          <h3>Google Yorumları Listesi</h3>
          <p className="muted small">
            Bu listede sadece Google'dan çekilen yorumlar gösterilmektedir. Web sitesi yorumları{' '}
            <NavLink to="/admin/geribildirim">Geri Bildirim</NavLink>{' '}
            sayfasındadır.
          </p>
        </div>

        {/* Sağ Panel: Senkronizasyon Geçmişi */}
        <aside className="card" style={{ padding: '1.2rem', maxHeight: '70vh', overflow: 'auto' }}>
          <h3>Senkronizasyon Geçmişi</h3>
          {syncLogs.length === 0 ? (
            <p className="muted center" style={{ padding: '2rem' }}>Henüz senkronizasyon kaydı yok</p>
          ) : (
            <div className="list" style={{ display: 'grid', gap: '0.5rem' }}>
              {syncLogs.map((log) => (
                <div key={log.id} className={`card fb${log.status === 'error' ? ' error' : ''}`} style={{ padding: '0.8rem', margin: 0 }}>
                  <div className="orow" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div>
                      <span
                        style={{
                          padding: '0.15rem 0.5rem',
                          borderRadius: '999px',
                          fontSize: '0.7rem',
                          fontWeight: '700',
                          background: getStatusColor(log.status),
                          color: '#fff',
                        }}
                      >
                        {getStatusLabel(log.status)}
                      </span>
                      <span className="muted small" style={{ marginLeft: '0.5rem' }}>
                        {formatDateTime(log.started_at)}
                      </span>
                    </div>
                    {log.completed_at && (
                      <time className="muted small" style={{ whiteSpace: 'nowrap' }}>
                        {formatDateTime(log.completed_at)}
                      </time>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                    <div>
                      <span className="muted">Çekilen</span>
                      <div style={{ fontWeight: '700' }}>{log.reviews_fetched}</div>
                    </div>
                    <div>
                      <span className="muted">Yeni</span>
                      <div style={{ fontWeight: '700', color: 'var(--success)' }}>{log.reviews_new}</div>
                    </div>
                    <div>
                      <span className="muted">Güncellenen</span>
                      <div style={{ fontWeight: '700', color: 'var(--orange)' }}>{log.reviews_updated}</div>
                    </div>
                  </div>
                  {log.error_message && (
                    <p className="muted small" style={{ margin: '0.5rem 0 0', color: 'var(--danger)', fontSize: '0.8rem' }}>
                      {log.error_message}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .card.error {
          border-left: 3px solid var(--danger);
        }
      `}</style>
    </>
  );
}