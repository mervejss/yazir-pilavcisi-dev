import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import { formatBytes } from '@/lib/imageTools';

interface Backup {
  id: string;
  name: string;
  note: string | null;
  is_auto: boolean;
  counts: Record<string, number>;
  created_at: string;
}

export default function BackupsAdmin() {
  const [list, setList] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [restoreB, setRestoreB] = useState<Backup | null>(null);
  const [typed, setTyped] = useState('');
  const [delB, setDelB] = useState<Backup | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('menu_backups').select('id,name,note,is_auto,counts,created_at').order('created_at', { ascending: false });
    if (error) setMissing(true);
    else {
      setMissing(false);
      setList((data || []) as unknown as Backup[]);
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const create = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    const { error } = await supabase.rpc('create_menu_backup', { p_name: name || null, p_note: note || null });
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success('Menü yedeği alındı');
    setNewOpen(false);
    setName('');
    setNote('');
    load();
  };

  const quick = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('create_menu_backup', { p_name: null, p_note: 'Tek tıkla yedek' });
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success('Menü yedeği alındı');
    load();
  };

  const download = async (b: Backup) => {
    const { data, error } = await supabase.from('menu_backups').select('snapshot,name,created_at').eq('id', b.id).single();
    if (error || !data) return void toast.error('İndirilemedi');
    const blob = new Blob([JSON.stringify((data as any).snapshot, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `menu-yedek-${new Date(b.created_at).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
    a.click();
    toast.success(`JSON indirildi (${formatBytes(blob.size)})`);
  };

  const restore = async () => {
    if (!restoreB) return;
    setBusy(true);
    const { error } = await supabase.rpc('restore_menu_backup', { p_id: restoreB.id });
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success('Menü yedekten geri yüklendi. Önceki hali "Geri yüklemeden önce" adıyla yedeklendi.');
    setRestoreB(null);
    setTyped('');
    load();
  };

  const remove = async () => {
    if (!delB) return;
    const { error } = await supabase.from('menu_backups').delete().eq('id', delB.id);
    if (error) toast.error(error.message);
    else {
      toast.success('Yedek silindi');
      setDelB(null);
      load();
    }
  };

  if (loading) return <p className="muted center">Yükleniyor…</p>;

  return (
    <>
      <div className="bar mx-bar">
        <div>
          <h1>Menü Yedekleri</h1>
          <p className="muted" style={{ margin: 0 }}>Kategoriler, ürünler, fiyatlar, seçenekler ve galeri kayıtlarının anlık görüntüsü. Her gün 03:30'da otomatik yedek de alınır (pg_cron açıksa).</p>
        </div>
        <div className="mx-bar-actions">
          <button type="button" className="btn ghost sm" onClick={() => setNewOpen(true)}>+ Adlandırarak yedekle</button>
          <button type="button" className="btn gold sm" onClick={quick} disabled={busy}>💾 Şimdi yedekle</button>
        </div>
      </div>

      {missing && <div className="note">Yedekleme için <code>sql/16_menu_extras_backup_audit.sql</code> dosyasını Supabase SQL Editor'de çalıştırın.</div>}

      <div className="bk-list">
        {list.map((b) => (
          <article key={b.id} className="bk-card">
            <div className="bk-head">
              <div>
                <h3>{b.name}</h3>
                <small className="muted">{new Date(b.created_at).toLocaleString('tr-TR')}</small>
              </div>
              <span className={`cp-st ${b.is_auto ? 'mute' : 'ok'}`}>{b.is_auto ? 'Otomatik' : 'Elle'}</span>
            </div>
            {b.note && <p className="muted small" style={{ margin: 0 }}>{b.note}</p>}
            <div className="bk-counts">
              <span>🗂️ {b.counts?.categories ?? 0} kategori</span>
              <span>🍽️ {b.counts?.products ?? 0} ürün</span>
              <span>💰 {b.counts?.variants ?? 0} fiyat</span>
              <span>➕ {b.counts?.options ?? 0} seçenek</span>
              <span>🖼️ {b.counts?.gallery ?? 0} galeri</span>
            </div>
            <div className="bk-actions">
              <button type="button" className="btn ghost sm" onClick={() => download(b)}>⬇ JSON indir</button>
              <button type="button" className="btn ghost sm" onClick={() => { setRestoreB(b); setTyped(''); }}>↩ Geri yükle</button>
              <button type="button" className="btn ghost sm danger-txt" onClick={() => setDelB(b)} aria-label="Sil">🗑️</button>
            </div>
          </article>
        ))}
        {list.length === 0 && !missing && <div className="ad-empty" style={{ gridColumn: '1/-1' }}><div>💾</div><h3>Henüz yedek yok</h3><p className="muted">“Şimdi yedekle” ile ilk yedeği alın.</p></div>}
      </div>

      <Modal open={newOpen} onClose={() => !busy && setNewOpen(false)}>
        <form onSubmit={create}>
          <div className="pe-head"><div><h2>💾 Yeni Menü Yedeği</h2></div><button type="button" className="icon-circle" onClick={() => setNewOpen(false)} aria-label="Kapat">✕</button></div>
          <label className="fld">Yedek adı<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Örn: Ramazan öncesi menü" autoFocus /></label>
          <label className="fld" style={{ marginTop: '0.8rem' }}>Not (isteğe bağlı)<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <div className="pe-foot"><div /><div className="pe-foot-right"><button type="button" className="btn ghost" onClick={() => setNewOpen(false)}>Vazgeç</button><button type="submit" className="btn gold" disabled={busy}>{busy ? 'Alınıyor…' : 'Yedekle'}</button></div></div>
        </form>
      </Modal>

      <ConfirmationModal
        open={!!restoreB}
        onClose={() => !busy && setRestoreB(null)}
        onConfirm={() => typed.trim().toUpperCase() === 'GERİ YÜKLE' || typed.trim().toLowerCase() === 'geri yükle' ? restore() : toast.error('Onay için "GERİ YÜKLE" yazın')}
        title="Menüyü yedekten geri yükle"
        message={`"${restoreB?.name}" yedeğindeki menü yeniden kurulacak. Yedekten sonra eklenen ürün/kategoriler silinir, değişen fiyatlar eski haline döner. Geri yüklemeden önce mevcut menü otomatik yedeklenir.`}
        confirmLabel="Evet, geri yükle"
        variant="danger"
        loading={busy}
      >
        <label className="fld">Onaylamak için <b>GERİ YÜKLE</b> yazın<input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus /></label>
      </ConfirmationModal>

      <ConfirmationModal open={!!delB} onClose={() => setDelB(null)} onConfirm={remove} title="Yedeği sil" message={`"${delB?.name}" yedeği kalıcı olarak silinecek.`} confirmLabel="Evet, sil" />
    </>
  );
}
