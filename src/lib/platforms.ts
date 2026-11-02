import { supabase } from '@/lib/supabase';

/** Alan tanımı: yönetim panelindeki bağlantı formları buradan üretilir (gizli olmayanlar → integrations.config). */
export interface PlatformField {
  key: string;
  label: string;
  placeholder?: string;
  help?: string;
  type?: 'text' | 'select' | 'number' | 'bool';
  options?: { value: string; label: string }[];
}

export interface PlatformMeta {
  code: string;
  name: string;
  emoji: string;
  route: string;
  /** Edge Function kurulu ve kullanıma hazır mı? false ise sayfa yalnızca ayarları saklar. */
  implemented: boolean;
  fn: string;
  docUrl?: string;
  /** Edge Function secrets içinde tanımlanması gereken gizli değişkenler (DEĞERLERİ ASLA BURAYA/DB'YE YAZMAYIN) */
  secrets: string[];
  connectionFields: PlatformField[];
  storeFields: PlatformField[];
  settingFields: PlatformField[];
  blurb: string;
}

const ENV: PlatformField = {
  key: 'environment', label: 'Ortam', type: 'select',
  options: [{ value: 'stage', label: 'Test (stage)' }, { value: 'prod', label: 'Canlı (prod)' }],
  help: 'Önce test ortamında deneyin; canlıya geçişte "Canlı" seçin.',
};

