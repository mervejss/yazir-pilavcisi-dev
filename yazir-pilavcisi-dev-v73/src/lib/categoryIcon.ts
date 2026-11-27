import type { IconName } from '@/components/ui/Icon';

/** Kategori adına göre uygun çizgi ikonu seçer (ad listesi değişse de çalışır; eşleşmezse genel "yemek" ikonu). Menü, ana sayfa ve yönetim sipariş ekranı ortak kullanır. */
const RULES: Array<[RegExp, IconName]> = [
  [/pilav|pirinç|bulgur/, 'pilaf'],
  [/çorba|corba|yan\b|yanlar|meze/, 'soup'],
  [/çay|cay|kahve|sıcak/, 'coffee'],
  [/içecek|icecek|ayran|şerbet|kola|gazoz|meşrubat|su\b|limonata|soğuk/, 'drink'],
  [/tatl|baklava|revani|künefe|kunefe|sütlaç|dondurma/, 'dessert'],
  [/tost|sandviç|sandvic|burger|döner|doner|dürüm|durum|lahmacun|pide/, 'burger'],
  [/midye|deniz|karides/, 'shell'],
  [/balık|balik/, 'fish'],
  [/pizza/, 'pizza'],
  [/salata|turşu|cacık|vegan|sebze/, 'leaf'],
  [/ızgara|izgara|kebap|kebab|et\b|tavuk|köfte|kofte|mangal|şiş|sis\b/, 'flame'],
  [/kampanya|menü|menu|fırsat|firsat|set\b|paket|özel|ozel/, 'gift'],
];
export function categoryIcon(name: string): IconName {
  const n = (name || '').toLocaleLowerCase('tr');
  for (const [re, ic] of RULES) if (re.test(n)) return ic;
  return 'utensils';
}
