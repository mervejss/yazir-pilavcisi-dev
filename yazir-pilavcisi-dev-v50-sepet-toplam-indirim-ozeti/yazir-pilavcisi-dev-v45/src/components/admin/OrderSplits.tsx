import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { tl } from '@/lib/helpers';

const ICON: Record<string, string> = { cash_on_delivery: '💵', card_on_delivery: '💳', iban: '🏦' };

/** Kuryenin kişi bazlı aldığı ayrı ödemeler (SQL 31 yoksa hiçbir şey göstermez) */
export default function OrderSplits({ orderId }: { orderId: string }) {
  const [rows, setRows] = useState<Array<{ label: string | null; method: string; amount: number }>>([]);
  useEffect(() => {
    let off = false;
    supabase
      .from('order_split_payments')
      .select('label,method,amount,seq')
      .eq('order_id', orderId)
      .order('seq')
      .then(({ data, error }) => {
        if (!off && !error && data) setRows(data as any);
      });
    return () => {
      off = true;
    };
  }, [orderId]);
  if (rows.length === 0) return null;
  return (
    <div className="note small">
      👥 Ayrı ödemeler: {rows.map((r, i) => `${r.label || `${i + 1}. kişi`} ${ICON[r.method] || ''} ${tl(Number(r.amount))}`).join(' · ')}
    </div>
  );
}
