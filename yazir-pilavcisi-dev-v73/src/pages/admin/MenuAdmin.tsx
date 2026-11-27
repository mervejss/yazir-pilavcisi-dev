import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';
import { useAdminMenu, type AdminProduct } from '@/hooks/useAdminMenu';
import { supabase } from '@/lib/supabase';
import { tl } from '@/lib/helpers';
import { randId, slugify } from '@/lib/imageTools';
import { PRODUCT_BUCKET, copyInBucket, productImageUrl, removeFromBucket, uploadToBucket } from '@/lib/menuImages';
import Switch from '@/components/ui/Switch';
import Modal from '@/components/ui/Modal';
import ProductImage from '@/components/ui/ProductImage';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import ImageStudio, { type StudioResult } from '@/components/ui/ImageStudio';
import Lightbox from '@/components/ui/Lightbox';
import ProductEditor from '@/components/admin/ProductEditor';
import CategoryManagerModal from '@/components/admin/CategoryManagerModal';

type StatusFilter = 'all' | 'on' | 'out' | 'hidden' | 'nophoto' | 'daily';
type SortKey = 'manual' | 'name' | 'price_asc' | 'price_desc' | 'newest';
type ViewMode = 'grid' | 'list';

interface ConfirmState {
  title: string;
  message: string;
  label: string;
  variant?: 'danger' | 'warning' | 'info';
  body?: ReactNode;
  run: () => Promise<void>;
}

const STATUS_LABEL: Record<StatusFilter, string> = {
  all: 'Tümü',
  on: 'Satışta',
  out: 'Tükendi',
  hidden: 'Gizli',
  nophoto: 'Fotoğrafsız',
  daily: 'Günlük menü',
};

const minPrice = (p: AdminProduct) => {
  const act = p.variants.filter((v) => v.is_active);
  const list = act.length ? act : p.variants;
  return list.length ? Math.min(...list.map((v) => Number(v.price))) : 0;
};

