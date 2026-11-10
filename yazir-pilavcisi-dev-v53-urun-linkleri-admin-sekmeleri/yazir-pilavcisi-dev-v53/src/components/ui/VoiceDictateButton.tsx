import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { explainSpeechError } from '@/lib/voiceMic';

interface Props {
  /** Alanın şu anki değeri (kayıt başlarken buna eklenir) */
  value: string;
  /** Konuşuldukça (anlık) alanın yeni tam değerini yazar */
  onChange: (v: string) => void;
  /** Durdurulunca çağrılır: bu oturumda söylenen kesin (final) metinle istenirse temizleme/biçimlendirme yapılabilir
   *  (örn. telefon numarasını normalize etmek). Vermezseniz ham konuşulan metin alanda kalır. */
  onFinalize?: (spokenFinalText: string) => void;
  size?: 'sm' | 'md';
  className?: string;
  title?: string;
}

/** Herhangi bir input/textarea'nın yanına konup o alana doğrudan, anlık olarak sesle yazdıran mikrofon düğmesi.
 *  Durdur'a basılana kadar (tarayıcı sessizlikte otomatik keserse bile) kendiliğinden durmaz. */
export default function VoiceDictateButton({ value, onChange, onFinalize, size = 'sm', className = '', title }: Props) {
  const [active, setActive] = useState(false);
  const recRef = useRef<any>(null);
  const stoppedRef = useRef(true);
  const baseRef = useRef('');
  const finalRef = useRef('');
  const supported = typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  useEffect(
    () => () => {
      stoppedRef.current = true;
      try { recRef.current?.stop(); } catch { /* yoksay */ }
    },
    [],
  );

  const start = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    stoppedRef.current = false;
    baseRef.current = value && value.trim() ? value.trim() + ' ' : '';
    finalRef.current = '';
    const rec = new SR();
    rec.lang = 'tr-TR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      let finalChunk = '';
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalChunk += r[0].transcript + ' ';
        else interim += r[0].transcript;
      }
      if (finalChunk) finalRef.current = `${finalRef.current} ${finalChunk}`.replace(/\s+/g, ' ').trim();
      const live = `${finalRef.current} ${interim}`.replace(/\s+/g, ' ').trim();
      onChange(`${baseRef.current}${live}`.replace(/\s+/g, ' ').trim());
    };
    rec.onerror = (e: any) => {
      if (['not-allowed', 'service-not-allowed', 'audio-capture', 'network'].includes(e.error)) {
        stoppedRef.current = true;
        setActive(false);
        explainSpeechError(e.error).then((m) => toast.error(m, { id: 'mic-err', duration: 8000 }));
      }
      // 'no-speech' / 'aborted' vb. geçici durumlarda sessizce devam — onend yeniden başlatır
    };
    rec.onend = () => {
      if (!stoppedRef.current) {
        try { rec.start(); } catch { /* zaten başlatılıyorsa yoksay */ }
      }
    };
    recRef.current = rec;
    try {
      rec.start();
      setActive(true);
    } catch { /* yoksay */ }
  };

  const stop = () => {
    stoppedRef.current = true;
    try { recRef.current?.stop(); } catch { /* yoksay */ }
    setActive(false);
    const spoken = finalRef.current.trim();
    if (spoken && onFinalize) onFinalize(spoken);
  };

  if (!supported) return null;

  return (
    <button
      type="button"
      className={`voice-mic-btn ${size} ${active ? 'on' : ''} ${className}`}
      onClick={(e) => { e.preventDefault(); active ? stop() : start(); }}
      title={title || (active ? 'Durdurmak için tıklayın' : 'Sesle yazmak için tıklayın')}
      aria-label={active ? 'Sesle yazmayı durdur' : 'Sesle yaz'}
    >
      {active ? '⏹️' : '🎙️'}
    </button>
  );
}
