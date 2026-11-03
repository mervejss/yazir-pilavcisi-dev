/** Alerjen uyarıları ve rozetler — yönetici istediğini ürüne ekler, müşteri menüde görür. */
export interface TagDef {
  key: string;
  label: string;
  emoji: string;
}

export const ALLERGENS: TagDef[] = [
  { key: 'gluten', label: 'Gluten', emoji: '🌾' },
  { key: 'milk', label: 'Süt / laktoz', emoji: '🥛' },
  { key: 'egg', label: 'Yumurta', emoji: '🥚' },
  { key: 'peanut', label: 'Yer fıstığı', emoji: '🥜' },
  { key: 'nuts', label: 'Sert kabuklu yemiş', emoji: '🌰' },
  { key: 'soy', label: 'Soya', emoji: '🫘' },
  { key: 'sesame', label: 'Susam', emoji: '⚪' },
  { key: 'fish', label: 'Balık', emoji: '🐟' },
  { key: 'shellfish', label: 'Kabuklu deniz ürünü', emoji: '🦐' },
  { key: 'celery', label: 'Kereviz', emoji: '🥬' },
  { key: 'mustard', label: 'Hardal', emoji: '🟡' },
  { key: 'sulphite', label: 'Sülfit', emoji: '🍷' },
];

export const BADGES: TagDef[] = [
  { key: 'spicy', label: 'Acılı', emoji: '🌶️' },
  { key: 'vegan', label: 'Vegan', emoji: '🌱' },
  { key: 'vegetarian', label: 'Vejetaryen', emoji: '🥗' },
  { key: 'gluten_free', label: 'Glutensiz', emoji: '✅' },
  { key: 'lactose_free', label: 'Laktozsuz', emoji: '🥛' },
  { key: 'new', label: 'Yeni', emoji: '✨' },
  { key: 'bestseller', label: 'Çok satan', emoji: '🔥' },
  { key: 'chef', label: 'Şef önerisi', emoji: '👨‍🍳' },
  { key: 'hot', label: 'Sıcak servis', emoji: '♨️' },
];

/** Listede yoksa (özel etiket) yazılan metin olduğu gibi gösterilir */
export function tagInfo(list: TagDef[], key: string): TagDef {
  return list.find((t) => t.key === key) || { key, label: key, emoji: '•' };
}
