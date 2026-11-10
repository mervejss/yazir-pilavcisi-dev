import { useState } from 'react';
import { getPublicUrl } from '@/lib/supabase';

interface ProductImageProps {
  imagePath?: string | null;
  emoji?: string | null;
  name: string;
  className?: string;
  style?: React.CSSProperties;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'fill';
}

export default function ProductImage({
  imagePath,
  emoji,
  name,
  className = '',
  style,
  size = 'fill',
}: ProductImageProps) {
  const [hasError, setHasError] = useState(false);

  // Determine image URL
  const imageUrl =
    imagePath && !hasError
      ? imagePath.startsWith('http')
        ? imagePath
        : getPublicUrl('product-images', imagePath)
      : null;

  const sizeStyles: Record<string, React.CSSProperties> = {
    sm: { width: '40px', height: '40px', minWidth: '40px', fontSize: '1.4rem', borderRadius: '8px' },
    md: { width: '64px', height: '64px', minWidth: '64px', fontSize: '2rem', borderRadius: '10px' },
    lg: { width: '96px', height: '96px', minWidth: '96px', fontSize: '3rem', borderRadius: '12px' },
    xl: { width: '100%', height: '220px', fontSize: '4.5rem', borderRadius: '14px' },
    fill: { width: '100%', height: '100%', fontSize: '3.4rem' },
  };

  const containerStyle: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'var(--surface)',
    ...sizeStyles[size],
    ...style,
  };

  if (imageUrl) {
    return (
      <div className={`prod-img-box ${className}`} style={containerStyle}>
        <img
          src={imageUrl}
          alt={name}
          loading="lazy"
          onError={() => setHasError(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      </div>
    );
  }

  return (
    <div className={`prod-img-box fallback ${className}`} style={containerStyle}>
      <span role="img" aria-label={name} style={{ lineHeight: 1 }}>
        {emoji || '🍽️'}
      </span>
    </div>
  );
}
