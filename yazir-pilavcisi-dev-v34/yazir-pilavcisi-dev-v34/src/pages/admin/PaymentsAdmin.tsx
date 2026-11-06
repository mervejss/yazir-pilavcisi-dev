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
  due_date: '', category: '', person_name: '', person_phone: '', person_address: '', notes: '',
});

const CATEGORIES = ['Web sitesi', 'Reklam', 'Sosyal medya', 'Yazılım / Abonelik', 'Kira', 'Tedarikçi', 'Maaş', 'Vergi', 'Diğer'];
const todayStr = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const fmtDate = (d?: string | null) => (d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const daysTo = (d: string) => Math.round((new Date(d + 'T12:00:00').getTime() - new Date(todayStr() + 'T12:00:00').getTime()) / 86400000);

export default function PaymentsAdmin() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [log, setLog] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<'open' | 'history' | 'closed'>('open');
  const [edit, setEdit] = useState<null | { id: string | null; f: ReturnType<typeof blank> }>(null);
  const [saving, setSaving] = useState(false);
  const [payFor, setPayFor] = useState<Note | null>(null);
  const [pay, setPay] = useState({ amount: '', date: todayStr(), memo: '' });
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
  const byId = useMemo(() => Object.fromEntries(notes.map((n) => [n.id, n])), [notes]);

  const open = notes.filter((n) => n.status === 'open');
  const closed = notes.filter((n) => n.status === 'closed');
  const sum = (arr: Note[], dir: Note['direction'], f: (n: Note) => number) => arr.filter((n) => n.direction === dir).reduce((s, n) => s + f(n), 0);
  const payableOnce = sum(open.filter((n) => n.recurrence === 'once'), 'payable', remaining);
  const payableMonthly = sum(open.filter((n) => n.recurrence === 'monthly'), 'payable', (n) => n.amount);
  const receivable = sum(open, 'receivable', remaining);
  const thisMonthKey = todayStr().slice(0, 7);
  const paidThisMonth = log.filter((l) => l.paid_at.slice(0, 7) === thisMonthKey && byId[l.note_id]?.direction === 'payable').reduce((s, l) => s + l.amount, 0);

  const startEdit = (n?: Note) =>
    setEdit({
      id: n?.id || null,
      f: n
        ? { title: n.title, direction: n.direction, amount: String(n.amount), recurrence: n.recurrence, due_date: n.due_date || '', category: n.category || '', person_name: n.person_name || '', person_phone: n.person_phone || '', person_address: n.person_address || '', notes: n.notes || '' }
        : blank(),
    });

  const save = async () => {
    if (!edit) return;
    const f = edit.f;
    const amount = Number(String(f.amount).replace(',', '.'));
    if (!f.title.trim()) return void toast.error('Başlık yazın');
    if (!isFinite(amount) || amount < 0 || f.amount === '') return void toast.error('Geçerli bir tutar girin');
    setSaving(true);
    const row = {
      title: f.title.trim(), direction: f.direction, amount, recurrence: f.recurrence, due_date: f.due_date || null,
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

  const openPay = (n: Note) => {
    setPayFor(n);
    setPay({ amount: String(remaining(n)), date: todayStr(), memo: '' });
  };
  const doPay = async () => {
    if (!payFor) return;
    const amount = Number(pay.amount.replace(',', '.'));
    if (!isFinite(amount) || amount <= 0) return void toast.error('Geçerli tutar girin');
    setSaving(true);
    const { data, error } = await supabase.rpc('payment_mark_paid', {
      p_note: payFor.id, p_amount: amount, p_paid_at: `${pay.date}T12:00:00+03:00`, p_memo: pay.memo || null,
    } as any);
    setSaving(false);
    if (error) return void toast.error(error.message);
    const r: any = data;
    toast.success(r?.status === 'closed' ? 'Ödendi — kayıt kapandı' : r?.next_due ? `Ödendi — sonraki vade ${fmtDate(r.next_due)}` : `Ödendi — kalan ${tl(Number(r?.remaining || 0))}`);
    setPayFor(null);
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
    if (!n.due_date) return <span className="chip">Vade yok</span>;
    const d = daysTo(n.due_date);
    const cls = d < 0 ? 'pn-late' : d <= 5 ? 'pn-soon' : '';
    return <span className={`chip ${cls}`}>{d < 0 ? `${-d} gün gecikti` : d === 0 ? 'Bugün' : `${d} gün sonra`} · {fmtDate(n.due_date)}</span>;
  };

  const card = (n: Note) => (
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
          <b>{tl(remaining(n))}</b>
          {n.recurrence === 'once' && (paidOf[n.id] || 0) > 0 && <small>Toplam {tl(n.amount)} · ödenen {tl(paidOf[n.id])}</small>}
          {n.recurrence === 'monthly' && <small>/ ay</small>}
        </div>
      </div>
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
          {n.status === 'open' ? <button type="button" className="btn gold sm" onClick={() => openPay(n)}>✔ Ödendi</button> : <button type="button" className="btn ghost sm" onClick={() => reopen(n)}>Yeniden aç</button>}
          <button type="button" className="btn ghost sm" onClick={() => startEdit(n)}>✏️ Düzenle</button>
          <button type="button" className="btn ghost sm danger-txt" onClick={() => setDel(n)}>🗑 Sil</button>
        </div>
      </div>
    </article>
  );

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
            <div className="card"><small>Ödenecek (tek seferlik kalan)</small><b>{tl(payableOnce)}</b></div>
            <div className="card"><small>Aylık yükümlülük</small><b>{tl(payableMonthly)}</b><em>/ ay</em></div>
            <div className="card"><small>Alınacak</small><b>{tl(receivable)}</b></div>
            <div className="card"><small>Bu ay ödenen</small><b>{tl(paidThisMonth)}</b></div>
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
                      <button type="button" className="linklike small" onClick={() => setUndo(l)}>Geri al</button>
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
              <label className="fld">Vade / tarih <span className="muted">(isteğe bağlı)</span><input type="date" value={edit.f.due_date} onChange={set('due_date')} /></label>
            </div>
            <div className="fld">
              <span>Sıklık</span>
              <div className="seg">
                <button type="button" className={edit.f.recurrence === 'once' ? 'on' : ''} onClick={() => setEdit({ ...edit, f: { ...edit.f, recurrence: 'once' } })}>1️⃣ Tek seferlik</button>
                <button type="button" className={edit.f.recurrence === 'monthly' ? 'on' : ''} onClick={() => setEdit({ ...edit, f: { ...edit.f, recurrence: 'monthly' } })}>🔁 Her ay</button>
              </div>
            </div>
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

      {/* Ödendi */}
      <Modal open={!!payFor} onClose={() => !saving && setPayFor(null)}>
        {payFor && (
          <>
            <div className="pe-head"><h2>✔ Ödendi olarak işaretle</h2></div>
            <p className="muted small">{payFor.title}{payFor.person_name ? ` · ${payFor.person_name}` : ''}</p>
            <div className="two-col">
              <label className="fld">Ödenen tutar (₺)<input inputMode="decimal" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></label>
              <label className="fld">Ödeme tarihi<input type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} /></label>
            </div>
            <label className="fld">Not <span className="muted">(isteğe bağlı)</span><input value={pay.memo} onChange={(e) => setPay({ ...pay, memo: e.target.value })} placeholder="Havale, nakit…" /></label>
            {payFor.recurrence === 'once' && Number(pay.amount.replace(',', '.')) < remaining(payFor) && <p className="small muted">Kısmi ödeme: kalan tutar için kayıt açık kalır.</p>}
            {payFor.recurrence === 'monthly' && <p className="small muted">Aylık kayıt: ödeme sonrası vade bir ay ilerler.</p>}
            <div className="pn-modal-actions">
              <button type="button" className="btn gold" disabled={saving} onClick={doPay}>{saving ? 'Kaydediliyor…' : 'Onayla'}</button>
              <button type="button" className="btn ghost" disabled={saving} onClick={() => setPayFor(null)}>Vazgeç</button>
            </div>
          </>
        )}
      </Modal>

      <ConfirmationModal open={!!del} onClose={() => setDel(null)} onConfirm={doDelete} title="Kaydı sil" message={`"${del?.title}" kaydı ve tüm ödeme geçmişi silinecek. Emin misiniz?`} />
      <ConfirmationModal open={!!undo} onClose={() => setUndo(null)} onConfirm={doUndo} title="Ödemeyi geri al" message="Bu ödeme kaydı silinecek ve ilgili kayıt yeniden açılacak." confirmLabel="Evet, geri al" variant="warning" />
    </>
  );
}
