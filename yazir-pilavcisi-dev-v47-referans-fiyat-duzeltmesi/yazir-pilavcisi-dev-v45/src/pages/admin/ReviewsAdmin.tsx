import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import Stars from '@/components/ui/Stars';
import Modal from '@/components/ui/Modal';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import { useCountUp } from '@/hooks/useCountUp';

interface Rev {
  id: string;
  order_id: string;
  author_name: string;
  taste_rating: number;
  delivery_rating: number | null;
  service_rating: number;
  overall: number;
  comment: string;
  is_published: boolean;
  admin_reply: string | null;
  replied_at: string | null;
  created_at: string;
  updated_at: string;
  orders?: { order_no: number; order_type: string } | null;
}
type Filter = 'all' | 'unreplied' | 'low' | 'hidden';

const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

export default function ReviewsAdmin() {
  const { profile } = useAuthStore();
  const canWrite = !!profile && ['owner', 'sub_admin'].includes(profile.role);
  const [list, setList] = useState<Rev[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [replyFor, setReplyFor] = useState<Rev | null>(null);
  const [reply, setReply] = useState('');
  const [del, setDel] = useState<Rev | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('order_reviews').select('*, orders(order_no, order_type)').order('created_at', { ascending: false }).limit(500);
    if (error) setMissing(true);
    else {
      setMissing(false);
      setList(((data || []) as any[]).map((r) => ({ ...r, taste_rating: Number(r.taste_rating), service_rating: Number(r.service_rating), delivery_rating: r.delivery_rating != null ? Number(r.delivery_rating) : null, overall: Number(r.overall) })));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const ch = supabase.channel(`rev-admin-${Math.random()}`).on('postgres_changes', { event: '*', schema: 'public', table: 'order_reviews' }, () => load()).subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  const stats = useMemo(() => {
    const pub = list.filter((r) => r.is_published);
    return {
      total: list.length,
      avg: avg(pub.map((r) => r.overall)),
      taste: avg(pub.map((r) => r.taste_rating)),
      delivery: avg(pub.filter((r) => r.delivery_rating != null).map((r) => r.delivery_rating as number)),
      service: avg(pub.map((r) => r.service_rating)),
      unreplied: list.filter((r) => !r.admin_reply && r.comment).length,
      hidden: list.filter((r) => !r.is_published).length,
      low: list.filter((r) => r.overall < 3).length,
    };
  }, [list]);
  const avgA = useCountUp(stats.avg, 900, 1);

  const shown = list.filter((r) => {
    const t = q.trim().toLocaleLowerCase('tr');
    if (t && !`${r.author_name} ${r.comment} ${r.orders?.order_no || ''}`.toLocaleLowerCase('tr').includes(t)) return false;
    if (filter === 'unreplied') return !r.admin_reply;
    if (filter === 'low') return r.overall < 3;
    if (filter === 'hidden') return !r.is_published;
    return true;
  });

  const act = async (id: string, action: string, text?: string) => {
    setBusy(true);
    const { error } = await supabase.rpc('admin_moderate_review', { p_id: id, p_action: action, p_reply: text ?? null });
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success(action === 'reply' ? 'Yanıt kaydedildi' : action === 'delete' ? 'Yorum silindi' : action === 'hide' ? 'Yorum gizlendi' : 'Yorum yayında');
    setReplyFor(null);
    setDel(null);
    load();
  };

  if (loading) return <p className="muted center">Yükleniyor…</p>;

  return (
    <>
      <div className="bar mx-bar">
        <div>
          <h1>Yorumlar (Web Siparişleri)</h1>
          <p className="muted" style={{ margin: 0 }}>Giriş yapıp sipariş veren müşterilerin lezzet / teslimat / servis değerlendirmeleri. Yanıt yazın, gizleyin veya silin.</p>
        </div>
        <div className="mx-bar-actions"><a className="btn ghost sm" href="/yorumlar" target="_blank" rel="noreferrer">Herkese açık sayfa ↗</a></div>
      </div>
      {missing && <div className="note">Bu sayfa için <code>sql/21_order_reviews_coupon_report.sql</code> dosyasını Supabase SQL Editor'de çalıştırın.</div>}

      <div className="ad-stats rva-stats">
        <div className="ad-stat static rva-hero"><small>Genel ortalama</small><b>⭐ {stats.total ? avgA.toFixed(1) : '–'}</b><span>{stats.total} değerlendirme</span></div>
        <div className="ad-stat static"><small>😋 Lezzet</small><b>{stats.taste ? stats.taste.toFixed(1) : '–'}</b><Stars rating={stats.taste} size={14} /></div>
        <div className="ad-stat static"><small>🛵 Teslimat</small><b>{stats.delivery ? stats.delivery.toFixed(1) : '–'}</b><Stars rating={stats.delivery} size={14} /></div>
        <div className="ad-stat static"><small>🤝 Servis</small><b>{stats.service ? stats.service.toFixed(1) : '–'}</b><Stars rating={stats.service} size={14} /></div>
        <button type="button" className={`ad-stat warn${filter === 'unreplied' ? ' on' : ''}`} onClick={() => setFilter(filter === 'unreplied' ? 'all' : 'unreplied')}><small>Yanıt bekleyen</small><b>{stats.unreplied}</b><span>yorumlu</span></button>
        <button type="button" className={`ad-stat bad${filter === 'low' ? ' on' : ''}`} onClick={() => setFilter(filter === 'low' ? 'all' : 'low')}><small>Düşük puan (&lt;3)</small><b>{stats.low}</b><span>ilgilenin</span></button>
      </div>

      <div className="ad-toolbar">
        <div className="ad-search"><span>🔍</span><input type="search" placeholder="İsim, yorum veya sipariş no ara…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="seg">
          {([['all', 'Tümü'], ['unreplied', 'Yanıtsız'], ['low', 'Düşük puan'], ['hidden', 'Gizli']] as const).map(([k, l]) => (
            <button type="button" key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
      </div>

      <div className="rva-list">
        {shown.map((r, i) => (
          <article key={r.id} className={`rva-card${r.is_published ? '' : ' hidden'}${r.overall < 3 ? ' low' : ''}`} style={{ ['--i' as any]: i % 10 }}>
            <header>
              <div className="rva-who"><span className="rv-avatar ph">{r.author_name.charAt(0)}</span><div><b>{r.author_name}</b><small className="muted">Sipariş #{r.orders?.order_no ?? '—'} · {new Date(r.created_at).toLocaleDateString('tr-TR')}{r.updated_at !== r.created_at ? ' (düzenlendi)' : ''}</small></div></div>
              <div className="rv-score"><Stars rating={r.overall} size={18} /><b>{r.overall.toFixed(1)}</b></div>
            </header>
            <div className="rv-minis">
              <span className="rv-mini">😋 Lezzet <b>{r.taste_rating.toFixed(1)}</b></span>
              {r.delivery_rating != null && <span className="rv-mini">🛵 Teslimat <b>{r.delivery_rating.toFixed(1)}</b></span>}
              <span className="rv-mini">🤝 Servis <b>{r.service_rating.toFixed(1)}</b></span>
              {!r.is_published && <span className="rv-mini hid">Gizli</span>}
            </div>
            {r.comment ? <p className="rv-body">{r.comment}</p> : <p className="muted small">Yorum metni yok, yalnızca puan.</p>}
            {r.admin_reply && <div className="rv-reply"><b>Yanıtınız</b><p>{r.admin_reply}</p></div>}
            {canWrite && (
              <div className="rva-actions">
                <button type="button" className="btn ghost sm" onClick={() => { setReplyFor(r); setReply(r.admin_reply || ''); }}>💬 {r.admin_reply ? 'Yanıtı düzenle' : 'Yanıtla'}</button>
                <button type="button" className="btn ghost sm" onClick={() => act(r.id, r.is_published ? 'hide' : 'publish')}>{r.is_published ? '🙈 Gizle' : '👁 Yayınla'}</button>
                <button type="button" className="btn ghost sm danger-txt" onClick={() => setDel(r)}>🗑️ Sil</button>
              </div>
            )}
          </article>
        ))}
        {shown.length === 0 && !missing && <div className="ad-empty"><div>💬</div><h3>Bu filtrede yorum yok</h3></div>}
      </div>

      <Modal open={!!replyFor} onClose={() => !busy && setReplyFor(null)}>
        {replyFor && (
          <>
            <div className="pe-head"><div><h2>💬 Yoruma Yanıt</h2><p className="muted small">{replyFor.author_name} · {replyFor.overall.toFixed(1)} ★</p></div><button type="button" className="icon-circle" onClick={() => setReplyFor(null)} aria-label="Kapat">✕</button></div>
            {replyFor.comment && <blockquote className="rva-quote">{replyFor.comment}</blockquote>}
            <label className="fld">Yanıtınız (herkese açık sayfada görünür)<textarea rows={4} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={600} placeholder="Teşekkür ederiz, geri bildiriminiz bizim için değerli…" /></label>
            <div className="pe-foot"><div />
              <div className="pe-foot-right">
                {replyFor.admin_reply && <button type="button" className="btn ghost danger-txt" onClick={() => act(replyFor.id, 'reply', '')} disabled={busy}>Yanıtı kaldır</button>}
                <button type="button" className="btn ghost" onClick={() => setReplyFor(null)} disabled={busy}>Vazgeç</button>
                <button type="button" className="btn gold" onClick={() => act(replyFor.id, 'reply', reply)} disabled={busy || !reply.trim()}>Yanıtı Yayınla</button>
              </div>
            </div>
          </>
        )}
      </Modal>

      <ConfirmationModal open={!!del} onClose={() => setDel(null)} onConfirm={() => del && act(del.id, 'delete')} title="Yorumu sil" message={`${del?.author_name} müşterisinin yorumu kalıcı olarak silinecek. Bunun yerine "Gizle" kullanabilirsiniz.`} confirmLabel="Evet, sil" loading={busy} />
    </>
  );
}
