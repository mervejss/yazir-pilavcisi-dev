import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import type { RestaurantGallery } from '@/types/database';
import { autoCropToBlob, formatBytes, randId, RATIO_VALUE } from '@/lib/imageTools';
import { GALLERY_BUCKET, copyInBucket, galleryImageUrl, removeFromBucket, uploadToBucket } from '@/lib/menuImages';
import Switch from '@/components/ui/Switch';
import Modal from '@/components/ui/Modal';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import ImageStudio, { type AspectKey, type StudioResult } from '@/components/ui/ImageStudio';
import Lightbox from '@/components/ui/Lightbox';

type StatusFilter = 'all' | 'on' | 'off' | 'featured';
type SortKey = 'manual' | 'newest' | 'oldest' | 'title';
type ViewMode = 'grid' | 'list';
type Density = 'sm' | 'md' | 'lg';

const CATEGORY_PRESETS = ['İç Mekan', 'Yemekler', 'Mutfak', 'Dış Mekan', 'Ekip', 'Etkinlik', 'Diğer'];

interface QueueItem {
  id: string;
  file: File;
  preview: string;
  title: string;
  blob?: Blob;
  editedPreview?: string;
  info?: StudioResult;
}

interface ConfirmState {
  title: string;
  message: string;
  label: string;
  body?: ReactNode;
  run: () => Promise<void>;
}

const isMissingColumn = (err: any) => /column|schema cache/i.test(String(err?.message || '')) || err?.code === '42703' || err?.code === 'PGRST204';

