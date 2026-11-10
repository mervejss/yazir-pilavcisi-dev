import type { CSSProperties } from 'react';

/** Yerel SVG ikon seti (çizgi stili, currentColor). Harici paket gerektirmez. */
const PATHS: Record<string, string> = {
  download: 'M12 4v11 M7.5 11.5L12 16l4.5-4.5 M5 20h14',
  tag: 'M3 12V4h8l10 10-8 8z M7.5 8.5a1 1 0 1 0 0-.01',
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  menu: 'M4 4h5v16H4z M9 5h5 M9 9h5 M14 4h6v16h-6z M17 8v8',
  utensils: 'M5 3v7a3 3 0 0 0 3 3v8 M8 3v7 M11 3v7a3 3 0 0 1-3 3 M18 21V3c-2.2 1-3.5 3.6-3.5 7 0 2 1.2 3.2 3.5 3.5',
  cart: 'M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6 M10 20.2a.6.6 0 1 0 0 .01 M18 20.2a.6.6 0 1 0 0 .01',
  bag: 'M5 8h14l-1 12H6z M9 8V7a3 3 0 0 1 6 0v1',
  users: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20 M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7 M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35 M15.5 4.2a3.5 3.5 0 0 1 0 6.6',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M4 21a8 8 0 0 1 16 0',
  image: 'M4 5h16v14H4z M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3 M4 17l5-5 4 4 3-3 4 4',
  star: 'M12 3l2.8 5.9 6.5.9-4.7 4.5 1.1 6.4L12 17.6 6.3 20.7l1.1-6.4L2.7 9.8l6.5-.9z',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  message: 'M4 5h16v11H9l-5 4z',
  logout: 'M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4 M16 8l4 4-4 4 M20 12H9',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  clipboard: 'M9 4h6v3H9z M7 5.5H5v15.5h14V5.5h-2 M9 12h6 M9 16h4',
  grid: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  layout: 'M4 4h7v9H4z M13 4h7v5h-7z M13 11h7v9h-7z M4 15h7v5H4z',
  truck: 'M2 6h11v10H2z M13 10h4l3 3v3h-7 M6 19.3a1.6 1.6 0 1 0 0-.01 M17 19.3a1.6 1.6 0 1 0 0-.01',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z M9 4v14 M15 6v14',
  chart: 'M4 20V4 M4 20h16 M8 16v-5 M12 16V8 M16 16v-3',
  settings: 'M4 7h10 M18 7h2 M4 17h2 M10 17h10 M16 5v4 M8 15v4',
  plus: 'M12 5v14 M5 12h14',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14 M20 20l-4-4',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12 M18 6L6 18',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M12 7v5l3 2',
  qr: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h2v2h-2z M18 14h2v2h-2z M14 18h2v2h-2z M18 18h2v2h-2z',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v6 M14 11v6',
  edit: 'M4 20l1-4L16 5l3 3L8 19z M14 7l3 3',
  lock: 'M6 11h12v9H6z M8 11V8a4 4 0 0 1 8 0v3',
  zap: 'M13 2L4 14h7l-1 8 9-12h-7z',
  bell: 'M6 17v-6a6 6 0 0 1 12 0v6l2 2H4z M10 21h4',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6',
  wallet: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M3 7l2-3h12 M16 13.5h2',
  menuIcon: 'M4 6h16 M4 12h16 M4 18h16',
  chevronDown: 'M6 9l6 6 6-6',
  mapPin: 'M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M12 11v5 M12 7.8v.01',
  flame: 'M12 3c1 3.5 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .2 1.2.8 2 1.5 2.3C10 8.5 10.5 5.5 12 3z',
  heart: 'M12 20s-8-4.8-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.2 12 20 12 20z',
  dashboard: 'M4 13a8 8 0 0 1 16 0 M12 13l4-4 M5 20h14',
  cash: 'M3 7h18v10H3z M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5 M6.5 10v.01 M17.5 14v.01',
  card: 'M3 6h18v12H3z M3 10h18 M7 15h4',
  minus: 'M5 12h14',
  arrowRight: 'M5 12h14 M13 6l6 6-6 6',
  chef: 'M7 14a4 4 0 0 1-.6-7.9A5 5 0 0 1 16 5.5a4 4 0 0 1 1 7.9V19H7z M7 16h10',
  copy: 'M9 9h11v11H9z M5 15V4h11',
  print: 'M7 9V3h10v6 M6 17H4v-7h16v7h-2 M7 14h10v7H7z',
  cup: 'M6 5h12l-1.5 15h-9z M7.2 10h9.6 M12 5l1.5-3',
  leaf: 'M5 19c0-8 5-14 15-14 0 10-6 15-14 15 M5 19l8-8',
  instagram: 'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4z M12 16.2a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4 M17.3 6.7v.01',
  mail: 'M3 6h18v12H3z M3 7l9 6.5L21 7',
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  navigation: 'M4 11l16-7-7 16-2.5-6.5z',
  calendar: 'M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4',
  refresh: 'M20 12a8 8 0 1 1-2.5-5.8 M20 4v5h-5',
};

export type IconName = keyof typeof PATHS;

interface Props {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
}

export default function Icon({ name, size = 18, className = '', style, strokeWidth = 2 }: Props) {
  const d = PATHS[name] || PATHS.info;
  return (
    <svg
      className={`ico ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {d.split(' M').map((seg, i) => (
        <path key={i} d={i === 0 ? seg : 'M' + seg} />
      ))}
    </svg>
  );
}
