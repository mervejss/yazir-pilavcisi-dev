/** Rol → ana sayfa yardımcıları.
 *  Personel (owner / sub_admin / operator) ve kurye hesapları MÜŞTERİ alanını (/profil) kullanmaz;
 *  her zaman kendi paneline gider. Müşteri olarak sipariş vermek isteyen personel ayrı bir e-posta ile müşteri hesabı açar. */
export const STAFF_ROLES = ['owner', 'sub_admin', 'operator'] as const;

export const isStaffRole = (r?: string | null): boolean => !!r && (STAFF_ROLES as readonly string[]).includes(r);
export const isPanelRole = (r?: string | null): boolean => isStaffRole(r) || r === 'courier';

/** Rolün kendi ana ekranı */
export const homeForRole = (r?: string | null): string => (r === 'courier' ? '/kurye' : isStaffRole(r) ? '/admin' : '/profil');

/** Bu rol bu yola girebilir mi? (/admin → personel, /kurye → personel + kurye) */
export const canEnterPath = (path: string, r?: string | null): boolean => {
  if (path === '/admin' || path.startsWith('/admin/')) return isStaffRole(r);
  if (path === '/kurye' || path.startsWith('/kurye/')) return isPanelRole(r);
  return false;
};

/** Girişten sonra nereye: gelinen panel sayfası uygunsa oraya, değilse rolün ana ekranına */
export const afterLoginPath = (r?: string | null, from?: string | null): string =>
  from && canEnterPath(from.split('?')[0], r) ? from : homeForRole(r);
