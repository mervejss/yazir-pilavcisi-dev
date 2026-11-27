// Personel yetkileri için ekranda gösterilen açıklamalar.
// Gerçek kaynak veritabanıdır (permissions.description). Veritabanında açıklama yoksa bu metinler yedek olarak kullanılır.

export const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  'orders.view': 'Canlı ve geçmiş siparişleri, sipariş içeriğini ve durumunu görür.',
  'orders.create': 'Telefon, masa veya tezgâh için yeni sipariş girer.',
  'orders.edit': 'Sipariş kalemlerini değiştirir; hazırlanıyor, yolda, teslim edildi gibi durumları günceller.',
  'orders.cancel': 'Siparişi iptal eder (iptal nedeni kayda geçer).',
  'orders.assign_courier': 'Siparişe kurye atar veya kuryeyi değiştirir.',
  'tables.view': 'Masa düzenini ve masaların doluluk durumunu görür.',
  'tables.operate': 'Masayı dolu/boş yapar, hesabı kapatır ve ödemeyi alır.',
  'tables.manage': 'Masa ekler, siler, adını ve yerleşimini değiştirir; QR kodu yeniler.',
  'couriers.view': 'Kurye listesini, çevrimiçi durumunu ve canlı konumunu görür.',
  'couriers.manage': 'Kurye bilgilerini düzenler, kuryeyi aktif/pasif yapar.',
  'menu.manage': 'Ürün, kategori, fiyat, fotoğraf ve galeriyi ekler/düzenler/siler.',
  'reports.view': 'Ciro, ürün ve müşteri raporlarını görür.',
  'customers.view': 'Müşteri listesini, adreslerini ve sipariş geçmişini görür.',
  'customers.manage': 'Müşteri adı, telefonu ve notlarını düzenler.',
  'feedback.view': 'Müşteri geri bildirimlerini okur ve yanıtlar.',
  'staff.view': 'Personel listesini görür (yetki değiştiremez).',
  'settings.manage': 'Çalışma saatleri, teslimat ücreti, iletişim bilgisi ve yorum ayarlarını değiştirir.',
  'integrations.manage': 'Trendyol, Yemeksepeti, Migros gibi platform bağlantılarını yönetir.',
  'audit.view': 'Kim, ne zaman, neyi değiştirdi kayıtlarını (işlem geçmişi) görür.',
};

/**
 * Kurye rolü yönetim yetkisi (permissions tablosu) KULLANMAZ; kurye yalnızca kendi paneliyle çalışır.
 * Bu liste kurye panelinin gerçekte neler yapabildiğini gösterir (veritabanındaki satır düzeyi güvenlik kurallarıyla aynıdır).
 */
export const COURIER_BUILTIN: { label: string; desc: string }[] = [
  { label: 'Kendisine atanan siparişleri görür', desc: 'Yalnızca kendi üzerine atanmış paketlerin adres, telefon, tutar ve içeriğini görür; diğer siparişleri göremez.' },
  { label: 'Teslimat durumunu günceller', desc: 'Yola çıktım / müşteriye teslim ettim adımlarını işaretler.' },
  { label: 'Ödeme yöntemini seçer', desc: 'Teslimde nakit, kart (POS) veya IBAN olarak tahsilatı kaydeder.' },
  { label: 'Canlı konum paylaşır', desc: 'Çevrimiçi olunca konumu işletme haritasında ve müşteri takip sayfasında görünür.' },
  { label: 'Kendi teslimat istatistiklerini görür', desc: 'Kendi teslimat sayısı ve kazanç özetini görür; işletme cirosunu göremez.' },
];

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  owner: 'Tüm yetkilere sahiptir; değiştirilemez.',
  sub_admin: 'Varsayılan olarak hiçbir yönetim yetkisi yoktur; sahip yetkileri tek tek açar.',
  operator: 'Sipariş, masa ve müşteri işlerini yürütür; varsayılan yetkileri aşağıda görünür.',
  courier: 'Yalnızca kurye paneliyle çalışır; yönetim paneli yetkisi yoktur.',
};