export const PLATFORMS: PlatformMeta[] = [
  {
    code: 'trendyol', name: 'Trendyol Go', emoji: '🟠', route: '/admin/entegrasyonlar/trendyol', implemented: true,
    fn: 'platform-trendyol', docUrl: 'https://developers.tgoapps.com/docs/category/8-uber-eats-trendyol-go---yemek-entegrasyonu',
    secrets: ['TRENDYOL_API_KEY', 'TRENDYOL_API_SECRET', 'CRON_SECRET'],
    blurb: 'Uber Eats geçişi dahil Trendyol Go Yemek: sipariş çekme, kabul/hazır/yolda/teslim/iptal, menü ve restoran ayarları.',
    connectionFields: [ENV],
    storeFields: [
      { key: 'supplier_id', label: 'Satıcı (Supplier) ID', placeholder: '000', help: 'Trendyol Go panelinden / entegrasyon yetkilisinden alınır. Şimdilik 000 kalabilir.' },
      { key: 'store_id', label: 'Mağaza (Store) ID', placeholder: '000', help: 'Restoranın TGO mağaza numarası. Şimdilik 000 kalabilir.' },
    ],
    settingFields: [
      { key: 'auto_accept', label: 'Yeni siparişi otomatik kabul et', type: 'bool' },
      { key: 'poll_seconds', label: 'Sipariş çekme aralığı (sn)', type: 'number', help: 'Panel açıkken tarayıcı bu aralıkla yeniler; 7/24 için sunucu zamanlayıcısı kurun (README).' },
      { key: 'sync_menu', label: 'Menü senkronizasyonu açık', type: 'bool' },
      { key: 'sync_hours', label: 'Çalışma saatlerini platforma gönder', type: 'bool' },
    ],
  },
  {
    code: 'yemeksepeti', name: 'Yemeksepeti', emoji: '🔴', route: '/admin/entegrasyonlar/yemeksepeti', implemented: false,
    fn: 'platform-yemeksepeti', docUrl: 'https://developer.yemeksepeti.com/api-specifications',
    secrets: ['YEMEKSEPETI_CLIENT_ID', 'YEMEKSEPETI_CLIENT_SECRET'],
    blurb: 'Yemeksepeti Partner API (OpenAPI). Bağlantı bilgileri hazır; API fonksiyonu bir sonraki adımda eklenecek.',
    connectionFields: [ENV],
    storeFields: [
      { key: 'chain_code', label: 'Zincir (Chain) kodu', placeholder: '000' },
      { key: 'vendor_id', label: 'Restoran (Vendor) ID', placeholder: '000' },
    ],
    settingFields: [
      { key: 'auto_accept', label: 'Yeni siparişi otomatik kabul et', type: 'bool' },
      { key: 'sync_menu', label: 'Menü senkronizasyonu açık', type: 'bool' },
      { key: 'sync_hours', label: 'Restoran durumunu platforma gönder (updateVendorStatus)', type: 'bool' },
    ],
  },
  {
    code: 'migros', name: 'Migros Yemek', emoji: '🟢', route: '/admin/entegrasyonlar/migros', implemented: false,
    fn: 'platform-migros', secrets: ['MIGROS_API_KEY'],
    blurb: 'Migros Yemek entegrasyonu için hazırlık sayfası. API fonksiyonu sonraki adımda eklenecek.',
    connectionFields: [ENV],
    storeFields: [{ key: 'store_id', label: 'Mağaza ID', placeholder: '000' }],
    settingFields: [
      { key: 'auto_accept', label: 'Yeni siparişi otomatik kabul et', type: 'bool' },
      { key: 'sync_menu', label: 'Menü senkronizasyonu açık', type: 'bool' },
      { key: 'sync_hours', label: 'Çalışma saatlerini platforma gönder', type: 'bool' },
    ],
  },
  {
    code: 'getir', name: 'Getir Yemek', emoji: '🟣', route: '/admin/entegrasyonlar/getir', implemented: false,
    fn: 'platform-getir', secrets: ['GETIR_API_KEY'],
    blurb: 'Getir Yemek entegrasyonu için hazırlık sayfası. API fonksiyonu sonraki adımda eklenecek.',
    connectionFields: [ENV],
    storeFields: [{ key: 'store_id', label: 'Restoran ID', placeholder: '000' }],
    settingFields: [
      { key: 'auto_accept', label: 'Yeni siparişi otomatik kabul et', type: 'bool' },
      { key: 'sync_menu', label: 'Menü senkronizasyonu açık', type: 'bool' },
      { key: 'sync_hours', label: 'Çalışma saatlerini platforma gönder', type: 'bool' },
    ],
  },
  {
    code: 'other', name: 'Diğer platformlar', emoji: '🔗', route: '/admin/entegrasyonlar/diger', implemented: false,
    fn: 'platform-other', secrets: [],
    blurb: 'Listede olmayan başka bir platform için not alanı. Yeni platform = yeni kaynak satırı + yeni Edge Function.',
    connectionFields: [],
    storeFields: [{ key: 'note', label: 'Not / platform adı', placeholder: 'Örn. başka bir platform bilgisi' }],
    settingFields: [],
  },
];

export const platformByCode = (code: string) => PLATFORMS.find((p) => p.code === code);

export interface PlatformResult { ok: boolean; result?: any; error?: string }

/**
 * Platform fonksiyonunu çağırır. Hata FIRLATMAZ — her çağrı kendi içinde izole;
 * bir platformdaki sorun çağıran ekranı ya da diğer platformları bozmaz.
 */
export async function callPlatform(code: string, action: string, body: Record<string, unknown> = {}): Promise<PlatformResult> {
  const meta = platformByCode(code);
  if (!meta) return { ok: false, error: 'Bilinmeyen platform' };
  if (!meta.implemented) return { ok: false, error: `${meta.name} entegrasyon fonksiyonu henüz kurulmadı (sonraki adım).` };
  try {
    const { data, error } = await supabase.functions.invoke(meta.fn, { body: { action, ...body } });
    if (error) return { ok: false, error: 'Fonksiyona ulaşılamadı. Edge Function dağıtıldı mı? ' + (error.message || '') };
    return data as PlatformResult;
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Beklenmeyen hata' };
  }
}

export const isPlatformSource = (source: string) => !!PLATFORMS.find((p) => p.code === source && p.implemented);
