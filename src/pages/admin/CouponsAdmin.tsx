import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { tl } from '@/lib/helpers';
import { AUDIENCE_LABELS, conditionLines, discountLabel, isoToLocalInput, randomCode } from '@/lib/campaigns';
import Modal from '@/components/ui/Modal';
import Switch from '@/components/ui/Switch';
import ConfirmationModal from '@/components/ui/ConfirmationModal';

interface Coupon {
  id: string;
  code: string;
  title: string;
  description: string;
  discount_type: 'percent' | 'fixed' | 'free_delivery';
  discount_value: number;
  max_discount: number | null;
  min_order_amount: number;
  starts_at: string | null;
  ends_at: string | null;
  daily_start: string | null;
  daily_end: string | null;
  weekdays: number[] | null;
  audience: 'all' | 'members' | 'new_customers' | 'specific';
  customer_ids: string[];
  usage_limit: number | null;
  per_customer_limit: number | null;
  used_count: number;
  is_public: boolean;
  is_active: boolean;
  created_at: string;
}

const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

const blank = (): any => ({
  code: randomCode(),
  title: '',
  description: '',
  discount_type: 'percent',
  discount_value: 10,
  max_discount: '',
  min_order_amount: 0,
  starts_at: '',
  ends_at: '',
  daily_start: '',
  daily_end: '',
  weekdays: [] as number[],
  audience: 'all',
  customer_ids: [] as string[],
  usage_limit: '',
  per_customer_limit: 1,
  is_public: true,
  is_active: true,
});

const TEMPLATES: { label: string; patch: Record<string, any> }[] = [
  { label: '🍽️ Öğle saati %10 (12:00–15:00)', patch: { title: 'Öğle Fırsatı', description: 'Öğle saatlerinde sepette %10 indirim!', discount_type: 'percent', discount_value: 10, daily_start: '12:00', daily_end: '15:00' } },
  { label: '🎉 Hafta sonu %15', patch: { title: 'Hafta Sonu Keyfi', description: 'Cumartesi ve Pazar günleri %15 indirim.', discount_type: 'percent', discount_value: 15, weekdays: [6, 7] } },
  { label: '🆕 İlk sipariş 30 ₺', patch: { title: 'İlk Siparişe Özel', description: 'İlk siparişinizde 30 ₺ indirim.', discount_type: 'fixed', discount_value: 30, audience: 'new_customers', per_customer_limit: 1 } },
  { label: '🛵 Ücretsiz teslimat', patch: { title: 'Ücretsiz Teslimat', description: 'Bu kodla teslimat ücreti bizden.', discount_type: 'free_delivery', discount_value: 0, min_order_amount: 150 } },
  { label: '🎟️ İlk 50 kişiye %20', patch: { title: 'İlk 50 Kişiye Özel', description: 'Kontenjan sınırlı!', discount_type: 'percent', discount_value: 20, usage_limit: 50 } },
];

const toNum = (v: any) => (v === '' || v == null ? null : Number(v));

function status(c: Coupon): { label: string; cls: string } {
  const now = Date.now();
  if (!c.is_active) return { label: 'Pasif', cls: 'mute' };
  if (c.ends_at && new Date(c.ends_at).getTime() < now) return { label: 'Süresi doldu', cls: 'bad' };
  if (c.usage_limit != null && c.used_count >= c.usage_limit) return { label: 'Kontenjan doldu', cls: 'bad' };
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return { label: 'Planlandı', cls: 'warn' };
  return { label: 'Aktif', cls: 'ok' };
}

