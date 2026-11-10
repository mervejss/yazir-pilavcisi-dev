/**
 * Sesli uyarı sistemi (dosya gerektirmez — Web Audio ile üretilir).
 * Her cihaz kendi ses ayarını saklar (yönetici bilgisayarı / kurye telefonu ayrı ayarlanabilir).
 */
import { getToneUrl } from '@/lib/ringtoneStore';
import { supabase } from '@/lib/supabase';
import type { AlertChannel } from '@/lib/alertChannels';

export type AlertTone = 'siren' | 'bell' | 'chime' | 'beep' | 'custom';
export type AlertMode = 'once' | 'timed' | 'until_ack';

export interface AlertSettings {
  enabled: boolean;
  /** 0–1 */
  volume: number;
  tone: AlertTone;
  /** once: tek sefer · timed: X saniye · until_ack: sen susturana kadar */
  mode: AlertMode;
  seconds: number;
  /** Tarayıcı bildirimi (sekme arka plandayken) */
  notify: boolean;
  vibrate: boolean;
  /** Kanal için Türkçe sesli anons */
  speak: boolean;
  announcement?: string;
  /** Yeni siparişte otomatik mutfak fişi yazdır (yalnızca yönetici) */
  autoPrint: boolean;
  /** Kendi yüklediği zil sesinin adı (tone = 'custom') */
  customName?: string;
  /** Çalma anında AlertHost tarafından eklenir: kullanıcıya özel ses anahtarı */
  customKey?: string;
}

export const DEFAULT_ALERT: AlertSettings = {
  enabled: true,
  volume: 0.8,
  tone: 'siren',
  mode: 'until_ack',
  seconds: 20,
  notify: true,
  vibrate: true,
  speak: false,
  autoPrint: false,
};

export const TONE_LABELS: Record<AlertTone, string> = {
  siren: '🚨 Siren (çok yüksek)',
  bell: '🔔 Zil',
  chime: '🎶 Melodi',
  beep: '📟 Bip',
  custom: '🎵 Kendi zil sesim',
};

/** Ayarlar kişiye özeldir: aynı cihazı kullanan farklı kullanıcıların ayarı karışmaz */
export const userAlertKey = (base: string, uid?: string | null) => (uid ? `${base}:${uid}` : base);

export function loadAlertSettings(key: string, legacyKey?: string): AlertSettings {
  try {
    const raw = localStorage.getItem(key) ?? (legacyKey ? localStorage.getItem(legacyKey) : null);
    if (raw) return { ...DEFAULT_ALERT, ...JSON.parse(raw) };
  } catch {
    /* yoksay */
  }
  return { ...DEFAULT_ALERT };
}

export function saveAlertSettings(key: string, s: AlertSettings) {
  try {
    localStorage.setItem(key, JSON.stringify(s));
  } catch {
    /* yoksay */
  }
}

let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    return ctx;
  } catch {
    return null;
  }
}

/** Tarayıcılar ilk kullanıcı dokunuşuna kadar sesi engeller; dokunuşta kilidi aç */
export function unlockAudio() {
  const c = getCtx();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}
export function isAudioLocked(): boolean {
  const c = getCtx();
  return !!c && c.state === 'suspended';
}

type Note = [freq: number, at: number, dur: number, type: OscillatorType];
const PATTERNS: Record<Exclude<AlertTone, 'custom'>, { notes: Note[]; length: number }> = {
  siren: {
    notes: [
      [988, 0, 0.28, 'square'], [784, 0.28, 0.28, 'square'], [988, 0.56, 0.28, 'square'], [784, 0.84, 0.28, 'square'],
    ],
    length: 1.3,
  },
  bell: { notes: [[1318, 0, 0.9, 'sine'], [1568, 0.35, 0.9, 'sine'], [1318, 0.9, 0.9, 'sine']], length: 1.9 },
  chime: { notes: [[523, 0, 0.3, 'triangle'], [659, 0.25, 0.3, 'triangle'], [784, 0.5, 0.3, 'triangle'], [1046, 0.75, 0.5, 'triangle']], length: 1.5 },
  beep: { notes: [[880, 0, 0.15, 'sine'], [880, 0.25, 0.15, 'sine'], [880, 0.5, 0.15, 'sine']], length: 1.0 },
};

