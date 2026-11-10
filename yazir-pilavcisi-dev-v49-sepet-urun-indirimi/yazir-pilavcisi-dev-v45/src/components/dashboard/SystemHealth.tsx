import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

interface Health {
  db_bytes: number;
  storage_bytes: number;
  tables: Array<{ name: string; bytes: number; rows: number }>;
  counts: { orders: number; location_history: number; customers: number };
  retention_days: number;
}

// Supabase ücretsiz plan yaklaşık limitleri (değişebilir: supabase.com/pricing)
const DB_LIMIT = 500 * 1024 * 1024;
const STORAGE_LIMIT = 1024 * 1024 * 1024;

const mb = (b: number) => (b / 1024 / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 1 });

function Bar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, (used / limit) * 100);
  const cls = pct >= 85 ? 'bad' : pct >= 65 ? 'warn' : '';
  return (
    <div className="sh-row">
      <div className="sh-top"><span>{label}</span><b>{mb(used)} / {mb(limit)} MB · %{pct.toFixed(1)}</b></div>
      <div className="pn-bar"><i className={`sh-fill ${cls}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

/** Ücretsiz Supabase limitlerine ne kadar yaklaşıldığını gösterir (SQL 30 gerekir) */
export default function SystemHealth() {
  const isOwner = useAuthStore((s) => s.isOwner());
  const [h, setH] = useState<Health | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_system_health');
    if (error) return setMissing(true);
    setMissing(false);
    setH(data as unknown as Health);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const cleanup = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_cleanup_now');
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${data ?? 0} eski konum kaydı silindi`);
    load();
  };

  if (missing) return <div className="note small">Sistem sağlığı için <code>sql/30_ops_health_heat.sql</code> dosyasını çalıştırın.</div>;
  if (!h) return null;

  const warn = h.db_bytes / DB_LIMIT >= 0.65 || h.storage_bytes / STORAGE_LIMIT >= 0.65;
  return (
    <section className="card sh">
      <h2>🩺 Sistem durumu <small className="muted">(Supabase ücretsiz limit takibi)</small></h2>
      <Bar label="Veritabanı" used={h.db_bytes} limit={DB_LIMIT} />
      <Bar label="Dosya depolama (görseller)" used={h.storage_bytes} limit={STORAGE_LIMIT} />
      {warn && <p className="note small">Limite yaklaşıyorsunuz: eski konum geçmişini temizleyin, büyük görselleri küçültün ve gereksiz verileri silin.</p>}
      <p className="small muted">
        {h.counts.orders.toLocaleString('tr-TR')} sipariş · {h.counts.customers.toLocaleString('tr-TR')} kullanıcı · {h.counts.location_history.toLocaleString('tr-TR')} konum kaydı (en çok {h.retention_days} gün saklanır)
      </p>
      <details>
        <summary className="small">En büyük tablolar</summary>
        <ul className="sh-tables">
          {h.tables.map((t) => (
            <li key={t.name}><span>{t.name}</span><b>{mb(t.bytes)} MB · {Number(t.rows).toLocaleString('tr-TR')} satır</b></li>
          ))}
        </ul>
      </details>
      {isOwner && (
        <button type="button" className="btn ghost sm" disabled={busy} onClick={cleanup}>{busy ? 'Temizleniyor…' : 'Eski konum geçmişini şimdi temizle'}</button>
      )}
    </section>
  );
}
