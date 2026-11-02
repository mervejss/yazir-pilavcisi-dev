import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { RestaurantGallery } from '@/types/database';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function GalleryPage() {
    const [photos, setPhotos] = useState<RestaurantGallery[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchGallery = async () => {
            setLoading(true);
            const { data } = await supabase
                .from('restaurant_gallery')
                .select('*')
                .eq('is_active', true)
                .order('sort_order', { ascending: true });
            if (data) setPhotos(data);
            setLoading(false);
        };
        fetchGallery();
    }, []);

    if (loading) return <LoadingSpinner />;

    return (
        <main className="page">
            <h1>Restoranımızdan Kareler</h1>
            <p className="muted">Yazır Pilavcısı atmosferi, lezzetlerimiz ve mutfağımızdan kareler.</p>

            {photos.length === 0 ? (
                <p className="muted center" style={{ marginTop: '3rem', padding: '2rem' }}>
                    Henüz galeriye fotoğraf eklenmedi.
                </p>
            ) : (
                <div
                    className="grid3"
                    style={{
                        marginTop: '1.5rem',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                        gap: '1.5rem'
                    }}
                >
                    {photos.map((item) => {
                        const imageUrl = item.image_path.startsWith('http')
                            ? item.image_path
                            : `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/business-images/${item.image_path}`;

                        return (
                            <div
                                key={item.id}
                                className="card"
                                style={{
                                    padding: '0.6rem',
                                    borderRadius: '14px',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                                    background: 'var(--card-bg)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    transition: 'transform 0.2s ease',
                                }}
                            >
                                <div
                                    style={{
                                        width: '100%',
                                        aspectRatio: '1 / 1',
                                        borderRadius: '10px',
                                        overflow: 'hidden',
                                        background: '#f0eeea'
                                    }}
                                >
                                    <img
                                        src={imageUrl}
                                        alt={item.title || 'Yazır Pilavcısı'}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                </div>
                                {item.title && (
                                    <h4 style={{ padding: '0.8rem 0.4rem 0.4rem', margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>
                                        {item.title}
                                    </h4>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </main>
    );
}