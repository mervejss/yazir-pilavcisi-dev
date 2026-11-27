/** Sesle yazma hatalarının GERÇEK nedenini bulup Türkçe, işe yarar bir mesaj verir.
 *  (Eskiden her hata "izin verilmedi" diyordu; asıl neden çoğu zaman sunucu başlığı / tarayıcı engeliydi.) */

/** Sunucu "Permissions-Policy: microphone=()" gönderdiyse tarayıcı izni hiç sormaz ve engeller. */
export function micBlockedByPolicy(): boolean {
  try {
    const d: any = document;
    const pp = d.permissionsPolicy || d.featurePolicy;
    if (pp && typeof pp.allowsFeature === 'function') return !pp.allowsFeature('microphone');
  } catch {
    /* yoksay */
  }
  return false;
}

export async function explainSpeechError(code: string): Promise<string> {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'Mikrofon yalnızca güvenli (https) bağlantıda çalışır. Siteyi https ile açın.';
  }
  if (micBlockedByPolicy()) {
    return 'Site sunucusu mikrofonu engelliyor (Permissions-Policy). public/_headers dosyasında microphone=(self) olmalı ve site yeniden yayınlanmalı.';
  }
  if (code === 'audio-capture') return 'Mikrofon bulunamadı veya başka bir uygulama kullanıyor. Mikrofonu kontrol edip tekrar deneyin.';
  if (code === 'network') return 'Ses tanıma için internet bağlantısı gerekir. Bağlantınızı kontrol edin.';
  if (code === 'service-not-allowed') {
    return 'Bu tarayıcıda ses tanıma servisi kapalı. Chrome (Android/bilgisayar) veya Safari (iPhone) kullanın; telefonda "Google ile sesli yazma" açık olmalı.';
  }
  // not-allowed: gerçekten tarayıcı mı engelledi? Bir kez izin isteyerek öğren (verilirse sonraki denemede çalışır)
  try {
    if (navigator.mediaDevices?.getUserMedia) {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      return 'Mikrofon izni verildi. Sesle yazma düğmesine bir kez daha basın.';
    }
  } catch (e: any) {
    const n = e?.name || '';
    if (n === 'NotFoundError') return 'Mikrofon bulunamadı. Cihazınızda mikrofon olduğundan emin olun.';
    if (n === 'NotReadableError') return 'Mikrofon başka bir uygulama tarafından kullanılıyor. Diğer uygulamayı kapatıp tekrar deneyin.';
  }
  return 'Mikrofon izni engelli. Adres çubuğundaki kilit/ayar simgesi → Site ayarları → Mikrofon → "İzin ver" deyip sayfayı yenileyin. (Telefonda: Ayarlar → Uygulamalar → tarayıcı → İzinler → Mikrofon.)';
}
