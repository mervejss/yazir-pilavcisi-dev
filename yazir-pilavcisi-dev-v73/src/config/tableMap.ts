/**
 * Müşteri masa seçim ekranındaki fotoğraf (public/masa-duzeni.jpg) ve masa numaralarının
 * fotoğraf üzerindeki yerleri (% olarak: x soldan, y yukarıdan).
 *
 * • Masa EKLEYİP/ÇIKARDIĞINIZDA (Admin → Masalar) liste kendiliğinden güncellenir.
 * • Fotoğrafta yeri tanımlı olmayan yeni masa, fotoğrafın altındaki numara düğmelerinde görünür.
 * • Fotoğraf değişirse yeni dosyayı aynı adla koyun ve aşağıdaki yerleri düzeltin.
 */
export const TABLE_PHOTO = '/masa-duzeni.jpg';

export const TABLE_SPOTS: Record<number, { x: number; y: number }> = {
  1: { x: 15, y: 29 },
  2: { x: 43, y: 76 },
  3: { x: 59, y: 21 },
  4: { x: 75, y: 48 },
  5: { x: 92, y: 33 },
};
