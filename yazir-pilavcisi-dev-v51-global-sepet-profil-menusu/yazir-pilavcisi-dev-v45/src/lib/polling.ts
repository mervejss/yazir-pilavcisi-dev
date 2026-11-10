// Ortak yardımcılar: gereksiz Supabase isteklerini (egress / log) azaltmak için.
// Kural: sekme gizliyken sorgu YOK; öne gelince tek seferde tazele. Art arda gelen gerçek zamanlı olaylar tek sorguya birleşir.

export const isHidden = (): boolean => typeof document !== 'undefined' && document.visibilityState === 'hidden';

/**
 * Görünürken her `ms` milisaniyede bir çalışır. Sekme gizliyken HİÇ çalışmaz;
 * sekme öne gelince, son çalışmadan `minGapMs` geçtiyse bir kez hemen çalışır.
 * İlk çağrıyı yapmaz (ilk yüklemeyi çağıran yapar). Döndürülen fonksiyon temizler.
 */
export function visiblePoll(fn: () => void | Promise<void>, ms: number, minGapMs = Math.min(ms, 20_000)): () => void {
  let last = Date.now();
  const run = () => {
    last = Date.now();
    void fn();
  };
  const iv = setInterval(() => {
    if (!isHidden()) run();
  }, ms);
  const onVis = () => {
    if (!isHidden() && Date.now() - last >= minGapMs) run();
  };
  document.addEventListener('visibilitychange', onVis);
  return () => {
    clearInterval(iv);
    document.removeEventListener('visibilitychange', onVis);
  };
}

/**
 * Gerçek zamanlı olaylar için birleştirici (throttle + trailing).
 * Olay gelince `wait` ms sonra TEK sorgu çalışır; bu sürede gelen diğer olaylar aynı sorguya katılır.
 * Sekme gizliyse sorgu ertelenir, sekme öne gelince bir kez çalışır.
 */
export function coalesce(fn: () => void | Promise<void>, wait: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;
  const onVis = () => {
    if (pending && !isHidden()) {
      pending = false;
      void fn();
    }
  };
  document.addEventListener('visibilitychange', onVis);
  return {
    call() {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        if (isHidden()) pending = true;
        else void fn();
      }, wait);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = false;
      document.removeEventListener('visibilitychange', onVis);
    },
  };
}
