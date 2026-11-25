// Admin "Yeni Sipariş" EK ÜCRET: saf (arayüzsüz) hesaplama + mesafe/saat önerisi.
// Ek ücret, teslimat ücretiyle birlikte orders.delivery_fee'ye yazılır → toplam = ara toplam + teslimat − indirim
// formülü sistemin her yerinde (rapor, masa hesabı, sipariş düzenleme) aynı kalır.
import { SURCHARGE_DISTANCE_TIERS, SURCHARGE_NIGHT_TIERS } from '@/config/surcharge';

const r2 = (n: number) => Math.round(n * 100) / 100 + 0;

export interface SurchargeSpec {
  /** Sabit TL (≥ 0) */
  amount: number;
  /** Yüzde (0–100): indirim sonrası ÜRÜN ara toplamı üzerinden */
  percent: number;
  /** Ekranda görünen gerekçe: "Uzak mesafe 7,4 km · Gece 01:20" / "Elle girildi" */
  reason: string;
}

export interface SurchargeResult {
  active: boolean;
  fixed: number;
  pctAmount: number;
  total: number;
  percent: number;
  reason: string;
}

export const NO_SURCHARGE: SurchargeResult = { active: false, fixed: 0, pctAmount: 0, total: 0, percent: 0, reason: '' };

/** base = indirim sonrası ürün ara toplamı */
export function computeSurcharge(base: number, spec: SurchargeSpec | null): SurchargeResult {
  if (!spec) return NO_SURCHARGE;
  const fixed = Number.isFinite(spec.amount) && spec.amount > 0 ? r2(spec.amount) : 0;
  const percent = Number.isFinite(spec.percent) && spec.percent > 0 ? Math.min(spec.percent, 100) : 0;
  const pctAmount = r2((base * percent) / 100);
  const total = r2(fixed + pctAmount);
  return { active: total > 0, fixed, pctAmount, total, percent, reason: spec.reason };
}

/** "12,5" / "12.5" → 12.5 ; boş → 0 ; geçersiz → NaN */
export const parseNum = (s: string): number => {
  const t = String(s ?? '').trim().replace(',', '.');
  return t === '' ? 0 : Number(t);
};

/** Girişler geçerli mi ve en az biri > 0 mı? */
export function validSurchargeInput(amountStr: string, pctStr: string): boolean {
  const a = parseNum(amountStr);
  const p = parseNum(pctStr);
  return Number.isFinite(a) && Number.isFinite(p) && a >= 0 && p >= 0 && p <= 100 && a + p > 0;
}

/* ------------------------------ Mesafe ------------------------------ */

export interface LatLngLike { lat: number; lng: number }

/** İki nokta arası kuş uçuşu km (Haversine) */
export function distanceKm(a: LatLngLike, b: LatLngLike): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export const fmtKmTr = (km: number) => `${km.toFixed(1).replace('.', ',')} km`;

export interface DistanceSuggestion { km: number; amount: number; label: string; text: string }

export function suggestByDistance(restaurant: LatLngLike, dest: LatLngLike | null): DistanceSuggestion | null {
  if (!dest || !Number.isFinite(dest.lat) || !Number.isFinite(dest.lng)) return null;
  const km = distanceKm(restaurant, dest);
  const tier = SURCHARGE_DISTANCE_TIERS.find((t) => km <= t.upToKm) ?? SURCHARGE_DISTANCE_TIERS[SURCHARGE_DISTANCE_TIERS.length - 1];
  const amount = tier ? tier.amount : 0;
  return {
    km, amount,
    label: `Mesafe ${fmtKmTr(km)}`,
    text: `Restorana ≈ ${fmtKmTr(km)} (kuş uçuşu)`,
  };
}

/* ------------------------------- Saat ------------------------------- */

export interface TimeSuggestion { clock: string; minAfterMidnight: number | null; amount: number; label: string; text: string }

const hm = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? (m > 0 ? `${h} sa ${m} dk` : `${h} sa`) : `${m} dk`;
};

export function suggestByTime(when: Date): TimeSuggestion {
  const mins = when.getHours() * 60 + when.getMinutes();
  const clock = `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;
  // 23:00–24:00 gibi gece yarısından ÖNCEKİ aralıklar için negatif dakika (ör. 23:30 → −30)
  const rel = mins >= 12 * 60 ? mins - 24 * 60 : mins;
  const tier = SURCHARGE_NIGHT_TIERS.find((t) => rel >= t.fromMin && rel < t.toMin);
  if (!tier) return { clock, minAfterMidnight: null, amount: 0, label: '', text: `Saat ${clock} · normal saat (gece ücreti yok)` };
  const text = rel >= 0
    ? `Saat ${clock} · gece yarısından ${hm(rel === 0 ? 0 : rel)} sonra`
    : `Saat ${clock} · gece yarısına ${hm(-rel)} kala`;
  return { clock, minAfterMidnight: rel, amount: tier.amount, label: `Gece ${clock}`, text };
}

/* ----------------------------- Birleşik ----------------------------- */

export interface SuggestionSet {
  distance: DistanceSuggestion | null;
  time: TimeSuggestion;
  /** Önerilen toplam TL (mesafe + saat) */
  total: number;
  /** Seçilebilir öneriler (tutarı > 0 olanlar) */
  options: { key: 'both' | 'distance' | 'time'; amount: number; reason: string; title: string }[];
}

export function buildSuggestions(restaurant: LatLngLike, dest: LatLngLike | null, when: Date): SuggestionSet {
  const distance = suggestByDistance(restaurant, dest);
  const time = suggestByTime(when);
  const d = distance?.amount ?? 0;
  const t = time.amount;
  const options: SuggestionSet['options'] = [];
  if (d > 0 && t > 0) {
    options.push({ key: 'both', amount: d + t, reason: `${distance!.label} + ${time.label}`, title: 'Önerilen (mesafe + gece)' });
    options.push({ key: 'distance', amount: d, reason: distance!.label, title: 'Sadece mesafe' });
    options.push({ key: 'time', amount: t, reason: time.label, title: 'Sadece gece' });
  } else if (d > 0) {
    options.push({ key: 'distance', amount: d, reason: distance!.label, title: 'Önerilen (mesafe)' });
  } else if (t > 0) {
    options.push({ key: 'time', amount: t, reason: time.label, title: 'Önerilen (gece)' });
  }
  return { distance, time, total: d + t, options };
}
