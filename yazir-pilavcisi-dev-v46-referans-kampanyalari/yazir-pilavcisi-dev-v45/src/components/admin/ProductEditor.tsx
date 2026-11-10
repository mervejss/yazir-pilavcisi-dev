import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Switch from '@/components/ui/Switch';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import ImageStudio, { type StudioResult } from '@/components/ui/ImageStudio';
import Lightbox from '@/components/ui/Lightbox';
import { supabase } from '@/lib/supabase';
import { tl } from '@/lib/helpers';
import { randId, slugify } from '@/lib/imageTools';
import { PRODUCT_BUCKET, productImageUrl, removeFromBucket, uploadToBucket } from '@/lib/menuImages';
import type { AdminProduct } from '@/hooks/useAdminMenu';
import type { Category } from '@/types/database';
import { ALLERGENS, BADGES, tagInfo } from '@/lib/menuTags';
import toast from 'react-hot-toast';

interface VariantDraft {
  key: string;
  id?: string;
  name: string;
  price: number | string;
  is_active: boolean;
}

interface OptionDraft {
  key: string;
  id?: string;
  name: string;
  price_delta: number | string;
}
interface GroupDraft {
  key: string;
  id?: string;
  name: string;
  is_required: boolean;
  max_select: number | string;
  options: OptionDraft[];
}

interface FormState {
  allergens: string[];
  badges: string[];
  groups: GroupDraft[];
  name: string;
  category_id: string;
  description: string;
  emoji: string;
  kcal: number | string;
  protein_g: number | string;
  carb_g: number | string;
  is_daily: boolean;
  is_active: boolean;
  is_sold_out: boolean;
  variants: VariantDraft[];
}

const EMOJIS = ['🍚', '🍗', '🥩', '🫘', '🥣', '🍲', '🥗', '🥙', '🍖', '🧆', '🌶️', '🥤', '☕', '🍮', '🍰', '🍽️'];
const DESC_MAX = 220;

const emptyForm = (categoryId: string): FormState => ({
  name: '',
  category_id: categoryId,
  description: '',
  emoji: '🍚',
  kcal: 400,
  protein_g: 20,
  carb_g: 50,
  is_daily: false,
  is_active: true,
  is_sold_out: false,
  variants: [{ key: randId(), name: '1 porsiyon', price: 120, is_active: true }],
  allergens: [],
  badges: [],
  groups: [],
});

function formFromProduct(p: AdminProduct): FormState {
  return {
    name: p.name,
    category_id: p.category_id,
    description: p.description || '',
    emoji: p.emoji || '🍚',
    kcal: p.kcal ?? 0,
    protein_g: Number(p.protein_g) || 0,
    carb_g: Number(p.carb_g) || 0,
    is_daily: !!p.is_daily,
    is_active: !!p.is_active,
    is_sold_out: !!p.is_sold_out,
    allergens: [...(p.allergens || [])],
    badges: [...(p.badges || [])],
    groups: [...(p.optionGroups || [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((g) => ({
        key: g.id,
        id: g.id,
        name: g.name,
        is_required: g.is_required,
        max_select: g.max_select,
        options: [...(g.options || [])]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((o) => ({ key: o.id, id: o.id, name: o.name, price_delta: Number(o.price_delta) })),
      })),
    variants: [...p.variants]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((v) => ({ key: v.id, id: v.id, name: v.name, price: Number(v.price), is_active: v.is_active })),
  };
}

interface Props {
  open: boolean;
  mode: 'create' | 'edit';
  product: AdminProduct | null;
  categories: Category[];
  allProducts: AdminProduct[];
  defaultCategoryId?: string;
  onClose: () => void;
  onSaved: () => void;
  onDuplicate?: (p: AdminProduct) => void;
  onDelete?: (p: AdminProduct) => void;
}

/** Enter ile özel etiket ekleme kutusu */
function CustomTagInput({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => void }) {
  const [v, setV] = useState('');
  const add = () => {
    const t = v.trim();
    if (t) onAdd(t);
    setV('');
  };
  return (
    <div className="tag-custom">
      <input
        value={v}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          }
        }}
      />
      <button type="button" className="btn ghost sm" onClick={add}>Ekle</button>
    </div>
  );
}

