import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { ROLE_LABELS } from '@/lib/constants';
import Modal from '@/components/ui/Modal';
import ConfirmationModal from '@/components/ui/ConfirmationModal';

interface Log {
  id: number;
  table_name: string;
  record_id: string | null;
  action: string;
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
  reason: string | null;
  actor_id: string | null;
  actor_role: string | null;
  created_at: string;
}

const TABLES: Record<string, { label: string; pk: string; revert: boolean }> = {
  products: { label: 'Ürün', pk: 'id', revert: true },
  product_variants: { label: 'Ürün fiyatı/porsiyonu', pk: 'id', revert: true },
  categories: { label: 'Kategori', pk: 'id', revert: true },
  product_option_groups: { label: 'Ürün seçeneği grubu', pk: 'id', revert: true },
  product_options: { label: 'Ürün seçeneği', pk: 'id', revert: true },
  restaurant_gallery: { label: 'Galeri', pk: 'id', revert: true },
  coupons: { label: 'Kupon', pk: 'id', revert: true },
  business_settings: { label: 'İşletme ayarları', pk: 'id', revert: true },
  opening_hours: { label: 'Çalışma saatleri', pk: 'day_of_week', revert: true },
  opening_hours_overrides: { label: 'Güne özel saat', pk: 'override_date', revert: true },
  dining_tables: { label: 'Masa', pk: 'id', revert: true },
  orders: { label: 'Sipariş', pk: 'id', revert: false },
  profiles: { label: 'Kullanıcı/Personel', pk: 'id', revert: false },
  staff_permissions: { label: 'Personel yetkisi', pk: 'id', revert: false },
  role_permissions: { label: 'Rol yetkisi', pk: 'id', revert: false },
  courier_profiles: { label: 'Kurye', pk: 'user_id', revert: false },
  integrations: { label: 'Entegrasyon', pk: 'platform', revert: false },
  loyalty_ledger: { label: 'Sadakat puanı', pk: 'id', revert: false },
  menu_backups: { label: 'Menü yedeği', pk: 'id', revert: false },
  order_sources: { label: 'Sipariş kaynağı', pk: 'code', revert: false },
  product_platform_mappings: { label: 'Platform eşleştirme', pk: 'id', revert: false },
};

const ACTIONS: Record<string, { label: string; cls: string }> = {
  INSERT: { label: 'Ekleme', cls: 'ok' },
  UPDATE: { label: 'Değişiklik', cls: 'warn' },
  DELETE: { label: 'Silme', cls: 'bad' },
  ITEMS_REPLACED: { label: 'Kalem düzeltme', cls: 'warn' },
  MENU_RESTORE: { label: 'Menü geri yükleme', cls: 'bad' },
};

const FIELDS: Record<string, string> = {
  name: 'Ad', title: 'Başlık', description: 'Açıklama', price: 'Fiyat', is_active: 'Aktif', is_sold_out: 'Tükendi', is_daily: 'Günlük menü',
  sort_order: 'Sıra', category_id: 'Kategori', image_path: 'Fotoğraf', kcal: 'Kalori', protein_g: 'Protein', carb_g: 'Karbonhidrat',
  status: 'Durum', total: 'Toplam', courier_id: 'Kurye', code: 'Kod', discount_value: 'İndirim', usage_limit: 'Kontenjan',
  open_time: 'Açılış', close_time: 'Kapanış', is_closed: 'Kapalı', phone: 'Telefon', address: 'Adres', delivery_fee: 'Teslimat ücreti',
  min_order_amount: 'Min. sipariş', is_accepting_orders: 'Sipariş kabulü', role: 'Rol', full_name: 'Ad soyad', allergens: 'Alerjenler', badges: 'Rozetler',
  is_featured: 'Öne çıkan', category: 'Kategori', emoji: 'Emoji', loyalty_enabled: 'Puan sistemi', is_public: 'Sitede göster',
};

const fmtVal = (v: any): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Evet' : 'Hayır';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 140);
  return String(v);
};

function recordLabel(l: Log): string {
  const d = { ...(l.old_data || {}), ...(l.new_data || {}) } as any;
  return d.name || d.title || d.code || d.full_name || (d.order_no ? `#${d.order_no}` : '') || (l.record_id ? String(l.record_id).slice(0, 8) : '');
}

function summary(l: Log): string {
  if (l.action === 'UPDATE' && l.new_data) {
    return Object.keys(l.new_data)
      .slice(0, 4)
      .map((k) => `${FIELDS[k] || k}: ${fmtVal(l.old_data?.[k])} → ${fmtVal(l.new_data![k])}`)
      .join(' · ');
  }
  if (l.action === 'INSERT') return 'Yeni kayıt oluşturuldu';
  if (l.action === 'DELETE') return 'Kayıt silindi';
  if (l.reason) return l.reason;
  return '';
}

