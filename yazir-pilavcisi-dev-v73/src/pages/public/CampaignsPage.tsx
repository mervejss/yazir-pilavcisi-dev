import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { conditionLines, discountLabel } from '@/lib/campaigns';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import toast from 'react-hot-toast';

export interface Campaign {
  id: string;
  code: string;
  title: string;
  description: string;
  discount_type: string;
  discount_value: number;
  max_discount: number | null;
  min_order_amount: number;
  starts_at: string | null;
  ends_at: string | null;
  daily_start: string | null;
  daily_end: string | null;
  weekdays: number[] | null;
  audience: string;
  remaining: number | null;
}

export function useCampaigns() {
  const [items, setItems] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.rpc('public_campaigns').then(({ data, error }) => {
      if (!error && data) setItems(data as unknown as Campaign[]);
      setLoading(false);
    });
  }, []);
  return { items, loading };
}

export function CampaignCard({ c }: { c: Campaign }) {
  const upcoming = c.starts_at && new Date(c.starts_at) > new Date();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(c.code);
      toast.success(`${c.code} kopyalandı — sepette kullanabilirsiniz`);
    } catch {
      toast(c.code);
    }
  };
  return (
    <article className={`camp-card${upcoming ? ' soon' : ''}`}>
      <div className="camp-badge">{discountLabel(c)}</div>
      {upcoming && <span className="camp-soon">Yakında · {new Date(c.starts_at!).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}</span>}
      <h3>{c.title || discountLabel(c)}</h3>
      {c.description && <p className="muted">{c.description}</p>}
      <ul className="camp-cond">
        {conditionLines(c).map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <div className="camp-code">
        <code>{c.code}</code>
        <button type="button" className="btn gold sm" onClick={copy}>Kopyala</button>
      </div>
    </article>
  );
}

export default function CampaignsPage() {
  const { items, loading } = useCampaigns();
  if (loading) return <LoadingSpinner />;
  return (
    <main className="page">
      <h1>🎟️ Kupon Kodları ve Kampanyalar</h1>
      <p className="muted">Kodu kopyalayın, sepetinizde “Kupon kodu” alanına yapıştırın.</p>
      {items.length === 0 ? (
        <div className="ad-empty" style={{ marginTop: '2rem' }}>
          <div>🎁</div>
          <h3>Şu an aktif kampanya yok</h3>
          <p className="muted">Yeni kampanyalar burada duyurulacak, bizi takip edin!</p>
          <Link className="btn gold" to="/menu">Menüye göz at</Link>
        </div>
      ) : (
        <div className="camp-grid">
          {items.map((c) => (
            <CampaignCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </main>
  );
}