function playCycle(tone: Exclude<AlertTone, 'custom'>, volume: number) {
  const c = getCtx();
  if (!c) return;
  const p = PATTERNS[tone];
  const t0 = c.currentTime + 0.02;
  const peak = Math.max(0.01, Math.min(1, volume)) * (tone === 'siren' ? 0.55 : 0.8);
  p.notes.forEach(([f, at, dur, type]) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = f;
    o.connect(g);
    g.connect(c.destination);
    g.gain.setValueAtTime(0.0001, t0 + at);
    g.gain.exponentialRampToValueAtTime(peak, t0 + at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur);
    o.start(t0 + at);
    o.stop(t0 + at + dur + 0.05);
  });
}

/** Döngülü çalar */
export class AlertPlayer {
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private audio: HTMLAudioElement | null = null;
  private token = 0;
  playing = false;

  start(s: AlertSettings, onEnd?: () => void) {
    this.stop();
    if (!s.enabled) return;
    unlockAudio();
    const my = ++this.token;
    this.playing = true;
    if (s.speak && s.announcement && 'speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(s.announcement); utterance.lang = 'tr-TR'; utterance.volume = Math.max(0.1, Math.min(1, s.volume)); window.speechSynthesis.speak(utterance); } catch { /* speech unavailable */ }
    }
    if (s.vibrate && 'vibrate' in navigator) navigator.vibrate?.([300, 150, 300, 150, 600]);

    if (s.tone === 'custom' && s.customKey) {
      getToneUrl(s.customKey).then((url) => {
        if (my !== this.token) return; // bu arada durduruldu
        if (!url) return this.startBuiltin(s, 'siren', onEnd); // dosya yoksa siren
        const a = new Audio(url);
        a.volume = Math.max(0.05, Math.min(1, s.volume));
        a.loop = s.mode !== 'once';
        a.onended = () => {
          if (s.mode === 'once') {
            this.playing = false;
            onEnd?.();
          }
        };
        this.audio = a;
        a.play().catch(() => this.startBuiltin(s, 'siren', onEnd)); // tarayıcı engellerse siren
        if (s.mode === 'timed') {
          this.stopTimer = setTimeout(() => {
            this.stop();
            onEnd?.();
          }, Math.max(2, s.seconds) * 1000);
        }
      });
      return;
    }
    this.startBuiltin(s, s.tone === 'custom' ? 'siren' : s.tone, onEnd);
  }

  private startBuiltin(s: AlertSettings, tone: Exclude<AlertTone, 'custom'>, onEnd?: () => void) {
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
    const len = PATTERNS[tone].length * 1000;
    playCycle(tone, s.volume);
    if (s.mode === 'once') {
      this.stopTimer = setTimeout(() => {
        this.playing = false;
        onEnd?.();
      }, len);
      return;
    }
    this.timer = setInterval(() => {
      playCycle(tone, s.volume);
      if (s.vibrate && 'vibrate' in navigator) navigator.vibrate?.([300, 150, 300]);
    }, len);
    if (s.mode === 'timed') {
      this.stopTimer = setTimeout(() => {
        this.stop();
        onEnd?.();
      }, Math.max(2, s.seconds) * 1000);
    }
  }

  stop() {
    this.token++;
    if (this.timer) clearInterval(this.timer);
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.timer = null;
    this.stopTimer = null;
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this.audio = null;
    }
    this.playing = false;
    if ('speechSynthesis' in window) { try { window.speechSynthesis.cancel(); } catch { /* ignore */ } }
    if ('vibrate' in navigator) navigator.vibrate?.(0);
  }
}

/** Ayar ekranındaki "Dene" düğmesi: tek döngü çalar */
export function testTone(s: AlertSettings) {
  unlockAudio();
  if (s.tone === 'custom' && s.customKey) {
    getToneUrl(s.customKey).then((url) => {
      if (!url) return playCycle('siren', s.volume);
      const a = new Audio(url);
      a.volume = Math.max(0.05, Math.min(1, s.volume));
      a.play().catch(() => undefined);
      setTimeout(() => a.pause(), 6000);
    });
    return;
  }
  playCycle(s.tone === 'custom' ? 'siren' : s.tone, s.volume);
}


