import { useEffect, useRef } from 'react';

/**
 * Telefonun GERİ tuşu / tarayıcı geri oku, uygulamanın ana ekranından dışarı (giriş sayfasına, önceki siteye)
 * çıkarmasın. `onBack` true dönerse geri hareketi uygulama içinde işlenmiş sayılır (ör. açık pencereyi kapatmak).
 * Çıkış YALNIZCA çıkış düğmesiyle yapılır.
 */
export function useBackTrap(active: boolean, onBack?: () => boolean | void) {
  const cb = useRef(onBack);
  cb.current = onBack;
  useEffect(() => {
    if (!active) return;
    const guard = () => window.history.pushState({ backTrap: true }, '', window.location.href);
    guard();
    const onPop = () => {
      guard(); // sayfadan ayrılmayı engelle
      cb.current?.();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [active]);
}
