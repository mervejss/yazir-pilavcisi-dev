import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAlertStore } from '@/stores/alertStore';
import { AlertPlayer, DEFAULT_ALERT, isAudioLocked, loadAlertSettings, saveAlertSettings, saveAccountAlertSettings, syncAlertSettingsFromAccount, syncAlertMutesFromAccount, saveAccountAlertMute, unlockAudio, userAlertKey, getAlertMutedUntil, setAlertMuted, type AlertSettings } from '@/lib/alertSound';
import { syncToneFromAccount } from '@/lib/ringtoneStore';
import { useAuthStore } from '@/stores/authStore';
import SoundSettingsModal from '@/components/alerts/SoundSettingsModal';
import { ALERT_CHANNELS, type AlertChannel } from '@/lib/alertChannels';

interface Props { storageKey: string; defaultLink?: string; showButton?: boolean; }
const MUTE_OPTIONS = [
  { label: '1 saat sustur', ms: 60 * 60 * 1000 },
  { label: '8 saat sustur', ms: 8 * 60 * 60 * 1000 },
  { label: '1 gün sustur', ms: 24 * 60 * 60 * 1000 },
  { label: '1 hafta sustur', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: 'Sonsuza dek sustur', ms: 0 },
];

export default function AlertHost({ storageKey, defaultLink, showButton = true }: Props) {
  const { alerts, dismiss, dismissAll } = useAlertStore();
  const uid = useAuthStore((s) => s.user?.id);
  const navigate = useNavigate();
  const [selectedChannel, setSelectedChannel] = useState<AlertChannel>(storageKey.includes('courier') ? 'courier_assigned' : 'web');
  const [settingsByChannel, setSettingsByChannel] = useState<Record<string, AlertSettings>>({});
  const [open, setOpen] = useState(false);
  const [muteMenu, setMuteMenu] = useState(false);
  const [muteRevision, setMuteRevision] = useState(0);
  const [locked, setLocked] = useState(isAudioLocked());
  const [fabHidden, setFabHidden] = useState<boolean>(() => { try { return localStorage.getItem(`yz_alert_fab_hidden:${uid || 'anon'}:${storageKey}`) === '1'; } catch { return false; } });
  const player = useRef(new AlertPlayer());
  const prevIds = useRef<Set<string>>(new Set());
  const lastPlaySignature = useRef('');
  const activeChannel = (alerts[0]?.channel || selectedChannel) as AlertChannel;
  const settingsFor = (channel: AlertChannel) => settingsByChannel[channel] || loadAlertSettings(`${userAlertKey(storageKey, uid)}:${channel}`, `${storageKey}:${channel}`);
  const activeSettings = settingsFor(activeChannel);

  useEffect(() => {
    const all: Record<string, AlertSettings> = {};
    ALERT_CHANNELS.forEach((c) => { all[c.id] = loadAlertSettings(`${userAlertKey(storageKey, uid)}:${c.id}`, userAlertKey(storageKey, uid)); });
    setSettingsByChannel(all);
    if (uid) {
      void syncAlertSettingsFromAccount(uid, storageKey).then((remote) => { if (remote) setSettingsByChannel((old) => ({ ...old, ...remote })); });
      void syncAlertMutesFromAccount(uid, storageKey).then(() => setMuteRevision((v) => v + 1));
      ALERT_CHANNELS.forEach((c) => { void syncToneFromAccount(`ring:${uid}:${c.id}`, uid).then((name) => { if (name) setSettingsByChannel((old) => ({ ...old, [c.id]: { ...(old[c.id] || DEFAULT_ALERT), customName: (old[c.id] || DEFAULT_ALERT).customName || name } })); }); });
    }
  }, [uid, storageKey]);

  useEffect(() => {
    const unlock = () => { unlockAudio(); setLocked(isAudioLocked()); };
    window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, []);

  useEffect(() => {
    const p = player.current;
    const currentIds = new Set(alerts.map((a) => a.id));
    const fresh = alerts.find((a) => !prevIds.current.has(a.id));
    const latest = alerts[0];
    if (latest) {
      const channel = latest.channel || 'web';
      const prefs = settingsFor(channel);
      const mutedUntil = getAlertMutedUntil(uid, storageKey, channel);
      const signature = `${channel}:${JSON.stringify(prefs)}:${latest.id}`;
      if (!prefs.enabled || mutedUntil !== null) {
        p.stop();
        lastPlaySignature.current = '';
      } else if (fresh || !p.playing || signature !== lastPlaySignature.current) {
        p.start({ ...prefs, announcement: ALERT_CHANNELS.find((c) => c.id === channel)?.sample, customKey: `ring:${uid || 'anon'}:${channel}` });
        lastPlaySignature.current = signature;
      }
      if (fresh && prefs.notify && document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
        try { new Notification(latest.title, { body: latest.body, tag: latest.id, requireInteraction: true }); } catch { /* ignore */ }
      }
    } else { p.stop(); lastPlaySignature.current = ''; }
    prevIds.current = currentIds;
  }, [alerts, settingsByChannel, uid, storageKey, muteRevision]);

  useEffect(() => () => player.current.stop(), []);
  useEffect(() => {
    if (!alerts.length) return;
    const orig = document.title; let on = false;
    const t = setInterval(() => { on = !on; document.title = on ? `🔔 (${alerts.length}) ${alerts[0].title}` : orig; }, 900);
    return () => { clearInterval(t); document.title = orig; };
  }, [alerts]);

  const updateSettings = (next: AlertSettings, channel: AlertChannel) => {
    setSettingsByChannel((old) => ({ ...old, [channel]: next }));
    saveAlertSettings(`${userAlertKey(storageKey, uid)}:${channel}`, next);
    void saveAccountAlertSettings(uid, channel, next);
  };
  const muteChannel = (ms: number) => {
    setAlertMuted(uid, storageKey, activeChannel, ms);
    void saveAccountAlertMute(uid, storageKey, activeChannel, ms);
    player.current.stop(); setMuteMenu(false);
  };
  const unmuteChannel = () => { setAlertMuted(uid, storageKey, activeChannel, null); void saveAccountAlertMute(uid, storageKey, activeChannel, null); setMuteMenu(false); };
  const mutedUntil = getAlertMutedUntil(uid, storageKey, activeChannel);
  const go = (link?: string) => { dismissAll(); const target = link || defaultLink; if (target) navigate(target); };
  const setHidden = (v: boolean) => { setFabHidden(v); try { localStorage.setItem(`yz_alert_fab_hidden:${uid || 'anon'}:${storageKey}`, v ? '1' : '0'); } catch { /* ignore */ } };

  return <>
    {alerts.length > 0 && <div className="alert-bar" role="alertdialog" aria-live="assertive"><div className="alert-bar-main"><span className="alert-bell">{mutedUntil !== null ? '🔕' : '🔔'}</span><div className="alert-bar-text"><b>{alerts[0].title}</b>{alerts[0].body && <span>{alerts[0].body}</span>}{alerts.length > 1 && <small>+ {alerts.length - 1} uyarı daha</small>}{mutedUntil !== null && <small>Bu kanal {mutedUntil === 0 ? 'süresiz sessizde' : ` ${new Date(mutedUntil).toLocaleString('tr-TR')} tarihine kadar sessizde`}</small>}</div></div><div className="alert-bar-actions">
      <div style={{ position: 'relative' }}><button type="button" className="alert-btn mute" onClick={() => setMuteMenu((v) => !v)}>{mutedUntil === null ? '🔇 Sustur' : '🔕 Sessiz ayarı'}</button>{muteMenu && <div className="alert-mute-menu" style={{ position: 'absolute', right: 0, bottom: '100%', zIndex: 10000, minWidth: 190, padding: 8, background: 'var(--surface, #fff)', border: '1px solid var(--border, #ddd)', borderRadius: 10, boxShadow: '0 8px 24px #0002' }}>{MUTE_OPTIONS.map((o) => <button key={o.ms} type="button" className="btn ghost sm" style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 4 }} onClick={() => muteChannel(o.ms)}>{o.label}</button>)}{mutedUntil !== null && <button type="button" className="btn gold sm" style={{ width: '100%' }} onClick={unmuteChannel}>Sesi yeniden aç</button>}</div>}</div>
      <button type="button" className="alert-btn go" onClick={() => go(alerts[0].link)}>Aç</button><button type="button" className="alert-btn" onClick={() => (alerts.length > 1 ? dismiss(alerts[0].id) : dismissAll())}>Tamam</button>
    </div></div>}
    {locked && activeSettings.enabled && <button type="button" className="alert-unlock" onClick={() => { unlockAudio(); setLocked(isAudioLocked()); }}>🔊 Sesli bildirimleri etkinleştirmek için buraya dokunun</button>}
    {showButton && !fabHidden && <button type="button" className="alert-fab" onClick={() => { setSelectedChannel(activeChannel); setOpen(true); }} title="Kişisel ses ayarları" aria-label="Ses ayarları">{activeSettings.enabled ? '🔔' : '🔕'}</button>}
    {showButton && fabHidden && <button type="button" className="alert-tab" onClick={() => setHidden(false)} aria-label="Zil düğmesini göster">‹ 🔔</button>}
    <SoundSettingsModal open={open} onClose={() => setOpen(false)} value={settingsFor(selectedChannel)} storageKey={userAlertKey(storageKey, uid)} userId={uid} showAutoPrint={storageKey.includes('admin')} initialChannel={selectedChannel} onChannelChange={setSelectedChannel} onChange={updateSettings} />
  </>;
}