const prettyName = (name: string) =>
  name
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export default function GalleryAdmin() {
  const [photos, setPhotos] = useState<RestaurantGallery[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtre / görünüm
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [catFilter, setCatFilter] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('manual');
  const [view, setView] = useState<ViewMode>('grid');
  const [density, setDensity] = useState<Density>('md');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Yükleme kuyruğu
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [qRatio, setQRatio] = useState<AspectKey>('4:3');
  const [qCategory, setQCategory] = useState('');
  const [qPublish, setQPublish] = useState(true);
  const [qUploading, setQUploading] = useState(false);
  const [qProgress, setQProgress] = useState(0);
  const [qStudioId, setQStudioId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<RestaurantGallery | null>(null);

  // Düzenleme / görüntüleme
  const [editing, setEditing] = useState<RestaurantGallery | null>(null);
  const [form, setForm] = useState({ title: '', description: '', category: '', is_featured: false, is_active: true });
  const [savingMeta, setSavingMeta] = useState(false);
  const [studio, setStudio] = useState<{ photo: RestaurantGallery; source: { file?: Blob | null; url?: string | null } } | null>(null);
  const [lightbox, setLightbox] = useState<{ ids: string[]; index: number } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Sürükle-bırak sıralama
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  /* ------------------------------------------------------------------ */
  /* Veri                                                                */
  /* ------------------------------------------------------------------ */
  const fetchGallery = useCallback(async () => {
    const { data, error } = await supabase.from('restaurant_gallery').select('*').order('sort_order', { ascending: true });
    if (error) toast.error(error.message);
    if (data) setPhotos(data as unknown as RestaurantGallery[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchGallery();
  }, [fetchGallery]);

  const fail = (err: any, fallback: string) => {
    if (isMissingColumn(err)) toast.error('Veritabanı güncel değil: sql/14_menu_gallery_pro.sql dosyasını Supabase SQL Editor\'de çalıştırın.');
    else toast.error(err?.message || fallback);
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    photos.forEach((p) => p.category && set.add(p.category));
    return [...set].sort((a, b) => a.localeCompare(b, 'tr'));
  }, [photos]);

  const allCategoryOptions = useMemo(() => [...new Set([...CATEGORY_PRESETS, ...categories])], [categories]);

  const stats = useMemo(
    () => ({
      total: photos.length,
      on: photos.filter((p) => p.is_active).length,
      off: photos.filter((p) => !p.is_active).length,
      featured: photos.filter((p) => p.is_featured).length,
      cats: categories.length,
    }),
    [photos, categories],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr');
    let list = photos.filter((p) => {
      if (q && !`${p.title} ${p.description || ''} ${p.category || ''}`.toLocaleLowerCase('tr').includes(q)) return false;
      if (status === 'on' && !p.is_active) return false;
      if (status === 'off' && p.is_active) return false;
      if (status === 'featured' && !p.is_featured) return false;
      if (catFilter === '__none' && p.category) return false;
      if (catFilter !== 'all' && catFilter !== '__none' && p.category !== catFilter) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      switch (sort) {
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'title':
          return (a.title || '').localeCompare(b.title || '', 'tr');
        default:
          return a.sort_order - b.sort_order;
      }
    });
    return list;
  }, [photos, search, status, catFilter, sort]);

  const canReorder = sort === 'manual' && !search.trim() && status === 'all' && catFilter === 'all';
  const allVisibleSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  const selectedPhotos = photos.filter((p) => selected.has(p.id));

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  /* ------------------------------------------------------------------ */
  /* Yükleme kuyruğu                                                     */
  /* ------------------------------------------------------------------ */
  const addFiles = (files: FileList | File[]) => {
    const list = [...files].filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
    const rejected = [...files].length - list.length;
    if (rejected > 0) toast.error(`${rejected} dosya atlandı (yalnızca JPG, PNG, WebP)`);
    if (!list.length) return;
    setQueue((q) => [
      ...q,
      ...list.map((f) => ({ id: randId(8), file: f, preview: URL.createObjectURL(f), title: prettyName(f.name) })),
    ]);
  };

  const clearQueue = () => {
    queue.forEach((i) => {
      URL.revokeObjectURL(i.preview);
      if (i.editedPreview) URL.revokeObjectURL(i.editedPreview);
    });
    setQueue([]);
    setQProgress(0);
  };

  const queueStudioItem = queue.find((i) => i.id === qStudioId) || null;

  const onQueueStudioSave = (blob: Blob, info: StudioResult) => {
    if (!queueStudioItem) return;
    setQueue((q) =>
      q.map((i) => {
        if (i.id !== queueStudioItem.id) return i;
        if (i.editedPreview) URL.revokeObjectURL(i.editedPreview);
        return { ...i, blob, info, editedPreview: URL.createObjectURL(blob) };
      }),
    );
    setQStudioId(null);
  };

  const startUpload = async () => {
    if (!queue.length) return;
    setQUploading(true);
    setQProgress(0);
    let done = 0;
    try {
      const maxSort = photos.length ? Math.max(...photos.map((p) => p.sort_order)) : 0;
      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        let blob = item.blob;
        let contentType = item.info?.contentType || 'image/webp';
        let ext = item.info?.ext === 'jpeg' ? 'jpg' : 'webp';
        if (!blob) {
          const ratio = qRatio === 'orig' ? null : RATIO_VALUE[qRatio];
          const res = await autoCropToBlob(item.file, ratio, 1600, 0.88);
          blob = res.blob;
          contentType = 'image/webp';
          ext = 'webp';
        }
        const path = `gallery/${Date.now()}-${randId(5)}.${ext}`;
        await uploadToBucket(GALLERY_BUCKET, path, blob, contentType);

        const base = { title: item.title.trim(), image_path: path, sort_order: maxSort + i + 1, is_active: qPublish };
        let { error } = await supabase.from('restaurant_gallery').insert({ ...base, category: qCategory.trim() || null, description: '', is_featured: false });
        if (error && isMissingColumn(error)) {
          // Eski tablo yapısı: yeni alanlar olmadan kaydet
          ({ error } = await supabase.from('restaurant_gallery').insert(base));
        }
        if (error) throw error;
        done++;
        setQProgress(Math.round((done / queue.length) * 100));
      }
      toast.success(`${done} fotoğraf galeriye eklendi`);
      clearQueue();
      fetchGallery();
    } catch (err: any) {
      toast.error(`${err?.message || 'Yükleme başarısız'} (${done}/${queue.length} yüklendi)`);
      fetchGallery();
    } finally {
      setQUploading(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /* Tek fotoğraf işlemleri                                              */
  /* ------------------------------------------------------------------ */
  const updateRow = async (id: string, patch: Record<string, any>, okMsg?: string) => {
    const { error } = await supabase.from('restaurant_gallery').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) {
      // updated_at sütunu yoksa onsuz dene
      if (isMissingColumn(error)) {
        const r2 = await supabase.from('restaurant_gallery').update(patch).eq('id', id);
        if (!r2.error) {
          okMsg && toast.success(okMsg);
          fetchGallery();
          return true;
        }
        fail(r2.error, 'Güncellenemedi');
        return false;
      }
      fail(error, 'Güncellenemedi');
      return false;
    }
    okMsg && toast.success(okMsg);
    fetchGallery();
    return true;
  };

  const toggleActive = (p: RestaurantGallery) => updateRow(p.id, { is_active: !p.is_active }, !p.is_active ? 'Fotoğraf yayında' : 'Fotoğraf gizlendi');
  const toggleFeatured = (p: RestaurantGallery) => updateRow(p.id, { is_featured: !p.is_featured }, !p.is_featured ? '⭐ Öne çıkarıldı' : 'Öne çıkarma kaldırıldı');

  const openEdit = (p: RestaurantGallery) => {
    setEditing(p);
    setForm({
      title: p.title || '',
      description: p.description || '',
      category: p.category || '',
      is_featured: !!p.is_featured,
      is_active: !!p.is_active,
    });
  };

  const saveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSavingMeta(true);
    const ok = await updateRow(
      editing.id,
      {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category.trim() || null,
        is_featured: form.is_featured,
        is_active: form.is_active,
      },
      'Fotoğraf bilgileri kaydedildi',
    );
    setSavingMeta(false);
    if (ok) setEditing(null);
  };

  const pickReplace = (p: RestaurantGallery) => {
    replaceTarget.current = p;
    replaceRef.current?.click();
  };

  const onReplacePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    const p = replaceTarget.current;
    if (!f || !p) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return toast.error('Yalnızca JPG, PNG veya WebP');
    setStudio({ photo: p, source: { file: f } });
  };

  const saveStudio = async (blob: Blob, info: StudioResult) => {
    if (!studio) return;
    const p = studio.photo;
    const path = `gallery/${Date.now()}-${randId(5)}.${info.ext === 'jpeg' ? 'jpg' : 'webp'}`;
    await uploadToBucket(GALLERY_BUCKET, path, blob, info.contentType);
    const ok = await updateRow(p.id, { image_path: path }, 'Fotoğraf güncellendi');
    if (ok) {
      await removeFromBucket(GALLERY_BUCKET, p.image_path);
      setStudio(null);
      setEditing(null);
    }
  };

  const duplicate = async (p: RestaurantGallery) => {
    const t = toast.loading('Çoğaltılıyor…');
    try {
      const ext = p.image_path.split('.').pop() || 'webp';
      const newPath = await copyInBucket(GALLERY_BUCKET, p.image_path, `gallery/${Date.now()}-${randId(5)}.${ext}`);
      if (!newPath) throw new Error('Dosya kopyalanamadı');
      const maxSort = photos.length ? Math.max(...photos.map((x) => x.sort_order)) : 0;
      const base = { title: `${p.title || 'Fotoğraf'} (Kopya)`, image_path: newPath, sort_order: maxSort + 1, is_active: false };
      let { error } = await supabase.from('restaurant_gallery').insert({ ...base, category: p.category || null, description: p.description || '', is_featured: false });
      if (error && isMissingColumn(error)) ({ error } = await supabase.from('restaurant_gallery').insert(base));
      if (error) throw error;
      toast.success('Çoğaltıldı (gizli olarak eklendi)', { id: t });
      fetchGallery();
    } catch (err: any) {
      toast.dismiss(t);
      fail(err, 'Çoğaltılamadı');
    }
  };

  const askDelete = (p: RestaurantGallery) =>
    setConfirm({
      title: 'Fotoğrafı sil',
      message: `"${p.title || 'Başlıksız fotoğraf'}" galeriden ve depolamadan kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
      label: 'Evet, fotoğrafı sil',
      body: (
        <div className="gx-del-body">
          <img src={galleryImageUrl(p.image_path)} alt="" />
          <div>
            <b>{p.title || 'Başlıksız'}</b>
            <small>{p.category || 'Kategorisiz'}</small>
            {p.is_active && (
              <button
                type="button"
                className="btn ghost sm"
                style={{ marginTop: '0.4rem' }}
                onClick={() => {
                  setConfirm(null);
                  toggleActive(p);
                }}
              >
                Silmek yerine gizle
              </button>
            )}
          </div>
        </div>
      ),
      run: async () => {
        await removeFromBucket(GALLERY_BUCKET, p.image_path);
        const { error } = await supabase.from('restaurant_gallery').delete().eq('id', p.id);
        if (error) throw error;
        toast.success('Fotoğraf silindi');
        setEditing(null);
        setSelected((s) => {
          const n = new Set(s);
          n.delete(p.id);
          return n;
        });
        fetchGallery();
      },
    });

  /* ------------------------------------------------------------------ */
  /* Sıralama                                                            */
  /* ------------------------------------------------------------------ */
  const persistOrder = async (arr: RestaurantGallery[]) => {
    setPhotos(arr.map((p, i) => ({ ...p, sort_order: i + 1 })));
    try {
      await Promise.all(
        arr.map((p, i) => (p.sort_order !== i + 1 ? supabase.from('restaurant_gallery').update({ sort_order: i + 1 }).eq('id', p.id) : null)),
      );
      toast.success('Sıralama kaydedildi');
    } catch (err) {
      fail(err, 'Sıralama kaydedilemedi');
      fetchGallery();
    }
  };

  const moveTo = (p: RestaurantGallery, where: 'first' | 'last' | -1 | 1) => {
    const arr = [...photos].sort((a, b) => a.sort_order - b.sort_order);
    const i = arr.findIndex((x) => x.id === p.id);
    if (i < 0) return;
    arr.splice(i, 1);
    let to: number;
    if (where === 'first') to = 0;
    else if (where === 'last') to = arr.length;
    else to = Math.max(0, Math.min(arr.length, i + where));
    arr.splice(to, 0, p);
    persistOrder(arr);
  };

  const onDrop = (target: RestaurantGallery) => {
    if (!dragId || dragId === target.id) return;
    const arr = [...photos].sort((a, b) => a.sort_order - b.sort_order);
    const from = arr.findIndex((x) => x.id === dragId);
    const to = arr.findIndex((x) => x.id === target.id);
    if (from < 0 || to < 0) return;
    const [m] = arr.splice(from, 1);
    arr.splice(to, 0, m);
    persistOrder(arr);
  };

  /* ------------------------------------------------------------------ */
  /* Toplu işlemler                                                      */
  /* ------------------------------------------------------------------ */
  const bulkPatch = async (patch: Record<string, any>, msg: string) => {
    const ids = [...selected];
    const { error } = await supabase.from('restaurant_gallery').update(patch).in('id', ids);
    if (error) return fail(error, 'Güncellenemedi');
    toast.success(`${ids.length} fotoğraf: ${msg}`);
    fetchGallery();
  };

  const askBulkDelete = () => {
    const list = selectedPhotos;
    setConfirm({
      title: `${list.length} fotoğrafı sil`,
      message: 'Seçili fotoğraflar kalıcı olarak silinecek. Bu işlem geri alınamaz.',
      label: `Evet, ${list.length} fotoğrafı sil`,
      body: (
        <div className="gx-del-strip">
          {list.slice(0, 8).map((p) => (
            <img key={p.id} src={galleryImageUrl(p.image_path)} alt="" />
          ))}
          {list.length > 8 && <span>+{list.length - 8}</span>}
        </div>
      ),
      run: async () => {
        for (const p of list) await removeFromBucket(GALLERY_BUCKET, p.image_path);
        const { error } = await supabase.from('restaurant_gallery').delete().in('id', list.map((p) => p.id));
        if (error) throw error;
        toast.success(`${list.length} fotoğraf silindi`);
        setSelected(new Set());
        fetchGallery();
      },
    });
  };

  /* ------------------------------------------------------------------ */
  /* Görüntüleyici                                                       */
  /* ------------------------------------------------------------------ */
  const openLightbox = (p: RestaurantGallery) => {
    const idx = filtered.findIndex((x) => x.id === p.id);
    setLightbox({ ids: filtered.map((x) => x.id), index: Math.max(0, idx) });
  };
  const lbPhotos = lightbox ? (lightbox.ids.map((id) => photos.find((p) => p.id === id)).filter(Boolean) as RestaurantGallery[]) : [];
  const lbCurrent = lightbox ? lbPhotos[lightbox.index] : null;

  /* ------------------------------------------------------------------ */
  /* Görünüm                                                             */
  /* ------------------------------------------------------------------ */
  const gridMin = density === 'sm' ? 170 : density === 'lg' ? 340 : 250;

  const renderCard = (p: RestaurantGallery) => {
    const sel = selected.has(p.id);
    return (
      <article
        key={p.id}
        className={`gx-card${p.is_active ? '' : ' hidden'}${sel ? ' sel' : ''}${dragId === p.id ? ' dragging' : ''}${overId === p.id && dragId !== p.id ? ' over' : ''}`}
        draggable={canReorder}
        onDragStart={() => setDragId(p.id)}
        onDragEnd={() => {
          setDragId(null);
          setOverId(null);
        }}
        onDragOver={(e) => {
          if (!canReorder) return;
          e.preventDefault();
          setOverId(p.id);
        }}
        onDrop={(e) => {
          e.preventDefault();
          onDrop(p);
          setDragId(null);
          setOverId(null);
        }}
      >
        <div className="gx-media">
          <button type="button" className="gx-img" onClick={() => openLightbox(p)} aria-label={`${p.title || 'Fotoğraf'} büyüt`}>
            <img src={galleryImageUrl(p.image_path)} alt={p.title} loading="lazy" draggable={false} />
          </button>
          <label className="mx-check" title="Seç">
            <input type="checkbox" checked={sel} onChange={() => toggleSelect(p.id)} />
          </label>
          <div className="mx-badges">
            {!p.is_active && <span className="mx-badge hid">Gizli</span>}
            {p.is_featured && <span className="mx-badge star">⭐ Öne çıkan</span>}
          </div>
          {canReorder && <span className="gx-grip" title="Sürükleyerek sıralayın">⠿</span>}
          <div className="gx-hover">
            <button type="button" onClick={() => openLightbox(p)} title="Büyüt">🔍</button>
            <button type="button" onClick={() => setStudio({ photo: p, source: { url: galleryImageUrl(p.image_path) } })} title="Görseli düzenle / kırp">✂️</button>
            <button type="button" onClick={() => toggleFeatured(p)} title={p.is_featured ? 'Öne çıkarmayı kaldır' : 'Öne çıkar'}>{p.is_featured ? '★' : '☆'}</button>
            <button type="button" onClick={() => duplicate(p)} title="Çoğalt">📄</button>
          </div>
        </div>
        <div className="gx-body">
          <h3 title={p.title}>{p.title || 'Başlıksız fotoğraf'}</h3>
          <div className="gx-meta">
            {p.category ? <span className="chip">{p.category}</span> : <span className="muted small">Kategorisiz</span>}
            <span className="muted small">{new Date(p.created_at).toLocaleDateString('tr-TR')}</span>
          </div>
        </div>
        <div className="gx-foot">
          <div className="gx-switch">
            <Switch checked={p.is_active} onChange={() => toggleActive(p)} label={p.is_active ? 'Yayında' : 'Gizli'} />
            <small>{p.is_active ? 'Yayında' : 'Gizli'}</small>
          </div>
          <div className="gx-foot-btns">
            {canReorder && (
              <>
                <button type="button" className="btn ghost sm" onClick={() => moveTo(p, -1)} title="Öne al" aria-label="Öne al">◀</button>
                <button type="button" className="btn ghost sm" onClick={() => moveTo(p, 1)} title="Geri al" aria-label="Geri al">▶</button>
              </>
            )}
            <button type="button" className="btn ghost sm" onClick={() => openEdit(p)}>✏️ Düzenle</button>
            <button type="button" className="btn ghost sm danger-txt" onClick={() => askDelete(p)} title="Sil" aria-label="Sil">🗑️</button>
          </div>
        </div>
      </article>
    );
  };

  const renderRow = (p: RestaurantGallery) => {
    const sel = selected.has(p.id);
    return (
      <div key={p.id} className={`mx-row gx-row${p.is_active ? '' : ' hidden'}${sel ? ' sel' : ''}`}>
        <label className="mx-check inline">
          <input type="checkbox" checked={sel} onChange={() => toggleSelect(p.id)} />
        </label>
        <div className="mx-order">
          <button type="button" onClick={() => moveTo(p, -1)} disabled={!canReorder} aria-label="Yukarı">▲</button>
          <b>{p.sort_order}</b>
          <button type="button" onClick={() => moveTo(p, 1)} disabled={!canReorder} aria-label="Aşağı">▼</button>
        </div>
        <button type="button" className="mx-thumb" onClick={() => openLightbox(p)} aria-label="Büyüt">
          <img src={galleryImageUrl(p.image_path)} alt={p.title} loading="lazy" />
        </button>
        <div className="mx-info">
          <div className="mx-info-top">
            <b>{p.title || 'Başlıksız fotoğraf'}</b>
            {p.is_featured && <span className="mx-badge star">⭐</span>}
            {!p.is_active && <span className="mx-badge hid">Gizli</span>}
          </div>
          <small className="muted">{p.category || 'Kategorisiz'} · {new Date(p.created_at).toLocaleDateString('tr-TR')}</small>
          {p.description && <small className="mx-rowdesc">{p.description}</small>}
        </div>
        <div className="mx-row-sw">
          <div>
            <small>Yayında</small>
            <Switch checked={p.is_active} onChange={() => toggleActive(p)} label="Yayında" />
          </div>
          <div>
            <small>Öne çıkan</small>
            <Switch checked={!!p.is_featured} onChange={() => toggleFeatured(p)} label="Öne çıkan" />
          </div>
        </div>
        <div className="mx-row-actions">
          <button type="button" className="btn ghost sm" onClick={() => openEdit(p)}>✏️ Düzenle</button>
          <button type="button" className="btn ghost sm" onClick={() => setStudio({ photo: p, source: { url: galleryImageUrl(p.image_path) } })} title="Kırp / düzenle">✂️</button>
          <button type="button" className="btn ghost sm" onClick={() => duplicate(p)} title="Çoğalt">📄</button>
          <button type="button" className="btn ghost sm danger-txt" onClick={() => askDelete(p)} title="Sil">🗑️</button>
        </div>
      </div>
    );
  };

  if (loading) return <p className="muted center">Galeri yükleniyor...</p>;

  return (
    <>
      <div className="bar mx-bar">
        <div>
          <h1>Galeri Yönetimi</h1>
          <p className="muted" style={{ margin: 0 }}>
            Fotoğrafları yükleyin, kırpın, kategorilere ayırın ve sürükleyerek sıralayın — değişiklikler anında sitede görünür
          </p>
        </div>
        <div className="mx-bar-actions">
          <a className="btn ghost sm" href="/galeri" target="_blank" rel="noreferrer">
            Galeriyi önizle ↗
          </a>
          <button type="button" className="btn gold sm" onClick={() => fileRef.current?.click()}>
            + Fotoğraf Ekle
          </button>
        </div>
      </div>

      <div className="ad-stats">
        <button type="button" className={`ad-stat${status === 'all' ? ' on' : ''}`} onClick={() => setStatus('all')}>
          <small>Toplam fotoğraf</small>
          <b>{stats.total}</b>
          <span>{stats.cats} kategori</span>
        </button>
        <button type="button" className={`ad-stat ok${status === 'on' ? ' on' : ''}`} onClick={() => setStatus('on')}>
          <small>Yayında</small>
          <b>{stats.on}</b>
          <span>sitede görünüyor</span>
        </button>
        <button type="button" className={`ad-stat mute${status === 'off' ? ' on' : ''}`} onClick={() => setStatus('off')}>
          <small>Gizli</small>
          <b>{stats.off}</b>
          <span>yalnızca yönetici görür</span>
        </button>
        <button type="button" className={`ad-stat warn${status === 'featured' ? ' on' : ''}`} onClick={() => setStatus('featured')}>
          <small>Öne çıkan</small>
          <b>{stats.featured}</b>
          <span>⭐ işaretli</span>
        </button>
      </div>

      {/* Sürükle-bırak yükleme alanı */}
      <div
        className={`gx-drop${dragOver ? ' over' : ''}`}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (e.dataTransfer.files?.length) {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }
          setDragOver(false);
        }}
      >
        <div className="gx-drop-ico">🖼️</div>
        <div>
          <b>Fotoğrafları buraya sürükleyip bırakın</b>
          <p className="muted small" style={{ margin: 0 }}>
            Birden fazla dosya seçebilirsiniz · JPG, PNG, WebP · otomatik kırpılır ve küçültülür, istediğinizi tek tek düzenleyebilirsiniz
          </p>
        </div>
        <button type="button" className="btn gold" onClick={() => fileRef.current?.click()}>
          📁 Dosya Seç
        </button>
      </div>

      <div className="ad-toolbar">
        <div className="ad-search">
          <span aria-hidden="true">🔍</span>
          <input type="search" placeholder="Başlık, açıklama veya kategori ara…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Galeride ara" />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label="Aramayı temizle">✕</button>
          )}
        </div>
        <label className="ad-select">
          <span>Sıralama</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="manual">Manuel (sürükle-bırak)</option>
            <option value="newest">En yeni</option>
            <option value="oldest">En eski</option>
            <option value="title">Başlığa göre</option>
          </select>
        </label>
        <label className="ad-select">
          <span>Boyut</span>
          <select value={density} onChange={(e) => setDensity(e.target.value as Density)} disabled={view === 'list'}>
            <option value="sm">Küçük</option>
            <option value="md">Orta</option>
            <option value="lg">Büyük</option>
          </select>
        </label>
        <div className="ad-viewtoggle" role="group" aria-label="Görünüm">
          <button type="button" className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')}>▦ Kartlar</button>
          <button type="button" className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>☰ Liste</button>
        </div>
      </div>

      <div className="ad-tabs" role="tablist">
        <button type="button" role="tab" className={catFilter === 'all' ? 'on' : ''} onClick={() => setCatFilter('all')}>
          Tümü <i>{photos.length}</i>
        </button>
        {categories.map((c) => (
          <button key={c} type="button" role="tab" className={catFilter === c ? 'on' : ''} onClick={() => setCatFilter(c)}>
            {c} <i>{photos.filter((p) => p.category === c).length}</i>
          </button>
        ))}
        {photos.some((p) => !p.category) && categories.length > 0 && (
          <button type="button" role="tab" className={catFilter === '__none' ? 'on' : ''} onClick={() => setCatFilter('__none')}>
            Kategorisiz <i>{photos.filter((p) => !p.category).length}</i>
          </button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="ad-bulk" role="region" aria-label="Toplu işlemler">
          <b>{selected.size} fotoğraf seçildi</b>
          <div className="ad-bulk-actions">
            <button type="button" className="btn ghost sm" onClick={() => bulkPatch({ is_active: true }, 'yayına alındı')}>Yayınla</button>
            <button type="button" className="btn ghost sm" onClick={() => bulkPatch({ is_active: false }, 'gizlendi')}>Gizle</button>
            <button type="button" className="btn ghost sm" onClick={() => bulkPatch({ is_featured: true }, 'öne çıkarıldı')}>⭐ Öne çıkar</button>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) bulkPatch({ category: e.target.value === '__clear' ? null : e.target.value }, 'kategori güncellendi');
              }}
              aria-label="Kategori ata"
            >
              <option value="">Kategori ata…</option>
              {allCategoryOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
              <option value="__clear">— Kategoriyi kaldır —</option>
            </select>
            <button type="button" className="btn ghost sm danger-txt" onClick={askBulkDelete}>🗑️ Sil</button>
          </div>
          <button type="button" className="btn ghost sm" onClick={() => setSelected(new Set())}>Seçimi temizle</button>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="ad-listhead">
          <label className="mx-check inline">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={() =>
                setSelected((s) => {
                  const n = new Set(s);
                  if (allVisibleSelected) filtered.forEach((p) => n.delete(p.id));
                  else filtered.forEach((p) => n.add(p.id));
                  return n;
                })
              }
            />
            <span>Görünenleri seç</span>
          </label>
          <span className="muted small">
            {filtered.length} fotoğraf{canReorder ? ' · sürükleyerek sıralayabilirsiniz' : ' · sıralamak için filtreleri kaldırıp "Manuel" seçin'}
          </span>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="ad-empty">
          <div>🖼️</div>
          <h3>{photos.length === 0 ? 'Galeride henüz fotoğraf yok' : 'Bu filtreye uygun fotoğraf yok'}</h3>
          <p className="muted">{photos.length === 0 ? 'İlk fotoğraflarınızı ekleyerek başlayın.' : 'Filtreleri temizlemeyi deneyin.'}</p>
          <div className="prow" style={{ justifyContent: 'center' }}>
            {photos.length > 0 && (
              <button type="button" className="btn ghost" onClick={() => { setSearch(''); setStatus('all'); setCatFilter('all'); }}>
                Filtreleri temizle
              </button>
            )}
            <button type="button" className="btn gold" onClick={() => fileRef.current?.click()}>+ Fotoğraf Ekle</button>
          </div>
        </div>
      ) : view === 'grid' ? (
        <div className="gx-grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${gridMin}px, 1fr))` }}>
          {filtered.map(renderCard)}
        </div>
      ) : (
        <div className="mx-rows">{filtered.map(renderRow)}</div>
      )}

      {/* Gizli dosya girdileri */}
      <input
        ref={fileRef}
        type="file"
        hidden
        multiple
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input ref={replaceRef} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={onReplacePicked} />

      {/* Yükleme kuyruğu */}
      <Modal open={queue.length > 0} onClose={() => !qUploading && clearQueue()} size="xl" className="gx-queue">
        <div className="pe-head">
          <div>
            <h2>📤 Yüklenecek Fotoğraflar ({queue.length})</h2>
            <p className="muted small">Başlıkları düzenleyin; ✂️ ile tek tek kırpabilirsiniz. Dokunulmayanlar seçilen orana göre otomatik ortadan kırpılır.</p>
          </div>
          <button type="button" className="icon-circle" onClick={clearQueue} disabled={qUploading} aria-label="Kapat">✕</button>
        </div>

        <div className="gx-qopts">
          <label className="fld">
            Otomatik kırpma oranı
            <select value={qRatio} onChange={(e) => setQRatio(e.target.value as AspectKey)} disabled={qUploading}>
              <option value="4:3">Klasik yatay (4:3)</option>
              <option value="1:1">Kare (1:1)</option>
              <option value="16:9">Geniş (16:9)</option>
              <option value="3:4">Dikey (3:4)</option>
              <option value="orig">Orijinal oranı koru</option>
            </select>
          </label>
          <label className="fld">
            Kategori
            <input list="gx-cat-list" value={qCategory} onChange={(e) => setQCategory(e.target.value)} placeholder="Örn: İç Mekan" disabled={qUploading} />
            <datalist id="gx-cat-list">
              {allCategoryOptions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <div className="fld">
            Yayın durumu
            <div className="gx-pub">
              <Switch checked={qPublish} onChange={() => setQPublish((v) => !v)} label="Hemen yayınla" disabled={qUploading} />
              <span>{qPublish ? 'Hemen yayınla' : 'Gizli olarak ekle'}</span>
            </div>
          </div>
        </div>

        <div className="gx-qlist">
          {queue.map((it) => (
            <div key={it.id} className="gx-qitem">
              <img src={it.editedPreview || it.preview} alt="" />
              <div className="gx-qbody">
                <input
                  value={it.title}
                  onChange={(e) => setQueue((q) => q.map((x) => (x.id === it.id ? { ...x, title: e.target.value } : x)))}
                  placeholder="Fotoğraf başlığı"
                  aria-label="Başlık"
                  disabled={qUploading}
                />
                <small className="muted">
                  {it.info ? `✂️ Düzenlendi · ${it.info.width}×${it.info.height} · ${formatBytes(it.info.size)}` : `Orijinal ${formatBytes(it.file.size)} · otomatik kırpılacak`}
                </small>
              </div>
              <div className="gx-qbtns">
                <button type="button" className="btn ghost sm" onClick={() => setQStudioId(it.id)} disabled={qUploading}>✂️ Düzenle</button>
                <button
                  type="button"
                  className="btn ghost sm danger-txt"
                  onClick={() => {
                    URL.revokeObjectURL(it.preview);
                    setQueue((q) => q.filter((x) => x.id !== it.id));
                  }}
                  disabled={qUploading}
                  aria-label="Kuyruktan çıkar"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>

        {qUploading && (
          <div className="gx-progress" role="progressbar" aria-valuenow={qProgress} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ width: `${qProgress}%` }} />
            <span>%{qProgress}</span>
          </div>
        )}

        <div className="pe-foot">
          <div className="pe-foot-left">
            <button type="button" className="btn ghost sm" onClick={() => fileRef.current?.click()} disabled={qUploading}>+ Daha fazla ekle</button>
          </div>
          <div className="pe-foot-right">
            <button type="button" className="btn ghost" onClick={clearQueue} disabled={qUploading}>Vazgeç</button>
            <button type="button" className="btn gold" onClick={startUpload} disabled={qUploading || queue.some((i) => !i.title.trim() && false)}>
              {qUploading ? 'Yükleniyor…' : `${queue.length} fotoğrafı yükle`}
            </button>
          </div>
        </div>
      </Modal>

      <ImageStudio
        open={!!queueStudioItem}
        source={queueStudioItem ? { file: queueStudioItem.file } : null}
        title={queueStudioItem?.title || 'Fotoğraf'}
        defaultAspect={qRatio}
        defaultMaxWidth={1600}
        saveLabel="Uygula"
        onClose={() => setQStudioId(null)}
        onSave={onQueueStudioSave}
      />

      {/* Bilgi düzenleme */}
      <Modal open={!!editing} onClose={() => !savingMeta && setEditing(null)} size="wide">
        {editing && (
          <form onSubmit={saveMeta}>
            <div className="pe-head">
              <div>
                <h2>✏️ Fotoğrafı Düzenle</h2>
                <p className="muted small">Eklenme: {new Date(editing.created_at).toLocaleString('tr-TR')}</p>
              </div>
              <button type="button" className="icon-circle" onClick={() => setEditing(null)} aria-label="Kapat">✕</button>
            </div>

            <div className="gx-edit">
              <div className="gx-edit-img">
                <button type="button" onClick={() => openLightbox(editing)} title="Büyüt">
                  <img src={galleryImageUrl(editing.image_path)} alt={editing.title} />
                  <span className="pe-zoom">🔍 Büyüt</span>
                </button>
                <div className="gx-edit-btns">
                  <button type="button" className="btn ghost sm" onClick={() => setStudio({ photo: editing, source: { url: galleryImageUrl(editing.image_path) } })}>✂️ Düzenle / Kırp</button>
                  <button type="button" className="btn ghost sm" onClick={() => pickReplace(editing)}>📷 Görseli değiştir</button>
                  <button type="button" className="btn ghost sm" onClick={() => { duplicate(editing); setEditing(null); }}>📄 Çoğalt</button>
                </div>
              </div>

              <div className="gx-edit-form">
                <label className="fld">
                  Başlık
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Örn: İç mekan oturma alanı" />
                </label>
                <label className="fld">
                  Açıklama <span className="muted small">(isteğe bağlı, galeride görünür)</span>
                  <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={300} />
                </label>
                <label className="fld">
                  Kategori
                  <input list="gx-cat-list-2" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Seçin veya yeni yazın" />
                  <datalist id="gx-cat-list-2">
                    {allCategoryOptions.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </label>
                <div className="pe-toggles">
                  <div>
                    <div><b>Yayında</b><small>Kapalıysa ziyaretçiler görmez</small></div>
                    <Switch checked={form.is_active} onChange={() => setForm({ ...form, is_active: !form.is_active })} label="Yayında" />
                  </div>
                  <div>
                    <div><b>⭐ Öne çıkan</b><small>Galeride yıldızla işaretlenir ve filtrelenebilir</small></div>
                    <Switch checked={form.is_featured} onChange={() => setForm({ ...form, is_featured: !form.is_featured })} label="Öne çıkan" />
                  </div>
                </div>
              </div>
            </div>

            <div className="pe-foot">
              <div className="pe-foot-left">
                <button type="button" className="btn ghost sm danger-txt" onClick={() => askDelete(editing)} disabled={savingMeta}>🗑️ Fotoğrafı sil</button>
              </div>
              <div className="pe-foot-right">
                <button type="button" className="btn ghost" onClick={() => setEditing(null)} disabled={savingMeta}>Vazgeç</button>
                <button type="submit" className="btn gold" disabled={savingMeta}>{savingMeta ? 'Kaydediliyor…' : 'Kaydet'}</button>
              </div>
            </div>
          </form>
        )}
      </Modal>

      {/* Mevcut görseli düzenleme / değiştirme */}
      <ImageStudio
        open={!!studio}
        source={studio?.source || null}
        title={studio?.photo.title || 'Galeri fotoğrafı'}
        defaultAspect="4:3"
        defaultMaxWidth={1600}
        saveLabel="Fotoğrafı Kaydet"
        onClose={() => setStudio(null)}
        onSave={saveStudio}
      />

      <Lightbox
        open={!!lightbox}
        items={lbPhotos.map((p) => ({
          url: galleryImageUrl(p.image_path),
          title: p.title || 'Başlıksız fotoğraf',
          subtitle: [p.category, p.description].filter(Boolean).join(' · '),
          filename: `${(p.title || 'galeri').replace(/\s+/g, '-')}.webp`,
        }))}
        index={lightbox?.index || 0}
        onIndexChange={(i) => setLightbox((l) => (l ? { ...l, index: i } : l))}
        onClose={() => setLightbox(null)}
        badge={lbCurrent ? <span className={`lb-badge${lbCurrent.is_active ? ' on' : ''}`}>{lbCurrent.is_active ? 'Yayında' : 'Gizli'}{lbCurrent.is_featured ? ' · ⭐' : ''}</span> : null}
        actions={[
          { label: 'Düzenle / Kırp', icon: '✂️', primary: true, onClick: (i) => { const p = lbPhotos[i]; setLightbox(null); if (p) setStudio({ photo: p, source: { url: galleryImageUrl(p.image_path) } }); } },
          { label: 'Bilgiler', icon: '✏️', onClick: (i) => { const p = lbPhotos[i]; setLightbox(null); if (p) openEdit(p); } },
          { label: 'Öne çıkar', icon: '⭐', onClick: (i) => { const p = lbPhotos[i]; if (p) toggleFeatured(p); } },
          { label: 'Yayın', icon: '👁', onClick: (i) => { const p = lbPhotos[i]; if (p) toggleActive(p); } },
          { label: 'Sil', icon: '🗑️', danger: true, onClick: (i) => { const p = lbPhotos[i]; setLightbox(null); if (p) askDelete(p); } },
        ]}
      />

      <ConfirmationModal
        open={!!confirm}
        onClose={() => !confirmBusy && setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return;
          setConfirmBusy(true);
          try {
            await confirm.run();
            setConfirm(null);
          } catch (err: any) {
            toast.error(err?.message || 'İşlem başarısız');
          } finally {
            setConfirmBusy(false);
          }
        }}
        title={confirm?.title || ''}
        message={confirm?.message || ''}
        confirmLabel={confirm?.label}
        loading={confirmBusy}
      >
        {confirm?.body}
      </ConfirmationModal>
    </>
  );
}
