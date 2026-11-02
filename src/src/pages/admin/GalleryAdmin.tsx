import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { RestaurantGallery } from '@/types/database';
import Switch from '@/components/ui/Switch';
import Modal from '@/components/ui/Modal';
import toast from 'react-hot-toast';

export default function GalleryAdmin() {
    const [photos, setPhotos] = useState<RestaurantGallery[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);

    // New photo state
    const [newTitle, setNewTitle] = useState('');
    const [newAspectRatio, setNewAspectRatio] = useState<'1/1' | '16/9' | '4/3'>('1/1');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Edit modal state
    const [editModal, setEditModal] = useState(false);
    const [selectedPhoto, setSelectedPhoto] = useState<RestaurantGallery | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const editFileInputRef = useRef<HTMLInputElement>(null);

    const fetchGallery = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('restaurant_gallery')
            .select('*')
            .order('sort_order', { ascending: true });
        if (data) setPhotos(data);
        setLoading(false);
    };

    useEffect(() => {
        fetchGallery();
    }, []);

    const handleTriggerUpload = () => {
        if (!newTitle.trim()) {
            toast.error('Lütfen önce fotoğraf başlığı veya açıklaması yazın!');
            return;
        }
        fileInputRef.current?.click();
    };

    // Canvas tabanlı basit ve güçlü kırpma / oranlandırma fonksiyonu
    const processAndUploadImage = async (file: File, targetRatio: '1/1' | '16/9' | '4/3', onComplete: (path: string) => void) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = async () => {
                const canvas = document.createElement('canvas');
                let srcW = img.width;
                let srcH = img.height;

                let [ratioW, ratioH] = targetRatio.split('/').map(Number);
                let desiredRatio = ratioW / ratioH;

                let cropW = srcW;
                let cropH = srcW / desiredRatio;

                if (cropH > srcH) {
                    cropH = srcH;
                    cropW = srcH * desiredRatio;
                }

                let startX = (srcW - cropW) / 2;
                let startY = (srcH - cropH) / 2;

                // Kalite standartları için maksimum boyutlandırma
                canvas.width = 1080;
                canvas.height = 1080 / desiredRatio;

                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                ctx.drawImage(img, startX, startY, cropW, cropH, 0, 0, canvas.width, canvas.height);

                canvas.toBlob(async (blob) => {
                    if (!blob) return;
                    try {
                        const fileName = `${Date.now()}.jpg`;
                        const filePath = `gallery/${fileName}`;

                        const { error: uploadError } = await supabase.storage
                            .from('business-images')
                            .upload(filePath, blob, { contentType: 'image/jpeg', upsert: true });

                        if (uploadError) throw uploadError;
                        onComplete(filePath);
                    } catch (err: any) {
                        toast.error(err.message || 'Görsel işlenemedi');
                        setUploading(false);
                    }
                }, 'image/jpeg', 0.9);
            };
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';

        setUploading(true);
        processAndUploadImage(file, newAspectRatio, async (filePath) => {
            try {
                const { error: dbError } = await supabase.from('restaurant_gallery').insert({
                    title: newTitle.trim(),
                    image_path: filePath,
                    sort_order: photos.length + 1,
                    is_active: true,
                });

                if (dbError) throw dbError;

                toast.success('Fotoğraf kırpıldı ve galeriye eklendi!');
                setNewTitle('');
                fetchGallery();
            } catch (err: any) {
                toast.error(err.message || 'Kayıt başarısız');
            } finally {
                setUploading(false);
            }
        });
    };

    const handleEditFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedPhoto) return;
        e.target.value = '';

        setUploading(true);
        processAndUploadImage(file, '1/1', async (filePath) => {
            try {
                // Eski görseli sil
                if (selectedPhoto.image_path) {
                    await supabase.storage.from('business-images').remove([selectedPhoto.image_path]);
                }

                const { error } = await supabase
                    .from('restaurant_gallery')
                    .update({ image_path: filePath, title: editTitle.trim() })
                    .eq('id', selectedPhoto.id);

                if (error) throw error;

                toast.success('Fotoğraf güncellendi');
                setEditModal(false);
                setSelectedPhoto(null);
                fetchGallery();
            } catch (err: any) {
                toast.error(err.message || 'Güncellenemedi');
            } finally {
                setUploading(false);
            }
        });
    };

    const handleToggleActive = async (id: string, current: boolean) => {
        try {
            const { error } = await supabase
                .from('restaurant_gallery')
                .update({ is_active: !current })
                .eq('id', id);

            if (error) throw error;
            setPhotos(photos.map((p) => (p.id === id ? { ...p, is_active: !current } : p)));
            toast.success('Durum güncellendi');
        } catch (err: any) {
            toast.error(err.message || 'Güncellenemedi');
        }
    };

    const handleMoveOrder = async (photo: RestaurantGallery, direction: 'up' | 'down') => {
        const sorted = [...photos].sort((a, b) => a.sort_order - b.sort_order);
        const currentIndex = sorted.findIndex((p) => p.id === photo.id);
        if (currentIndex === -1) return;

        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (targetIndex < 0 || targetIndex >= sorted.length) return;

        const targetPhoto = sorted[targetIndex];

        try {
            const currentOrder = photo.sort_order;
            const targetOrder = targetPhoto.sort_order;

            const newCurrentOrder = currentOrder === targetOrder
                ? (direction === 'up' ? targetOrder - 1 : targetOrder + 1)
                : targetOrder;
            const newTargetOrder = currentOrder;

            await Promise.all([
                supabase.from('restaurant_gallery').update({ sort_order: newCurrentOrder }).eq('id', photo.id),
                supabase.from('restaurant_gallery').update({ sort_order: newTargetOrder }).eq('id', targetPhoto.id),
            ]);

            toast.success('Sıralama güncellendi');
            fetchGallery();
        } catch (err: any) {
            toast.error(err.message || 'Sıralama değiştirilemedi');
        }
    };

    const handleDeletePhoto = async (photo: RestaurantGallery) => {
        if (!window.confirm(`"${photo.title || 'Fotoğraf'}" öğesini silmek istediğinize emin misiniz?`)) return;

        try {
            if (photo.image_path) {
                await supabase.storage.from('business-images').remove([photo.image_path]);
            }
            const { error } = await supabase.from('restaurant_gallery').delete().eq('id', photo.id);
            if (error) throw error;

            toast.success('Fotoğraf silindi');
            fetchGallery();
        } catch (err: any) {
            toast.error(err.message || 'Silinemedi');
        }
    };

    const handleOpenEdit = (p: RestaurantGallery) => {
        setSelectedPhoto(p);
        setEditTitle(p.title || '');
        setEditModal(true);
    };

    const handleSaveEditTitle = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedPhoto) return;

        try {
            const { error } = await supabase
                .from('restaurant_gallery')
                .update({ title: editTitle.trim() })
                .eq('id', selectedPhoto.id);

            if (error) throw error;

            toast.success('Başlık güncellendi');
            setEditModal(false);
            setSelectedPhoto(null);
            fetchGallery();
        } catch (err: any) {
            toast.error(err.message || 'Güncellenemedi');
        }
    };

    if (loading) return <p className="muted center">Galeri yükleniyor...</p>;

    return (
        <>
            <div className="bar">
                <div>
                    <h1>Galeri Yönetimi</h1>
                    <p className="muted" style={{ margin: 0 }}>
                        Restoran fotoğraflarını kare veya yatay oranlarda otomatik kırparak ekleyin ve yönetin
                    </p>
                </div>
            </div>

            {/* Yeni Fotoğraf Yükleme ve Boyut Seçim Alanı */}
            <div className="card" style={{ marginBottom: '1.5rem', background: 'var(--card-bg)' }}>
                <h3>Yeni Fotoğraf Ekle & Kırp</h3>
                <p className="muted small" style={{ marginBottom: '1rem' }}>
                    Başlık yazın, kırpma oranını seçin ve fotoğrafınızı seçerek otomatik boyutlandırıp yükleyin.
                </p>

                <div className="two-col" style={{ alignItems: 'flex-end', gap: '1rem' }}>
                    <label>
                        Fotoğraf Başlığı / Açıklaması
                        <input
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                            placeholder="Örn: İç Mekan Oturma Alanı"
                        />
                    </label>

                    <label>
                        Kırpma / En-Boy Oranı
                        <select
                            value={newAspectRatio}
                            onChange={(e: any) => setNewAspectRatio(e.target.value)}
                            style={{ width: '100%', padding: '0.55em', borderRadius: '8px', border: '1px solid var(--line)' }}
                        >
                            <option value="1/1">Instagram Kare (1:1)</option>
                            <option value="16/9">Geniş Yatay (16:9)</option>
                            <option value="4/3">Klasik Yatay (4:3)</option>
                        </select>
                    </label>

                    <button
                        type="button"
                        className="btn gold"
                        onClick={handleTriggerUpload}
                        disabled={uploading}
                        style={{ height: '42px' }}
                    >
                        {uploading ? 'İşleniyor...' : '📁 Fotoğraf Seç & Yükle'}
                    </button>
                </div>
            </div>

            <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
            />

            <input
                type="file"
                ref={editFileInputRef}
                style={{ display: 'none' }}
                accept="image/jpeg,image/png,image/webp"
                onChange={handleEditFileChange}
            />

            <div className="card">
                <h3>Yüklenen Görseller ({photos.length})</h3>

                {photos.length === 0 ? (
                    <p className="muted center" style={{ padding: '3rem' }}>Henüz galeriye fotoğraf eklenmemiş.</p>
                ) : (
                    <table className="tbl" style={{ marginTop: '1rem' }}>
                        <thead>
                        <tr>
                            <th style={{ width: '60px' }}>Sıra</th>
                            <th style={{ width: '100px' }}>Önizleme</th>
                            <th>Başlık / Açıklama</th>
                            <th>Durum</th>
                            <th style={{ textAlign: 'right' }}>İşlemler</th>
                        </tr>
                        </thead>
                        <tbody>
                        {photos.map((p) => {
                            const imageUrl = p.image_path.startsWith('http')
                                ? p.image_path
                                : `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/business-images/${p.image_path}`;

                            return (
                                <tr key={p.id}>
                                    <td>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                            <button
                                                type="button"
                                                className="btn ghost sm"
                                                style={{ padding: '0.1em 0.4em', fontSize: '0.75rem', lineHeight: 1 }}
                                                onClick={() => handleMoveOrder(p, 'up')}
                                            >
                                                ▲
                                            </button>
                                            <b style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{p.sort_order}</b>
                                            <button
                                                type="button"
                                                className="btn ghost sm"
                                                style={{ padding: '0.1em 0.4em', fontSize: '0.75rem', lineHeight: 1 }}
                                                onClick={() => handleMoveOrder(p, 'down')}
                                            >
                                                ▼
                                            </button>
                                        </div>
                                    </td>

                                    <td>
                                        <div
                                            style={{
                                                width: '80px',
                                                height: '80px',
                                                borderRadius: '10px',
                                                overflow: 'hidden',
                                                border: '1px solid var(--line)',
                                                background: '#000',
                                            }}
                                        >
                                            <img
                                                src={imageUrl}
                                                alt={p.title}
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            />
                                        </div>
                                    </td>

                                    <td>
                                        <b style={{ fontSize: '1rem' }}>{p.title || 'Başlıksız Fotoğraf'}</b>
                                        <div className="small muted">Eklenme: {new Date(p.created_at).toLocaleDateString('tr-TR')}</div>
                                    </td>

                                    <td>
                                        <Switch
                                            checked={p.is_active}
                                            onChange={() => handleToggleActive(p.id, p.is_active)}
                                            label={p.is_active ? 'Yayında' : 'Gizli'}
                                        />
                                    </td>

                                    <td style={{ textAlign: 'right' }}>
                                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                                            <button
                                                type="button"
                                                className="btn ghost sm"
                                                onClick={() => handleOpenEdit(p)}
                                            >
                                                ✏️ Düzenle
                                            </button>
                                            <button
                                                type="button"
                                                className="btn ghost sm"
                                                style={{ color: 'var(--danger)' }}
                                                onClick={() => handleDeletePhoto(p)}
                                            >
                                                🗑️ Sil
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Düzenleme ve Görsel Değiştirme Modal */}
            <Modal open={editModal} onClose={() => setEditModal(false)}>
                <h2>Fotoğrafı Düzenle</h2>
                <form onSubmit={handleSaveEditTitle} className="form">
                    <label>
                        Fotoğraf Başlığı / Açıklaması
                        <input
                            required
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                        />
                    </label>

                    {selectedPhoto && (
                        <div style={{ marginTop: '1rem', padding: '0.8rem', background: '#faf9f5', borderRadius: '8px' }}>
                            <p className="small muted" style={{ margin: '0 0 0.5rem 0' }}>Fotoğrafı yenisiyle değiştirmek isterseniz:</p>
                            <button
                                type="button"
                                className="btn ghost sm"
                                onClick={() => editFileInputRef.current?.click()}
                                disabled={uploading}
                            >
                                {uploading ? 'Yükleniyor...' : '🖼️ Yeni Fotoğraf Seç ve Değiştir'}
                            </button>
                        </div>
                    )}

                    <div className="prow" style={{ marginTop: '1.2rem' }}>
                        <button type="submit" className="btn gold sm">
                            Başlığı Kaydet
                        </button>
                        <button
                            type="button"
                            className="btn ghost sm"
                            onClick={() => setEditModal(false)}
                        >
                            Kapat
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
}