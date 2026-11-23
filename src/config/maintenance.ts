/**
 * ==========================================================================
 *  BAKIM MODU — TEK ANAHTAR
 * ==========================================================================
 *  true  → Site kapalı: müşteri ve personel yalnızca "bakımdayız" ekranını görür.
 *          (Menü, sipariş, sepet, giriş, kayıt, admin, kurye… hiçbiri yüklenmez.)
 *  false → Site normal çalışır (hiçbir şey silinmedi, sadece gizlendi).
 *
 *  Açıp kapatmak için BU SATIRI değiştirip commit + push etmek yeterlidir.
 *  Veritabanı/Edge Function kilidi için ayrıca: sql/bakim/maintenance_on.sql / maintenance_off.sql
 *  Rehber: BAKIM_MODU_REHBERI.md
 */
export const MAINTENANCE_MODE: boolean = true;

/** Ekranda görünen metinler — buradan değiştirilebilir. */
export const MAINTENANCE_COPY = {
  customer: {
    title: 'Geçici Bakım Çalışması',
    text: 'Şu anda sistemimiz geçici olarak bakımda. Hizmetlerimiz kısa süreliğine kullanıma kapalıdır. Anlayışınız için teşekkür ederiz.',
    // İstenirse ikinci satırı şu şekilde de yazabilirsiniz:
    // 'Ödeme ve sistem güncellemeleri nedeniyle hizmetlerimiz geçici olarak durdurulmuştur.'
    note: 'Sistem güncellemeleri nedeniyle hizmetlerimiz geçici olarak durdurulmuştur.',
  },
  staff: {
    title: 'Personel Sistemi Bakımda',
    text: 'Personel sistemimiz şu anda bakım nedeniyle geçici olarak hizmet dışıdır. Lütfen daha sonra tekrar deneyiniz.',
    note: '',
  },
};

/** Personel / yönetim / kurye adresleri → personel bakım mesajı gösterilir. */
export function isStaffPath(pathname: string): boolean {
  return /^\/(personel-giris|admin|kurye)(\/|$)/i.test(pathname);
}
