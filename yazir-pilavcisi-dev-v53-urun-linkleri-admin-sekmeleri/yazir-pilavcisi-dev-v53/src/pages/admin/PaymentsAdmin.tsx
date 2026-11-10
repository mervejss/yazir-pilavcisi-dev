import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { tl } from '@/lib/helpers';
import Modal from '@/components/ui/Modal';
import ConfirmationModal from '@/components/ui/ConfirmationModal';

interface Note {
  id: string;
  title: string;
  direction: 'payable' | 'receivable';
  amount: number;
  recurrence: 'once' | 'monthly';
  due_date: string | null;
  start_date: string | null;
  end_date: string | null;
  category: string | null;
  person_name: string | null;
  person_phone: string | null;
  person_address: string | null;
  notes: string | null;
  status: 'open' | 'closed';
  created_at: string;
}
interface LogRow {
  id: string;
  note_id: string;
  amount: number;
  paid_at: string;
  for_date: string | null;
  memo: string | null;
}

const blank = () => ({
  title: '', direction: 'payable' as Note['direction'], amount: '', recurrence: 'once' as Note['recurrence'],
  due_date: '', start_date: '', end_date: '', category: '', person_name: '', person_phone: '', person_address: '', notes: '',
});

const CATEGORIES = ['Web sitesi', 'Reklam', 'Sosyal medya', 'Yazılım / Abonelik', 'Kira', 'Tedarikçi', 'Maaş', 'Vergi', 'Diğer'];
const todayStr = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const fmtDate = (d?: string | null) => (d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const pad = (n: number) => String(n).padStart(2, '0');
/** 'YYYY-MM-DD' + k ay (ayın günü kısa aylara göre kısalır) */
function addMonths(iso: string, k: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + k, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(Math.min(d, last))}`;
}
function addDays(iso: string, k: number): string {
  const t = new Date(iso + 'T12:00:00Z');
  t.setUTCDate(t.getUTCDate() + k);
  return t.toISOString().slice(0, 10);
}
interface Period { due: string; end: string }
/** Aylık kaydın dönemleri: başlangıçtan bugüne kadar + bir sonraki dönem. Bitiş tarihi varsa orada biter. */
function periodsOf(n: Note): Period[] {
  if (n.recurrence !== 'monthly' || !n.start_date) return [];
  const today = todayStr();
  const out: Period[] = [];
  for (let k = 0; k < 240; k++) {
    const due = addMonths(n.start_date, k);
    if (n.end_date && due > n.end_date) break;
    let end = addDays(addMonths(n.start_date, k + 1), -1);
    if (n.end_date && end > n.end_date) end = n.end_date;
    out.push({ due, end });
    if (due > today) break;
  }
  return out;
}
const daysTo = (d: string) => Math.round((new Date(d + 'T12:00:00').getTime() - new Date(todayStr() + 'T12:00:00').getTime()) / 86400000);

export default function PaymentsAdmin() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [log, setLog] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<'open' | 'history' | 'closed'>('open');
  const [edit, setEdit] = useState<null | { id: string | null; f: ReturnType<typeof blank> }>(null);
  const [saving, setSaving] = useState(false);
  const [payM, setPayM] = useState<null | { note: Note; logId: string | null; amount: string; date: string; memo: string; forDate: string }>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [del, setDel] = useState<Note | null>(null);
  const [undo, setUndo] = useState<LogRow | null>(null);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      supabase.from('payment_notes').select('*').order('created_at', { ascending: true }),
      supabase.from('payment_note_log').select('*').order('paid_at', { ascending: false }).limit(500),
    ]);
    if (a.error) {
      setMissing(/payment_notes|42P01|PGRST205|schema cache/i.test(a.error.message + (a.error.code || '')));
      if (!/payment_notes|schema cache/i.test(a.error.message)) toast.error(a.error.message);
    } else {
      setMissing(false);
      setNotes(((a.data || []) as any[]).map((n) => ({ ...n, amount: Number(n.amount) })));
      setLog(((b.data || []) as any[]).map((l) => ({ ...l, amount: Number(l.amount) })));
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const paidOf = useMemo(() => {
    const m: Record<string, number> = {};
    log.forEach((l) => (m[l.note_id] = (m[l.note_id] || 0) + l.amount));
    return m;
  }, [log]);
  const remaining = (n: Note) => (n.recurrence === 'monthly' ? n.amount : Math.max(n.amount - (paidOf[n.id] || 0), 0));
  const logsOf = (id: string) => log.filter((l) => l.note_id === id);
  const paidFor = (id: string, due: string) => log.filter((l) => l.note_id === id && l.for_date === due).reduce((a, l) => a + l.amount, 0);
  /** Aylık kayıt: vadesi gelmiş (≤ bugün) dönemlerden ödenmemiş tutar */
  const overdueOf = (n: Note) => periodsOf(n).filter((p) => p.due <= todayStr()).reduce((a, p) => a + Math.max(n.amount - paidFor(n.id, p.due), 0), 0);
  const byId = useMemo(() => Object.fromEntries(notes.map((n) => [n.id, n])), [notes]);

  const open = notes.filter((n) => n.status === 'open');
  const closed = notes.filter((n) => n.status === 'closed');
  const sum = (arr: Note[], dir: Note['direction'], f: (n: Note) => number) => arr.filter((n) => n.direction === dir).reduce((s, n) => s + f(n), 0);
  const payableOnce = sum(open.filter((n) => n.recurrence === 'once'), 'payable', remaining);
  const payableMonthly = sum(open.filter((n) => n.recurrence === 'monthly'), 'payable', (n) => n.amount);
  const receivable = sum(open, 'receivable', remaining);
  const thisMonthKey = todayStr().slice(0, 7);
  const monthLogs = log.filter((l) => l.paid_at.slice(0, 7) === thisMonthKey && byId[l.note_id]?.direction === 'payable');
  const paidThisMonth = monthLogs.reduce((s, l) => s + l.amount, 0);
  const monthByNote = Object.entries(
    monthLogs.reduce((m: Record<string, number>, l) => ((m[l.note_id] = (m[l.note_id] || 0) + l.amount), m), {}),
  );
  const overdueTotal = open.filter((n) => n.direction === 'payable').reduce((s, n) => s + overdueOf(n), 0);

  const startEdit = (n?: Note) =>
    setEdit({
      id: n?.id || null,
      f: n
        ? { title: n.title, direction: n.direction, amount: String(n.amount), recurrence: n.recurrence, due_date: n.due_date || '', start_date: n.start_date || '', end_date: n.end_date || '', category: n.category || '', person_name: n.person_name || '', person_phone: n.person_phone || '', person_address: n.person_address || '', notes: n.notes || '' }
        : blank(),
    });

  const save = async () => {
    if (!edit) return;
    const f = edit.f;
    const amount = Number(String(f.amount).replace(',', '.'));
    if (!f.title.trim()) return void toast.error('Başlık yazın');
    if (!isFinite(amount) || amount < 0 || f.amount === '') return void toast.error('Geçerli bir tutar girin');
    if (f.recurrence === 'monthly' && !f.start_date) return void toast.error('Aylık kayıt için başlangıç tarihi seçin');
    if (f.recurrence === 'monthly' && f.end_date && f.end_date < f.start_date) return void toast.error('Bitiş tarihi başlangıçtan önce olamaz');
    setSaving(true);
    const row = {
      title: f.title.trim(), direction: f.direction, amount, recurrence: f.recurrence, due_date: f.recurrence === 'once' ? f.due_date || null : null, start_date: f.recurrence === 'monthly' ? f.start_date || null : null, end_date: f.recurrence === 'monthly' ? f.end_date || null : null,
      category: f.category.trim() || null, person_name: f.person_name.trim() || null, person_phone: f.person_phone.trim() || null,
      person_address: f.person_address.trim() || null, notes: f.notes.trim() || null,
    };
    const { error } = edit.id ? await supabase.from('payment_notes').update(row).eq('id', edit.id) : await supabase.from('payment_notes').insert(row);
    setSaving(false);
    if (error) return void toast.error(error.message);
    toast.success(edit.id ? 'Kayıt güncellendi' : 'Kayıt eklendi');
    setEdit(null);
    load();
  };

  const openPay = (n: Note, forDate?: string, row?: LogRow) => {
    const per = periodsOf(n);
    const firstUnpaid = per.find((p) => paidFor(n.id, p.due) < n.amount)?.due || '';
    setPayM({
      note: n,
      logId: row?.id || null,
      amount: row ? String(row.amount) : String(n.recurrence === 'monthly' ? Math.max(n.amount - paidFor(n.id, forDate || firstUnpaid), 0) || n.amount : remaining(n) || n.amount),
      date: row ? row.paid_at.slice(0, 10) : todayStr(),
      memo: row?.memo || '',
      forDate: row ? row.for_date || '' : n.recurrence === 'monthly' ? forDate || firstUnpaid : '',
    });
  };
  const doPay = async () => {
    if (!payM) return;
    const amount = Number(payM.amount.replace(',', '.'));
    if (!isFinite(amount) || amount <= 0) return void toast.error('Geçerli tutar girin');
    if (!payM.date) return void toast.error('Ödeme tarihini seçin');
    setSaving(true);
    const { data, error } = await supabase.rpc('payment_log_save', {
      p_log: payM.logId, p_note: payM.note.id, p_amount: amount, p_paid_at: `${payM.date}T12:00:00+03:00`,
      p_for_date: payM.forDate || null, p_memo: payM.memo || null,
    } as any);
    setSaving(false);
    if (error) return void toast.error(/payment_log_save|schema cache|PGRST202/i.test(error.message) ? 'sql/27_payment_installments.sql dosyasını Supabase SQL Editor\'de çalıştırın' : error.message);
    const r: any = data;
    toast.success(payM.note.recurrence === 'once' ? (Number(r?.remaining) > 0 ? `Kaydedildi — kalan ${tl(Number(r.remaining))}` : 'Kaydedildi — tamamı ödendi, kayıt kapandı') : 'Ödeme kaydedildi');
    setPayM(null);
    load();
  };
  const closeNote = async (n: Note) => {
    const { error } = await supabase.from('payment_notes').update({ status: 'closed' }).eq('id', n.id);
    if (error) return void toast.error(error.message);
    toast.success('Kayıt kapatıldı');
    load();
  };
  const doDelete = async () => {
    if (!del) return;
    const { error } = await supabase.from('payment_notes').delete().eq('id', del.id);
    if (error) return void toast.error(error.message);
    toast.success('Kayıt silindi');
    setDel(null);
    load();
  };
  const doUndo = async () => {
    if (!undo) return;
    const { error } = await supabase.rpc('payment_undo_log', { p_log: undo.id } as any);
    if (error) return void toast.error(error.message);
    toast.success('Ödeme geri alındı');
    setUndo(null);
    load();
  };
  const reopen = async (n: Note) => {
    const { error } = await supabase.from('payment_notes').update({ status: 'open' }).eq('id', n.id);
    if (error) return void toast.error(error.message);
    load();
  };

  const dueChip = (n: Note) => {
    if (n.recurrence === 'monthly') {
      if (!n.start_date) return <span className="chip pn-soon">Başlangıç tarihi girin</span>;
      const od = overdueOf(n);
      return od > 0 ? <span className="chip pn-late">Geciken: {tl(od)}</span> : <span className="chip">Güncel ✓</span>;
    }
    if (!n.due_date) return <span className="chip">Vade yok</span>;
    const d = daysTo(n.due_date);
    const cls = d < 0 ? 'pn-late' : d <= 5 ? 'pn-soon' : '';
    return <span className={`chip ${cls}`}>{d < 0 ? `${-d} gün gecikti` : d === 0 ? 'Bugün' : `${d} gün sonra`} · {fmtDate(n.due_date)}</span>;
  };

  const logRow = (n: Note, l: LogRow) => (
    <div key={l.id} className="pn-mini">
      <span><b>{fmtDate(l.paid_at)}</b>{l.for_date && n.recurrence === 'monthly' ? ` · ${fmtDate(l.for_date)} dönemi` : ''}{l.memo ? ` · ${l.memo}` : ''}</span>
      <span className="pn-mini-r">
        <b>{tl(l.amount)}</b>
        <button type="button" className="linklike small" onClick={() => openPay(n, undefined, l)}>Düzenle</button>
        <button type="button" className="linklike small danger-txt" onClick={() => setUndo(l)}>Sil</button>
      </span>
    </div>
  );

  const card = (n: Note) => {
    const paid = paidOf[n.id] || 0;
    const left = Math.max(n.amount - paid, 0);
    const pct = n.amount > 0 ? Math.min(100, Math.round((paid / n.amount) * 100)) : 0;
    const per = periodsOf(n);
    const logs = logsOf(n.id);
    const isOpen = !!expanded[n.id];
    return (
      <article key={n.id} className={`pn-card${n.direction === 'receivable' ? ' rec' : ''}`}>
        <div className="pn-top">
          <div className="pn-title">
            <b>{n.title}</b>
            <div className="pn-badges">
              <span className="chip">{n.direction === 'payable' ? '💸 Ödenecek' : '💰 Alınacak'}</span>
              <span className="chip">{n.recurrence === 'monthly' ? '🔁 Aylık' : '1️⃣ Tek seferlik'}</span>
              {n.category && <span className="chip">{n.category}</span>}
            </div>
          </div>
          <div className="pn-amt">
            <b>{tl(n.amount)}</b>
            <small>{n.recurrence === 'monthly' ? 'her ay' : 'toplam'}</small>
          </div>
        </div>

        {n.recurrence === 'once' ? (
          <div className="pn-prog">
            <div className="pn-bar"><i style={{ width: `${pct}%` }} /></div>
            <div className="pn-nums">
              <span>Toplam <b>{tl(n.amount)}</b></span>
              <span className="ok-txt">Ödenen <b>{tl(paid)}</b></span>
              <span className={left > 0 ? 'pn-left' : 'ok-txt'}>Kalan <b>{tl(left)}</b></span>
            </div>
          </div>
        ) : (
          <div className="pn-nums">
            <span>Dönem <b>{n.start_date ? `${fmtDate(n.start_date)} → ${n.end_date ? fmtDate(n.end_date) : 'süresiz'}` : '—'}</b></span>
            <span className="ok-txt">Toplam ödenen <b>{tl(paid)}</b></span>
            {overdueOf(n) > 0 && <span className="pn-left">Geciken <b>{tl(overdueOf(n))}</b></span>}
          </div>
        )}

        {(n.person_name || n.person_phone || n.person_address) && (
          <div className="pn-person">
            {n.person_name && <span>👤 {n.person_name}</span>}
            {n.person_phone && <a href={`tel:${n.person_phone.replace(/\s/g, '')}`}>📞 {n.person_phone}</a>}
            {n.person_address && <span>📍 {n.person_address}</span>}
          </div>
        )}
        {n.notes && <p className="pn-notes">📝 {n.notes}</p>}

        <div className="pn-foot">
          {n.status === 'open' ? dueChip(n) : <span className="chip">✔ Kapandı</span>}
          <div className="pn-act">
            {n.status === 'open' ? (
              <button type="button" className="btn gold sm" onClick={() => openPay(n)}>➕ Ödeme ekle</button>
            ) : (
              <button type="button" className="btn ghost sm" onClick={() => reopen(n)}>Yeniden aç</button>
            )}
            <button type="button" className="btn ghost sm" onClick={() => setExpanded((e) => ({ ...e, [n.id]: !isOpen }))}>
              {isOpen ? '▲ Gizle' : `▼ ${n.recurrence === 'monthly' ? 'Dönemler' : 'Ödemeler'} (${logs.length})`}
            </button>
            <button type="button" className="btn ghost sm" onClick={() => startEdit(n)}>✏️ Düzenle</button>
            {n.status === 'open' && <button type="button" className="btn ghost sm" onClick={() => closeNote(n)} title="Artık takip etme">Kapat</button>}
            <button type="button" className="btn ghost sm danger-txt" onClick={() => setDel(n)}>🗑 Sil</button>
          </div>
        </div>

        {isOpen && (
          <div className="pn-detail">
            {n.recurrence === 'monthly' && (
              <>
                {per.length === 0 && <p className="small muted">Dönemleri görmek için ✏️ Düzenle'den başlangıç tarihi girin.</p>}
                {[...per].reverse().map((p) => {
                  const pd = paidFor(n.id, p.due);
                  const full = pd >= n.amount;
                  const future = p.due > todayStr();
                  return (
                    <div key={p.due} className={`pn-period${full ? ' paid' : !future ? ' late' : ''}`}>
                      <span><b>{fmtDate(p.due)} – {fmtDate(p.end)}</b>{future && <em> · sıradaki dönem</em>}</span>
                      <span className="pn-mini-r">
                        <span>{tl(pd)} / {tl(n.amount)}</span>
                        {full ? <span className="chip">✔ Ödendi</span> : (
                          <button type="button" className="btn gold sm" onClick={() => openPay(n, p.due)}>Öde</button>
                        )}
                      </span>
                    </div>
                  );
                })}
                {(() => {
                  const dues = new Set(per.map((p) => p.due));
                  const other = logs.filter((l) => !l.for_date || !dues.has(l.for_date));
                  return other.length > 0 ? <><h5 className="pn-h5">Diğer ödemeler</h5>{other.map((l) => logRow(n, l))}</> : null;
                })()}
              </>
            )}
            {n.recurrence === 'once' && (logs.length === 0 ? <p className="small muted">Henüz ödeme yok.</p> : [...logs].sort((a, b) => b.paid_at.localeCompare(a.paid_at)).map((l) => logRow(n, l)))}
            {n.recurrence === 'monthly' && per.length > 0 && <h5 className="pn-h5">Tüm ödemeler</h5>}
            {n.recurrence === 'monthly' && logs.map((l) => logRow(n, l))}
          </div>
        )}
      </article>
    );
  };

  const set = (k: keyof ReturnType<typeof blank>) => (e: any) => setEdit((s) => (s ? { ...s, f: { ...s.f, [k]: e.target.value } } : s));

  return (
    <>
      <div className="bar">
        <div>
          <h1>Ödemeler</h1>
          <p className="muted">Ödenecek / alınacak tutarları not defteri gibi tutun. Aylık kayıtlar ödendikçe vadesi bir ay ilerler.</p>
        </div>
        <button type="button" className="btn gold" onClick={() => startEdit()}>➕ Yeni kayıt</button>
      </div>

      {missing ? (
        <div className="note big"><b>Bu sayfa için veritabanı hazır değil.</b> Supabase SQL Editor'de <code>sql/26_payment_notebook.sql</code> dosyasını bir kez çalıştırın, sonra sayfayı yenileyin.</div>
      ) : (
        <>
          <div className="pn-kpis">
            <div className="card"><small>Ödenecek kalan (tek seferlik)</small><b>{tl(payableOnce)}</b></div>
            <div className="card"><small>Aylık yükümlülük</small><b>{tl(payableMonthly)}</b><em>/ ay</em></div>
            <div className="card"><small>Geciken (aylık dönemler)</small><b className={overdueTotal > 0 ? 'err-txt' : ''}>{tl(overdueTotal)}</b></div>
            <div className="card"><small>Alınacak</small><b>{tl(receivable)}</b></div>
            <div className="card pn-wide">
              <small>Bu ay ödenen</small>
              <b>{tl(paidThisMonth)}</b>
              {monthByNote.length > 0 && (
                <ul className="pn-month">
                  {monthByNote.map(([id, amt]) => {
                    const n = byId[id];
                    return (
                      <li key={id}>
                        <span>{n?.title || 'Silinmiş kayıt'}</span>
                        <b>{tl(amt)}{n?.recurrence === 'once' ? ` / ${tl(n.amount)}` : ''}</b>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <div className="seg pn-tabs">
            <button type="button" className={tab === 'open' ? 'on' : ''} onClick={() => setTab('open')}>Bekleyenler ({open.length})</button>
            <button type="button" className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>Geçmiş ödemeler ({log.length})</button>
            <button type="button" className={tab === 'closed' ? 'on' : ''} onClick={() => setTab('closed')}>Kapananlar ({closed.length})</button>
          </div>

          {loading && <p className="muted">Yükleniyor…</p>}

          {tab === 'open' && (
            <div className="pn-list">
              {open.map(card)}
              {!loading && open.length === 0 && <div className="note">Bekleyen kayıt yok. "Yeni kayıt" ile ekleyin.</div>}
            </div>
          )}
          {tab === 'closed' && (
            <div className="pn-list">
              {closed.map(card)}
              {closed.length === 0 && <div className="note">Kapanan kayıt yok.</div>}
            </div>
          )}
          {tab === 'history' && (
            <div className="pn-list">
              {log.map((l) => {
                const n = byId[l.note_id];
                return (
                  <div key={l.id} className="pn-log">
                    <div>
                      <b>{n?.title || 'Silinmiş kayıt'}</b>
                      <div className="small muted">
                        {fmtDate(l.paid_at)}
                        {l.for_date && ` · vade ${fmtDate(l.for_date)}`}
                        {n?.person_name && ` · ${n.person_name}`}
                        {l.memo && ` · ${l.memo}`}
                      </div>
                    </div>
                    <div className="pn-log-r">
                      <b>{tl(l.amount)}</b>
                      <span className="pn-mini-r">{n && <button type="button" className="linklike small" onClick={() => openPay(n, undefined, l)}>Düzenle</button>}<button type="button" className="linklike small danger-txt" onClick={() => setUndo(l)}>Sil</button></span>
                    </div>
                  </div>
                );
              })}
              {log.length === 0 && <div className="note">Henüz ödeme yapılmadı.</div>}
              {log.length > 0 && <p className="small muted">Toplam: <b>{tl(log.reduce((s, l) => s + l.amount, 0))}</b></p>}
            </div>
          )}
        </>
      )}

      {/* Ekle / düzenle */}
      <Modal open={!!edit} onClose={() => !saving && setEdit(null)} size="wide">
        {edit && (
          <>
            <div className="pe-head">
              <h2>{edit.id ? 'Kaydı düzenle' : 'Yeni kayıt'}</h2>
              <button type="button" className="icon-circle" onClick={() => setEdit(null)} aria-label="Kapat">✕</button>
            </div>
            <div className="fld">
              <span>Tür</span>
              <div className="seg">
                <button type="button" className={edit.f.direction === 'payable' ? 'on' : ''} onClick={() => setEdit({ ...edit, f: { ...edit.f, direction: 'payable' } })}>💸 Ödenecek (borç)</button>
                <button type="button" className={edit.f.direction === 'receivable' ? 'on' : ''} onClick={() => setEdit({ ...edit, f: { ...edit.f, direction: 'receivable' } })}>💰 Alınacak (alacak)</button>
              </div>
            </div>
            <label className="fld">Başlık<input value={edit.f.title} onChange={set('title')} placeholder="Örn. Reklam yönetimi" /></label>
            <div className="two-col">
              <label className="fld">Tutar (₺)<input inputMode="decimal" value={edit.f.amount} onChange={set('amount')} placeholder="10000" /></label>
              {edit.f.recurrence === 'once' && <label className="fld">Son ödeme tarihi <span className="muted">(isteğe bağlı)</span><input type="date" value={edit.f.due_date} onChange={set('due_date')} /></label>}
            </div>
            <div className="fld">
              <span>Sıklık</span>
              <div className="seg">
                <button type="button" className={edit.f.recurrence === 'once' ? 'on' : ''} onClick={() => setEdit({ ...edit, f: { ...edit.f, recurrence: 'once' } })}>1️⃣ Tek seferlik</button>
                <button type="button" className={edit.f.recurrence === 'monthly' ? 'on' : ''} onClick={() => setEdit({ ...edit, f: { ...edit.f, recurrence: 'monthly' } })}>🔁 Her ay</button>
              </div>
            </div>
            {edit.f.recurrence === 'monthly' && (
              <>
                <div className="two-col">
                  <label className="fld">Başlangıç tarihi <span className="req">*</span><input type="date" value={edit.f.start_date} onChange={set('start_date')} /></label>
                  <label className="fld">Bitiş tarihi <span className="muted">(boşsa süresiz)</span><input type="date" value={edit.f.end_date} onChange={set('end_date')} /></label>
                </div>
                <p className="small muted" style={{ margin: '-0.3rem 0 0.4rem' }}>Dönemler başlangıç gününe göre her ay otomatik oluşur (örn. başlangıç 6 Kasım → 6 Kas–5 Ara, 6 Ara–5 Oca…). Her döneme ayrı ödeme girebilirsiniz.</p>
              </>
            )}
            <label className="fld">Kategori <span className="muted">(isteğe bağlı)</span>
              <input list="pn-cats" value={edit.f.category} onChange={set('category')} />
              <datalist id="pn-cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
            <div className="two-col">
              <label className="fld">Kime / kimden <span className="muted">(isteğe bağlı)</span><input value={edit.f.person_name} onChange={set('person_name')} placeholder="Ad soyad veya firma" /></label>
              <label className="fld">Telefon <span className="muted">(isteğe bağlı)</span><input inputMode="tel" value={edit.f.person_phone} onChange={set('person_phone')} /></label>
            </div>
            <label className="fld">Adres <span className="muted">(isteğe bağlı)</span><input value={edit.f.person_address} onChange={set('person_address')} /></label>
            <label className="fld">Not <span className="muted">(isteğe bağlı)</span><textarea rows={2} value={edit.f.notes} onChange={set('notes')} /></label>
            <div className="pn-modal-actions">
              <button type="button" className="btn gold" disabled={saving} onClick={save}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</button>
              <button type="button" className="btn ghost" disabled={saving} onClick={() => setEdit(null)}>Vazgeç</button>
            </div>
          </>
        )}
      </Modal>

      {/* Ödeme ekle / düzenle */}
      <Modal open={!!payM} onClose={() => !saving && setPayM(null)}>
        {payM && (() => {
          const n = payM.note;
          const per = periodsOf(n);
          const amt = Number(payM.amount.replace(',', '.')) || 0;
          const paidOthers = (paidOf[n.id] || 0) - (payM.logId ? log.find((l) => l.id === payM.logId)?.amount || 0 : 0);
          const left = Math.max(n.amount - paidOthers, 0);
          return (
            <>
              <div className="pe-head"><h2>{payM.logId ? '✏️ Ödemeyi düzenle' : '➕ Ödeme ekle'}</h2></div>
              <p className="muted small">{n.title}{n.person_name ? ` · ${n.person_name}` : ''}</p>
              {n.recurrence === 'once' && (
                <div className="pn-nums" style={{ marginBottom: '0.6rem' }}>
                  <span>Toplam <b>{tl(n.amount)}</b></span>
                  <span className="ok-txt">Önceki ödenen <b>{tl(paidOthers)}</b></span>
                  <span className="pn-left">Kalan <b>{tl(left)}</b></span>
                </div>
              )}
              <div className="two-col">
                <label className="fld">Ödenen tutar (₺)<input inputMode="decimal" value={payM.amount} onChange={(e) => setPayM({ ...payM, amount: e.target.value })} /></label>
                <label className="fld">Ödeme tarihi<input type="date" value={payM.date} onChange={(e) => setPayM({ ...payM, date: e.target.value })} /></label>
              </div>
              {n.recurrence === 'monthly' && (
                <label className="fld">Hangi dönemin ödemesi?
                  <select value={payM.forDate} onChange={(e) => setPayM({ ...payM, forDate: e.target.value })}>
                    <option value="">Dönemsiz / diğer</option>
                    {[...per].reverse().map((p) => (
                      <option key={p.due} value={p.due}>{fmtDate(p.due)} – {fmtDate(p.end)} ({tl(paidFor(n.id, p.due))} / {tl(n.amount)})</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="fld">Not <span className="muted">(isteğe bağlı)</span><input value={payM.memo} onChange={(e) => setPayM({ ...payM, memo: e.target.value })} placeholder="Havale, nakit, avans…" /></label>
              {n.recurrence === 'once' && amt > 0 && (
                <p className="small muted">Bu ödemeden sonra kalan: <b>{tl(Math.max(left - amt, 0))}</b>{amt > left ? ' (toplamdan fazla girdiniz)' : ''}</p>
              )}
              <div className="pn-modal-actions">
                <button type="button" className="btn gold" disabled={saving} onClick={doPay}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</button>
                <button type="button" className="btn ghost" disabled={saving} onClick={() => setPayM(null)}>Vazgeç</button>
              </div>
            </>
          );
        })()}
      </Modal>

      <ConfirmationModal open={!!del} onClose={() => setDel(null)} onConfirm={doDelete} title="Kaydı sil" message={`"${del?.title}" kaydı ve tüm ödeme geçmişi silinecek. Emin misiniz?`} />
      <ConfirmationModal open={!!undo} onClose={() => setUndo(null)} onConfirm={doUndo} title="Ödeme kaydını sil" message="Bu ödeme kaydı silinecek; kalan tutar yeniden hesaplanacak." confirmLabel="Evet, sil" variant="warning" />
    </>
  );
}
