import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { TABLE_PHOTO, TABLE_SPOTS } from '@/config/tableMap';
import '@/styles/dinein.css';

export interface PublicTable { number: number; name: string | null; capacity: number; occupied: boolean }

/** Aktif masaları getirir (Admin → Masalar'da eklenen/çıkarılan masalar kendiliğinden yansır) */
export function usePublicTables() {
  const [tables, setTables] = useState<PublicTable[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let dead = false;
    const load = async () => {
      const { data, error } = await supabase.rpc('public_dining_tables');
      if (dead) return;
      if (error) { setFailed(true); return; }
      setFailed(false);
      setTables((data as PublicTable[]) || []);
    };
    void load();
    const iv = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 30000);
    return () => { dead = true; window.clearInterval(iv); };
  }, []);
  return { tables, failed };
}

/** "Restoranda yiyeceğim": fotoğraftan veya düğmelerden masa, sonra sandalye seçimi */
export default function DineInPicker({
  tableNo, setTableNo, seat, setSeat, lockedNo,
}: {
  tableNo: number | null; setTableNo: (n: number | null) => void;
  seat: number | null; setSeat: (n: number | null) => void;
  /** QR ile gelindiyse masa zaten bellidir */
  lockedNo?: number | null;
}) {
  const { tables, failed } = usePublicTables();
  const [photoOk, setPhotoOk] = useState(true);
  const current = lockedNo ?? tableNo;
  const sel = tables?.find((t) => t.number === current) || null;
  const seats = sel ? Math.min(Math.max(sel.capacity, 1), 12) : 0;

  // seçili masa kaldırıldıysa seçimi bırak
  useEffect(() => {
    if (tables && tableNo != null && !lockedNo && !tables.some((t) => t.number === tableNo)) { setTableNo(null); setSeat(null); }
  }, [tables, tableNo, lockedNo, setTableNo, setSeat]);

  const pick = (n: number) => { setTableNo(n); setSeat(null); };

  return (
    <div className="dine-pick">
      {lockedNo == null && (
        <>
          <h3>🪑 Hangi masadasınız?</h3>
          {failed && <p className="small disc-err">Masa listesi alınamadı. İnternetinizi kontrol edip sayfayı yenileyin.</p>}
          {tables && tables.length === 0 && <p className="small muted">Şu an seçilebilir masa yok. Lütfen garsonumuza söyleyin.</p>}
          {!tables && !failed && <p className="small muted">Masalar yükleniyor…</p>}

          {photoOk && tables && tables.length > 0 && (
            <div className="dine-photo">
              <img src={TABLE_PHOTO} alt="Restoran masa düzeni" onError={() => setPhotoOk(false)} />
              {tables.filter((t) => TABLE_SPOTS[t.number]).map((t) => (
                <button
                  key={t.number}
                  type="button"
                  className={`dine-spot${current === t.number ? ' on' : ''}${t.occupied ? ' busy' : ''}`}
                  style={{ left: `${TABLE_SPOTS[t.number].x}%`, top: `${TABLE_SPOTS[t.number].y}%` }}
                  onClick={() => pick(t.number)}
                  aria-label={`Masa ${t.number}`}
                  aria-pressed={current === t.number}
                >
                  {t.number}
                </button>
              ))}
            </div>
          )}
          {photoOk && tables && tables.length > 0 && <p className="small muted dine-help">Fotoğraftaki masa numarasına dokunun veya aşağıdan seçin.</p>}

          {tables && tables.length > 0 && (
            <div className="dine-nums" role="radiogroup" aria-label="Masa numarası">
              {tables.map((t) => (
                <button
                  key={t.number}
                  type="button"
                  role="radio"
                  aria-checked={current === t.number}
                  className={`${current === t.number ? 'on' : ''}${t.occupied ? ' busy' : ''}`}
                  onClick={() => pick(t.number)}
                >
                  <b>{t.number}</b>
                  <small>{t.name || (t.occupied ? 'dolu' : 'boş')}</small>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {lockedNo != null && <p className="dine-locked">✅ <b>{lockedNo > 0 ? `Masa ${lockedNo}` : 'Masanız'}</b> · QR kod ile tanındı</p>}

      {sel && seats > 0 && (
        <div className="dine-seats">
          <h3>💺 Sandalye <small className="muted">(isteğe bağlı — herkes kendi siparişini verebilir)</small></h3>
          <div className="dine-nums" role="radiogroup" aria-label="Sandalye">
            <button type="button" role="radio" aria-checked={seat == null} className={seat == null ? 'on' : ''} onClick={() => setSeat(null)}><b>Tüm masa</b></button>
            {Array.from({ length: seats }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" role="radio" aria-checked={seat === n} className={seat === n ? 'on' : ''} onClick={() => setSeat(n)}>
                <b>{n}</b><small>sandalye</small>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
