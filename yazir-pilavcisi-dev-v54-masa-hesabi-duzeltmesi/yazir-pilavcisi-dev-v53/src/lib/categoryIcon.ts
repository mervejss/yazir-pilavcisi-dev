import type { IconName } from '@/components/ui/Icon';

/** Kategori adına göre uygun ikon seçer (ad listesi değişse de çalışır). */
export function categoryIcon(name: string): IconName {
  const n = name.toLocaleLowerCase('tr');
  if (/(içecek|icecek|ayran|şerbet|su\b|kola|çay|kahve)/.test(n)) return 'cup';
  if (/(tatlı|tatli|sütlaç|baklava)/.test(n)) return 'heart';
  if (/(salata|meze|turşu|cacık)/.test(n)) return 'leaf';
  if (/(çorba|corba)/.test(n)) return 'flame';
  if (/(tavuk|et\b|döner|köfte|kebap|ızgara)/.test(n)) return 'chef';
  if (/(paket|set|menü|menu|kampanya|fırsat)/.test(n)) return 'bag';
  return 'utensils';
}
