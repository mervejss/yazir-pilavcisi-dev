import { HAS_GMAPS_KEY, geocodeFull, type LatLng } from '@/lib/googleMaps';

/** Daire/kat/apartman gibi ayrıntıları atar: "Osmanlı Cd. No: 11 Apt: 9/9A, Kat: 1, Daire: 1" → "Osmanlı Cd. No: 11" */
export function simplifyAddress(s: string): string[] {
  const full = s.replace(/\s+/g, ' ').trim();
  const noUnit = full
    .replace(/\b(apt|apartman[ıi]?|blok|kat|daire|d)\s*[.:]?\s*:?\s*[\w/-]+/gi, ' ')
    .replace(/[,\s]+,/g, ',')
    .replace(/\s+/g, ' ')
    .replace(/^[,\s]+|[,\s]+$/g, '');
  const noNo = noUnit.replace(/\b(no|numara)\s*[.:]?\s*:?\s*[\w/-]+/gi, ' ').replace(/\s+/g, ' ').replace(/[,\s]+$/g, '').trim();
  return [...new Set([full, noUnit, noNo].filter((x) => x.length >= 4))];
}

async function nominatim(q: string): Promise<LatLng | null> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=tr&accept-language=tr&q=${encodeURIComponent(q)}`);
    if (!r.ok) return null;
    const j = (await r.json()) as { lat: string; lon: string }[];
    return j[0] ? { lat: Number(j[0].lat), lng: Number(j[0].lon) } : null;
  } catch {
    return null;
  }
}

/** Yazılan adresten konum bulur. Google anahtarı varsa Google, yoksa OpenStreetMap; tam adres bulunamazsa sadeleştirilmiş denenir. */
export async function locateAddress(address: string, district: string): Promise<LatLng | null> {
  for (const a of simplifyAddress(address)) {
    const q = [a, district, 'Konya'].filter(Boolean).join(', ');
    if (HAS_GMAPS_KEY) {
      const g = await geocodeFull([a, district].filter(Boolean).join(', '));
      if (g) return { lat: g.lat, lng: g.lng };
    } else {
      const g = await nominatim(q);
      if (g) return g;
    }
  }
  return null;
}
