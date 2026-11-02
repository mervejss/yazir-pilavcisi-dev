interface LogoProps {
  dark?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

export default function Logo({ dark, className = '', size = 'md', showText = false }: LogoProps) {
  const heightMap = {
    sm: '34px',
    md: '44px',
    lg: '56px',
  };

  return (
    <div className={`brand-logo-container ${dark ? 'dark' : ''} ${className}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.65rem' }}>
      <img
        src="/logo.jpg"
        alt="Yazır Pilavcısı"
        className="brand-logo-img"
        style={{
          height: heightMap[size],
          width: 'auto',
          objectFit: 'contain',
          borderRadius: '8px',
          filter: 'drop-shadow(0 2px 8px rgba(212, 175, 55, 0.35))',
          transition: 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      />
      {showText && (
        <span className="brand-logo-text" style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
          <span style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.05em', color: 'var(--gold)' }}>
            YAZIR
          </span>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.15em', color: 'var(--text-muted)' }}>
            PİLAVCISI
          </span>
        </span>
      )}
    </div>
  );
}
