/**
 * ==========================================================================
 *  EK ÜCRET ÖNERİ KURALLARI (Admin · Yeni Sipariş · Paket Servis)
 * ==========================================================================
 *  Sipariş girilirken müşteri konumunun restorana uzaklığına ve saate göre bir ek ücret ÖNERİLİR.
 *  Öneri yalnızca tavsiyedir: yönetici öneriyi seçebilir, kendi TL / % değerini yazabilir ya da hiç eklemeyebilir.
 *  Rakamları işletmenize göre BURADAN değiştirin (başka bir dosyaya dokunmaya gerek yok).
 */

/** Mesafe basamakları — restorana KUŞ UÇUŞU km. Satırlar küçükten büyüğe: "upToKm'ye kadar → amount ₺". */
export const SURCHARGE_DISTANCE_TIERS: { upToKm: number; amount: number }[] = [
  { upToKm: 3, amount: 0 },
  { upToKm: 5, amount: 20 },
  { upToKm: 8, amount: 40 },
  { upToKm: 12, amount: 70 },
  { upToKm: Infinity, amount: 100 },   // 12 km üstü
];

/**
 * Gece basamakları — GECE YARISINDAN (00:00) sonra geçen dakikaya göre. [fromMin, toMin) aralığı.
 * 05:00'ten (300. dk) sonrası normal saattir. İsterseniz 23:00–24:00 için de satır ekleyebilirsiniz:
 *   { fromMin: -60, toMin: 0, amount: 10 }   // 23:00–00:00
 */
export const SURCHARGE_NIGHT_TIERS: { fromMin: number; toMin: number; amount: number }[] = [
  { fromMin: 0, toMin: 60, amount: 20 },     // 00:00 – 01:00
  { fromMin: 60, toMin: 120, amount: 30 },   // 01:00 – 02:00
  { fromMin: 120, toMin: 300, amount: 50 },  // 02:00 – 05:00
];
