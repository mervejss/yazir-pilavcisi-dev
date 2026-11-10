import { useEffect, useState } from 'react';

/** Sayıyı 0'dan hedefe doğru animasyonla artırır (hareket azaltma tercihine saygılı) */
export function useCountUp(target: number, duration = 900, decimals = 0): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !Number.isFinite(target)) {
      setV(target || 0);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}
