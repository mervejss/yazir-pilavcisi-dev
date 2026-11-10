import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Icon from '@/components/ui/Icon';
import { useCartStore } from '@/stores/cartStore';
import { cartMessage, quickMessages, waUrl } from '@/lib/whatsapp';
import type { BusinessSettings } from '@/types/database';

interface Props {
  settings: BusinessSettings | null;
  open: boolean;
  statusLabel: string;
}

export const OPEN_WA_EVENT = 'open-whatsapp';
export const openWhatsApp = () => window.dispatchEvent(new Event(OPEN_WA_EVENT));

/** Sağ altta yüzen WhatsApp düğmesi + hazır mesaj penceresi. Ana sayfadaki "WhatsApp ile sipariş" da bunu açar. */
export default function WhatsAppWidget({ settings, open: isOpen, statusLabel }: Props) {
  const [show, setShow] = useState(false);
  const [text, setText] = useState('');
  const [locating, setLocating] = useState(false);
  const items = useCartStore((s) => s.items);
  const total = useCartStore((s) => s.total());

  useEffect(() => {
    const on = () => setShow(true);
    window.addEventListener(OPEN_WA_EVENT, on);
    return () => window.removeEventListener(OPEN_WA_EVENT, on);
  }, []);

  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setShow(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [show]);

  if (settings && settings.wa_widget_enabled === false) return null;

  const number = settings?.whatsapp;
  const send = (msg: string) => {
    window.open(waUrl(number, msg), '_blank', 'noopener');
    setShow(false);
  };

  const sendLocation = () => {
    if (!navigator.geolocation) return toast.error('Tarayıcı konum desteklemiyor');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        const link = `https://www.google.com/maps?q=${p.coords.latitude.toFixed(6)},${p.coords.longitude.toFixed(6)}`;
        send(`Merhaba, konumum: ${link}\nBu adrese paket servis yapıyor musunuz?`);
      },
      () => {
        setLocating(false);
        toast.error('Konum alınamadı, izin verdiğinizden emin olun');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const catalog = settings?.wa_catalog_url?.trim();

  return (
    <>
      <button type="button" className="wa-fab" onClick={() => setShow((v) => !v)} aria-label="WhatsApp ile yazın" aria-expanded={show}>
        <Icon name={show ? 'x' : 'message'} size={26} />
        {!show && <span className="wa-fab-t">WhatsApp</span>}
      </button>

      {show && (
        <>
          <div className="wa-back" onClick={() => setShow(false)} aria-hidden="true" />
          <section className="wa-pop scope-dark" role="dialog" aria-label="WhatsApp ile iletişim">
            <header className="wa-head">
              <span className="wa-ava"><Icon name="message" size={22} /></span>
              <div>
                <b>{settings?.name || 'Yazır Pilavcısı'}</b>
                <small className={isOpen ? 'on' : 'off'}><i /> {statusLabel}</small>
              </div>
              <button type="button" className="wa-x" onClick={() => setShow(false)} aria-label="Kapat"><Icon name="x" size={18} /></button>
            </header>

            <div className="wa-body">
              <p className="wa-hi">Merhaba 👋 Hızlıca yazmak için bir seçenek seçin, WhatsApp hazır mesajla açılsın.</p>

              {items.length > 0 && (
                <button type="button" className="wa-cart" onClick={() => send(cartMessage(items, total))}>
                  🛒 Sepetimi WhatsApp'tan gönder <small>({items.reduce((a, i) => a + i.quantity, 0)} ürün)</small>
                </button>
              )}

              <div className="wa-chips">
                {quickMessages(settings?.wa_quick_messages).map((m) => (
                  <button key={m} type="button" onClick={() => send(m)}>{m.replace(/^Merhaba,?\s*/i, '')}</button>
                ))}
                <button type="button" onClick={sendLocation} disabled={locating}>{locating ? 'Konum alınıyor…' : '📍 Konumumu gönder'}</button>
              </div>

              {catalog && (
                <a className="wa-cat" href={catalog} target="_blank" rel="noreferrer">🛍️ WhatsApp kataloğunu aç</a>
              )}

              <form
                className="wa-free"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (text.trim()) send(text.trim());
                }}
              >
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Kendi mesajınızı yazın…" maxLength={500} />
                <button type="submit" disabled={!text.trim()} aria-label="Gönder">Gönder</button>
              </form>
            </div>
          </section>
        </>
      )}
    </>
  );
}