const PAGE = 100;

export default function AuditAdmin() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [people, setPeople] = useState<Record<string, { name: string; role: string }>>({});
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [noAccess, setNoAccess] = useState(false);
  const [tableF, setTableF] = useState('all');
  const [actionF, setActionF] = useState('all');
  const [actorF, setActorF] = useState('all');
  const [rangeF, setRangeF] = useState('7');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Log | null>(null);
  const [revertLog, setRevertLog] = useState<Log | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (append = false) => {
      setLoading(true);
      let query = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).range(append ? logs.length : 0, (append ? logs.length : 0) + PAGE - 1);
      if (tableF !== 'all') query = query.eq('table_name', tableF);
      if (actionF !== 'all') query = query.eq('action', actionF);
      if (actorF !== 'all') query = query.eq('actor_id', actorF);
      if (rangeF !== 'all') query = query.gte('created_at', new Date(Date.now() - Number(rangeF) * 864e5).toISOString());
      const { data, error } = await query;
      if (error) setNoAccess(true);
      else {
        setNoAccess(false);
        const rows = (data || []) as unknown as Log[];
        setLogs(append ? [...logs, ...rows] : rows);
        setMore(rows.length === PAGE);
      }
      setLoading(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tableF, actionF, actorF, rangeF, logs.length],
  );

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableF, actionF, actorF, rangeF]);

  useEffect(() => {
    supabase.from('profiles').select('id,full_name,role').in('role', ['owner', 'sub_admin', 'operator', 'courier']).then(({ data }) => {
      const m: Record<string, { name: string; role: string }> = {};
      (data || []).forEach((p: any) => (m[p.id] = { name: p.full_name, role: p.role }));
      setPeople(m);
    });
  }, []);

  const shown = useMemo(() => {
    const t = q.trim().toLocaleLowerCase('tr');
    if (!t) return logs;
    return logs.filter((l) => `${recordLabel(l)} ${TABLES[l.table_name]?.label || l.table_name} ${summary(l)} ${people[l.actor_id || '']?.name || ''}`.toLocaleLowerCase('tr').includes(t));
  }, [logs, q, people]);

  const canRevert = (l: Log) => {
    const t = TABLES[l.table_name];
    if (!t?.revert || !l.record_id) return false;
    return (l.action === 'UPDATE' && !!l.old_data) || (l.action === 'DELETE' && !!l.old_data);
  };

  const doRevert = async () => {
    if (!revertLog || !revertLog.old_data) return;
    const t = TABLES[revertLog.table_name];
    setBusy(true);
    try {
      if (revertLog.action === 'UPDATE') {
        const { data, error } = await supabase.from(revertLog.table_name).update(revertLog.old_data).eq(t.pk, revertLog.record_id as string).select();
        if (error) throw error;
        if (!data || data.length === 0) throw new Error('Kayıt bulunamadı (silinmiş olabilir) ya da yetkiniz yok');
      } else {
        const { error } = await supabase.from(revertLog.table_name).insert(revertLog.old_data);
        if (error) throw error;
      }
      toast.success('Değişiklik geri alındı (bu işlem de geçmişe kaydedildi)');
      setRevertLog(null);
      setSel(null);
      load(false);
    } catch (e: any) {
      toast.error(e?.message || 'Geri alınamadı');
    } finally {
      setBusy(false);
    }
  };

  const keys = sel ? Array.from(new Set([...Object.keys(sel.old_data || {}), ...Object.keys(sel.new_data || {})])) : [];

  return (
    <>
      <div className="bar mx-bar">
        <div>
          <h1>İşlem Geçmişi</h1>
          <p className="muted" style={{ margin: 0 }}>Kim, ne zaman, neyi değiştirdi — menü, fiyat, ayar, sipariş, kupon ve personel işlemleri. Uygun kayıtlar tek tıkla geri alınabilir.</p>
        </div>
        <div className="mx-bar-actions"><button type="button" className="btn ghost sm" onClick={() => load(false)}>↻ Yenile</button></div>
      </div>

      {noAccess && <div className="note">İşlem geçmişini görmek için yetkiniz yok ya da kayıt tablosuna erişilemiyor (yalnızca yönetici/“audit.view” izni).</div>}

      <div className="ad-toolbar">
        <div className="ad-search"><span>🔍</span><input type="search" placeholder="Ürün adı, kişi veya değişiklik ara…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <label className="ad-select"><span>Tablo</span>
          <select value={tableF} onChange={(e) => setTableF(e.target.value)}>
            <option value="all">Tümü</option>
            {Object.entries(TABLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label className="ad-select"><span>İşlem</span>
          <select value={actionF} onChange={(e) => setActionF(e.target.value)}>
            <option value="all">Tümü</option>
            {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label className="ad-select"><span>Kişi</span>
          <select value={actorF} onChange={(e) => setActorF(e.target.value)}>
            <option value="all">Herkes</option>
            {Object.entries(people).filter(([, p]) => p.role !== 'courier').map(([id, p]) => <option key={id} value={id}>{p.name}</option>)}
          </select>
        </label>
        <label className="ad-select"><span>Dönem</span>
          <select value={rangeF} onChange={(e) => setRangeF(e.target.value)}>
            <option value="1">Son 24 saat</option><option value="7">Son 7 gün</option><option value="30">Son 30 gün</option><option value="90">Son 90 gün</option><option value="all">Tümü</option>
          </select>
        </label>
      </div>

      <div className="au-list">
        {shown.map((l) => {
          const a = ACTIONS[l.action] || { label: l.action, cls: 'mute' };
          const who = l.actor_id ? people[l.actor_id] : null;
          return (
            <button type="button" key={l.id} className="au-row" onClick={() => setSel(l)}>
              <span className="au-time">
                {new Date(l.created_at).toLocaleDateString('tr-TR')}
                <b>{new Date(l.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</b>
              </span>
              <span className={`cp-st ${a.cls}`}>{a.label}</span>
              <span className="au-main">
                <b>{TABLES[l.table_name]?.label || l.table_name}</b> {recordLabel(l) && <em>“{recordLabel(l)}”</em>}
                <small>{summary(l)}</small>
              </span>
              <span className="au-who">{who ? `${who.name}` : l.actor_id ? 'Bilinmeyen kullanıcı' : 'Sistem'}<small>{ROLE_LABELS[l.actor_role || who?.role || ''] || ''}</small></span>
            </button>
          );
        })}
        {!loading && shown.length === 0 && !noAccess && <div className="ad-empty"><div>📜</div><h3>Bu filtrede kayıt yok</h3></div>}
        {loading && <p className="muted center">Yükleniyor…</p>}
        {more && !loading && <button type="button" className="btn ghost" style={{ justifySelf: 'center' }} onClick={() => load(true)}>Daha eski kayıtları yükle</button>}
      </div>

      <Modal open={!!sel} onClose={() => setSel(null)} size="wide">
        {sel && (
          <>
            <div className="pe-head">
              <div>
                <h2>{TABLES[sel.table_name]?.label || sel.table_name} · {ACTIONS[sel.action]?.label || sel.action}</h2>
                <p className="muted small">{new Date(sel.created_at).toLocaleString('tr-TR')} · {sel.actor_id ? people[sel.actor_id]?.name || 'Bilinmeyen' : 'Sistem'} {recordLabel(sel) && `· “${recordLabel(sel)}”`}</p>
              </div>
              <button type="button" className="icon-circle" onClick={() => setSel(null)} aria-label="Kapat">✕</button>
            </div>
            {sel.reason && <div className="note small">Gerekçe: {sel.reason}</div>}
            <table className="tbl au-diff">
              <thead><tr><th>Alan</th><th>Önce</th><th>Sonra</th></tr></thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k}>
                    <td>{FIELDS[k] || k}</td>
                    <td className="old">{fmtVal(sel.old_data?.[k])}</td>
                    <td className="new">{fmtVal(sel.new_data?.[k])}</td>
                  </tr>
                ))}
                {keys.length === 0 && <tr><td colSpan={3} className="muted center">Ayrıntı yok</td></tr>}
              </tbody>
            </table>
            <div className="pe-foot">
              <div className="pe-foot-left">
                {canRevert(sel) && (
                  <button type="button" className="btn ghost sm" onClick={() => setRevertLog(sel)}>
                    ↩ {sel.action === 'DELETE' ? 'Silinen kaydı geri getir' : 'Bu değişikliği geri al'}
                  </button>
                )}
              </div>
              <div className="pe-foot-right"><button type="button" className="btn gold" onClick={() => setSel(null)}>Kapat</button></div>
            </div>
          </>
        )}
      </Modal>

      <ConfirmationModal
        open={!!revertLog}
        onClose={() => !busy && setRevertLog(null)}
        onConfirm={doRevert}
        title={revertLog?.action === 'DELETE' ? 'Silinen kaydı geri getir' : 'Değişikliği geri al'}
        message={revertLog?.action === 'DELETE' ? 'Silinen kayıt eski haliyle yeniden oluşturulacak.' : 'Kayıt, değişiklikten önceki değerlere döndürülecek. Aradaki başka değişiklikler bu alanlar için ezilir.'}
        confirmLabel="Evet, geri al"
        variant="warning"
        loading={busy}
      />
    </>
  );
}
