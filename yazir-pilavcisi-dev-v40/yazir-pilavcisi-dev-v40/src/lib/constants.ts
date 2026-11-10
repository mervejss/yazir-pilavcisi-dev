// Sipariş durum etiketleri (Türkçe)
export const ORDER_STATUS_LABELS: Record<string, string> = {
  new: 'Yeni',
  preparing: 'Hazırlanıyor',
  ready: 'Hazır',
  assigned: 'Kuryeye atandı',
  on_the_way: 'Yolda',
  delivered: 'Teslim edildi',
  cancelled: 'İptal edildi',
};

export const ORDER_STATUS_COLORS: Record<string, string> = {
  new: '#ffe2b8',
  preparing: '#fff1a8',
  ready: '#b8e6ff',
  assigned: '#cfe8ff',
  on_the_way: '#cfe8ff',
  delivered: '#d4f2d6',
  cancelled: '#ffd4d4',
};

export const TABLE_STATUS_LABELS: Record<string, string> = {
  empty: 'Boş',
  awaiting_order: 'Sipariş bekliyor',
  preparing: 'Hazırlanıyor',
  served: 'Servis edildi',
  awaiting_bill: 'Hesap bekliyor',
  bill_closed: 'Hesap kapatıldı',
  awaiting_cleaning: 'Temizlik bekliyor',
  cleaning: 'Temizleniyor',
};

export const TABLE_STATUS_COLORS: Record<string, string> = {
  empty: '#e8e5dc',
  awaiting_order: '#ffe2b8',
  preparing: '#fff1a8',
  served: '#d4f2d6',
  awaiting_bill: '#ffd4d4',
  bill_closed: '#b8e6ff',
  awaiting_cleaning: '#f0e0ff',
  cleaning: '#e0f0ff',
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash_on_delivery: 'Kapıda nakit',
  card_on_delivery: 'Kapıda kart',
  iban: 'IBAN',
  platform_online: 'Platform (online)',
  cash_at_table: 'Masada nakit',
  card_at_table: 'Masada kart',
};

export const FEEDBACK_TYPE_LABELS: Record<string, string> = {
  suggestion: 'Öneri',
  complaint: 'Şikayet',
  thanks: 'Teşekkür',
  question: 'Soru',
};

export const BULK_STATUS_LABELS: Record<string, string> = {
  new: 'Yeni',
  contacted: 'Arandı',
  confirmed: 'Onaylandı',
  done: 'Tamamlandı',
  cancelled: 'İptal',
};

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Sahip',
  sub_admin: 'Yönetici',
  operator: 'Operatör',
  courier: 'Kurye',
  customer: 'Müşteri',
};

export const DAY_NAMES = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

export const SOURCE_COLORS: Record<string, string> = {
  web: '#14110c',
  phone: '#6b6556',
  table: '#2e9e45',
  counter: '#b8860b',
  trendyol: '#f27a1a',
  yemeksepeti: '#fa0050',
  migros: '#2e9e45',
  getir: '#5d3ebc',
  other: '#6b6556',
};

export const SOURCE_LABELS: Record<string, string> = {
  web: 'Online Sipariş',
  phone: 'Telefon',
  table: 'Masa Servisi',
  counter: 'Restoran Paket',
  trendyol: 'Trendyol Go',
  yemeksepeti: 'Yemeksepeti',
  migros: 'Migros Yemek',
  getir: 'Getir',
  other: 'Diğer Platform',
};

/** Sipariş kartında kaynağın yanında gösterilen simge */
export const SOURCE_EMOJI: Record<string, string> = {
  web: '🌐',
  phone: '☎️',
  table: '🍽️',
  counter: '🥡',
  trendyol: '🟠',
  yemeksepeti: '🔴',
  migros: '🟢',
  getir: '🟣',
  other: '🔗',
};

/** Dış platform (API ile gelen) kaynaklar */
export const PLATFORM_SOURCES = ['trendyol', 'yemeksepeti', 'migros', 'getir', 'other'];

export const ORDER_TYPE_LABELS: Record<string, string> = {
  delivery: 'Paket teslimat',
  pickup: 'Gel-al / Paket',
  dine_in: 'Restoranda',
};
