/**
 * Sesli uyarı sistemi (dosya gerektirmez — Web Audio ile üretilir).
 * Her cihaz kendi ses ayarını saklar (yönetici bilgisayarı / kurye telefonu ayrı ayarlanabilir).
 */
export type AlertTone = 'siren' | 'bell' | 'chime' | 'beep';
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
  /** Yeni siparişte otomatik mutfak fişi yazdır (yalnızca yönetici) */
  autoPrint: boolean;
}

export const DEFAULT_ALERT: AlertSettings = {
  enabled: true,
  volume: 0.8,
  tone: 'siren',
  mode: 'until_ack',
  seconds: 20,
  notify: true,
  vibrate: true,
  autoPrint: false,
};

export const TONE_LABELS: Record<AlertTone, string> = {
  siren: '🚨 Siren (çok yüksek)',
  bell: '🔔 Zil',
  chime: '🎶 Melodi',
  beep: '📟 Bip',
};

export function loadAlertSettings(key: string): AlertSettings {
  try {
    const raw = localStorage.getItem(key);
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
const PATTERNS: Record<AlertTone, { notes: Note[]; length: number }> = {
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

function playCycle(tone: AlertTone, volume: number) {
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
  playing = false;

  start(s: AlertSettings, onEnd?: () => void) {
    this.stop();
    if (!s.enabled) return;
    unlockAudio();
    this.playing = true;
    const len = PATTERNS[s.tone].length * 1000;
    playCycle(s.tone, s.volume);
    if (s.vibrate && 'vibrate' in navigator) navigator.vibrate?.([300, 150, 300, 150, 600]);
    if (s.mode === 'once') {
      this.stopTimer = setTimeout(() => {
        this.playing = false;
        onEnd?.();
      }, len);
      return;
    }
    this.timer = setInterval(() => {
      playCycle(s.tone, s.volume);
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
    if (this.timer) clearInterval(this.timer);
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.timer = null;
    this.stopTimer = null;
    this.playing = false;
    if ('vibrate' in navigator) navigator.vibrate?.(0);
  }
}

/** Ayar ekranındaki "Dene" düğmesi: tek döngü çalar */
export function testTone(s: AlertSettings) {
  unlockAudio();
  playCycle(s.tone, s.volume);
}
