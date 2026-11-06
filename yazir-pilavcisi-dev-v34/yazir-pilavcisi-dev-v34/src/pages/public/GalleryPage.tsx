import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import type { RestaurantGallery } from '@/types/database';
import { galleryImageUrl } from '@/lib/menuImages';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Lightbox from '@/components/ui/Lightbox';

export default function GalleryPage() {
  const [photos, setPhotos] = useState<RestaurantGallery[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState<string>('all');
  const [lb, setLb] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('restaurant_gallery')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (data) setPhotos(data as unknown as RestaurantGallery[]);
      setLoading(false);
    })();
  }, []);

  const categories = useMemo(() => [...new Set(photos.map((p) => p.category).filter(Boolean))] as string[], [photos]);
  const shown = useMemo(
    () => photos.filter((p) => cat === 'all' || (cat === '__star' ? p.is_featured : p.category === cat)),
    [photos, cat],
  );
  const hasStar = photos.some((p) => p.is_featured);

  if (loading) return <LoadingSpinner />;

  return (
    <main className="page">
      <h1>Restoranımızdan Kareler</h1>
      <p className="muted">Yazır Pilavcısı atmosferi, lezzetlerimiz ve mutfağımızdan kareler.</p>

      {(categories.length > 0 || hasStar) && (
        <div className="seg pub-gal-tabs">
          <button type="button" className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>Tümü</button>
          {hasStar && (
            <button type="button" className={cat === '__star' ? 'on' : ''} onClick={() => setCat('__star')}>⭐ Öne çıkanlar</button>
          )}
          {categories.map((c) => (
            <button type="button" key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="muted center" style={{ marginTop: '3rem', padding: '2rem' }}>Henüz galeriye fotoğraf eklenmedi.</p>
      ) : (
        <div className="pub-gal-grid">
          {shown.map((item, i) => (
            <figure key={item.id} className="pub-gal-item">
              <button type="button" onClick={() => setLb(i)} aria-label={`${item.title || 'Fotoğraf'} büyüt`}>
                <img src={galleryImageUrl(item.image_path)} alt={item.title || 'Yazır Pilavcısı'} loading="lazy" />
                {item.is_featured && <span className="pub-gal-star">⭐</span>}
              </button>
              {(item.title || item.description) && (
                <figcaption>
                  {item.title && <b>{item.title}</b>}
                  {item.description && <span>{item.description}</span>}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      )}

      <Lightbox
        open={lb !== null}
        items={shown.map((p) => ({
          url: galleryImageUrl(p.image_path),
          title: p.title || 'Yazır Pilavcısı',
          subtitle: [p.category, p.description].filter(Boolean).join(' · '),
        }))}
        index={lb ?? 0}
        onIndexChange={setLb}
        onClose={() => setLb(null)}
        showDownload={false}
      />
    </main>
  );
}