export default function CouponsAdmin() {
  const { profile } = useAuthStore();
  const canWrite = !!profile && ['owner', 'sub_admin'].includes(profile.role);
  const [list, setList] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingSql, setMissingSql] = useState(false);
  const [form, setForm] = useState<any | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState<Coupon | null>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [custQ, setCustQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'ok' | 'off'>('all');

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
    if (error) setMissingSql(true);
    else {
      setMissingSql(false);
      setList((data || []) as unknown as Coupon[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    supabase.rpc('admin_customers').then(({ data }) => data && setCustomers(data as any[]));
  }, [load]);

  const stats = useMemo(() => {
    const act = list.filter((c) => status(c).cls === 'ok');
    return { total: list.length, active: act.length, uses: list.reduce((s, c) => s + c.used_count, 0), pub: list.filter((c) => c.is_public && c.is_active).length };
  }, [list]);

  const shown = list.filter((c) => (filter === 'all' ? true : filter === 'ok' ? status(c).cls === 'ok' : status(c).cls !== 'ok'));

  const openNew = (patch?: Record<string, any>) => {
    setEditId(null);
    setForm({ ...blank(), ...(patch || {}) });
  };
  const openEdit = (c: Coupon) => {
    setEditId(c.id);
    setForm({
      ...c,
      max_discount: c.max_discount ?? '',
      starts_at: isoToLocalInput(c.starts_at),
      ends_at: isoToLocalInput(c.ends_at),
      daily_start: c.daily_start?.slice(0, 5) || '',
      daily_end: c.daily_end?.slice(0, 5) || '',
      weekdays: c.weekdays || [],
      usage_limit: c.usage_limit ?? '',
      per_customer_limit: c.per_customer_limit ?? '',
    });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const code = String(form.code).trim().toUpperCase().replace(/\s+/g, '');
    if (code.length < 3) return void toast.error('Kupon kodu en az 3 karakter olmalı');
    if (form.discount_type !== 'free_delivery' && !(Number(form.discount_value) > 0)) return void toast.error('İndirim değeri girin');
    if (form.discount_type === 'percent' && Number(form.discount_value) > 100) return void toast.error('Yüzde 100\'ü geçemez');
    if ((form.daily_start && !form.daily_end) || (!form.daily_start && form.daily_end)) return void toast.error('Saat aralığı için başlangıç ve bitiş girin');
    setSaving(true);
    const row = {
      code,
      title: form.title.trim(),
      description: form.description.trim(),
      discount_type: form.discount_type,
      discount_value: form.discount_type === 'free_delivery' ? 0 : Number(form.discount_value),
      max_discount: form.discount_type === 'percent' ? toNum(form.max_discount) : null,
      min_order_amount: Number(form.min_order_amount) || 0,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      daily_start: form.daily_start || null,
      daily_end: form.daily_end || null,
      weekdays: form.weekdays.length ? form.weekdays : null,
      audience: form.audience,
      customer_ids: form.audience === 'specific' ? form.customer_ids : [],
      usage_limit: toNum(form.usage_limit),
      per_customer_limit: toNum(form.per_customer_limit),
      is_public: form.is_public,
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
    };
    const q = editId ? supabase.from('coupons').update(row).eq('id', editId).select('id') : supabase.from('coupons').insert({ ...row, created_by: profile?.id }).select('id');
    const { data, error } = await q;
    setSaving(false);
    if (error) return void toast.error(/duplicate|unique/i.test(error.message) ? 'Bu kupon kodu zaten kullanılıyor' : error.message);
    if (!data || data.length === 0) return void toast.error('Kaydedilemedi: yetkiniz yok');
    toast.success(editId ? 'Kupon güncellendi' : 'Kupon oluşturuldu');
    setForm(null);
    load();
  };

  const toggle = async (c: Coupon, field: 'is_active' | 'is_public') => {
    const { error } = await supabase.from('coupons').update({ [field]: !c[field] }).eq('id', c.id);
    if (error) toast.error(error.message);
    else load();
  };

  const duplicate = async (c: Coupon) => {
    const { id, created_at, used_count, ...rest } = c as any;
    const { error } = await supabase.from('coupons').insert({ ...rest, code: randomCode(), title: `${c.title} (Kopya)`, is_active: false, is_public: false, used_count: 0 });
    if (error) toast.error(error.message);
    else {
      toast.success('Kupon çoğaltıldı (pasif)');
      load();
    }
  };

  const remove = async () => {
    if (!del) return;
    const { error } = await supabase.from('coupons').delete().eq('id', del.id);
    if (error) toast.error(error.message);
    else {
      toast.success('Kupon silindi');
      setDel(null);
      load();
    }
  };

  const custMatches = custQ.trim()
    ? customers.filter((c) => `${c.full_name} ${c.phone || ''}`.toLocaleLowerCase('tr').includes(custQ.trim().toLocaleLowerCase('tr'))).slice(0, 6)
    : [];

  if (loading) return <p className="muted center">Yükleniyor…</p>;

  return (
    <>
      <div className="bar mx-bar">
        <div>
          <h1>Kupon &amp; Kampanya Yönetimi</h1>
          <p className="muted" style={{ margin: 0 }}>Kupon kodları, saat/gün bazlı ve kontenjanlı kampanyalar. "Sitede göster" açık olanlar müşteri sitesindeki Kampanyalar bölümünde görünür.</p>
        </div>
        <div className="mx-bar-actions">
          <a className="btn ghost sm" href="/kampanyalar" target="_blank" rel="noreferrer">Kampanyalar sayfası ↗</a>
          {canWrite && <button type="button" className="btn gold sm" onClick={() => openNew()}>+ Yeni Kupon</button>}
        </div>
      </div>

      {missingSql && <div className="note">Kupon sistemi için <code>sql/15_coupons_loyalty.sql</code> dosyasını Supabase SQL Editor'de çalıştırın.</div>}

      <div className="ad-stats">
        <div className="ad-stat static"><small>Toplam kupon</small><b>{stats.total}</b><span>tanımlı</span></div>
        <button type="button" className={`ad-stat ok${filter === 'ok' ? ' on' : ''}`} onClick={() => setFilter(filter === 'ok' ? 'all' : 'ok')}><small>Şu an geçerli</small><b>{stats.active}</b><span>aktif kampanya</span></button>
        <div className="ad-stat static"><small>Toplam kullanım</small><b>{stats.uses}</b><span>sipariş</span></div>
        <div className="ad-stat static"><small>Sitede görünen</small><b>{stats.pub}</b><span>herkese açık</span></div>
      </div>

      {canWrite && (
        <div className="tpl-row">
          <span className="muted small">Hızlı şablonlar:</span>
          {TEMPLATES.map((t) => (
            <button key={t.label} type="button" className="btn ghost sm" onClick={() => openNew(t.patch)}>{t.label}</button>
          ))}
        </div>
      )}

      <div className="seg" style={{ margin: '0.8rem 0' }}>
        <button type="button" className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>Tümü ({list.length})</button>
        <button type="button" className={filter === 'ok' ? 'on' : ''} onClick={() => setFilter('ok')}>Geçerli</button>
        <button type="button" className={filter === 'off' ? 'on' : ''} onClick={() => setFilter('off')}>Pasif / Bitmiş</button>
      </div>

      <div className="cp-grid">
        {shown.map((c) => {
          const st = status(c);
          const pct = c.usage_limit ? Math.min(100, (c.used_count / c.usage_limit) * 100) : 0;
          return (
            <article key={c.id} className={`cp-card ${st.cls}`}>
              <div className="cp-top">
                <code>{c.code}</code>
                <span className={`cp-st ${st.cls}`}>{st.label}</span>
              </div>
              <h3>{c.title || discountLabel(c)}</h3>
              <div className="cp-disc">{discountLabel(c)}</div>
              <ul className="camp-cond">{conditionLines(c).map((l) => <li key={l}>{l}</li>)}<li>{AUDIENCE_LABELS[c.audience]}{c.audience === 'specific' ? ` (${c.customer_ids.length} kişi)` : ''}</li></ul>
              <div className="cp-use">
                <div><i style={{ width: `${c.usage_limit ? pct : Math.min(100, c.used_count * 5)}%` }} /></div>
                <small>{c.used_count} kullanım{c.usage_limit ? ` / ${c.usage_limit} kontenjan` : ' (sınırsız)'}</small>
              </div>
              {canWrite && (
                <>
                  <div className="cp-switches">
                    <label>Aktif <Switch checked={c.is_active} onChange={() => toggle(c, 'is_active')} label="Aktif" /></label>
                    <label>Sitede göster <Switch checked={c.is_public} onChange={() => toggle(c, 'is_public')} label="Sitede göster" /></label>
                  </div>
                  <div className="cp-actions">
                    <button type="button" className="btn ghost sm" onClick={() => openEdit(c)}>✏️ Düzenle</button>
                    <button type="button" className="btn ghost sm" onClick={() => duplicate(c)}>📄 Çoğalt</button>
                    <button type="button" className="btn ghost sm danger-txt" onClick={() => setDel(c)} aria-label="Sil">🗑️</button>
                  </div>
                </>
              )}
            </article>
          );
        })}
        {shown.length === 0 && !missingSql && <div className="ad-empty" style={{ gridColumn: '1/-1' }}><div>🎟️</div><h3>Henüz kupon yok</h3><p className="muted">Hızlı şablonlardan birini seçerek başlayın.</p></div>}
      </div>

      <Modal open={!!form} onClose={() => !saving && setForm(null)} size="wide">
        {form && (
          <form onSubmit={save}>
            <div className="pe-head">
              <div><h2>{editId ? '✏️ Kuponu Düzenle' : '➕ Yeni Kupon / Kampanya'}</h2></div>
              <button type="button" className="icon-circle" onClick={() => setForm(null)} aria-label="Kapat">✕</button>
            </div>
            <div className="pe-right">
              <section className="pe-sec">
                <h4>Temel</h4>
                <div className="two-col">
                  <label className="fld">Kupon kodu *
                    <div className="code-row"><input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /><button type="button" className="btn ghost sm" onClick={() => setForm({ ...form, code: randomCode() })}>🎲 Üret</button></div>
                  </label>
                  <label className="fld">Başlık (sitede görünür)<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Örn: Hafta Sonu Keyfi" /></label>
                </div>
                <label className="fld">Açıklama<textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
              </section>

              <section className="pe-sec">
                <h4>İndirim</h4>
                <div className="seg">
                  {([['percent', '% Yüzde'], ['fixed', '₺ Tutar'], ['free_delivery', '🛵 Ücretsiz teslimat']] as const).map(([k, l]) => (
                    <button type="button" key={k} className={form.discount_type === k ? 'on' : ''} onClick={() => setForm({ ...form, discount_type: k })}>{l}</button>
                  ))}
                </div>
                <div className="two-col">
                  {form.discount_type !== 'free_delivery' && (
                    <label className="fld">{form.discount_type === 'percent' ? 'İndirim yüzdesi (%)' : 'İndirim tutarı (₺)'}<input type="number" min={0} step="0.5" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} /></label>
                  )}
                  {form.discount_type === 'percent' && (
                    <label className="fld">Azami indirim (₺, isteğe bağlı)<input type="number" min={0} value={form.max_discount} onChange={(e) => setForm({ ...form, max_discount: e.target.value })} /></label>
                  )}
                  <label className="fld">Minimum sepet tutarı (₺)<input type="number" min={0} value={form.min_order_amount} onChange={(e) => setForm({ ...form, min_order_amount: e.target.value })} /></label>
                </div>
              </section>

              <section className="pe-sec">
                <h4>Ne zaman geçerli?</h4>
                <div className="two-col">
                  <label className="fld">Başlangıç (isteğe bağlı)<input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></label>
                  <label className="fld">Bitiş (isteğe bağlı)<input type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></label>
                  <label className="fld">Günlük saat başlangıcı<input type="time" value={form.daily_start} onChange={(e) => setForm({ ...form, daily_start: e.target.value })} /></label>
                  <label className="fld">Günlük saat bitişi<input type="time" value={form.daily_end} onChange={(e) => setForm({ ...form, daily_end: e.target.value })} /></label>
                </div>
                <div className="fld">Geçerli günler <span className="muted small">(hiçbiri seçili değilse her gün)</span>
                  <div className="tag-pick">
                    {DAYS.map((d, i) => (
                      <button type="button" key={d} className={form.weekdays.includes(i + 1) ? 'on' : ''} onClick={() => setForm({ ...form, weekdays: form.weekdays.includes(i + 1) ? form.weekdays.filter((x: number) => x !== i + 1) : [...form.weekdays, i + 1] })}>{d}</button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="pe-sec">
                <h4>Kimler kullanabilir?</h4>
                <div className="seg">
                  {(Object.keys(AUDIENCE_LABELS) as string[]).map((k) => (
                    <button type="button" key={k} className={form.audience === k ? 'on' : ''} onClick={() => setForm({ ...form, audience: k })}>{AUDIENCE_LABELS[k]}</button>
                  ))}
                </div>
                {form.audience === 'specific' && (
                  <div className="fld">Müşteri seçin
                    <input value={custQ} onChange={(e) => setCustQ(e.target.value)} placeholder="İsim veya telefon ara…" />
                    {custMatches.map((c) => (
                      <button type="button" key={c.id} className="cust-pick" onClick={() => { if (!form.customer_ids.includes(c.id)) setForm({ ...form, customer_ids: [...form.customer_ids, c.id] }); setCustQ(''); }}>
                        + {c.full_name || 'İsimsiz'} <small className="muted">{c.phone}</small>
                      </button>
                    ))}
                    <div className="tag-pick">
                      {form.customer_ids.map((id: string) => {
                        const c = customers.find((x) => x.id === id);
                        return <button type="button" key={id} className="on" onClick={() => setForm({ ...form, customer_ids: form.customer_ids.filter((x: string) => x !== id) })}>{c?.full_name || id.slice(0, 6)} ✕</button>;
                      })}
                    </div>
                  </div>
                )}
                <div className="two-col">
                  <label className="fld">Toplam kontenjan <span className="muted small">(boş = sınırsız)</span><input type="number" min={1} value={form.usage_limit} onChange={(e) => setForm({ ...form, usage_limit: e.target.value })} /></label>
                  <label className="fld">Kişi başı kullanım <span className="muted small">(boş = sınırsız)</span><input type="number" min={1} value={form.per_customer_limit} onChange={(e) => setForm({ ...form, per_customer_limit: e.target.value })} /></label>
                </div>
              </section>

              <section className="pe-sec">
                <div className="pe-toggles">
                  <div><div><b>Aktif</b><small>Kapalıysa kod çalışmaz</small></div><Switch checked={form.is_active} onChange={() => setForm({ ...form, is_active: !form.is_active })} label="Aktif" /></div>
                  <div><div><b>Sitede göster</b><small>Müşteri sitesindeki "Kampanyalar" bölümünde ve ana sayfada listelenir</small></div><Switch checked={form.is_public} onChange={() => setForm({ ...form, is_public: !form.is_public })} label="Sitede göster" /></div>
                </div>
              </section>
            </div>
            <div className="pe-foot"><div />
              <div className="pe-foot-right">
                <button type="button" className="btn ghost" onClick={() => setForm(null)} disabled={saving}>Vazgeç</button>
                <button type="submit" className="btn gold" disabled={saving}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</button>
              </div>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmationModal open={!!del} onClose={() => setDel(null)} onConfirm={remove} title="Kuponu sil" message={`"${del?.code}" kuponu ve kullanım kayıtları silinecek. Bu işlem geri alınamaz.`} confirmLabel="Evet, sil" />
    </>
  );
}