export default function MenuAdmin() {
  const { products, categories, loading, refetch } = useAdminMenu();

  // Filtre / görünüm
  const [catTab, setCatTab] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortKey>('manual');
  const [view, setView] = useState<ViewMode>(() => {
    try {
      return (localStorage.getItem('menuAdminView') as ViewMode) || 'grid';
    } catch {
      return 'grid';
    }
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Pencereler
  const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; product: AdminProduct | null } | null>(null);
  const [catModal, setCatModal] = useState(false);
  const [qrModal, setQrModal] = useState(false);
  const [qrTarget, setQrTarget] = useState<'menu' | 'linktree'>('menu');
  const [priceModal, setPriceModal] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [openAfter, setOpenAfter] = useState<string | null>(null);

  // Fotoğraf işlemleri (kart üzerinden)
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<AdminProduct | null>(null);
  const [studio, setStudio] = useState<{ product: AdminProduct; source: { file?: Blob | null; url?: string | null } } | null>(null);
  const [lightbox, setLightbox] = useState<{ ids: string[]; index: number } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('menuAdminView', view);
    } catch {
      /* yoksay */
    }
  }, [view]);

  // Çoğaltma sonrası yeni ürünün düzenleme penceresini aç
  useEffect(() => {
    if (!openAfter) return;
    const p = products.find((x) => x.id === openAfter);
    if (p) {
      setEditor({ mode: 'edit', product: p });
      setOpenAfter(null);
    }
  }, [openAfter, products]);

  /* ------------------------------------------------------------------ */
  /* Türetilmiş veriler                                                  */
  /* ------------------------------------------------------------------ */
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    products.forEach((p) => (m[p.category_id] = (m[p.category_id] || 0) + 1));
    return m;
  }, [products]);

  const stats = useMemo(() => {
    const onSale = products.filter((p) => p.is_active && !p.is_sold_out).length;
    const out = products.filter((p) => p.is_sold_out).length;
    const hidden = products.filter((p) => !p.is_active).length;
    const noPhoto = products.filter((p) => !p.image_path).length;
    const avg = products.length ? products.reduce((s, p) => s + minPrice(p), 0) / products.length : 0;
    return { total: products.length, onSale, out, hidden, noPhoto, cats: categories.length, avg };
  }, [products, categories]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr');
    let list = products.filter((p) => {
      if (catTab !== 'all' && p.category_id !== catTab) return false;
      if (q && !(`${p.name} ${p.description} ${p.categoryName}`.toLocaleLowerCase('tr').includes(q))) return false;
      switch (status) {
        case 'on':
          return p.is_active && !p.is_sold_out;
        case 'out':
          return p.is_sold_out;
        case 'hidden':
          return !p.is_active;
        case 'nophoto':
          return !p.image_path;
        case 'daily':
          return p.is_daily;
        default:
          return true;
      }
    });
    const catOrder = new Map(categories.map((c) => [c.id, c.sort_order]));
    list = [...list].sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name, 'tr');
        case 'price_asc':
          return minPrice(a) - minPrice(b);
        case 'price_desc':
          return minPrice(b) - minPrice(a);
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        default:
          return (catOrder.get(a.category_id) ?? 0) - (catOrder.get(b.category_id) ?? 0) || a.sort_order - b.sort_order;
      }
    });
    return list;
  }, [products, categories, catTab, search, status, sort]);

  // "Tümü + manuel sıra + arama yok" iken kategori başlıklarıyla grupla
  const grouped = catTab === 'all' && sort === 'manual' && !search.trim() && status === 'all';
  const groups = useMemo(() => {
    if (!grouped) return [{ id: 'flat', name: '', items: filtered }];
    return [...categories]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((c) => ({ id: c.id, name: c.name, items: filtered.filter((p) => p.category_id === c.id) }))
        .filter((g) => g.items.length > 0);
  }, [grouped, filtered, categories]);

  const selectedProducts = products.filter((p) => selected.has(p.id));
  const allVisibleSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));

  const toggleSelect = (id: string) =>
      setSelected((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      });

  /* ------------------------------------------------------------------ */
  /* Tek ürün işlemleri                                                  */
  /* ------------------------------------------------------------------ */
  const fail = (err: any, fallback: string) => toast.error(err?.message || fallback);

  const toggleSoldOut = async (p: AdminProduct) => {
    const { error } = await supabase.from('products').update({ is_sold_out: !p.is_sold_out }).eq('id', p.id);
    if (error) return fail(error, 'Güncellenemedi');
    toast.success(!p.is_sold_out ? `${p.name} tükendi olarak işaretlendi` : `${p.name} yeniden satışta`);
    refetch();
  };

  const toggleActive = async (p: AdminProduct) => {
    const { error } = await supabase.from('products').update({ is_active: !p.is_active }).eq('id', p.id);
    if (error) return fail(error, 'Güncellenemedi');
    toast.success(!p.is_active ? `${p.name} menüde yayında` : `${p.name} menüden gizlendi`);
    refetch();
  };

  const updatePrice = async (variantId: string, current: number, raw: string) => {
    const val = Number(raw);
    if (raw === '' || Number.isNaN(val) || val < 0 || val === current) return;
    const { error } = await supabase.from('product_variants').update({ price: val }).eq('id', variantId);
    if (error) return fail(error, 'Fiyat güncellenemedi');
    toast.success('Fiyat güncellendi');
    refetch();
  };

  const moveOrder = async (p: AdminProduct, dir: -1 | 1) => {
    const list = products.filter((x) => x.category_id === p.category_id).sort((a, b) => a.sort_order - b.sort_order);
    const i = list.findIndex((x) => x.id === p.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    try {
      await Promise.all(
          list.map((x, idx) => (x.sort_order !== idx + 1 ? supabase.from('products').update({ sort_order: idx + 1 }).eq('id', x.id) : null)),
      );
      refetch();
    } catch (err) {
      fail(err, 'Sıralama değiştirilemedi');
    }
  };

  const duplicateProduct = async (p: AdminProduct) => {
    const t = toast.loading('Ürün çoğaltılıyor…');
    try {
      const slug = `${slugify(p.name) || 'urun'}-kopya-${randId(4)}`;
      const inCat = products.filter((x) => x.category_id === p.category_id);
      const { data, error } = await supabase
          .from('products')
          .insert({
            name: `${p.name} (Kopya)`,
            slug,
            category_id: p.category_id,
            description: p.description,
            emoji: p.emoji,
            kcal: p.kcal,
            protein_g: p.protein_g,
            carb_g: p.carb_g,
            is_daily: p.is_daily,
            is_active: false,
            is_sold_out: false,
            sort_order: inCat.length ? Math.max(...inCat.map((x) => x.sort_order)) + 1 : 1,
          })
          .select('id')
          .single();
      if (error) throw error;
      const newId = (data as any).id as string;

      if (p.variants.length) {
        const { error: vErr } = await supabase.from('product_variants').insert(
            p.variants.map((v, i) => ({ product_id: newId, name: v.name, price: v.price, is_active: v.is_active, sort_order: i + 1 })),
        );
        if (vErr) throw vErr;
      }
      if (p.image_path && !p.image_path.startsWith('http')) {
        const ext = p.image_path.split('.').pop() || 'webp';
        const newPath = await copyInBucket(PRODUCT_BUCKET, p.image_path, `${slug}/${Date.now()}.${ext}`);
        if (newPath) await supabase.from('products').update({ image_path: newPath }).eq('id', newId);
      }
      toast.success('Ürün çoğaltıldı (gizli olarak) — bilgileri düzenleyip yayınlayın', { id: t });
      setEditor(null);
      await refetch();
      setOpenAfter(newId);
    } catch (err) {
      toast.dismiss(t);
      fail(err, 'Çoğaltılamadı');
    }
  };

  const askDeleteProduct = (p: AdminProduct) => {
    setConfirm({
      title: 'Ürünü sil',
      message: `"${p.name}" ürününü ve tüm porsiyon/fiyatlarını kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`,
      label: 'Evet, ürünü sil',
      body: (
          <div className="mx-del-body">
            <ProductImage imagePath={p.image_path} emoji={p.emoji} name={p.name} size="md" />
            <div>
              <b>{p.name}</b>
              <small>{p.categoryName} · {tl(minPrice(p))}</small>
              {p.is_active && (
                  <button
                      type="button"
                      className="btn ghost sm"
                      style={{ marginTop: '0.4rem' }}
                      onClick={async () => {
                        setConfirm(null);
                        if (p.is_active) await toggleActive(p);
                      }}
                  >
                    Silmek yerine menüden gizle
                  </button>
              )}
            </div>
          </div>
      ),
      run: async () => {
        await removeFromBucket(PRODUCT_BUCKET, p.image_path);
        const { error } = await supabase.from('products').delete().eq('id', p.id);
        if (error) throw error;
        toast.success('Ürün silindi');
        setEditor(null);
        setSelected((s) => {
          const n = new Set(s);
          n.delete(p.id);
          return n;
        });
        refetch();
      },
    });
  };

  /* ------------------------------------------------------------------ */
  /* Fotoğraf işlemleri                                                  */
  /* ------------------------------------------------------------------ */
  const pickPhotoFor = (p: AdminProduct) => {
    uploadTarget.current = p;
    fileRef.current?.click();
  };

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    const p = uploadTarget.current;
    if (!f || !p) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return toast.error('Yalnızca JPG, PNG veya WebP yükleyebilirsiniz');
    setStudio({ product: p, source: { file: f } });
  };

  const saveStudio = async (blob: Blob, info: StudioResult) => {
    if (!studio) return;
    const p = studio.product;
    const path = `${p.slug}/${Date.now()}.${info.ext === 'jpeg' ? 'jpg' : 'webp'}`;
    await uploadToBucket(PRODUCT_BUCKET, path, blob, info.contentType);
    const { error } = await supabase.from('products').update({ image_path: path }).eq('id', p.id);
    if (error) throw error;
    await removeFromBucket(PRODUCT_BUCKET, p.image_path);
    toast.success(`"${p.name}" fotoğrafı güncellendi`);
    setStudio(null);
    refetch();
  };

  const askRemovePhoto = (p: AdminProduct) => {
    setConfirm({
      title: 'Fotoğrafı kaldır',
      message: `"${p.name}" ürününün fotoğrafı silinecek; yerine emoji gösterilecek.`,
      label: 'Evet, kaldır',
      body: (
          <div className="mx-del-body">
            <ProductImage imagePath={p.image_path} emoji={p.emoji} name={p.name} size="lg" />
          </div>
      ),
      run: async () => {
        const { error } = await supabase.from('products').update({ image_path: null }).eq('id', p.id);
        if (error) throw error;
        await removeFromBucket(PRODUCT_BUCKET, p.image_path);
        toast.success('Fotoğraf kaldırıldı');
        refetch();
      },
    });
  };

  const openLightbox = (p: AdminProduct) => {
    const withImg = filtered.filter((x) => x.image_path);
    const idx = withImg.findIndex((x) => x.id === p.id);
    if (idx < 0) return pickPhotoFor(p);
    setLightbox({ ids: withImg.map((x) => x.id), index: idx });
  };

  const lbProducts = lightbox ? lightbox.ids.map((id) => products.find((p) => p.id === id)).filter(Boolean) as AdminProduct[] : [];

  /* ------------------------------------------------------------------ */
  /* Toplu işlemler                                                      */
  /* ------------------------------------------------------------------ */
  const bulkUpdate = async (patch: Record<string, any>, okMsg: string) => {
    const ids = [...selected];
    const { error } = await supabase.from('products').update(patch).in('id', ids);
    if (error) return fail(error, 'Güncellenemedi');
    toast.success(`${ids.length} ürün: ${okMsg}`);
    refetch();
  };

  const bulkMoveCategory = async (categoryId: string) => {
    if (!categoryId) return;
    const ids = [...selected];
    const inCat = products.filter((x) => x.category_id === categoryId);
    let next = inCat.length ? Math.max(...inCat.map((x) => x.sort_order)) + 1 : 1;
    try {
      for (const id of ids) {
        const { error } = await supabase.from('products').update({ category_id: categoryId, sort_order: next++ }).eq('id', id);
        if (error) throw error;
      }
      toast.success(`${ids.length} ürün taşındı`);
      refetch();
    } catch (err) {
      fail(err, 'Taşınamadı');
    }
  };

  const askBulkDelete = () => {
    const list = selectedProducts;
    setConfirm({
      title: `${list.length} ürünü sil`,
      message: 'Seçili ürünler ve porsiyonları kalıcı olarak silinecek. Bu işlem geri alınamaz.',
      label: `Evet, ${list.length} ürünü sil`,
      body: (
          <ul className="mx-del-list">
            {list.slice(0, 8).map((p) => (
                <li key={p.id}>{p.emoji || '🍽️'} {p.name}</li>
            ))}
            {list.length > 8 && <li>… ve {list.length - 8} ürün daha</li>}
          </ul>
      ),
      run: async () => {
        for (const p of list) await removeFromBucket(PRODUCT_BUCKET, p.image_path);
        const { error } = await supabase.from('products').delete().in('id', list.map((p) => p.id));
        if (error) throw error;
        toast.success(`${list.length} ürün silindi`);
        setSelected(new Set());
        refetch();
      },
    });
  };

  /* ------------------------------------------------------------------ */
  /* Toplu fiyat güncelleme                                              */
  /* ------------------------------------------------------------------ */
  const [pricePct, setPricePct] = useState<number | string>(10);
  const [priceRound, setPriceRound] = useState<number>(1);
  const [priceScope, setPriceScope] = useState<'selected' | 'filtered' | 'all'>('filtered');
  const [priceBusy, setPriceBusy] = useState(false);

  const priceTargets =
      priceScope === 'selected' ? selectedProducts : priceScope === 'filtered' ? filtered : products;

  const newPrice = (old: number) => {
    const raw = old * (1 + Number(pricePct || 0) / 100);
    return Math.max(0, Math.round(raw / priceRound) * priceRound);
  };

  const applyPriceChange = async () => {
    const vars = priceTargets.flatMap((p) => p.variants);
    if (!vars.length) return;
    setPriceBusy(true);
    try {
      for (const v of vars) {
        const np = newPrice(Number(v.price));
        if (np !== Number(v.price)) {
          const { error } = await supabase.from('product_variants').update({ price: np }).eq('id', v.id);
          if (error) throw error;
        }
      }
      toast.success(`${vars.length} fiyat güncellendi`);
      setPriceModal(false);
      refetch();
    } catch (err) {
      fail(err, 'Fiyatlar güncellenemedi');
    } finally {
      setPriceBusy(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /* CSV dışa aktarım                                                    */
  /* ------------------------------------------------------------------ */
  const exportCsv = () => {
    const esc = (s: any) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const rows = [['Kategori', 'Ürün', 'Açıklama', 'Porsiyon', 'Fiyat (₺)', 'Kcal', 'Protein (g)', 'Karbonhidrat (g)', 'Durum']];
    filtered.forEach((p) => {
      const durum = !p.is_active ? 'Gizli' : p.is_sold_out ? 'Tükendi' : 'Satışta';
      (p.variants.length ? p.variants : [{ name: '', price: '' } as any]).forEach((v: any) =>
          rows.push([p.categoryName, p.name, p.description, v.name, v.price, p.kcal, p.protein_g, p.carb_g, durum]),
      );
    });
    const csv = '\ufeff' + rows.map((r) => r.map(esc).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `menu-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    toast.success('Menü CSV olarak indirildi');
  };

  /* ------------------------------------------------------------------ */
  /* QR                                                                  */
  /* ------------------------------------------------------------------ */
  const targetUrl = qrTarget === 'linktree' ? 'https://linktr.ee/yazirpilavcisi' : window.location.origin + '/menu';
  const [qrPng, setQrPng] = useState('');
  useEffect(() => {
    if (!qrModal) return;
    setQrPng('');
    QRCode.toDataURL(targetUrl, { width: 640, margin: 2 }, (err, url) => {
      if (!err && url) setQrPng(url);
    });
  }, [qrModal, targetUrl]);

  const downloadQrSvg = () => {
    QRCode.toString(targetUrl, { type: 'svg', margin: 2 }, (err, svg) => {
      if (err || !svg) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      a.download = qrTarget === 'linktree' ? 'linktree-qr.svg' : 'menu-qr.svg';
      a.click();
    });
  };

  /* ------------------------------------------------------------------ */
  /* Görünüm parçaları                                                   */
  /* ------------------------------------------------------------------ */
  const StatusBadges = ({ p }: { p: AdminProduct }) => (
      <>
        {!p.is_active && <span className="mx-badge hid">Gizli</span>}
        {p.is_active && p.is_sold_out && <span className="mx-badge out">Tükendi</span>}
        {p.is_daily && <span className="mx-badge daily">Günlük</span>}
      </>
  );

  const PriceInputs = ({ p }: { p: AdminProduct }) => (
      <div className="mx-prices">
        {p.variants.map((v) => (
            <label key={v.id} className={`mx-price${v.is_active ? '' : ' off'}`} title={v.is_active ? v.name : `${v.name} (pasif)`}>
              <span>{v.name}</span>
              <input
                  key={`${v.id}-${v.price}`}
                  type="number"
                  min={0}
                  step="0.5"
                  defaultValue={v.price}
                  onBlur={(e) => updatePrice(v.id, Number(v.price), e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
              <i>₺</i>
            </label>
        ))}
        {p.variants.length === 0 && <small className="muted">Porsiyon yok — Düzenle'den ekleyin</small>}
      </div>
  );

  const OrderBox = ({ p }: { p: AdminProduct }) => (
      <div className="mx-order" title={sort === 'manual' ? 'Kategori içi sıralama' : 'Sıralamak için "Sıralama: Manuel" seçin'}>
        <button type="button" onClick={() => moveOrder(p, -1)} disabled={sort !== 'manual'} aria-label="Yukarı taşı">
          ▲
        </button>
        <b>{p.sort_order}</b>
        <button type="button" onClick={() => moveOrder(p, 1)} disabled={sort !== 'manual'} aria-label="Aşağı taşı">
          ▼
        </button>
      </div>
  );

  const renderCard = (p: AdminProduct) => {
    const sel = selected.has(p.id);
    return (
        <article key={p.id} className={`mx-card${p.is_sold_out ? ' out' : ''}${!p.is_active ? ' hidden' : ''}${sel ? ' sel' : ''}`}>
          <div className="mx-media">
            <button type="button" className="mx-img" onClick={() => openLightbox(p)} aria-label={`${p.name} fotoğrafını incele`}>
              <ProductImage imagePath={p.image_path} emoji={p.emoji} name={p.name} />
              <span className="mx-zoom">{p.image_path ? '🔍 İncele' : '📷 Fotoğraf ekle'}</span>
            </button>
            <label className="mx-check" title="Seç">
              <input type="checkbox" checked={sel} onChange={() => toggleSelect(p.id)} />
            </label>
            <div className="mx-badges">
              {StatusBadges({ p })}
            </div>
            <div className="mx-photo-actions">
              <button type="button" onClick={() => pickPhotoFor(p)} title="Fotoğraf yükle / değiştir" aria-label="Fotoğraf yükle">
                📷
              </button>
              {p.image_path && (
                  <>
                    <button type="button" onClick={() => setStudio({ product: p, source: { url: productImageUrl(p.image_path) } })} title="Düzenle / kırp / boyutlandır" aria-label="Fotoğrafı düzenle">
                      ✂️
                    </button>
                    <button type="button" className="danger" onClick={() => askRemovePhoto(p)} title="Fotoğrafı kaldır" aria-label="Fotoğrafı kaldır">
                      ✕
                    </button>
                  </>
              )}
            </div>
          </div>

          <div className="mx-body">
            <div className="mx-cat">{p.categoryName}</div>
            <h3 title={p.name}>{p.name}</h3>
            <p className="mx-desc">{p.description || <em>Açıklama yok</em>}</p>
            <div className="mx-macros">
              <span>🔥 {p.kcal} kcal</span>
              <span>💪 {p.protein_g} g</span>
              <span>🌾 {p.carb_g} g</span>
            </div>
            {PriceInputs({ p })}
            <div className="mx-switches">
              <div>
                <span>Satışta</span>
                <Switch checked={!p.is_sold_out} onChange={() => toggleSoldOut(p)} label={p.is_sold_out ? 'Tükendi' : 'Satışta'} />
              </div>
              <div>
                <span>Yayında</span>
                <Switch checked={p.is_active} onChange={() => toggleActive(p)} label={p.is_active ? 'Yayında' : 'Gizli'} />
              </div>
            </div>
          </div>

          <div className="mx-foot">
            {OrderBox({ p })}
            <button type="button" className="btn ghost sm" onClick={() => setEditor({ mode: 'edit', product: p })}>
              ✏️ Düzenle
            </button>
            <button type="button" className="btn ghost sm" onClick={() => duplicateProduct(p)} title="Ürünü çoğalt">
              📄 Çoğalt
            </button>
            <button type="button" className="btn ghost sm danger-txt" onClick={() => askDeleteProduct(p)} title="Ürünü sil" aria-label="Ürünü sil">
              🗑️
            </button>
          </div>
        </article>
    );
  };

  const renderRow = (p: AdminProduct) => {
    const sel = selected.has(p.id);
    return (
        <div key={p.id} className={`mx-row${p.is_sold_out ? ' out' : ''}${!p.is_active ? ' hidden' : ''}${sel ? ' sel' : ''}`}>
          <label className="mx-check inline">
            <input type="checkbox" checked={sel} onChange={() => toggleSelect(p.id)} />
          </label>
          {OrderBox({ p })}
          <button type="button" className="mx-thumb" onClick={() => openLightbox(p)} aria-label="Fotoğrafı incele">
            <ProductImage imagePath={p.image_path} emoji={p.emoji} name={p.name} />
          </button>
          <div className="mx-info">
            <div className="mx-info-top">
              <b>{p.name}</b>
              {StatusBadges({ p })}
            </div>
            <small className="muted">{p.categoryName} · 🔥 {p.kcal} kcal · 💪 {p.protein_g} g · 🌾 {p.carb_g} g</small>
            {p.description && <small className="mx-rowdesc">{p.description}</small>}
          </div>
          {PriceInputs({ p })}
          <div className="mx-row-sw">
            <div>
              <small>Satışta</small>
              <Switch checked={!p.is_sold_out} onChange={() => toggleSoldOut(p)} label="Satışta" />
            </div>
            <div>
              <small>Yayında</small>
              <Switch checked={p.is_active} onChange={() => toggleActive(p)} label="Yayında" />
            </div>
          </div>
          <div className="mx-row-actions">
            <button type="button" className="btn ghost sm" onClick={() => setEditor({ mode: 'edit', product: p })}>
              ✏️ Düzenle
            </button>
            <button type="button" className="btn ghost sm" onClick={() => pickPhotoFor(p)} title="Fotoğraf yükle / değiştir">
              📷
            </button>
            <button type="button" className="btn ghost sm" onClick={() => duplicateProduct(p)} title="Çoğalt">
              📄
            </button>
            <button type="button" className="btn ghost sm danger-txt" onClick={() => askDeleteProduct(p)} title="Sil">
              🗑️
            </button>
          </div>
        </div>
    );
  };

  if (loading) return <p className="muted center">Menü yükleniyor...</p>;

  return (
      <>
        {/* Başlık + ana eylemler */}
        <div className="bar mx-bar">
          <div>
            <h1>Menü Yönetimi</h1>
            <p className="muted" style={{ margin: 0 }}>
              Ürünler, fotoğraflar, fiyatlar ve kategoriler — değişiklikler anında müşteri menüsüne yansır
            </p>
          </div>
          <div className="mx-bar-actions">
            <button type="button" className="btn ghost sm" onClick={() => { setQrTarget('linktree'); setQrModal(true); }}>
              🌳 LİNKTREE QR KOD
            </button>
            <button type="button" className="btn ghost sm" onClick={() => { setQrTarget('menu'); setQrModal(true); }}>
              🔳 QR KOD
            </button>
            <button type="button" className="btn ghost sm" onClick={exportCsv}>
              ⬇ CSV
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setPriceModal(true)}>
              % Toplu Fiyat
            </button>
            <button type="button" className="btn ghost sm" onClick={() => setCatModal(true)}>
              🗂️ Kategoriler
            </button>
            <button type="button" className="btn gold sm" onClick={() => setEditor({ mode: 'create', product: null })}>
              + Yeni Ürün
            </button>
          </div>
        </div>

        {/* İstatistik kartları */}
        <div className="ad-stats">
          <button type="button" className={`ad-stat${status === 'all' ? ' on' : ''}`} onClick={() => setStatus('all')}>
            <small>Toplam ürün</small>
            <b>{stats.total}</b>
            <span>{stats.cats} kategori</span>
          </button>
          <button type="button" className={`ad-stat ok${status === 'on' ? ' on' : ''}`} onClick={() => setStatus('on')}>
            <small>Satışta</small>
            <b>{stats.onSale}</b>
            <span>müşteri sipariş verebilir</span>
          </button>
          <button type="button" className={`ad-stat warn${status === 'out' ? ' on' : ''}`} onClick={() => setStatus('out')}>
            <small>Tükendi</small>
            <b>{stats.out}</b>
            <span>görünür ama alınamaz</span>
          </button>
          <button type="button" className={`ad-stat mute${status === 'hidden' ? ' on' : ''}`} onClick={() => setStatus('hidden')}>
            <small>Gizli</small>
            <b>{stats.hidden}</b>
            <span>menüde görünmüyor</span>
          </button>
          <button type="button" className={`ad-stat bad${status === 'nophoto' ? ' on' : ''}`} onClick={() => setStatus('nophoto')}>
            <small>Fotoğrafsız</small>
            <b>{stats.noPhoto}</b>
            <span>emoji gösteriliyor</span>
          </button>
          <div className="ad-stat static">
            <small>Ort. fiyat</small>
            <b>{tl(stats.avg)}</b>
            <span>başlangıç fiyatları</span>
          </div>
        </div>

        {/* Araç çubuğu */}
        <div className="ad-toolbar">
          <div className="ad-search">
            <span aria-hidden="true">🔍</span>
            <input
                type="search"
                placeholder="Ürün, açıklama veya kategori ara…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Menüde ara"
            />
            {search && (
                <button type="button" onClick={() => setSearch('')} aria-label="Aramayı temizle">
                  ✕
                </button>
            )}
          </div>
          <label className="ad-select">
            <span>Durum</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
              {(Object.keys(STATUS_LABEL) as StatusFilter[]).map((k) => (
                  <option key={k} value={k}>
                    {STATUS_LABEL[k]}
                  </option>
              ))}
            </select>
          </label>
          <label className="ad-select">
            <span>Sıralama</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="manual">Manuel (kategori sırası)</option>
              <option value="name">Ada göre (A→Z)</option>
              <option value="price_asc">Fiyat (artan)</option>
              <option value="price_desc">Fiyat (azalan)</option>
              <option value="newest">En yeni eklenen</option>
            </select>
          </label>
          <div className="ad-viewtoggle" role="group" aria-label="Görünüm">
            <button type="button" className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')} title="Kart görünümü">
              ▦ Kartlar
            </button>
            <button type="button" className={view === 'list' ? 'on' : ''} onClick={() => setView('list')} title="Liste görünümü">
              ☰ Liste
            </button>
          </div>
        </div>

        {/* Kategori sekmeleri */}
        <div className="ad-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={catTab === 'all'} className={catTab === 'all' ? 'on' : ''} onClick={() => setCatTab('all')}>
            Tüm Ürünler <i>{products.length}</i>
          </button>
          {[...categories]
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((c) => (
                  <button
                      key={c.id}
                      type="button"
                      role="tab"
                      aria-selected={catTab === c.id}
                      className={`${catTab === c.id ? 'on' : ''}${c.is_active ? '' : ' off'}`}
                      onClick={() => setCatTab(c.id)}
                  >
                    {c.name} <i>{counts[c.id] || 0}</i>
                  </button>
              ))}
        </div>

        {/* Toplu işlem çubuğu */}
        {selected.size > 0 && (
            <div className="ad-bulk" role="region" aria-label="Toplu işlemler">
              <b>{selected.size} ürün seçildi</b>
              <div className="ad-bulk-actions">
                <button type="button" className="btn ghost sm" onClick={() => bulkUpdate({ is_sold_out: false }, 'satışa açıldı')}>
                  Satışa aç
                </button>
                <button type="button" className="btn ghost sm" onClick={() => bulkUpdate({ is_sold_out: true }, 'tükendi yapıldı')}>
                  Tükendi yap
                </button>
                <button type="button" className="btn ghost sm" onClick={() => bulkUpdate({ is_active: true }, 'yayına alındı')}>
                  Yayınla
                </button>
                <button type="button" className="btn ghost sm" onClick={() => bulkUpdate({ is_active: false }, 'gizlendi')}>
                  Gizle
                </button>
                <select
                    value=""
                    onChange={(e) => bulkMoveCategory(e.target.value)}
                    aria-label="Kategoriye taşı"
                >
                  <option value="">Kategoriye taşı…</option>
                  {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                  ))}
                </select>
                <button type="button" className="btn ghost sm" onClick={() => { setPriceScope('selected'); setPriceModal(true); }}>
                  % Fiyat
                </button>
                <button type="button" className="btn ghost sm danger-txt" onClick={askBulkDelete}>
                  🗑️ Sil
                </button>
              </div>
              <button type="button" className="btn ghost sm" onClick={() => setSelected(new Set())}>
                Seçimi temizle
              </button>
            </div>
        )}

        {/* Liste */}
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
            {filtered.length} ürün gösteriliyor{filtered.length !== products.length ? ` (toplam ${products.length})` : ''}
          </span>
            </div>
        )}

        {filtered.length === 0 ? (
            <div className="ad-empty">
              <div>🍽️</div>
              <h3>Bu filtreye uygun ürün bulunamadı</h3>
              <p className="muted">Filtreleri temizleyin ya da yeni bir ürün ekleyin.</p>
              <div className="prow" style={{ justifyContent: 'center' }}>
                <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      setSearch('');
                      setStatus('all');
                      setCatTab('all');
                    }}
                >
                  Filtreleri temizle
                </button>
                <button type="button" className="btn gold" onClick={() => setEditor({ mode: 'create', product: null })}>
                  + Yeni Ürün
                </button>
              </div>
            </div>
        ) : (
            groups.map((g) => (
                <section key={g.id} className="mx-group">
                  {grouped && (
                      <h2 className="mx-group-h">
                        {g.name} <i>{g.items.length}</i>
                      </h2>
                  )}
                  {view === 'grid' ? <div className="mx-grid">{g.items.map(renderCard)}</div> : <div className="mx-rows">{g.items.map(renderRow)}</div>}
                </section>
            ))
        )}

        {/* Gizli dosya seçici */}
        <input ref={fileRef} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={onFilePicked} />

        {/* Ürün ekle / düzenle */}
        <ProductEditor
            open={!!editor}
            mode={editor?.mode || 'create'}
            product={editor?.product || null}
            categories={categories}
            allProducts={products}
            defaultCategoryId={catTab !== 'all' ? catTab : undefined}
            onClose={() => setEditor(null)}
            onSaved={refetch}
            onDuplicate={duplicateProduct}
            onDelete={askDeleteProduct}
        />

        {/* Kategoriler */}
        <CategoryManagerModal open={catModal} onClose={() => setCatModal(false)} categories={categories} counts={counts} onChanged={refetch} />

        {/* Görsel stüdyosu (kart üzerinden) */}
        <ImageStudio
            open={!!studio}
            source={studio?.source || null}
            title={studio?.product.name || ''}
            defaultAspect="4:3"
            saveLabel="Fotoğrafı Kaydet"
            onClose={() => setStudio(null)}
            onSave={saveStudio}
        />

        {/* Tam ekran görüntüleyici */}
        <Lightbox
            open={!!lightbox}
            items={lbProducts.map((p) => ({
              url: productImageUrl(p.image_path) || '',
              title: p.name,
              subtitle: `${p.categoryName} · ${tl(minPrice(p))}`,
              filename: `${p.slug}.webp`,
            }))}
            index={lightbox?.index || 0}
            onIndexChange={(i) => setLightbox((l) => (l ? { ...l, index: i } : l))}
            onClose={() => setLightbox(null)}
            actions={[
              {
                label: 'Düzenle / Kırp',
                icon: '✂️',
                primary: true,
                onClick: (i) => {
                  const p = lbProducts[i];
                  setLightbox(null);
                  if (p) setStudio({ product: p, source: { url: productImageUrl(p.image_path) } });
                },
              },
              {
                label: 'Değiştir',
                icon: '📷',
                onClick: (i) => {
                  const p = lbProducts[i];
                  setLightbox(null);
                  if (p) pickPhotoFor(p);
                },
              },
              {
                label: 'Ürünü düzenle',
                icon: '✏️',
                onClick: (i) => {
                  const p = lbProducts[i];
                  setLightbox(null);
                  if (p) setEditor({ mode: 'edit', product: p });
                },
              },
              {
                label: 'Kaldır',
                icon: '🗑️',
                danger: true,
                onClick: (i) => {
                  const p = lbProducts[i];
                  setLightbox(null);
                  if (p) askRemovePhoto(p);
                },
              },
            ]}
        />

        {/* Silme / onay penceresi */}
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
            variant={confirm?.variant || 'danger'}
            loading={confirmBusy}
        >
          {confirm?.body}
        </ConfirmationModal>

        {/* Toplu fiyat güncelleme */}
        <Modal open={priceModal} onClose={() => !priceBusy && setPriceModal(false)} size="wide">
          <div className="pe-head">
            <div>
              <h2>% Toplu Fiyat Güncelle</h2>
              <p className="muted small">Seçtiğiniz ürünlerin tüm porsiyon fiyatlarını yüzde olarak artırın veya azaltın.</p>
            </div>
            <button type="button" className="icon-circle" onClick={() => setPriceModal(false)} aria-label="Kapat">
              ✕
            </button>
          </div>
          <div className="two-col">
            <label className="fld">
              Değişim oranı (%) — eksi değer indirim
              <input type="number" step="1" value={pricePct} onChange={(e) => setPricePct(e.target.value)} />
            </label>
            <label className="fld">
              Yuvarlama
              <select value={priceRound} onChange={(e) => setPriceRound(Number(e.target.value))}>
                <option value={0.5}>0,50 ₺'ye</option>
                <option value={1}>1 ₺'ye</option>
                <option value={5}>5 ₺'ye</option>
                <option value={10}>10 ₺'ye</option>
              </select>
            </label>
          </div>
          <div className="seg" style={{ margin: '0.4rem 0 1rem' }}>
            <button type="button" className={priceScope === 'filtered' ? 'on' : ''} onClick={() => setPriceScope('filtered')}>
              Görünen ürünler ({filtered.length})
            </button>
            <button
                type="button"
                className={priceScope === 'selected' ? 'on' : ''}
                onClick={() => setPriceScope('selected')}
                disabled={selected.size === 0}
            >
              Seçililer ({selected.size})
            </button>
            <button type="button" className={priceScope === 'all' ? 'on' : ''} onClick={() => setPriceScope('all')}>
              Tüm menü ({products.length})
            </button>
          </div>
          <div className="mx-preview">
            <h4>Önizleme</h4>
            {priceTargets.slice(0, 6).map((p) => (
                <div key={p.id}>
                  <b>{p.name}</b>
                  <span>
                {p.variants.map((v) => `${tl(Number(v.price))} → ${tl(newPrice(Number(v.price)))}`).join('  ·  ') || '—'}
              </span>
                </div>
            ))}
            {priceTargets.length > 6 && <small className="muted">… ve {priceTargets.length - 6} ürün daha</small>}
            {priceTargets.length === 0 && <small className="muted">Güncellenecek ürün yok.</small>}
          </div>
          <div className="pe-foot">
            <div />
            <div className="pe-foot-right">
              <button type="button" className="btn ghost" onClick={() => setPriceModal(false)} disabled={priceBusy}>
                Vazgeç
              </button>
              <button type="button" className="btn gold" onClick={applyPriceChange} disabled={priceBusy || priceTargets.length === 0}>
                {priceBusy ? 'Uygulanıyor…' : `Uygula (${priceTargets.reduce((s, p) => s + p.variants.length, 0)} fiyat)`}
              </button>
            </div>
          </div>
        </Modal>

        {/* QR modal */}
        <Modal open={qrModal} onClose={() => setQrModal(false)}>
          <div className="pe-head">
            <div>
              <h2>{qrTarget === 'linktree' ? '🌳 Linktree QR Kodu' : '🔳 Menü QR Kodu'}</h2>
              <p className="muted small">
                {qrTarget === 'linktree'
                    ? 'Müşteriler okuttuğunda doğrudan Linktree profil adresinize yönlendirilir.'
                    : 'Müşteriler okuttuğunda güncel menü, fotoğraf ve fiyatlarla açılır.'}
              </p>
            </div>
            <button type="button" className="icon-circle" onClick={() => setQrModal(false)} aria-label="Kapat">
              ✕
            </button>
          </div>
          <div className="mx-qr">
            {qrPng ? <img src={qrPng} alt={qrTarget === 'linktree' ? 'Linktree QR kodu' : 'Menü QR kodu'} /> : <div className="mx-qr-load">QR üretiliyor…</div>}
            <code>{targetUrl}</code>
          </div>
          <div className="mx-qr-actions">
            {qrPng && (
                <a className="btn gold sm" href={qrPng} download={qrTarget === 'linktree' ? 'linktree-qr.png' : 'menu-qr.png'}>
                  ⬇ PNG indir
                </a>
            )}
            <button type="button" className="btn ghost sm" onClick={downloadQrSvg}>
              ⬇ SVG indir
            </button>
            <button
                type="button"
                className="btn ghost sm"
                onClick={() => {
                  navigator.clipboard?.writeText(targetUrl);
                  toast.success('Bağlantı kopyalandı');
                }}
            >
              📋 Bağlantıyı kopyala
            </button>
            <a className="btn ghost sm" href={targetUrl} target="_blank" rel="noreferrer">
              {qrTarget === 'linktree' ? 'Linktree Aç ↗' : 'Menüyü önizle ↗'}
            </a>
          </div>
        </Modal>
      </>
  );
}