import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Switch from '@/components/ui/Switch';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import { supabase } from '@/lib/supabase';
import { randId, slugify } from '@/lib/imageTools';
import type { Category } from '@/types/database';
import toast from 'react-hot-toast';

interface Props {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  /** category_id → ürün sayısı */
  counts: Record<string, number>;
  onChanged: () => void;
}

export default function CategoryManagerModal({ open, onClose, categories, counts, onChanged }: Props) {
  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);

  const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    if (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      toast.error('Bu isimde bir kategori zaten var');
      return;
    }
    setBusy(true);
    try {
      const slug = slugify(name) || `kategori-${randId(4)}`;
      const next = sorted.length ? Math.max(...sorted.map((c) => c.sort_order)) + 1 : 1;
      const { error } = await supabase.from('categories').insert({ name, slug, sort_order: next });
      if (error) throw error;
      toast.success('Kategori eklendi');
      setNewName('');
      onChanged();
    } catch (err: any) {
      toast.error(err.message || 'Eklenemedi');
    } finally {
      setBusy(false);
    }
  };

  const saveRename = async (c: Category) => {
    const name = editName.trim();
    setEditId(null);
    if (!name || name === c.name) return;
    if (categories.some((x) => x.id !== c.id && x.name.toLowerCase() === name.toLowerCase())) {
      toast.error('Bu isimde bir kategori zaten var');
      return;
    }
    const { error } = await supabase.from('categories').update({ name }).eq('id', c.id);
    if (error) toast.error(error.message);
    else {
      toast.success('Kategori adı güncellendi');
      onChanged();
    }
  };

  const toggleActive = async (c: Category) => {
    const { error } = await supabase.from('categories').update({ is_active: !c.is_active }).eq('id', c.id);
    if (error) toast.error(error.message);
    else {
      toast.success(!c.is_active ? 'Kategori yayında' : 'Kategori gizlendi (ürünleri müşteri görmez)');
      onChanged();
    }
  };

  const move = async (c: Category, dir: -1 | 1) => {
    const i = sorted.findIndex((x) => x.id === c.id);
    const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    // Sıra numaraları çakışabilir; hepsini 1..n olarak yeniden yaz
    const arr = [...sorted];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    try {
      await Promise.all(
        arr.map((x, idx) => (x.sort_order !== idx + 1 ? supabase.from('categories').update({ sort_order: idx + 1 }).eq('id', x.id) : null)),
      );
      onChanged();
    } catch (err: any) {
      toast.error(err.message || 'Sıralanamadı');
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('categories').delete().eq('id', deleting.id);
      if (error) throw error;
      toast.success('Kategori silindi');
      onChanged();
      setDeleting(null);
    } catch (err: any) {
      toast.error(err.message || 'Silinemedi (içinde ürün olabilir)');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <Modal open={open} onClose={onClose} size="wide">
        <div className="pe-head">
          <div>
            <h2>🗂️ Kategorileri Yönet</h2>
            <p className="muted small">Ekleyin, yeniden adlandırın, sıralayın, gizleyin veya silin.</p>
          </div>
          <button type="button" className="icon-circle" onClick={onClose} aria-label="Kapat">
            ✕
          </button>
        </div>

        <form onSubmit={add} className="cm-add">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Yeni kategori adı (Örn: Tatlılar)" />
          <button type="submit" className="btn gold" disabled={busy || !newName.trim()}>
            + Kategori Ekle
          </button>
        </form>

        <div className="cm-list">
          {sorted.map((c, i) => {
            const count = counts[c.id] || 0;
            return (
              <div key={c.id} className={`cm-row${c.is_active ? '' : ' off'}`}>
                <div className="cm-order">
                  <button type="button" onClick={() => move(c, -1)} disabled={i === 0} aria-label="Yukarı">
                    ▲
                  </button>
                  <button type="button" onClick={() => move(c, 1)} disabled={i === sorted.length - 1} aria-label="Aşağı">
                    ▼
                  </button>
                </div>

                <div className="cm-name">
                  {editId === c.id ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => saveRename(c)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveRename(c);
                        if (e.key === 'Escape') setEditId(null);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="cm-name-btn"
                      onClick={() => {
                        setEditId(c.id);
                        setEditName(c.name);
                      }}
                      title="Adı değiştirmek için tıklayın"
                    >
                      <b>{c.name}</b> <span className="muted">✏️</span>
                    </button>
                  )}
                  <small className="muted">{count} ürün{!c.is_active ? ' · gizli' : ''}</small>
                </div>

                <div className="cm-switch">
                  <Switch checked={c.is_active} onChange={() => toggleActive(c)} label={c.is_active ? 'Yayında' : 'Gizli'} />
                </div>

                <button
                  type="button"
                  className="icon-circle danger-txt"
                  onClick={() => setDeleting(c)}
                  disabled={count > 0}
                  title={count > 0 ? 'İçinde ürün olan kategori silinemez (önce ürünleri taşıyın)' : 'Kategoriyi sil'}
                  aria-label="Kategoriyi sil"
                >
                  🗑️
                </button>
              </div>
            );
          })}
          {sorted.length === 0 && <p className="muted center" style={{ padding: '2rem' }}>Henüz kategori yok.</p>}
        </div>
      </Modal>

      <ConfirmationModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Kategoriyi sil"
        message={`"${deleting?.name}" kategorisini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`}
        confirmLabel="Evet, sil"
        loading={busy}
      />
    </>
  );
}
