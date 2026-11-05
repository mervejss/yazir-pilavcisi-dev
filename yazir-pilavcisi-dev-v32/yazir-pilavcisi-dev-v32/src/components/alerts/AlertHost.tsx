import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAlertStore } from '@/stores/alertStore';
import { AlertPlayer, isAudioLocked, loadAlertSettings, unlockAudio, type AlertSettings } from '@/lib/alertSound';
import SoundSettingsModal from '@/components/alerts/SoundSettingsModal';

interface Props {
  /** localStorage anahtarı (yönetici ve kurye ayrı) */
  storageKey: string;
  /** Uyarıya tıklanınca gidilecek varsayılan adres */
  defaultLink?: string;
  /** Ayar düğmesi ekranda sabit görünsün mü */
  showButton?: boolean;
}

/**
 * Sayfanın neresinde olunursa olunsun görünen uyarı çubuğu + ses.
 * Ayarlara göre: tek sefer / X saniye / susturana kadar çalar.
 */
export default function AlertHost({ storageKey, defaultLink, showButton = true }: Props) {
  const { alerts, silenced, silence, dismiss, dismissAll } = useAlertStore();
  const [settings, setSettings] = useState<AlertSettings>(() => loadAlertSettings(storageKey));
  const [open, setOpen] = useState(false);
  const [locked, setLocked] = useState(isAudioLocked());
  const player = useRef(new AlertPlayer());
  const navigate = useNavigate();
  const prevCount = useRef(0);

  // Tarayıcı sesi ilk dokunuşta açar
  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      setLocked(isAudioLocked());
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Yeni uyarı gelince çal; hepsi bitince/susturulunca durdur
  useEffect(() => {
    const p = player.current;
    if (alerts.length > prevCount.current && !silenced) {
      p.start(settings);
      if (settings.notify && document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(alerts[0].title, { body: alerts[0].body, tag: alerts[0].id, requireInteraction: true });
        } catch {
          /* yoksay */
        }
      }
    }
    if (alerts.length === 0 || silenced) p.stop();
    prevCount.current = alerts.length;
  }, [alerts, silenced, settings]);

  useEffect(() => () => player.current.stop(), []);

  // Sekme başlığı yanıp söner
  useEffect(() => {
    if (alerts.length === 0) return;
    const orig = document.title;
    let on = false;
    const t = setInterval(() => {
      on = !on;
      document.title = on ? `🔔 (${alerts.length}) ${alerts[0].title}` : orig;
    }, 900);
    return () => {
      clearInterval(t);
      document.title = orig;
    };
  }, [alerts]);

  const go = (link?: string) => {
    const target = link || defaultLink;
    dismissAll();
    if (target) navigate(target);
  };

  return (
    <>
      {alerts.length > 0 && (
        <div className="alert-bar" role="alertdialog" aria-live="assertive">
          <div className="alert-bar-main">
            <span className="alert-bell">{silenced ? '🔕' : '🔔'}</span>
            <div className="alert-bar-text">
              <b>{alerts[0].title}</b>
              {alerts[0].body && <span>{alerts[0].body}</span>}
              {alerts.length > 1 && <small>+ {alerts.length - 1} uyarı daha</small>}
            </div>
          </div>
          <div className="alert-bar-actions">
            {!silenced && (
              <button type="button" className="alert-btn mute" onClick={silence}>
                🔇 Sustur
              </button>
            )}
            <button type="button" className="alert-btn go" onClick={() => go(alerts[0].link)}>
              Aç
            </button>
            <button type="button" className="alert-btn" onClick={() => (alerts.length > 1 ? dismiss(alerts[0].id) : dismissAll())}>
              Tamam
            </button>
          </div>
        </div>
      )}

      {locked && settings.enabled && (
        <button type="button" className="alert-unlock" onClick={() => { unlockAudio(); setLocked(isAudioLocked()); }}>
          🔊 Sesli bildirimleri etkinleştirmek için buraya dokunun
        </button>
      )}

      {showButton && (
        <button type="button" className="alert-fab" onClick={() => setOpen(true)} title="Ses ve bildirim ayarları" aria-label="Ses ayarları">
          {settings.enabled ? '🔔' : '🔕'}
        </button>
      )}

      <SoundSettingsModal
        open={open}
        onClose={() => setOpen(false)}
        value={settings}
        storageKey={storageKey}
        showAutoPrint={storageKey.includes('admin')}
        onChange={(s) => setSettings(s)}
      />
    </>
  );
}