/** Hesap + sipariş kanalı bazında susturma tercihi. 0 = süresiz. */
export function alertMuteKey(userId: string | undefined, hostKey: string, channel: AlertChannel) {
  return `yz_alert_mute_v2:${userId || 'anon'}:${hostKey}:${channel}`;
}
export function getAlertMutedUntil(userId: string | undefined, hostKey: string, channel: AlertChannel): number | null {
  try {
    const raw = localStorage.getItem(alertMuteKey(userId, hostKey, channel));
    if (raw === 'forever') return 0;
    if (!raw) return null;
    const until = Number(raw);
    if (!Number.isFinite(until) || until <= Date.now()) {
      localStorage.removeItem(alertMuteKey(userId, hostKey, channel));
      return null;
    }
    return until;
  } catch { return null; }
}
export function setAlertMuted(userId: string | undefined, hostKey: string, channel: AlertChannel, durationMs: number | null) {
  try {
    const key = alertMuteKey(userId, hostKey, channel);
    if (durationMs === null) localStorage.removeItem(key);
    else if (durationMs === 0) localStorage.setItem(key, 'forever');
    else localStorage.setItem(key, String(Date.now() + durationMs));
  } catch { /* local storage unavailable */ }
}

/** Ayarları hesaba da yedekler; tablo yoksa yerel ayarlar çalışmaya devam eder. */
export async function syncAlertSettingsFromAccount(userId: string, hostKey: string): Promise<Record<string, AlertSettings> | null> {
  const { data, error } = await supabase.from('user_notification_settings').select('settings').eq('user_id', userId).maybeSingle();
  if (error || !data?.settings) return null;
  const remote = data.settings as Record<string, AlertSettings>;
  Object.entries(remote).filter(([channel]) => !channel.startsWith('__')).forEach(([channel, value]) => saveAlertSettings(`${hostKey}:${userId}:${channel}`, { ...DEFAULT_ALERT, ...value }));
  return remote;
}
export async function saveAccountAlertSettings(userId: string | undefined, channel: string, settings: AlertSettings) {
  if (!userId) return;
  const { data } = await supabase.from('user_notification_settings').select('settings').eq('user_id', userId).maybeSingle();
  const all = { ...((data?.settings || {}) as Record<string, AlertSettings>), [channel]: settings };
  await supabase.from('user_notification_settings').upsert({ user_id: userId, settings: all, updated_at: new Date().toISOString() } as any);
}


export async function syncAlertMutesFromAccount(userId: string, hostKey: string) {
  const { data, error } = await supabase.from('user_notification_settings').select('settings').eq('user_id', userId).maybeSingle();
  if (error || !data?.settings) return;
  const muteMap = ((data.settings as any)[`__mute:${hostKey}`] || {}) as Record<string, number | string>;
  Object.entries(muteMap).forEach(([channel, until]) => {
    const value = until === 'forever' ? 'forever' : Number(until);
    try {
      const key = alertMuteKey(userId, hostKey, channel as AlertChannel);
      if (value === 'forever') localStorage.setItem(key, 'forever');
      else if (Number.isFinite(value) && Number(value) > Date.now()) localStorage.setItem(key, String(value));
      else localStorage.removeItem(key);
    } catch { /* ignore */ }
  });
}
export async function saveAccountAlertMute(userId: string | undefined, hostKey: string, channel: AlertChannel, until: number | null) {
  if (!userId) return;
  const { data } = await supabase.from('user_notification_settings').select('settings').eq('user_id', userId).maybeSingle();
  const all = { ...((data?.settings || {}) as Record<string, any>) };
  const key = `__mute:${hostKey}`;
  const map = { ...(all[key] || {}) };
  if (until === null) delete map[channel];
  else map[channel] = until === 0 ? 'forever' : Date.now() + until;
  all[key] = map;
  await supabase.from('user_notification_settings').upsert({ user_id: userId, settings: all, updated_at: new Date().toISOString() } as any);
}