export default function ProductEditor({
  open,
  mode,
  product,
  categories,
  allProducts,
  defaultCategoryId,
  onClose,
  onSaved,
  onDuplicate,
  onDelete,
}: Props) {
  const [form, setForm] = useState<FormState>(emptyForm(''));
  const initialJson = useRef('');
  const [saving, setSaving] = useState(false);

  // Fotoğraf durumu
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [pendingInfo, setPendingInfo] = useState<StudioResult | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [studioSrc, setStudioSrc] = useState<{ file?: Blob | null; url?: string | null } | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Açılışta formu doldur
  useEffect(() => {
    if (!open) return;
    const f = mode === 'edit' && product ? formFromProduct(product) : emptyForm(defaultCategoryId || categories[0]?.id || '');
    setForm(f);
    initialJson.current = JSON.stringify(f);
    setPendingBlob(null);
    setPendingInfo(null);
    setRemoveImage(false);
    setPendingUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product?.id, mode]);

  const currentImageUrl = useMemo(() => {
    if (pendingUrl) return pendingUrl;
    if (removeImage) return null;
    return productImageUrl(product?.image_path);
  }, [pendingUrl, removeImage, product?.image_path]);

  const dirty = JSON.stringify(form) !== initialJson.current || !!pendingBlob || removeImage;

  const requestClose = () => {
    if (saving) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  };

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  /* ---------- Varyantlar ---------- */
  const addVariant = () =>
    set('variants', [...form.variants, { key: randId(), name: '', price: '', is_active: true }]);
  const updateVariant = (key: string, patch: Partial<VariantDraft>) =>
    set('variants', form.variants.map((v) => (v.key === key ? { ...v, ...patch } : v)));
  const removeVariant = (key: string) => {
    if (form.variants.length <= 1) {
      toast.error('En az bir porsiyon/fiyat olmalı');
      return;
    }
    set('variants', form.variants.filter((v) => v.key !== key));
  };
  const moveVariant = (key: string, dir: -1 | 1) => {
    const i = form.variants.findIndex((v) => v.key === key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= form.variants.length) return;
    const arr = [...form.variants];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    set('variants', arr);
  };

  /* ---------- Fotoğraf ---------- */
  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) {
      toast.error('Yalnızca JPG, PNG veya WebP yükleyebilirsiniz');
      return;
    }
    setStudioSrc({ file: f });
  };

  const onStudioSave = (blob: Blob, info: StudioResult) => {
    setPendingUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(blob);
    });
    setPendingBlob(blob);
    setPendingInfo(info);
    setRemoveImage(false);
    setStudioSrc(null);
    toast.success('Fotoğraf hazır — "Kaydet" ile ürüne uygulanır');
  };

  const editCurrentImage = () => {
    if (pendingBlob) setStudioSrc({ file: pendingBlob });
    else if (currentImageUrl) setStudioSrc({ url: currentImageUrl });
  };

  /* ---------- Kaydet ---------- */
  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const name = form.name.trim();
    if (!name) return toast.error('Ürün adı zorunlu');
    if (!form.category_id) return toast.error('Kategori seçin');
    if (form.variants.some((v) => !v.name.trim() || v.price === '' || Number(v.price) < 0)) {
      return toast.error('Tüm porsiyonların adı ve fiyatı dolu olmalı');
    }

    setSaving(true);
    try {
      const base = {
        name,
        category_id: form.category_id,
        description: form.description.trim(),
        emoji: form.emoji.trim() || null,
        kcal: Number(form.kcal) || 0,
        protein_g: Number(form.protein_g) || 0,
        carb_g: Number(form.carb_g) || 0,
        is_daily: form.is_daily,
        is_active: form.is_active,
        is_sold_out: form.is_sold_out,
      } as Record<string, any>;
      // 16_menu_extras_backup_audit.sql çalıştırılmadıysa kayıt bozulmasın: alanlar yalnızca kullanılıyorsa gönderilir
      if (form.allergens.length || form.badges.length || (product && 'allergens' in product)) {
        base.allergens = form.allergens;
        base.badges = form.badges;
      }

      let productId = product?.id || '';
      let slug = product?.slug || '';
      let oldImage = product?.image_path || null;

      if (mode === 'create') {
        slug = `${slugify(name) || 'urun'}-${randId(4)}`;
        const inCat = allProducts.filter((p) => p.category_id === form.category_id);
        const nextSort = inCat.length ? Math.max(...inCat.map((p) => p.sort_order)) + 1 : 1;
        const { data, error } = await supabase
          .from('products')
          .insert({ ...base, slug, sort_order: nextSort })
          .select('id')
          .single();
        if (error) throw error;
        productId = (data as any).id;
      } else {
        const patch: any = { ...base };
        if (product && form.category_id !== product.category_id) {
          const inCat = allProducts.filter((p) => p.category_id === form.category_id);
          patch.sort_order = inCat.length ? Math.max(...inCat.map((p) => p.sort_order)) + 1 : 1;
        }
        const { error } = await supabase.from('products').update(patch).eq('id', productId);
        if (error) throw error;
      }

      // Fotoğraf
      if (pendingBlob && pendingInfo) {
        const path = `${slug}/${Date.now()}.${pendingInfo.ext === 'jpeg' ? 'jpg' : 'webp'}`;
        await uploadToBucket(PRODUCT_BUCKET, path, pendingBlob, pendingInfo.contentType);
        const { error } = await supabase.from('products').update({ image_path: path }).eq('id', productId);
        if (error) throw error;
        await removeFromBucket(PRODUCT_BUCKET, oldImage);
      } else if (removeImage && oldImage) {
        const { error } = await supabase.from('products').update({ image_path: null }).eq('id', productId);
        if (error) throw error;
        await removeFromBucket(PRODUCT_BUCKET, oldImage);
      }

      // Porsiyonlar: güncelle / ekle / sil
      const keptIds = new Set(form.variants.filter((v) => v.id).map((v) => v.id as string));
      const toDelete = (product?.variants || []).filter((v) => !keptIds.has(v.id)).map((v) => v.id);
      if (toDelete.length) {
        const { error } = await supabase.from('product_variants').delete().in('id', toDelete);
        if (error) throw error;
      }
      for (let i = 0; i < form.variants.length; i++) {
        const v = form.variants[i];
        const row = { name: v.name.trim(), price: Number(v.price), is_active: v.is_active, sort_order: i + 1 };
        if (v.id) {
          const { error } = await supabase.from('product_variants').update(row).eq('id', v.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('product_variants').insert({ ...row, product_id: productId });
          if (error) throw error;
        }
      }

      // Ürün seçenekleri (ekstra et, soğansız…)
      if (form.groups.length > 0 || (product?.optionGroups || []).length > 0) {
        const keptG = new Set(form.groups.filter((g) => g.id).map((g) => g.id as string));
        const delG = (product?.optionGroups || []).filter((g) => !keptG.has(g.id)).map((g) => g.id);
        if (delG.length) {
          const { error } = await supabase.from('product_option_groups').delete().in('id', delG);
          if (error) throw error;
        }
        for (let gi = 0; gi < form.groups.length; gi++) {
          const g = form.groups[gi];
          if (!g.name.trim()) continue;
          const grow = {
            name: g.name.trim(),
            is_required: g.is_required,
            min_select: g.is_required ? 1 : 0,
            max_select: Math.max(1, Number(g.max_select) || 1),
            sort_order: gi + 1,
          };
          let gid = g.id;
          if (gid) {
            const { error } = await supabase.from('product_option_groups').update(grow).eq('id', gid);
            if (error) throw error;
          } else {
            const { data, error } = await supabase.from('product_option_groups').insert({ ...grow, product_id: productId }).select('id').single();
            if (error) throw error;
            gid = (data as any).id as string;
          }
          const oldOpts = (product?.optionGroups || []).find((x) => x.id === g.id)?.options || [];
          const keptO = new Set(g.options.filter((o) => o.id).map((o) => o.id as string));
          const delO = oldOpts.filter((o) => !keptO.has(o.id)).map((o) => o.id);
          if (delO.length) {
            const { error } = await supabase.from('product_options').delete().in('id', delO);
            if (error) throw error;
          }
          for (let oi = 0; oi < g.options.length; oi++) {
            const o = g.options[oi];
            if (!o.name.trim()) continue;
            const orow = { name: o.name.trim(), price_delta: Number(o.price_delta) || 0, sort_order: oi + 1 };
            if (o.id) {
              const { error } = await supabase.from('product_options').update(orow).eq('id', o.id);
              if (error) throw error;
            } else {
              const { error } = await supabase.from('product_options').insert({ ...orow, group_id: gid });
              if (error) throw error;
            }
          }
        }
      }

      toast.success(mode === 'create' ? 'Ürün eklendi' : 'Ürün güncellendi');
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const minPrice = useMemo(() => {
    const prices = form.variants.filter((v) => v.price !== '' && v.is_active).map((v) => Number(v.price));
    return prices.length ? Math.min(...prices) : 0;
  }, [form.variants]);

  if (!open) return null;

  return (
    <>
      <Modal open={open} onClose={requestClose} size="xl" className="pe-sheet">
        <form onSubmit={handleSave}>
          <div className="pe-head">
            <div>
              <h2>{mode === 'create' ? '➕ Yeni Ürün Ekle' : '✏️ Ürün Bilgilerini Düzenle'}</h2>
              <p className="muted small">
                {mode === 'create' ? 'Ürünün bilgilerini, fotoğrafını ve fiyatlarını girin.' : product?.name}
              </p>
            </div>
            <div className="pe-head-actions">
              {dirty && <span className="pe-dirty">● Kaydedilmemiş değişiklik</span>}
              <button type="button" className="icon-circle" onClick={requestClose} aria-label="Kapat">
                ✕
              </button>
            </div>
          </div>

          <div className="pe-grid">
            {/* Sol: fotoğraf + canlı önizleme */}
            <aside className="pe-left">
              <div className="pe-photo">
                {currentImageUrl ? (
                  <button type="button" className="pe-photo-img" onClick={() => setLightbox(true)} title="Büyütüp incele">
                    <img src={currentImageUrl} alt={form.name || 'Ürün'} />
                    <span className="pe-zoom">🔍 Büyüt</span>
                  </button>
                ) : (
                  <div className="pe-photo-empty">
                    <span>{form.emoji || '🍽️'}</span>
                    <small>Fotoğraf yok</small>
                  </div>
                )}
                {pendingInfo && (
                  <div className="pe-photo-info">
                    Yeni: {pendingInfo.width}×{pendingInfo.height} · {Math.round(pendingInfo.size / 1024)} KB
                  </div>
                )}
                <div className="pe-photo-btns">
                  <button type="button" className="btn gold sm" onClick={() => fileRef.current?.click()}>
                    📷 {currentImageUrl ? 'Değiştir' : 'Fotoğraf yükle'}
                  </button>
                  <button type="button" className="btn ghost sm" onClick={editCurrentImage} disabled={!currentImageUrl}>
                    ✂️ Düzenle / Kırp
                  </button>
                  <button
                    type="button"
                    className="btn ghost sm danger-txt"
                    onClick={() => {
                      setPendingBlob(null);
                      setPendingInfo(null);
                      setPendingUrl((o) => {
                        if (o) URL.revokeObjectURL(o);
                        return null;
                      });
                      setRemoveImage(true);
                    }}
                    disabled={!currentImageUrl}
                  >
                    🗑️ Kaldır
                  </button>
                </div>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onPickFile} />
              </div>

              <div className="pe-preview">
                <small className="muted">Müşteri böyle görecek</small>
                <div className={`pe-pcard${form.is_sold_out ? ' out' : ''}`}>
                  <div className="pe-pimg">
                    {currentImageUrl ? <img src={currentImageUrl} alt="" /> : <span>{form.emoji || '🍽️'}</span>}
                    {form.is_sold_out && <em>Tükendi</em>}
                  </div>
                  <div className="pe-pbody">
                    <b>{form.name || 'Ürün adı'}</b>
                    <p>{form.description || 'Ürün açıklaması burada görünür.'}</p>
                    <div className="pe-pprice">
                      {form.variants.length > 1 ? 'başlayan ' : ''}
                      {tl(minPrice)}
                    </div>
                  </div>
                </div>
              </div>
            </aside>

            {/* Sağ: form */}
            <div className="pe-right">
              <section className="pe-sec">
                <h4>Temel bilgiler</h4>
                <div className="two-col">
                  <label className="fld">
                    Ürün adı *
                    <input required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Örn: Ciğerli Pilav" />
                  </label>
                  <label className="fld">
                    Kategori *
                    <select required value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {!c.is_active ? ' (pasif)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="fld">
                  Açıklama
                  <textarea
                    rows={3}
                    maxLength={DESC_MAX}
                    value={form.description}
                    onChange={(e) => set('description', e.target.value)}
                    placeholder="Özel baharatlarla demlenmiş, tane tane pilav…"
                  />
                  <small className={`pe-count${form.description.length > DESC_MAX - 20 ? ' warn' : ''}`}>
                    {form.description.length}/{DESC_MAX}
                  </small>
                </label>

                <div className="fld">
                  Emoji / ikon <span className="muted small">(fotoğraf yokken gösterilir)</span>
                  <div className="pe-emojis">
                    {EMOJIS.map((em) => (
                      <button type="button" key={em} className={form.emoji === em ? 'on' : ''} onClick={() => set('emoji', em)}>
                        {em}
                      </button>
                    ))}
                    <input
                      value={form.emoji}
                      onChange={(e) => set('emoji', e.target.value)}
                      maxLength={4}
                      aria-label="Özel emoji"
                      className="pe-emoji-input"
                    />
                  </div>
                </div>
              </section>

              <section className="pe-sec">
                <h4>
                  Porsiyon ve fiyatlar
                  <button type="button" className="btn gold sm" onClick={addVariant}>
                    + Porsiyon ekle
                  </button>
                </h4>
                <div className="pe-variants">
                  {form.variants.map((v, i) => (
                    <div key={v.key} className={`pe-var${v.is_active ? '' : ' off'}`}>
                      <div className="pe-var-order">
                        <button type="button" onClick={() => moveVariant(v.key, -1)} disabled={i === 0} aria-label="Yukarı">
                          ▲
                        </button>
                        <button type="button" onClick={() => moveVariant(v.key, 1)} disabled={i === form.variants.length - 1} aria-label="Aşağı">
                          ▼
                        </button>
                      </div>
                      <input
                        value={v.name}
                        onChange={(e) => updateVariant(v.key, { name: e.target.value })}
                        placeholder="Porsiyon adı (1 porsiyon, Büyük…)"
                        aria-label="Porsiyon adı"
                      />
                      <div className="pe-price">
                        <input
                          type="number"
                          min={0}
                          step="0.5"
                          value={v.price}
                          onChange={(e) => updateVariant(v.key, { price: e.target.value })}
                          placeholder="0"
                          aria-label="Fiyat"
                        />
                        <span>₺</span>
                      </div>
                      <label className="pe-var-active" title="Pasifse müşteri bu porsiyonu görmez">
                        <Switch checked={v.is_active} onChange={() => updateVariant(v.key, { is_active: !v.is_active })} label="Porsiyon aktif" />
                      </label>
                      <button type="button" className="icon-circle danger-txt" onClick={() => removeVariant(v.key)} aria-label="Porsiyonu sil" title="Sil">
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="pe-sec">
                <h4>Besin değerleri <span className="muted small">(1 porsiyon, yaklaşık)</span></h4>
                <div className="pe-macros">
                  <label className="fld">
                    🔥 Kalori (kcal)
                    <input type="number" min={0} value={form.kcal} onChange={(e) => set('kcal', e.target.value)} />
                  </label>
                  <label className="fld">
                    💪 Protein (g)
                    <input type="number" min={0} step="0.5" value={form.protein_g} onChange={(e) => set('protein_g', e.target.value)} />
                  </label>
                  <label className="fld">
                    🌾 Karbonhidrat (g)
                    <input type="number" min={0} step="0.5" value={form.carb_g} onChange={(e) => set('carb_g', e.target.value)} />
                  </label>
                </div>
              </section>

              <section className="pe-sec">
                <h4>
                  Rozetler <span className="muted small">(Acılı, Vegan… menüde ürün kartında görünür)</span>
                </h4>
                <div className="tag-pick">
                  {BADGES.map((b) => (
                    <button
                      type="button"
                      key={b.key}
                      className={form.badges.includes(b.key) ? 'on' : ''}
                      onClick={() => set('badges', form.badges.includes(b.key) ? form.badges.filter((x) => x !== b.key) : [...form.badges, b.key])}
                    >
                      {b.emoji} {b.label}
                    </button>
                  ))}
                  {form.badges.filter((b) => !BADGES.some((x) => x.key === b)).map((b) => (
                    <button type="button" key={b} className="on" onClick={() => set('badges', form.badges.filter((x) => x !== b))}>
                      ✎ {b} ✕
                    </button>
                  ))}
                </div>
                <CustomTagInput placeholder="Özel rozet ekle (Enter)" onAdd={(v) => !form.badges.includes(v) && set('badges', [...form.badges, v])} />
              </section>

              <section className="pe-sec">
                <h4>
                  Alerjen uyarıları <span className="muted small">(menüde ürün detayında uyarı olarak gösterilir)</span>
                </h4>
                <div className="tag-pick warn">
                  {ALLERGENS.map((a) => (
                    <button
                      type="button"
                      key={a.key}
                      className={form.allergens.includes(a.key) ? 'on' : ''}
                      onClick={() => set('allergens', form.allergens.includes(a.key) ? form.allergens.filter((x) => x !== a.key) : [...form.allergens, a.key])}
                    >
                      {a.emoji} {a.label}
                    </button>
                  ))}
                  {form.allergens.filter((a) => !ALLERGENS.some((x) => x.key === a)).map((a) => (
                    <button type="button" key={a} className="on" onClick={() => set('allergens', form.allergens.filter((x) => x !== a))}>
                      ✎ {tagInfo(ALLERGENS, a).label} ✕
                    </button>
                  ))}
                </div>
                <CustomTagInput placeholder="Özel alerjen ekle (Enter)" onAdd={(v) => !form.allergens.includes(v) && set('allergens', [...form.allergens, v])} />
              </section>

              <section className="pe-sec">
                <h4>
                  Ürün seçenekleri <span className="muted small">(ekstra et, soğansız, sos seçimi…)</span>
                  <button
                    type="button"
                    className="btn gold sm"
                    onClick={() => set('groups', [...form.groups, { key: randId(), name: '', is_required: false, max_select: 1, options: [{ key: randId(), name: '', price_delta: 0 }] }])}
                  >
                    + Seçenek grubu
                  </button>
                </h4>
                {form.groups.length === 0 && <p className="muted small" style={{ margin: 0 }}>Henüz seçenek grubu yok. Örn: "Ekstra" → Ekstra et (+40 ₺), Ekstra pilav (+25 ₺); "Çıkarılsın" → Soğansız.</p>}
                {form.groups.map((g) => (
                  <div key={g.key} className="opt-editor">
                    <div className="opt-editor-head">
                      <input
                        value={g.name}
                        placeholder="Grup adı (Örn: Ekstralar)"
                        onChange={(e) => set('groups', form.groups.map((x) => (x.key === g.key ? { ...x, name: e.target.value } : x)))}
                      />
                      <label className="opt-req" title="Müşteri seçim yapmak zorunda mı">
                        Zorunlu
                        <Switch checked={g.is_required} onChange={() => set('groups', form.groups.map((x) => (x.key === g.key ? { ...x, is_required: !x.is_required } : x)))} label="Zorunlu" />
                      </label>
                      <label className="opt-max">
                        En fazla
                        <input type="number" min={1} value={g.max_select} onChange={(e) => set('groups', form.groups.map((x) => (x.key === g.key ? { ...x, max_select: e.target.value } : x)))} />
                      </label>
                      <button type="button" className="icon-circle danger-txt" onClick={() => set('groups', form.groups.filter((x) => x.key !== g.key))} aria-label="Grubu sil">🗑️</button>
                    </div>
                    {g.options.map((o) => (
                      <div key={o.key} className="opt-row">
                        <input
                          value={o.name}
                          placeholder="Seçenek (Ekstra et)"
                          onChange={(e) => set('groups', form.groups.map((x) => (x.key === g.key ? { ...x, options: x.options.map((y) => (y.key === o.key ? { ...y, name: e.target.value } : y)) } : x)))}
                        />
                        <div className="pe-price">
                          <input
                            type="number"
                            step="0.5"
                            value={o.price_delta}
                            onChange={(e) => set('groups', form.groups.map((x) => (x.key === g.key ? { ...x, options: x.options.map((y) => (y.key === o.key ? { ...y, price_delta: e.target.value } : y)) } : x)))}
                          />
                          <span>₺</span>
                        </div>
                        <button
                          type="button"
                          className="icon-circle danger-txt"
                          onClick={() => set('groups', form.groups.map((x) => (x.key === g.key ? { ...x, options: x.options.filter((y) => y.key !== o.key) } : x)))}
                          aria-label="Seçeneği sil"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => set('groups', form.groups.map((x) => (x.key === g.key ? { ...x, options: [...x.options, { key: randId(), name: '', price_delta: 0 }] } : x)))}
                    >
                      + Seçenek ekle
                    </button>
                  </div>
                ))}
              </section>

              <section className="pe-sec">
                <h4>Durum ve görünürlük</h4>
                <div className="pe-toggles">
                  <div>
                    <div>
                      <b>Satışta</b>
                      <small>Kapalıysa "Tükendi" olarak görünür, sipariş verilemez</small>
                    </div>
                    <Switch checked={!form.is_sold_out} onChange={() => set('is_sold_out', !form.is_sold_out)} label="Satışta" />
                  </div>
                  <div>
                    <div>
                      <b>Menüde yayında</b>
                      <small>Kapalıysa müşteri ürünü hiç görmez (gizli)</small>
                    </div>
                    <Switch checked={form.is_active} onChange={() => set('is_active', !form.is_active)} label="Yayında" />
                  </div>
                  <div>
                    <div>
                      <b>Günlük / çorba menüsü</b>
                      <small>Ana sayfadaki "en sevilenler" vitrininde öne çıkarılmaz</small>
                    </div>
                    <Switch checked={form.is_daily} onChange={() => set('is_daily', !form.is_daily)} label="Günlük menü" />
                  </div>
                </div>
              </section>
            </div>
          </div>

          <div className="pe-foot">
            <div className="pe-foot-left">
              {mode === 'edit' && product && onDuplicate && (
                <button type="button" className="btn ghost sm" onClick={() => onDuplicate(product)} disabled={saving}>
                  📄 Çoğalt
                </button>
              )}
              {mode === 'edit' && product && onDelete && (
                <button type="button" className="btn ghost sm danger-txt" onClick={() => onDelete(product)} disabled={saving}>
                  🗑️ Ürünü sil
                </button>
              )}
            </div>
            <div className="pe-foot-right">
              <button type="button" className="btn ghost" onClick={requestClose} disabled={saving}>
                Vazgeç
              </button>
              <button type="submit" className="btn gold" disabled={saving}>
                {saving ? 'Kaydediliyor…' : mode === 'create' ? 'Ürünü Ekle' : 'Değişiklikleri Kaydet'}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      <ImageStudio
        open={!!studioSrc}
        source={studioSrc}
        title={form.name || 'Ürün fotoğrafı'}
        defaultAspect="4:3"
        saveLabel="Fotoğrafı Uygula"
        onClose={() => setStudioSrc(null)}
        onSave={onStudioSave}
      />

      <Lightbox
        open={lightbox && !!currentImageUrl}
        items={currentImageUrl ? [{ url: currentImageUrl, title: form.name || 'Ürün', subtitle: product?.categoryName, filename: `${product?.slug || 'urun'}.webp` }] : []}
        index={0}
        onIndexChange={() => {}}
        onClose={() => setLightbox(false)}
        actions={[
          {
            label: 'Düzenle / Kırp',
            icon: '✂️',
            primary: true,
            onClick: () => {
              setLightbox(false);
              editCurrentImage();
            },
          },
        ]}
      />

      <ConfirmationModal
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        onConfirm={() => {
          setConfirmClose(false);
          onClose();
        }}
        title="Kaydedilmemiş değişiklikler var"
        message="Pencereyi kapatırsanız yaptığınız değişiklikler kaybolacak. Yine de kapatmak istiyor musunuz?"
        confirmLabel="Evet, kapat"
        cancelLabel="Düzenlemeye dön"
        variant="warning"
      />
    </>
  );
}
