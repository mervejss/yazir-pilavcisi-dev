import { useEffect, useState } from 'react';
import Icon from '@/components/ui/Icon';

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/** Siteyi telefona uygulama gibi ekleme (Android: tek dokunuş · iPhone: yönerge). Alt bilgide küçük bir bağlantı olarak durur. */
export default function InstallPrompt() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    // Ana siteye özel manifest (kurye sayfası kendi manifestini ekler)
    const l = document.createElement('link');
    l.rel = 'manifest';
    l.href = '/site.webmanifest';
    document.head.appendChild(l);
    setInstalled(isStandalone());
    const onBip = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
    };
    const onInst = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onBip);
    window.addEventListener('appinstalled', onInst);
    return () => {
      l.remove();
      window.removeEventListener('beforeinstallprompt', onBip);
      window.removeEventListener('appinstalled', onInst);
    };
  }, []);

  if (installed || (!evt && !isIOS())) return null;

  const go = async () => {
    if (evt) {
      await evt.prompt();
      await evt.userChoice.catch(() => null);
      setEvt(null);
    } else setHelp((v) => !v);
  };

  return (
    <div className="install-box">
      <button type="button" className="foot-link install-btn" onClick={go}>
        <Icon name="phone" size={15} /> Uygulamayı ana ekrana ekle
      </button>
      {help && (
        <p className="small muted install-help">
          iPhone: Safari'de alttaki <b>Paylaş</b> simgesine dokunun, ardından <b>"Ana Ekrana Ekle"</b>'yi seçin.
        </p>
      )}
    </div>
  );
}
