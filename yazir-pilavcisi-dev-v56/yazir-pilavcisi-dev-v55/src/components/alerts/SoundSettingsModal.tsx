import Modal from '@/components/ui/Modal';
import Switch from '@/components/ui/Switch';
import { AlertPlayer, TONE_LABELS, saveAlertSettings, saveAccountAlertSettings, saveAccountAlertSettingsAllChannels, applyAlertSettingsToAllUsers, testTone, type AlertSettings, type AlertTone } from '@/lib/alertSound';
import { ALERT_CHANNELS, type AlertChannel } from '@/lib/alertChannels';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { MAX_RINGTONE_BYTES, removeTone, saveTone } from '@/lib/ringtoneStore';

interface Props {
  open: boolean;
  onClose: () => void;
  value: AlertSettings;
  settingsByChannel: Record<string, AlertSettings>;
  storageKey: string;
  hostKey: string;
  onChange: (s: AlertSettings, channel: AlertChannel) => void;
  userId?: string;
  showAutoPrint?: boolean;
  initialChannel: AlertChannel;
  onChannelChange: (channel: AlertChannel) => void;
  onMuteAll: (ms: number) => void;
  onUnmuteAll: () => void;
}

export default function SoundSettingsModal({ open, onClose, value, settingsByChannel, storageKey, userId, showAutoPrint, initialChannel, onChannelChange, onChange, onMuteAll, onUnmuteAll }: Props) {
  const demo = useRef(new AlertPlayer());
  const [busy, setBusy] = useState(false);
  const [channel, setChannel] = useState<AlertChannel>(initialChannel);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) setChannel(initialChannel); }, [open, initialChannel]);
  const ringKey = `ring:${userId || 'anon'}:${channel}`;
  const set = (patch: Partial<AlertSettings>) => {
    const next = { ...value, ...patch };
    onChange(next, channel);
    saveAlertSettings(`${storageKey}:${channel}`, next);
    void saveAccountAlertSettings(userId, channel, next);
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const { cloud } = await saveTone(ringKey, userId, f);
      set({ tone: 'custom', customName: f.name });
      toast.success(cloud ? 'Zil sesi bu hesap ve sipariş türü için kaydedildi' : 'Zil sesi bu cihaza kaydedildi');
    } catch (e: any) { toast.error(e?.message || 'Ses dosyası yüklenemedi'); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const onRemove = async () => {
    setBusy(true);
    await removeTone(ringKey, userId);
    set({ tone: 'siren', customName: undefined });
    setBusy(false);
    toast.success('Bu sipariş türünün özel zil sesi kaldırıldı');
  };
  const askNotify = async (on: boolean) => {
    set({ notify: on });
    if (on && 'Notification' in window && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch { /* ignore */ }
    }
  };
  const [bulkBusy, setBulkBusy] = useState(false);
  const applyAllChannels = async (enabled: boolean) => {
    ALERT_CHANNELS.forEach((c) => { const next = { ...(settingsByChannel[c.id] || value), enabled }; onChange(next, c.id); saveAlertSettings(`${storageKey}:${c.id}`, next); });
    await saveAccountAlertSettingsAllChannels(userId, ALERT_CHANNELS.map((c) => c.id), { enabled }, settingsByChannel);
    toast.success(enabled ? 'Tüm kanallar sizin için açıldı' : 'Tüm kanallar sizin için kapatıldı');
  };
  const applyAllUsers = async (enabled: boolean) => {
    setBulkBusy(true);
    try { await applyAlertSettingsToAllUsers(ALERT_CHANNELS.map((c) => c.id), { enabled }); toast.success(enabled ? 'Tüm kullanıcıların tüm kanalları açıldı' : 'Tüm kullanıcıların tüm kanalları kapatıldı'); }
    catch (e: any) { toast.error(e?.message || 'Tüm kullanıcılar için uygulanamadı'); }
    finally { setBulkBusy(false); }
  };

  return (
    <Modal open={open} onClose={() => { demo.current.stop(); onClose(); }}>
      <div className="pe-head">
        <div><h2>🔔 Kişisel Ses ve Bildirim Ayarları</h2><p className="muted small">Her hesap ve sipariş kanalı birbirinden bağımsızdır.</p></div>
        <button type="button" className="icon-circle" onClick={() => { demo.current.stop(); onClose(); }} aria-label="Kapat">✕</button>
      </div>
      <div className="fld" style={{ marginBottom: 14 }}><b>🔔 TÜM KANALLAR</b><small className="muted">Önce toplu işlem, ardından isterseniz tek tek kanal ayarı.</small><div className="ringtone-btns" style={{ marginTop: 8, flexWrap: 'wrap' }}><button type="button" className="btn ghost sm" onClick={() => void applyAllChannels(true)}>Kendim için TÜMÜNÜ AÇ</button><button type="button" className="btn ghost sm" onClick={() => void applyAllChannels(false)}>Kendim için TÜMÜNÜ KAPAT</button><button type="button" className="btn ghost sm" disabled={bulkBusy} onClick={() => void applyAllUsers(true)}>Tüm personeller için TÜMÜNÜ AÇ</button><button type="button" className="btn ghost sm danger-txt" disabled={bulkBusy} onClick={() => void applyAllUsers(false)}>Tüm personeller için TÜMÜNÜ KAPAT</button></div><div style={{ marginTop: 10 }}><b>Bu hesap için tüm bildirimleri süreli sustur</b><select defaultValue="" onChange={(e) => { const v = e.target.value; if (!v) return; if (v === 'off') onUnmuteAll(); else onMuteAll(Number(v)); e.currentTarget.value = ''; }}><option value="">Süre seçin…</option><option value={8*60*60*1000}>8 saat</option><option value={24*60*60*1000}>24 saat</option><option value={48*60*60*1000}>48 saat</option><option value={7*24*60*60*1000}>1 hafta</option><option value={30*24*60*60*1000}>1 ay</option><option value={365*24*60*60*1000}>1 yıl</option><option value="off">Tüm kanallarda sesi yeniden aç</option></select></div></div>
      <label className="fld" style={{ marginBottom: 14 }}>Tek kanal ayarını düzenle
        <select value={channel} onChange={(e) => { demo.current.stop(); setChannel(e.target.value as AlertChannel); onChannelChange(e.target.value as AlertChannel); }}>
          {ALERT_CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>
      <div className="note" style={{ marginBottom: 12, fontSize: 12 }}>Sesli anons örneği: “{ALERT_CHANNELS.find((c) => c.id === channel)?.sample}”</div>
      <div className="pe-toggles"><div><div><b>Bu kanalın sesini aç</b><small>Kapalıysa yalnızca bu sipariş türü sessiz kalır</small></div><Switch checked={value.enabled} onChange={() => set({ enabled: !value.enabled })} label="Sesli uyarı" /></div></div>
      <div className="sound-grid" style={{ opacity: value.enabled ? 1 : .5, pointerEvents: value.enabled ? 'auto' : 'none' }}>
        <label className="fld">Ses seviyesi <b>%{Math.round(value.volume * 100)}</b><input type="range" min={0.1} max={1} step={0.05} value={value.volume} onChange={(e) => set({ volume: Number(e.target.value) })} /></label>
        <label className="fld">Zil sesi<select value={value.tone} onChange={(e) => set({ tone: e.target.value as AlertTone })}>{(Object.keys(TONE_LABELS) as AlertTone[]).filter((t) => t !== 'custom' || value.customName).map((t) => <option key={t} value={t}>{t === 'custom' ? `🎵 ${value.customName || 'Özel zil sesi'}` : TONE_LABELS[t]}</option>)}</select></label>
        <div className="fld ringtone-up">Bu kanal için özel ses dosyası<input ref={fileRef} type="file" accept="audio/*" hidden onChange={(e) => onFile(e.target.files?.[0])} /><div className="ringtone-btns"><button type="button" className="btn ghost sm" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Yükleniyor…' : value.customName ? `🎵 ${value.customName} · Değiştir` : '📂 Ses dosyası yükle'}</button>{value.customName && <button type="button" className="btn ghost sm danger-txt" disabled={busy} onClick={onRemove}>Kaldır</button>}</div><small className="muted">mp3, m4a, wav, ogg · en fazla {(MAX_RINGTONE_BYTES / 1024 / 1024).toFixed(1)} MB. Her kanalın ses dosyası ayrıdır.</small>{value.customName && <label className="fld" style={{ marginTop: 8 }}>Zil sesi adı<input value={value.customName} onChange={(e) => set({ customName: e.target.value })} maxLength={60} /></label>}</div>
        <div className="fld">Çalma şekli<div className="seg"><button type="button" className={value.mode === 'once' ? 'on' : ''} onClick={() => set({ mode: 'once' })}>Tek sefer</button><button type="button" className={value.mode === 'timed' ? 'on' : ''} onClick={() => set({ mode: 'timed' })}>Süreli</button><button type="button" className={value.mode === 'until_ack' ? 'on' : ''} onClick={() => set({ mode: 'until_ack' })}>Susturana kadar</button></div></div>
        {value.mode === 'timed' && <label className="fld">Çalma süresi <b>{value.seconds} sn</b><input type="range" min={5} max={120} step={5} value={value.seconds} onChange={(e) => set({ seconds: Number(e.target.value) })} /></label>}
        <div className="pe-toggles"><div><div><b>Türkçe sesli anons</b><small>Örnekteki cümleyi Türkçe konuşarak duyur</small></div><Switch checked={!!value.speak} onChange={() => set({ speak: !value.speak })} label="Sesli anons" /></div><div><div><b>Tarayıcı bildirimi</b><small>Sekme arka plandayken bildirim göster</small></div><Switch checked={value.notify} onChange={() => askNotify(!value.notify)} label="Tarayıcı bildirimi" /></div><div><div><b>Titreşim</b><small>Telefonlarda titret</small></div><Switch checked={value.vibrate} onChange={() => set({ vibrate: !value.vibrate })} label="Titreşim" /></div>{showAutoPrint && <div><div><b>Otomatik mutfak fişi</b><small>Bu kanaldan sipariş gelince fiş yazdırma penceresi aç</small></div><Switch checked={value.autoPrint} onChange={() => set({ autoPrint: !value.autoPrint })} label="Otomatik fiş" /></div>}</div>
      </div>
      <div className="pe-foot"><div className="pe-foot-left"><button type="button" className="btn ghost" onClick={() => testTone({ ...value, customKey: ringKey })}>▶ Dene</button><button type="button" className="btn ghost" onClick={() => demo.current.start({ ...value, customKey: ringKey, enabled: true, mode: 'timed', seconds: 6 })}>▶ 6 sn çal</button><button type="button" className="btn ghost" onClick={() => demo.current.stop()}>■ Durdur</button></div><div className="pe-foot-right"><button type="button" className="btn gold" onClick={() => { demo.current.stop(); onClose(); }}>Tamam</button></div></div>
    </Modal>
  );
}
