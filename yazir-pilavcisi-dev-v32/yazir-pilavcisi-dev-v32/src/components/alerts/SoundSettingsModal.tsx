import Modal from '@/components/ui/Modal';
import Switch from '@/components/ui/Switch';
import { AlertPlayer, TONE_LABELS, saveAlertSettings, testTone, type AlertSettings, type AlertTone } from '@/lib/alertSound';
import { useRef } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  value: AlertSettings;
  storageKey: string;
  onChange: (s: AlertSettings) => void;
  showAutoPrint?: boolean;
}

export default function SoundSettingsModal({ open, onClose, value, storageKey, onChange, showAutoPrint }: Props) {
  const demo = useRef(new AlertPlayer());
  const set = (patch: Partial<AlertSettings>) => {
    const next = { ...value, ...patch };
    onChange(next);
    saveAlertSettings(storageKey, next);
  };

  const askNotify = async (on: boolean) => {
    set({ notify: on });
    if (on && 'Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {
        /* yoksay */
      }
    }
  };

  return (
    <Modal open={open} onClose={() => { demo.current.stop(); onClose(); }}>
      <div className="pe-head">
        <div>
          <h2>🔔 Ses ve Bildirim Ayarları</h2>
          <p className="muted small">Bu ayarlar yalnızca bu cihaz için geçerlidir.</p>
        </div>
        <button type="button" className="icon-circle" onClick={() => { demo.current.stop(); onClose(); }} aria-label="Kapat">✕</button>
      </div>

      <div className="pe-toggles">
        <div>
          <div><b>Sesli uyarı</b><small>Yeni sipariş / istek geldiğinde ses çal</small></div>
          <Switch checked={value.enabled} onChange={() => set({ enabled: !value.enabled })} label="Sesli uyarı" />
        </div>
      </div>

      <div className="sound-grid" style={{ opacity: value.enabled ? 1 : 0.5, pointerEvents: value.enabled ? 'auto' : 'none' }}>
        <label className="fld">
          Ses seviyesi <b>%{Math.round(value.volume * 100)}</b>
          <input type="range" min={0.1} max={1} step={0.05} value={value.volume} onChange={(e) => set({ volume: Number(e.target.value) })} />
        </label>

        <label className="fld">
          Ses türü
          <select value={value.tone} onChange={(e) => set({ tone: e.target.value as AlertTone })}>
            {(Object.keys(TONE_LABELS) as AlertTone[]).map((t) => (
              <option key={t} value={t}>{TONE_LABELS[t]}</option>
            ))}
          </select>
        </label>

        <div className="fld">
          Ne kadar çalsın?
          <div className="seg">
            <button type="button" className={value.mode === 'once' ? 'on' : ''} onClick={() => set({ mode: 'once' })}>Tek sefer</button>
            <button type="button" className={value.mode === 'timed' ? 'on' : ''} onClick={() => set({ mode: 'timed' })}>Belirli süre</button>
            <button type="button" className={value.mode === 'until_ack' ? 'on' : ''} onClick={() => set({ mode: 'until_ack' })}>Susturana kadar</button>
          </div>
        </div>

        {value.mode === 'timed' && (
          <label className="fld">
            Çalma süresi <b>{value.seconds} sn</b>
            <input type="range" min={5} max={120} step={5} value={value.seconds} onChange={(e) => set({ seconds: Number(e.target.value) })} />
          </label>
        )}

        <div className="pe-toggles">
          <div>
            <div><b>Tarayıcı bildirimi</b><small>Sekme arka plandayken ekranda bildirim göster</small></div>
            <Switch checked={value.notify} onChange={() => askNotify(!value.notify)} label="Tarayıcı bildirimi" />
          </div>
          <div>
            <div><b>Titreşim</b><small>Telefonlarda titret</small></div>
            <Switch checked={value.vibrate} onChange={() => set({ vibrate: !value.vibrate })} label="Titreşim" />
          </div>
          {showAutoPrint && (
            <div>
              <div><b>Otomatik fiş yazdır</b><small>Yeni siparişte mutfak fişi yazdırma penceresi açılır</small></div>
              <Switch checked={value.autoPrint} onChange={() => set({ autoPrint: !value.autoPrint })} label="Otomatik fiş" />
            </div>
          )}
        </div>
      </div>

      <div className="pe-foot">
        <div className="pe-foot-left">
          <button type="button" className="btn ghost" onClick={() => testTone(value)}>▶ Dene (tek döngü)</button>
          <button type="button" className="btn ghost" onClick={() => demo.current.start({ ...value, enabled: true, mode: 'timed', seconds: 6 })}>▶ 6 sn çal</button>
          <button type="button" className="btn ghost" onClick={() => demo.current.stop()}>■ Durdur</button>
        </div>
        <div className="pe-foot-right">
          <button type="button" className="btn gold" onClick={() => { demo.current.stop(); onClose(); }}>Tamam</button>
        </div>
      </div>
    </Modal>
  );
}
