import Modal from '@/components/ui/Modal';
import Switch from '@/components/ui/Switch';
import { AlertPlayer, TONE_LABELS, saveAlertSettings, testTone, type AlertSettings, type AlertTone } from '@/lib/alertSound';
import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { MAX_RINGTONE_BYTES, removeTone, saveTone } from '@/lib/ringtoneStore';

interface Props {
  open: boolean;
  onClose: () => void;
  value: AlertSettings;
  storageKey: string;
  onChange: (s: AlertSettings) => void;
  showAutoPrint?: boolean;
  /** Kişiye özel zil sesi anahtarı ve kullanıcı */
  ringKey?: string;
  userId?: string;
}

export default function SoundSettingsModal({ open, onClose, value, storageKey, onChange, showAutoPrint, ringKey, userId }: Props) {
  const demo = useRef(new AlertPlayer());
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<AlertSettings>) => {
    const next = { ...value, ...patch };
    onChange(next);
    saveAlertSettings(storageKey, next);
  };

  const onFile = async (f: File | undefined) => {
    if (!f || !ringKey) return;
    setBusy(true);
    try {
      const { cloud } = await saveTone(ringKey, userId, f);
      set({ tone: 'custom', customName: f.name });
      toast.success(cloud ? 'Zil sesi kaydedildi (hesabınıza bağlı)' : 'Zil sesi bu cihaza kaydedildi');
    } catch (e: any) {
      toast.error(e?.message || 'Ses dosyası yüklenemedi');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const onRemove = async () => {
    if (!ringKey) return;
    setBusy(true);
    await removeTone(ringKey, userId);
    set({ tone: value.tone === 'custom' ? 'siren' : value.tone, customName: undefined });
    setBusy(false);
    toast.success('Kendi zil sesiniz kaldırıldı');
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
            {(Object.keys(TONE_LABELS) as AlertTone[])
              .filter((t) => t !== 'custom' || value.customName)
              .map((t) => (
                <option key={t} value={t}>{t === 'custom' ? `🎵 Kendi zil sesim (${value.customName})` : TONE_LABELS[t]}</option>
              ))}
          </select>
        </label>

        {ringKey && (
          <div className="fld ringtone-up">
            Kendi zil sesim
            <input ref={fileRef} type="file" accept="audio/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
            <div className="ringtone-btns">
              <button type="button" className="btn ghost sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                {busy ? 'Yükleniyor…' : value.customName ? '🎵 Değiştir' : '📂 Telefondan ses seç'}
              </button>
              {value.customName && <button type="button" className="btn ghost sm danger-txt" disabled={busy} onClick={onRemove}>Kaldır</button>}
            </div>
            <small className="muted">
              mp3, m4a, wav, ogg · en fazla {(MAX_RINGTONE_BYTES / 1024 / 1024).toFixed(1)} MB. Bu ses yalnızca <b>sizin hesabınızda</b> çalar; başka kullanıcıları etkilemez.
            </small>
          </div>
        )}

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
          <button type="button" className="btn ghost" onClick={() => testTone({ ...value, customKey: ringKey })}>▶ Dene (tek döngü)</button>
          <button type="button" className="btn ghost" onClick={() => demo.current.start({ ...value, customKey: ringKey, enabled: true, mode: 'timed', seconds: 6 })}>▶ 6 sn çal</button>
          <button type="button" className="btn ghost" onClick={() => demo.current.stop()}>■ Durdur</button>
        </div>
        <div className="pe-foot-right">
          <button type="button" className="btn gold" onClick={() => { demo.current.stop(); onClose(); }}>Tamam</button>
        </div>
      </div>
    </Modal>
  );
}
