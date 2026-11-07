import { normalizePhone } from '@/lib/staffCustomers';

/**
 * Telefonla gelen siparişlerde personelin söylediklerini (sesle yazıma dökülmüş ham metin)
 * akıllıca alanlara ayrıştırır: isim, telefon, adres, mahalle.
 * Hiçbir veri kaybolmasın diye tanınamayan / fazladan her şey `note` alanına eklenir
 * ve orijinal ham metin ayrıca `raw` olarak her zaman geri döner.
 */

export interface VoiceParseResult {
  name: string;
  phone: string;
  address: string;
  district: string;
  note: string;
  raw: string;
}

const NAME_KW = ['benim adım', 'adım', 'ismim', 'adı soyadı', 'ad soyad', 'isim'];
const PHONE_KW = ['telefon numaram', 'telefon numarası', 'cep numaram', 'telefonum', 'numaram', 'telefon', 'numara', 'cep'];
const ADDRESS_KW = [
  'teslimat adresi', 'adresim', 'adres', 'mahallesi', 'mahalle', 'sokağı', 'sokak',
  'caddesi', 'cadde', 'apartmanı', 'apartman', 'sitesi', 'site', 'bina no', 'binası',
  'kapı no', 'daire no', 'kat', 'konum',
];
const NOTE_KW = ['not olarak', 'notum', 'sipariş notu', 'ekstra not', 'özel not', 'ayrıca şunu', 'ayrıca', 'lütfen'];
const ALL_KW = [...NAME_KW, ...PHONE_KW, ...ADDRESS_KW, ...NOTE_KW];

// Türkçe konuşma tanıma rakamları genelde doğrudan sayı olarak yazdığı için
// 05xx xxx xx xx / 5xx xxx xx xx kalıplarını (boşluk/nokta/tire ile) yakalar.
const PHONE_REGEX = /(?:\+?90[\s.-]?)?0?\s*5\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}/g;

function cleanSpaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Bir anahtar kelimeden sonrasını, bir sonraki (herhangi bir grup) anahtar kelimeye kadar yakalar. */
function captureAfterKeywords(text: string, keywords: string[]): string {
  const lower = text.toLocaleLowerCase('tr');
  let best: { idx: number; kw: string } | null = null;
  for (const kw of keywords) {
    const idx = lower.indexOf(kw.toLocaleLowerCase('tr'));
    if (idx !== -1 && (!best || idx < best.idx)) best = { idx, kw };
  }
  if (!best) return '';
  const start = best.idx + best.kw.length;
  let end = text.length;
  for (const kw2 of ALL_KW) {
    if (kw2 === best.kw) continue;
    const i2 = lower.indexOf(kw2.toLocaleLowerCase('tr'), start);
    if (i2 !== -1 && i2 < end) end = i2;
  }
  let captured = text.slice(start, end);
  captured = captured.replace(/^[:,.\s-]+/, '').replace(/[,.\s-]+$/, '');
  return cleanSpaces(captured);
}

export function parseVoiceOrder(rawInput: string): VoiceParseResult {
  const text = cleanSpaces(rawInput);
  if (!text) return { name: '', phone: '', address: '', district: '', note: '', raw: '' };

  // 1) Telefon: önce serbest regex (rakamlar genelde direkt yazılır), olmazsa anahtar kelimeden sonrası
  const phoneMatches = text.match(PHONE_REGEX) || [];
  let phone = '';
  for (const m of phoneMatches) {
    const n = normalizePhone(m);
    if (n) { phone = n; break; }
  }
  if (!phone) {
    const kwPhone = captureAfterKeywords(text, PHONE_KW);
    phone = (kwPhone && normalizePhone(kwPhone)) || '';
  }

  // 2) İsim
  const name = captureAfterKeywords(text, NAME_KW);

  // 3) Adres (ve içinden sızmış olabilecek telefon/not parçalarını temizle)
  let address = captureAfterKeywords(text, ADDRESS_KW);
  for (const m of phoneMatches) address = address.replace(m, '').trim();
  address = cleanSpaces(address);

  // 4) Mahalle: "... Mahallesi" kalıbı adres içinde veya tüm metinde aranır
  let district = '';
  const districtSrc = address || text;
  const districtMatch = districtSrc.match(/([A-ZÇĞİÖŞÜ][\wçğıöşüÇĞİÖŞÜ]*)\s+[Mm]ahalle(si)?/);
  if (districtMatch) district = districtMatch[1];

  // 5) Açıkça "not olarak / lütfen ..." denen kısım
  const explicitNote = captureAfterKeywords(text, NOTE_KW);

  // 6) Geriye kalan / tanınamayan her şeyi not'a ekle — hiçbir şey kaybolmasın
  let leftover = text;
  if (name) leftover = leftover.replace(name, '');
  if (address) leftover = leftover.replace(address, '');
  if (explicitNote) leftover = leftover.replace(explicitNote, '');
  for (const m of phoneMatches) leftover = leftover.replace(m, '');
  for (const kw of ALL_KW) leftover = leftover.replace(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
  leftover = cleanSpaces(leftover.replace(/[:,.\-]+/g, ' '));

  const note = [explicitNote, leftover].filter(Boolean).join(' · ');

  return { name, phone, address, district, note, raw: text };
}
