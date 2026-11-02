/** TL para biçimi */
export function tl(n: number): string {
  return Math.round(n).toLocaleString('tr-TR') + ' ₺';
}

/** Saat:dakika biçimi */
export function hhmm(dateStr: string | number): string {
  return new Date(dateStr).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Tarih biçimi */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Tarih + saat biçimi */
export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Ne kadar önce */
export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs} sn önce`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} sa önce`;
  const days = Math.floor(hours / 24);
  return `${days} gün önce`;
}

/** Slug oluştur */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Bugünün başlangıcı (iş günü: 03:00) */
export function businessDayStart(): Date {
  const now = new Date();
  const d = new Date(now);
  if (d.getHours() < 3) {
    d.setDate(d.getDate() - 1);
  }
  d.setHours(3, 0, 0, 0);
  return d;
}

/** Çalışma saatleri kontrol */
export function isOpenNow(hours: Array<{ day_of_week: number; open_time: string; close_time: string; closes_next_day: boolean; is_closed: boolean }>): boolean {
  if (!hours || hours.length === 0) return true;
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const currentTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  const isoDow = ((now.getDay() + 6) % 7) + 1; // 1=Monday

  for (const hour of hours) {
    if (hour.is_closed) continue;
    if (hour.day_of_week === isoDow) {
      if (hour.closes_next_day) {
        if (currentTime >= hour.open_time) return true;
      } else {
        if (currentTime >= hour.open_time && currentTime < hour.close_time) return true;
      }
    }
    // Gece yarısını aşan durum
    if (hour.closes_next_day) {
      const prevDow = isoDow === 1 ? 7 : isoDow - 1;
      if (hour.day_of_week === prevDow && currentTime < hour.close_time) return true;
    }
  }
  return false;
}

/** Beep sesi */
export function beep(): void {
  try {
    const a = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = a.createOscillator();
    const g = a.createGain();
    o.connect(g);
    g.connect(a.destination);
    o.frequency.value = 880;
    g.gain.value = 0.15;
    o.start();
    o.stop(a.currentTime + 0.25);
  } catch {
    /* ses desteklenmiyor */
  }
}
