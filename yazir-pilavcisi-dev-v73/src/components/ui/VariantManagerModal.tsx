import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import toast from 'react-hot-toast';

interface ProductVariant {
  id: string;
  product_id: string;
  name: string;
  price: number;
  sort_order: number;
  is_active: boolean;
}

interface VariantManagerModalProps {
  open: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  initialVariants: ProductVariant[];
  onSave: (variants: ProductVariant[]) => void;
}

export default function VariantManagerModal({
  open,
  onClose,
  productId,
  productName,
  initialVariants,
  onSave,
}: VariantManagerModalProps) {
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (open) {
      setVariants([...initialVariants].sort((a, b) => a.sort_order - b.sort_order));
    }
  }, [open, initialVariants]);

  const handleAddVariant = () => {
    const newVariant: ProductVariant = {
      id: `temp-${Date.now()}`,
      product_id: productId,
      name: '',
      price: 0,
      sort_order: variants.length + 1,
      is_active: true,
    };
    setVariants([...variants, newVariant]);
  };

  const handleUpdateVariant = (id: string, field: keyof ProductVariant, value: any) => {
    setVariants(variants.map((v) => (v.id === id ? { ...v, [field]: value } : v)));
  };

  const handleDeleteVariant = async (id: string, name: string) => {
    setConfirmDelete({ id, name });
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    setLoading(true);
    try {
      if (!confirmDelete.id.startsWith('temp-')) {
        const { error } = await supabase
          .from('product_variants')
          .delete()
          .eq('id', confirmDelete.id);
        if (error) throw error;
      }
      setVariants(variants.filter((v) => v.id !== confirmDelete.id));
      toast.success('Varyant silindi');
    } catch (err: any) {
      toast.error(err.message || 'Silinemedi');
    } finally {
      setLoading(false);
      setConfirmDelete(null);
    }
  };

  const handleMoveVariant = (id: string, direction: 'up' | 'down') => {
    const index = variants.findIndex((v) => v.id === id);
    if (index === -1) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= variants.length) return;

    const newVariants = [...variants];
    [newVariants[index], newVariants[targetIndex]] = [newVariants[targetIndex], newVariants[index]];
    newVariants.forEach((v, i) => (v.sort_order = i + 1));
    setVariants(newVariants);
  };

  const handleSave = async () => {
    // Validate
    const invalid = variants.some((v) => !v.name.trim() || v.price < 0);
    if (invalid) {
      toast.error('Lütfen tüm varyant adlarını ve fiyatlarını girin');
      return;
    }

    setSaving(true);
    try {
      // Separate new (temp) and existing variants
      const existingVariants = variants.filter((v) => !v.id.startsWith('temp-'));
      const newVariants = variants.filter((v) => v.id.startsWith('temp-'));

      // Update existing
      for (const v of existingVariants) {
        const { error } = await supabase
          .from('product_variants')
          .update({ name: v.name, price: v.price, sort_order: v.sort_order, is_active: v.is_active })
          .eq('id', v.id);
        if (error) throw error;
      }

      // Insert new
      if (newVariants.length > 0) {
        const { error } = await supabase.from('product_variants').insert(
          newVariants.map((v) => ({
            product_id: productId,
            name: v.name,
            price: v.price,
            sort_order: v.sort_order,
            is_active: v.is_active,
          }))
        );
        if (error) throw error;
      }

      // Check for deleted variants
      const currentIds = new Set(existingVariants.map((v) => v.id));
      const initialIds = new Set(initialVariants.map((v) => v.id));
      for (const id of initialIds) {
        if (!currentIds.has(id)) {
          await supabase.from('product_variants').delete().eq('id', id);
        }
      }

      toast.success('Varyantlar kaydedildi');
      onSave(variants);
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <Modal open={open} onClose={() => !saving && !loading && onClose()} size="wide">
        <div style={{ maxWidth: '680px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.35rem' }}>
              Varyant Yönetimi: {productName}
            </h2>
            <button
              type="button"
              className="btn gold sm"
              onClick={handleAddVariant}
              disabled={saving || loading}
              style={{ padding: '0.5em 1em' }}
            >
              + Varyant Ekle
            </button>
          </div>

          <p className="muted small" style={{ marginBottom: '1rem' }}>
            Varyantları sürükleyerek sıralayın, fiyatları güncelleyin veya yeni varyantlar ekleyin.
          </p>

          {variants.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Henüz varyant eklenmemiş</p>
              <button type="button" className="btn gold sm" onClick={handleAddVariant}>
                İlk Varyantı Ekle
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '50vh', overflowY: 'auto' }}>
              {variants.map((v, index) => (
                <div
                  key={v.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr 120px 60px 40px 40px',
                    gap: '0.5rem',
                    alignItems: 'center',
                    padding: '0.7rem 1rem',
                    background: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: '10px',
                    transition: 'all 0.15s',
                  }}
                >
                  {/* Drag handle / Order */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                    <button
                      type="button"
                      className="btn ghost sm"
                      style={{ padding: '0.1em 0.3em', fontSize: '0.7rem' }}
                      onClick={() => handleMoveVariant(v.id, 'up')}
                      disabled={index === 0}
                      title="Yukarı"
                    >
                      ▲
                    </button>
                    <b style={{ fontSize: '0.85rem', color: 'var(--text-muted)', minWidth: '20px', textAlign: 'center' }}>
                      {index + 1}
                    </b>
                    <button
                      type="button"
                      className="btn ghost sm"
                      style={{ padding: '0.1em 0.3em', fontSize: '0.7rem' }}
                      onClick={() => handleMoveVariant(v.id, 'down')}
                      disabled={index === variants.length - 1}
                      title="Aşağı"
                    >
                      ▼
                    </button>
                  </div>

                  {/* Name */}
                  <input
                    type="text"
                    value={v.name}
                    onChange={(e) => handleUpdateVariant(v.id, 'name', e.target.value)}
                    placeholder="Varyant adı (örn: 1 Porsiyon, Büyük)"
                    style={{ padding: '0.5em', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--input-bg)', color: 'var(--input-text)' }}
                    disabled={saving || loading}
                  />

                  {/* Price */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <input
                      type="number"
                      value={v.price}
                      onChange={(e) => handleUpdateVariant(v.id, 'price', Number(e.target.value) || 0)}
                      min="0"
                      step="1"
                      style={{ width: '80px', padding: '0.5em', borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--input-bg)', color: 'var(--input-text)', textAlign: 'right' }}
                      disabled={saving || loading}
                    />
                    <span className="small muted">₺</span>
                  </div>

                  {/* Active */}
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={v.is_active}
                      onChange={(e) => handleUpdateVariant(v.id, 'is_active', e.target.checked)}
                      disabled={saving || loading}
                    />
                  </label>

                  {/* Delete */}
                  <button
                    type="button"
                    className="btn ghost sm"
                    style={{ padding: '0.3em', color: 'var(--danger)', justifyContent: 'center' }}
                    onClick={() => handleDeleteVariant(v.id, v.name || 'Varyant')}
                    disabled={saving || loading}
                    title="Sil"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="prow" style={{ marginTop: '1.2rem', justifyContent: 'flex-end', gap: '0.8rem' }}>
            <button
              type="button"
              className="btn ghost"
              onClick={onClose}
              disabled={saving || loading}
              style={{ padding: '0.6em 1.2em' }}
            >
              Vazgeç
            </button>
            <button
              type="button"
              className="btn gold"
              onClick={handleSave}
              disabled={saving || loading || variants.length === 0}
              style={{ padding: '0.6em 1.5em' }}
            >
              {saving ? 'Kaydediliyor...' : 'Kaydet ve Kapat'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmationModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Varyantı Sil"
        message={`"${confirmDelete?.name}" varyantını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`}
        confirmLabel="Evet, Sil"
        variant="danger"
        loading={loading}
      />
    </>
  );
}