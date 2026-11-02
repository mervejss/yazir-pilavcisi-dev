// Sipariş durum etiketleri (Türkçe)
export const ORDER_STATUS_LABELS: Record<string, string> = {
  new: 'Yeni',
  preparing: 'Hazırlanıyor',
  ready: 'Hazır',
  assigned: 'Kuryeye Atandı',
  on_the_way: 'Yolda',
  delivered: 'Teslim Edildi',
  cancelled: 'İptal Edildi',
};

export const ORDER_STATUS_COLORS: Record<string, string> = {
  new: '#f59e0b',
  preparing: '#d97706',
  ready: '#3b82f6',
  assigned: '#8b5cf6',
  on_the_way: '#06b6d4',
  delivered: '#10b981',
  cancelled: '#ef4444',
};

export const TABLE_STATUS_LABELS: Record<string, string> = {
  empty: 'Boş',
  awaiting_order: 'Sipariş Bekliyor',
  preparing: 'Hazırlanıyor',
  served: 'Servis Edildi',
  awaiting_bill: 'Hesap Bekliyor',
  bill_closed: 'Hesap Kapatıldı',
  awaiting_cleaning: 'Temizlik Bekliyor',
  cleaning: 'Temizleniyor',
};

export const TABLE_STATUS_COLORS: Record<string, string> = {
  empty: '#10b981', // Canlı zümrüt yeşili
  awaiting_order: '#f59e0b', // Altın sarısı/amber
  preparing: '#d97706', // Sıcak turuncu
  served: '#3b82f6', // Mavi
  awaiting_bill: '#ef4444', // Dikkat çekici kırmızı
  bill_closed: '#6366f1', // İndigo
  awaiting_cleaning: '#a855f7', // Mor
  cleaning: '#06b6d4', // Camgöbeği
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash_on_delivery: 'Kapıda Nakit',
  card_on_delivery: 'Kapıda Kart',
  iban: 'IBAN / Havale',
  platform_online: 'Platform (Online)',
  cash_at_table: 'Masada Nakit',
  card_at_table: 'Masada Kart',
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
  owner: 'İşletme Sahibi',
  sub_admin: 'Alt Yönetici',
  operator: 'Kasa / Operatör',
  courier: 'Kurye',
  customer: 'Müşteri',
};

export const DAY_NAMES = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

export const SOURCE_COLORS: Record<string, string> = {
  web: '#d4af37',
  phone: '#64748b',
  table: '#10b981',
  yemeksepeti: '#fa0050',
  trendyol: '#f27a1a',
  getir: '#5d3ebc',
  migros: '#d9480f',
};
