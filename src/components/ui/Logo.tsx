interface LogoProps {
  /** Eski kullanım uyumluluğu: açık zemin üzerinde gösterim (logo koyu plaka içinde verilir) */
  dark?: boolean;
  className?: string;
  /** Yalnızca yuvarlak amblem */
  mark?: boolean;
  height?: number;
}

/** Yazır Pilavcısı altın logosu (public/logo.png). Alt metin erişilebilirlik içindir. */
export default function Logo({ dark, className = '', mark, height }: LogoProps) {
  const src = mark ? '/logo-mark.png' : '/logo.png';
  return (
    <img
      className={`logo-img${mark ? ' is-mark' : ''}${dark ? ' on-light' : ''} ${className}`}
      src={src}
      alt="Yazır Pilavcısı"
      height={height}
      style={height ? { height } : undefined}
      draggable={false}
    />
  );
}
