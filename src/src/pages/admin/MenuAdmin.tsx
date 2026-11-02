import { useState, useEffect, useRef } from 'react';
import { useMenu, type MenuProduct } from '@/hooks/useMenu';
import { supabase } from '@/lib/supabase';
import { tl } from '@/lib/helpers';
import Switch from '@/components/ui/Switch';
import Modal from '@/components/ui/Modal';
import ProductImage from '@/components/ui/ProductImage';
import ImageCropperModal from '@/components/ui/ImageCropperModal';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';

export default function MenuAdmin() {
  const { products, categories, refetch } = useMenu();
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [qrSvg, setQrSvg] = useState<string>('');

  // Modals state
  const [newProductModal, setNewProductModal] = useState(false);
  const [editProductModal, setEditProductModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<MenuProduct | null>(null);
  const [newCategoryModal, setNewCategoryModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  // Image Cropper & Confirmation Modal State
  const [cropperOpen, setCropperOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [cropperProduct, setCropperProduct] = useState<MenuProduct | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New product form state
  const [newProd, setNewProd] = useState({
    name: '',
    category_id: '',
    description: '',
    emoji: '🍚',
    kcal: 400,
    protein_g: 20,
    carb_g: 50,
    variant_name: '1 porsiyon',
    variant_price: 120,
    is_daily: false,
  });

  // Edit product form state
  const [editProd, setEditProd] = useState({
    name: '',
    category_id: '',
    description: '',
    emoji: '🍚',
    kcal: 400,
    protein_g: 20,
    carb_g: 50,
    is_daily: false,
  });

  useEffect(() => {
    const url = window.location.origin + '/menu';
    QRCode.toString(url, { type: 'svg', margin: 2 }, (err, svg) => {
      if (!err && svg) setQrSvg(svg);
    });
  }, []);

  // Filter products by selected category tab & search
  const filteredProducts = products.filter((p) => {
    const matchesCategory =
      selectedCategoryTab === 'all' || p.category_id === selectedCategoryTab;
    const matchesSearch =
      !searchQuery.trim() ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Handle image file selection -> Open Cropper & Confirmation Modal
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !cropperProduct) return;

    // Reset the input value so user can select the same file again if needed
    e.target.value = '';

    setPendingFile(file);
    setCropperOpen(true);
  };

  const handleOpenImageUpload = (product: MenuProduct) => {
    setCropperProduct(product);
    fileInputRef.current?.click();
  };

  // Delete/Remove product image
  const handleDeleteImage = async (product: MenuProduct) => {
    if (!window.confirm(`"${product.name}" ürününün fotoğrafını kaldırmak istediğinize emin misiniz?`)) {
      return;
    }

    try {
      if (product.image_path) {
        await supabase.storage.from('product-images').remove([product.image_path]);
      }

      const { error } = await supabase
        .from('products')
        .update({ image_path: null })
        .eq('id', product.id);

      if (error) throw error;

      toast.success('Ürün fotoğrafı kaldırıldı');
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Fotoğraf kaldırılamadı');
    }
  };

  // Toggle sold out
  const handleToggleSoldOut = async (productId: string, current: boolean) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({ is_sold_out: !current })
        .eq('id', productId);
      if (error) throw error;
      toast.success(!current ? 'Ürün tükendi olarak işaretlendi' : 'Ürün satışa açıldı');
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Güncellenemedi');
    }
  };

  // Update variant price
  const handleUpdatePrice = async (variantId: string, newPrice: number) => {
    try {
      const { error } = await supabase
        .from('product_variants')
        .update({ price: newPrice })
        .eq('id', variantId);
      if (error) throw error;
      toast.success('Fiyat güncellendi');
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Fiyat güncellenemedi');
    }
  };

  // Product Reordering: Move up or down within category
  const handleMoveOrder = async (product: MenuProduct, direction: 'up' | 'down') => {
    const categoryProducts = products
      .filter((p) => p.category_id === product.category_id)
      .sort((a, b) => a.sort_order - b.sort_order);

    const currentIndex = categoryProducts.findIndex((p) => p.id === product.id);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= categoryProducts.length) return;

    const targetProduct = categoryProducts[targetIndex];

    try {
      // Swap sort_order
      const currentOrder = product.sort_order;
      const targetOrder = targetProduct.sort_order;

      // Ensure distinct values if they happened to be identical
      const newCurrentOrder = currentOrder === targetOrder
        ? (direction === 'up' ? targetOrder - 1 : targetOrder + 1)
        : targetOrder;
      const newTargetOrder = currentOrder;

      await Promise.all([
        supabase.from('products').update({ sort_order: newCurrentOrder }).eq('id', product.id),
        supabase.from('products').update({ sort_order: newTargetOrder }).eq('id', targetProduct.id),
      ]);

      toast.success('Sıralama güncellendi');
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Sıralama değiştirilemedi');
    }
  };

  // Create Category
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      const slug = newCatName
        .toLowerCase()
        .replace(/ı/g, 'i')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/[^a-z0-9]+/g, '-');

      const { error } = await supabase.from('categories').insert({
        name: newCatName.trim(),
        slug,
        sort_order: categories.length + 1,
      });
      if (error) throw error;
      toast.success('Kategori eklendi');
      setNewCatName('');
      setNewCategoryModal(false);
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Kategori eklenemedi');
    }
  };

  // Create Product
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProd.name || !newProd.category_id) {
      toast.error('Lütfen zorunlu alanları doldurun');
      return;
    }
    try {
      const slugBase = newProd.name
        .toLowerCase()
        .replace(/ı/g, 'i')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/[^a-z0-9]+/g, '-');
      const slug = `${slugBase}-${Date.now().toString().slice(-4)}`;

      // Calculate next sort order in category
      const existingInCat = products.filter((p) => p.category_id === newProd.category_id);
      const nextSortOrder = existingInCat.length > 0
        ? Math.max(...existingInCat.map((p) => p.sort_order)) + 1
        : 1;

      const { data: prodData, error: prodErr } = await supabase
        .from('products')
        .insert({
          name: newProd.name,
          category_id: newProd.category_id,
          description: newProd.description,
          emoji: newProd.emoji,
          kcal: Number(newProd.kcal),
          protein_g: Number(newProd.protein_g),
          carb_g: Number(newProd.carb_g),
          is_daily: newProd.is_daily,
          sort_order: nextSortOrder,
          slug,
        })
        .select()
        .single();

      if (prodErr) throw prodErr;

      const { error: varErr } = await supabase.from('product_variants').insert({
        product_id: (prodData as any).id,
        name: newProd.variant_name || '1 porsiyon',
        price: Number(newProd.variant_price),
        sort_order: 1,
      });

      if (varErr) throw varErr;

      toast.success('Ürün başarıyla eklendi');
      setNewProductModal(false);
      setNewProd({
        name: '',
        category_id: categories[0]?.id || '',
        description: '',
        emoji: '🍚',
        kcal: 400,
        protein_g: 20,
        carb_g: 50,
        variant_name: '1 porsiyon',
        variant_price: 120,
        is_daily: false,
      });
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Ürün eklenemedi');
    }
  };

  // Open Edit Product Modal
  const handleOpenEditProduct = (p: MenuProduct) => {
    setSelectedProduct(p);
    setEditProd({
      name: p.name,
      category_id: p.category_id,
      description: p.description || '',
      emoji: p.emoji || '🍚',
      kcal: p.kcal || 0,
      protein_g: Number(p.protein_g) || 0,
      carb_g: Number(p.carb_g) || 0,
      is_daily: !!p.is_daily,
    });
    setEditProductModal(true);
  };

  // Save Edit Product
  const handleSaveEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    try {
      const { error } = await supabase
        .from('products')
        .update({
          name: editProd.name,
          category_id: editProd.category_id,
          description: editProd.description,
          emoji: editProd.emoji,
          kcal: Number(editProd.kcal),
          protein_g: Number(editProd.protein_g),
          carb_g: Number(editProd.carb_g),
          is_daily: editProd.is_daily,
        })
        .eq('id', selectedProduct.id);

      if (error) throw error;

      toast.success('Ürün bilgileri güncellendi');
      setEditProductModal(false);
      setSelectedProduct(null);
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Ürün güncellenemedi');
    }
  };

  // Delete product
  const handleDeleteProduct = async (productId: string, productName: string) => {
    if (!window.confirm(`"${productName}" ürününü silmek istediğinize emin misiniz?`)) return;

    try {
      const { error } = await supabase.from('products').delete().eq('id', productId);
      if (error) throw error;
      toast.success('Ürün silindi');
      refetch();
    } catch (err: any) {
      toast.error(err.message || 'Ürün silinemedi (Siparişi olan ürünler silinemez)');
    }
  };

  return (
    <>
      <div className="bar">
        <div>
          <h1>Menü ve Görsel Yönetimi</h1>
          <p className="muted" style={{ margin: 0 }}>
            Kategoriye göre ayrılmış ürünler, fotoğraf yükleme/kırpma, fiyatlar ve sıralama
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => setNewCategoryModal(true)}
          >
            + Kategori Ekle
          </button>
          <button
            type="button"
            className="btn gold sm"
            onClick={() => {
              setNewProd({
                ...newProd,
                category_id: categories[0]?.id || '',
              });
              setNewProductModal(true);
            }}
          >
            + Yeni Ürün Ekle
          </button>
        </div>
      </div>

      {/* Hidden File Input for Image Upload */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
      />

      {/* Category Tabs & Search Filter */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
          marginBottom: '1.2rem',
          background: 'var(--card-bg)',
          padding: '0.8rem 1rem',
          borderRadius: '12px',
          border: '1px solid var(--line)',
        }}
      >
        <div className="seg" style={{ margin: 0 }}>
          <button
            type="button"
            className={selectedCategoryTab === 'all' ? 'on' : ''}
            onClick={() => setSelectedCategoryTab('all')}
          >
            Tüm Ürünler ({products.length})
          </button>
          {categories.map((c) => {
            const count = products.filter((p) => p.category_id === c.id).length;
            return (
              <button
                type="button"
                key={c.id}
                className={selectedCategoryTab === c.id ? 'on' : ''}
                onClick={() => setSelectedCategoryTab(c.id)}
              >
                {c.name} ({count})
              </button>
            );
          })}
        </div>

        <div style={{ minWidth: '220px', flex: '0 1 280px' }}>
          <input
            type="text"
            placeholder="🔍 Menüde ürün ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', margin: 0, padding: '0.45em 0.8em' }}
          />
        </div>
      </div>

      <div className="two-panel">
        <div>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: '60px' }}>Sıra</th>
                <th style={{ width: '80px' }}>Görsel</th>
                <th>Ürün Bilgisi</th>
                <th>Kategori</th>
                <th>Porsiyon ve Fiyat</th>
                <th>Satış Durumu</th>
                <th style={{ textAlign: 'right' }}>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((p) => (
                <tr key={p.id}>
                  {/* Sıralama Butonları */}
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                      <button
                        type="button"
                        className="btn ghost sm"
                        style={{ padding: '0.1em 0.4em', fontSize: '0.75rem', lineHeight: 1 }}
                        title="Yukarı Taşı"
                        onClick={() => handleMoveOrder(p, 'up')}
                      >
                        ▲
                      </button>
                      <b style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {p.sort_order}
                      </b>
                      <button
                        type="button"
                        className="btn ghost sm"
                        style={{ padding: '0.1em 0.4em', fontSize: '0.75rem', lineHeight: 1 }}
                        title="Aşağı Taşı"
                        onClick={() => handleMoveOrder(p, 'down')}
                      >
                        ▼
                      </button>
                    </div>
                  </td>

                  {/* Fotoğraf Thumbnail & Fotoğraf Butonları */}
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                      <div
                        style={{
                          width: '64px',
                          height: '52px',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          border: '1px solid var(--line)',
                          position: 'relative',
                        }}
                      >
                        <ProductImage imagePath={p.image_path} emoji={p.emoji} name={p.name} />
                      </div>
                      <div style={{ display: 'flex', gap: '3px' }}>
                        <button
                          type="button"
                          className="btn ghost sm"
                          style={{ padding: '0.15em 0.35em', fontSize: '0.7rem' }}
                          title="Fotoğraf Yükle / Değiştir / Kırp"
                          onClick={() => handleOpenImageUpload(p)}
                        >
                          📷
                        </button>
                        {p.image_path && (
                          <button
                            type="button"
                            className="btn ghost sm"
                            style={{ padding: '0.15em 0.35em', fontSize: '0.7rem', color: 'var(--danger)' }}
                            title="Fotoğrafı Kaldır"
                            onClick={() => handleDeleteImage(p)}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Ürün Adı, Açıklama, Makrolar */}
                  <td>
                    <b>{p.name}</b>
                    {p.is_daily && <span className="small muted"> (Günlük Menü)</span>}
                    {p.description && (
                      <div className="small muted" style={{ maxWidth: '280px', lineHeight: 1.3 }}>
                        {p.description}
                      </div>
                    )}
                    <div className="small muted" style={{ marginTop: '3px' }}>
                      🔥 {p.kcal} kcal · {p.protein_g}g P · {p.carb_g}g K
                    </div>
                  </td>

                  {/* Kategori Adı */}
                  <td>
                    <span className="chip" style={{ fontSize: '0.8rem' }}>
                      {p.categoryName}
                    </span>
                  </td>

                  {/* Varyant ve Fiyatlar */}
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {p.variants.map((v) => (
                        <label key={v.id} className="pin" style={{ margin: 0, padding: '0.2em 0.4em' }}>
                          <small>{v.name}:</small>
                          <input
                            type="number"
                            defaultValue={v.price}
                            style={{ width: '65px', padding: '0.2em', textAlign: 'right' }}
                            onBlur={(e) => {
                              const val = Number(e.target.value);
                              if (val !== v.price && val >= 0) handleUpdatePrice(v.id, val);
                            }}
                          />
                          <small>₺</small>
                        </label>
                      ))}
                    </div>
                  </td>

                  {/* Satış Durumu */}
                  <td>
                    <Switch
                      checked={!p.is_sold_out}
                      onChange={() => handleToggleSoldOut(p.id, p.is_sold_out)}
                      label={!p.is_sold_out ? 'Satışta' : 'Tükendi'}
                    />
                  </td>

                  {/* İşlemler (Düzenle & Sil) */}
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '4px' }}>
                      <button
                        type="button"
                        className="btn ghost sm"
                        style={{ padding: '0.3em 0.6em', fontSize: '0.8rem' }}
                        onClick={() => handleOpenEditProduct(p)}
                        title="Ürün Bilgilerini Düzenle"
                      >
                        ✏️ Düzenle
                      </button>
                      <button
                        type="button"
                        className="btn ghost sm"
                        style={{ padding: '0.3em 0.6em', fontSize: '0.8rem', color: 'var(--danger)' }}
                        onClick={() => handleDeleteProduct(p.id, p.name)}
                        title="Ürünü Sil"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={7} className="center muted" style={{ padding: '2.5rem' }}>
                    Bu filtreye uygun ürün bulunamadı.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* QR Kod & Bilgi Paneli */}
        <aside className="qrbox">
          <h3>Genel Menü QR Kodu</h3>
          {qrSvg ? (
            <div
              dangerouslySetInnerHTML={{ __html: qrSvg }}
              style={{ maxWidth: '190px', margin: 'auto' }}
            />
          ) : (
            <div style={{ height: '190px', display: 'grid', placeItems: 'center' }}>
              QR üretiliyor...
            </div>
          )}
          <p className="muted small" style={{ marginTop: '0.8rem', lineHeight: 1.4 }}>
            Müşteriler bu QR kodu okuttuğunda doğrudan güncel ürünler, fotoğraflar ve fiyatlarla web menü açılır.
          </p>
          <div style={{ marginTop: '0.8rem' }}>
            <a
              href="/menu"
              target="_blank"
              rel="noreferrer"
              className="btn dark sm"
              style={{ width: '100%', fontSize: '0.85rem' }}
            >
              Müşteri Menüsünü Önizle ↗
            </a>
          </div>
        </aside>
      </div>

      {/* Image Cropper & Confirmation Modal */}
      <ImageCropperModal
        open={cropperOpen}
        file={pendingFile}
        product={cropperProduct}
        onClose={() => {
          setCropperOpen(false);
          setPendingFile(null);
          setCropperProduct(null);
        }}
        onSuccess={() => {
          refetch();
        }}
      />

      {/* Kategori Ekle Modal */}
      <Modal open={newCategoryModal} onClose={() => setNewCategoryModal(false)}>
        <h2>Yeni Kategori Ekle</h2>
        <form onSubmit={handleCreateCategory} className="form">
          <label>
            Kategori Adı
            <input
              required
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="Örn: Tatlılar, Çorbalar"
            />
          </label>
          <div className="prow" style={{ marginTop: '1rem' }}>
            <button type="submit" className="btn gold sm">
              Kategoriyi Kaydet
            </button>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setNewCategoryModal(false)}
            >
              Vazgeç
            </button>
          </div>
        </form>
      </Modal>

      {/* Ürün Ekle Modal */}
      <Modal open={newProductModal} onClose={() => setNewProductModal(false)}>
        <h2>Yeni Ürün Ekle</h2>
        <form onSubmit={handleCreateProduct} className="form">
          <div className="two-col">
            <label>
              Ürün Adı
              <input
                required
                value={newProd.name}
                onChange={(e) => setNewProd({ ...newProd, name: e.target.value })}
                placeholder="Örn: Ciğerli Pilav"
              />
            </label>
            <label>
              Kategori
              <select
                required
                value={newProd.category_id}
                onChange={(e) => setNewProd({ ...newProd, category_id: e.target.value })}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="two-col">
            <label>
              Emoji / İkon
              <input
                value={newProd.emoji}
                onChange={(e) => setNewProd({ ...newProd, emoji: e.target.value })}
                placeholder="🍚"
              />
            </label>
            <label>
              Kalori (kcal)
              <input
                type="number"
                value={newProd.kcal}
                onChange={(e) => setNewProd({ ...newProd, kcal: Number(e.target.value) })}
              />
            </label>
          </div>

          <div className="two-col">
            <label>
              Protein (g)
              <input
                type="number"
                step="0.5"
                value={newProd.protein_g}
                onChange={(e) => setNewProd({ ...newProd, protein_g: Number(e.target.value) })}
              />
            </label>
            <label>
              Karbonhidrat (g)
              <input
                type="number"
                step="0.5"
                value={newProd.carb_g}
                onChange={(e) => setNewProd({ ...newProd, carb_g: Number(e.target.value) })}
              />
            </label>
          </div>

          <label>
            Açıklama
            <textarea
              rows={2}
              value={newProd.description}
              onChange={(e) => setNewProd({ ...newProd, description: e.target.value })}
              placeholder="Özel baharatlarla demlenmiş leziz pilav..."
            />
          </label>

          <div className="two-col">
            <label>
              Varsayılan Porsiyon Adı
              <input
                required
                value={newProd.variant_name}
                onChange={(e) => setNewProd({ ...newProd, variant_name: e.target.value })}
                placeholder="1 porsiyon"
              />
            </label>
            <label>
              Fiyat (₺)
              <input
                type="number"
                required
                value={newProd.variant_price}
                onChange={(e) =>
                  setNewProd({ ...newProd, variant_price: Number(e.target.value) })
                }
              />
            </label>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={newProd.is_daily}
              onChange={(e) => setNewProd({ ...newProd, is_daily: e.target.checked })}
            />
            <span>Günlük / Çorba Menüsü (Ön vitrinde öne çıkarılmaz)</span>
          </label>

          <div className="prow" style={{ marginTop: '1rem' }}>
            <button type="submit" className="btn gold sm">
              Ürünü Kaydet
            </button>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setNewProductModal(false)}
            >
              Vazgeç
            </button>
          </div>
        </form>
      </Modal>

      {/* Ürün Bilgilerini Düzenle Modal */}
      <Modal open={editProductModal} onClose={() => setEditProductModal(false)}>
        <h2>Ürün Bilgilerini Düzenle</h2>
        <form onSubmit={handleSaveEditProduct} className="form">
          <div className="two-col">
            <label>
              Ürün Adı
              <input
                required
                value={editProd.name}
                onChange={(e) => setEditProd({ ...editProd, name: e.target.value })}
              />
            </label>
            <label>
              Kategori
              <select
                required
                value={editProd.category_id}
                onChange={(e) => setEditProd({ ...editProd, category_id: e.target.value })}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="two-col">
            <label>
              Emoji / İkon
              <input
                value={editProd.emoji}
                onChange={(e) => setEditProd({ ...editProd, emoji: e.target.value })}
              />
            </label>
            <label>
              Kalori (kcal)
              <input
                type="number"
                value={editProd.kcal}
                onChange={(e) => setEditProd({ ...editProd, kcal: Number(e.target.value) })}
              />
            </label>
          </div>

          <div className="two-col">
            <label>
              Protein (g)
              <input
                type="number"
                step="0.5"
                value={editProd.protein_g}
                onChange={(e) => setEditProd({ ...editProd, protein_g: Number(e.target.value) })}
              />
            </label>
            <label>
              Karbonhidrat (g)
              <input
                type="number"
                step="0.5"
                value={editProd.carb_g}
                onChange={(e) => setEditProd({ ...editProd, carb_g: Number(e.target.value) })}
              />
            </label>
          </div>

          <label>
            Açıklama
            <textarea
              rows={2}
              value={editProd.description}
              onChange={(e) => setEditProd({ ...editProd, description: e.target.value })}
            />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={editProd.is_daily}
              onChange={(e) => setEditProd({ ...editProd, is_daily: e.target.checked })}
            />
            <span>Günlük / Çorba Menüsü</span>
          </label>

          <div className="prow" style={{ marginTop: '1rem' }}>
            <button type="submit" className="btn gold sm">
              Değişiklikleri Kaydet
            </button>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setEditProductModal(false)}
            >
              Vazgeç
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
