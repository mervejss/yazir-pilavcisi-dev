/** TL para biçimi */
export function tl(n: number): string {
  const v = Number(n) || 0;
  // Kuruşlu tutarlar (ör. 12,50 ₺) yuvarlanıp yanlış gösterilmesin
  const hasCents = Math.abs(v * 100 - Math.round(v) * 100) > 0.5;
  return (
    v.toLocaleString('tr-TR', {
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: hasCents ? 2 : 0,
    }) + ' ₺'
  );
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

/** Bugünün başlangıcı (iş günü: 05:00) */
export function businessDayStart(): Date {
  const now = new Date();
  const d = new Date(now);
  if (d.getHours() < 5) {
    d.setDate(d.getDate() - 1);
  }
  d.setHours(5, 0, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// ÇALIŞMA SAATLERİ (haftalık program + tarihe özel değişiklikler) — İstanbul saati
// ---------------------------------------------------------------------------
type HourRow = { day_of_week: number; open_time: string; close_time: string; closes_next_day: boolean; is_closed: boolean };
type OverrideRow = { override_date: string; open_time: string; close_time: string; closes_next_day: boolean; is_closed: boolean; note?: string | null };

export interface EffectiveHours {
  open_time: string;
  close_time: string;
  closes_next_day: boolean;
  is_closed: boolean;
  /** 'override' = o tarihe özel, 'weekly' = haftalık standart */
  source: 'override' | 'weekly';
  note?: string | null;
}

/** İstanbul'daki şu anki tarih (YYYY-MM-DD), ISO gün (1=Pzt..7=Pazar) ve saat (HH:MM:SS) */
export function istanbulNow(): { dateISO: string; dow: number; time: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)?.value || '00';
  const dateISO = `${g('year')}-${g('month')}-${g('day')}`;
  return { dateISO, dow: isoDow(dateISO), time: `${g('hour')}:${g('minute')}:${g('second')}`, hour: Number(g('hour')) };
}

/** YYYY-MM-DD → ISO gün (1=Pzt..7=Pazar) */
export function isoDow(dateISO: string): number {
  const d = new Date(dateISO + 'T00:00:00Z').getUTCDay(); // 0=Pazar
  return d === 0 ? 7 : d;
}

/** YYYY-MM-DD tarihine gün ekle */
export function addDaysISO(dateISO: string, n: number): string {
  const d = new Date(dateISO + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "Çalışma günü" tarihi: gece 03:00'e kadar hâlâ önceki iş günü sayılır */
export function businessDateISO(): string {
  const n = istanbulNow();
  return n.hour < 3 ? addDaysISO(n.dateISO, -1) : n.dateISO;
}

/** Verilen takvim günü için geçerli saat: tarihe özel varsa o, yoksa haftalık standart */
export function effectiveHoursFor(dateISO: string, hours: HourRow[], overrides: OverrideRow[] = []): EffectiveHours | null {
  const o = overrides.find((x) => x.override_date === dateISO);
  if (o) {
    return { open_time: o.open_time, close_time: o.close_time, closes_next_day: o.closes_next_day, is_closed: o.is_closed, source: 'override', note: o.note };
  }
  const h = hours.find((x) => x.day_of_week === isoDow(dateISO));
  if (!h) return null;
  return { open_time: h.open_time, close_time: h.close_time, closes_next_day: h.closes_next_day, is_closed: h.is_closed, source: 'weekly' };
}

/** Haftanın 7 günü (Pzt→Paz). Her gün için önümüzdeki ilk tarih ve o tarihin geçerli saati. */
export function weekSchedule(hours: HourRow[], overrides: OverrideRow[] = []) {
  const today = businessDateISO();
  return [1, 2, 3, 4, 5, 6, 7].map((dow) => {
    let dateISO = today;
    for (let i = 0; i < 7; i++) {
      const d = addDaysISO(today, i);
      if (isoDow(d) === dow) { dateISO = d; break; }
    }
    const eff = effectiveHoursFor(dateISO, hours, overrides);
    const weekly = hours.find((h) => h.day_of_week === dow) || null;
    return { dow, dateISO, eff, weekly, isToday: dateISO === today, isOverride: eff?.source === 'override' };
  });
}

/** Çalışma saatleri kontrol (override verilirse onları da hesaba katar) */
export function isOpenNow(hours: HourRow[], overrides: OverrideRow[] = []): boolean {
  const now = istanbulNow();
  const today = effectiveHoursFor(now.dateISO, hours, overrides);
  if (today && !today.is_closed && now.time >= today.open_time && (today.closes_next_day || now.time < today.close_time)) {
    return true;
  }
  // dün başlayıp bu sabaha sarkan pencere (12:00 → 03:00 gibi)
  const prev = effectiveHoursFor(addDaysISO(now.dateISO, -1), hours, overrides);
  if (prev && !prev.is_closed && prev.closes_next_day && now.time < prev.close_time) return true;
  return false;
}

/** Bir sonraki açılış zamanı: "Bugün 12:00", "Yarın 12:00", "Cumartesi 12:00" */
export function nextOpeningLabel(hours: HourRow[], overrides: OverrideRow[] = []): string | null {
  const now = istanbulNow();
  for (let i = 0; i < 8; i++) {
    const d = addDaysISO(now.dateISO, i);
    const e = effectiveHoursFor(d, hours, overrides);
    if (!e || e.is_closed) continue;
    if (i === 0 && now.time >= e.open_time) continue;
    const t = e.open_time.slice(0, 5);
    if (i === 0) return `Bugün ${t}`;
    if (i === 1) return `Yarın ${t}`;
    const names = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
    return `${names[isoDow(d) - 1]} ${t}`;
  }
  return null;
}

export interface OpenStatus {
  /** Müşteri şu an sipariş verebilir mi / "açığız" diye gösterilsin mi */
  open: boolean;
  /** Sahip "sipariş kabulü"nü manuel kapattı mı */
  paused: boolean;
  /** Çalışma saatleri dışında mı */
  outsideHours: boolean;
  /** Kısa başlık: "Şu an açığız" */
  label: string;
  /** Ek açıklama: "Bugün 12:00'de açılıyoruz" */
  detail: string;
}

/**
 * Sitede gösterilecek açık/kapalı durumu.
 * Önce "Online Sipariş Kabulü" anahtarına, sonra (güne özel değişiklikler dahil) çalışma saatlerine bakar.
 */
export function getOpenStatus(
  hours: HourRow[],
  overrides: OverrideRow[],
  isAcceptingOrders: boolean | undefined,
): OpenStatus {
  const inHours = isOpenNow(hours, overrides);
  const paused = isAcceptingOrders === false;
  if (paused) {
    return { open: false, paused: true, outsideHours: !inHours, label: 'Şu an sipariş almıyoruz', detail: 'Online sipariş geçici olarak kapalı. Bizi arayabilirsiniz.' };
  }
  if (!inHours) {
    const next = nextOpeningLabel(hours, overrides);
    return { open: false, paused: false, outsideHours: true, label: 'Şu an kapalıyız', detail: next ? `Bir sonraki açılış: ${next}` : 'Çalışma saatlerimizde tekrar bekleriz.' };
  }
  return { open: true, paused: false, outsideHours: false, label: 'Şu an açığız', detail: '' };
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
