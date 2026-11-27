import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { tl } from '@/lib/helpers';

/** Müşteri profilinde sadakat puanı özeti (puan sistemi kapalıysa görünmez) */
export default function LoyaltyCard() {
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    supabase.rpc('my_loyalty').then(({ data, error }) => {
      if (!error && data) setD(data);
    });
  }, []);
  if (!d?.enabled) return null;
  return (
    <div className="loyalty-card">
      <div className="loyalty-pts">
        <small>Puan bakiyem</small>
        <b>⭐ {d.points}</b>
        <span>{tl(Number(d.points) * Number(d.point_value || 1))} indirim değerinde</span>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Her {Math.round(1 / Number(d.earn_per_lira || 0.05))} ₺ alışverişte 1 puan kazanırsınız. En az {d.min_redeem} puanla sepette kullanabilirsiniz.
      </p>
      {Array.isArray(d.history) && d.history.length > 0 && (
        <ul className="loyalty-hist">
          {d.history.slice(0, 5).map((h: any, i: number) => (
            <li key={i}>
              <span>{h.note || (h.reason === 'earn' ? 'Puan kazandınız' : h.reason === 'redeem' ? 'Puan kullandınız' : 'Düzenleme')}</span>
              <b className={h.points >= 0 ? 'up' : 'down'}>{h.points > 0 ? '+' : ''}{h.points}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
