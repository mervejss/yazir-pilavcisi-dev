import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import toast from 'react-hot-toast';

type Campaign = {
  id: string; campaign_name: string; business_name: string;
  staff_enabled: boolean; customers_enabled: boolean;
  staff_discount: number; customer_discount: number;
  staff_scope: 'cart'|'product'; customer_scope: 'cart'|'product';
  staff_code: string; customer_code: string; is_active: boolean;
};
const token = (name: string) => {
  const prefix = (name || 'REF').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3) || 'REF';
  const bytes = new Uint8Array(7); crypto.getRandomValues(bytes);
  return (prefix + Array.from(bytes, b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('')).slice(0,12);
};
const empty = () => ({ campaign_name:'', business_name:'', staff_enabled:true, customers_enabled:true, staff_discount:20, customer_discount:10, staff_scope:'cart' as const, customer_scope:'cart' as const, staff_code:token('REB'), customer_code:token('REB'), is_active:true });

export default function ReferralCampaignsAdmin() {
  const { profile } = useAuthStore();
  const [rows,setRows] = useState<Campaign[]>([]);
  const [form,setForm] = useState<any|null>(null);
  const [editId,setEditId] = useState<string|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const canWrite = !!profile && ['owner','sub_admin'].includes(profile.role);
  const load = useCallback(async () => {
    const {data,error} = await supabase.from('referral_campaigns').select('*').order('created_at',{ascending:false});
    if(error) setError(error.message); else { setError(''); setRows((data||[]) as Campaign[]); }
  },[]);
  useEffect(()=>{ load(); },[load]);
  const save = async (e:React.FormEvent) => {
    e.preventDefault(); if(!form) return;
    if(!form.staff_enabled && !form.customers_enabled) return void toast.error('En az bir kitle seçmelisiniz');
    if(form.staff_enabled && !(Number(form.staff_discount)>0 && Number(form.staff_discount)<=100)) return void toast.error('Personel indirimi %1–100 arasında olmalı');
    if(form.customers_enabled && !(Number(form.customer_discount)>0 && Number(form.customer_discount)<=100)) return void toast.error('Müşteri indirimi %1–100 arasında olmalı');
    setBusy(true);
    const row={...form,campaign_name:form.campaign_name.trim() || `Kampanya-${Date.now().toString(36).toUpperCase()}`,business_name:form.business_name.trim() || `İşletme-${Date.now().toString(36).toUpperCase()}`,staff_discount:Number(form.staff_discount)||0,customer_discount:Number(form.customer_discount)||0,updated_at:new Date().toISOString()};
    const q=editId?supabase.from('referral_campaigns').update(row).eq('id',editId):supabase.from('referral_campaigns').insert({...row,created_by:profile?.id});
    const {error}=await q; setBusy(false);
    if(error) return void toast.error(/unique|duplicate/i.test(error.message)?'Bu referans kodu zaten kullanılıyor. Yeni kod üretin.':error.message);
    toast.success(editId?'Kampanya güncellendi':'Kampanya oluşturuldu'); setForm(null); load();
  };
  const edit=(r:Campaign)=>{setEditId(r.id);setForm({...r});};
  const create=()=>{setEditId(null);setForm(empty());};
  const toggle=async(r:Campaign)=>{const {error}=await supabase.from('referral_campaigns').update({is_active:!r.is_active,updated_at:new Date().toISOString()}).eq('id',r.id);if(error)toast.error(error.message);else load();};
  const remove=async(r:Campaign)=>{if(!confirm('Bu kampanyayı silmek istediğinize emin misiniz? Kullanılmış referans bağlantıları silinemez.'))return;const {error}=await supabase.from('referral_campaigns').delete().eq('id',r.id);if(error)toast.error(error.message);else{toast.success('Kampanya silindi');load();}};
  const copy=(v:string)=>{navigator.clipboard.writeText(v).then(()=>toast.success('Kod kopyalandı')).catch(()=>toast.error('Kopyalanamadı'));};
  return <section className="card" style={{marginTop:'1rem'}}>
    <div className="bar"><div><h2>🤝 İşletme Referans Kampanyaları</h2><p className="muted small">İşletme personeli ve müşterileri için ayrı, benzersiz referans kodları oluşturun.</p></div>{canWrite&&<button className="btn gold sm" onClick={create}>+ Yeni Kampanya Oluştur</button>}</div>
    {error&&<div className="note">Kampanya tablosu bulunamadı. <code>sql/36_referral_campaigns.sql</code> dosyasını Supabase SQL Editor'de çalıştırın. ({error})</div>}
    {rows.map(r=><article key={r.id} className="cp-card" style={{margin:'1rem 0'}}>
      <div className="cp-top"><b>{r.campaign_name||r.business_name||'İsimsiz Kampanya'}</b><span className={`cp-st ${r.is_active?'ok':'mute'}`}>{r.is_active?'Aktif':'Pasif'}</span></div>
      <p>{r.business_name||'İşletme adı belirtilmedi'}</p>
      <div className="two-col">
        {r.staff_enabled&&<div><b>İşletme personeli · %{r.staff_discount}</b><p className="small muted">İndirim: {r.staff_scope==='product'?'Ürün bazında':'Sepet toplamında'}</p><code>{r.staff_code}</code> <button className="btn ghost sm" onClick={()=>copy(r.staff_code)}>Kopyala</button></div>}
        {r.customers_enabled&&<div><b>İşletme müşterileri · %{r.customer_discount}</b><p className="small muted">İndirim: {r.customer_scope==='product'?'Ürün bazında':'Sepet toplamında'}</p><code>{r.customer_code}</code> <button className="btn ghost sm" onClick={()=>copy(r.customer_code)}>Kopyala</button></div>}
      </div>
      {canWrite&&<div className="cp-actions"><button className="btn ghost sm" onClick={()=>edit(r)}>✏️ Düzenle</button><button className="btn ghost sm" onClick={()=>toggle(r)}>{r.is_active?'Pasife al':'Aktifleştir'}</button><button className="btn ghost sm danger-txt" onClick={()=>remove(r)}>Sil</button></div>}
    </article>)}
    {!rows.length&&!error&&<p className="muted center">Henüz referans kampanyası oluşturulmamış.</p>}
    {form&&<div className="modal-backdrop" style={{position:"fixed",inset:0,zIndex:10000,background:"rgba(0,0,0,.62)",display:"grid",placeItems:"center",padding:"1rem"}} onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setForm(null)}}><form className="modal card" style={{background:"var(--surface, #fff)",color:"var(--text, #222)",width:"100%",maxWidth:760,maxHeight:'90vh',overflowY:'auto'}} onSubmit={save}>
      <div className="bar"><h2>{editId?'Kampanyayı Düzenle':'Yeni Kampanya Oluştur'}</h2><button type="button" className="btn ghost sm" onClick={()=>setForm(null)}>✕</button></div>
      <div className="two-col">
        <label className="fld">Kampanya adı (isteğe bağlı)<input value={form.campaign_name} onChange={e=>setForm({...form,campaign_name:e.target.value})} placeholder="Örn. Reborn Fitness x Yazır Pilavcısı"/></label>
        <label className="fld">Kampanya yapılacak işletme adı (isteğe bağlı)<input value={form.business_name} onChange={e=>setForm({...form,business_name:e.target.value})} placeholder="Örn. Reborn Fitness"/></label>
      </div>
      <h3>Kampanya yapılacak kitle</h3>
      <label className="radio"><input type="checkbox" checked={form.staff_enabled} onChange={e=>setForm({...form,staff_enabled:e.target.checked})}/> İşletme Personeli</label>
      <label className="radio"><input type="checkbox" checked={form.customers_enabled} onChange={e=>setForm({...form,customers_enabled:e.target.checked})}/> İşletme Müşterileri / Üyeleri</label>
      <div className="two-col">
        {form.staff_enabled&&<section className="pe-sec"><h4>Personel indirimi</h4><label className="fld">İndirim (%)<input type="number" min="1" max="100" value={form.staff_discount} onChange={e=>setForm({...form,staff_discount:e.target.value})}/></label><label className="fld">İndirim türü<select value={form.staff_scope} onChange={e=>setForm({...form,staff_scope:e.target.value})}><option value="cart">Toplam sepet tutarı</option><option value="product">Her ürünün fiyatı</option></select></label><label className="fld">Referans kodu<div className="code-row"><input value={form.staff_code} disabled={!!editId} onChange={e=>setForm({...form,staff_code:e.target.value.toUpperCase()})}/>{!editId&&<button type="button" className="btn ghost sm" onClick={()=>setForm({...form,staff_code:token(form.business_name)})}>Yeni kod</button>}</div></label></section>}
        {form.customers_enabled&&<section className="pe-sec"><h4>Üye / müşteri indirimi</h4><label className="fld">İndirim (%)<input type="number" min="1" max="100" value={form.customer_discount} onChange={e=>setForm({...form,customer_discount:e.target.value})}/></label><label className="fld">İndirim türü<select value={form.customer_scope} onChange={e=>setForm({...form,customer_scope:e.target.value})}><option value="cart">Toplam sepet tutarı</option><option value="product">Her ürünün fiyatı</option></select></label><label className="fld">Referans kodu<div className="code-row"><input value={form.customer_code} disabled={!!editId} onChange={e=>setForm({...form,customer_code:e.target.value.toUpperCase()})}/>{!editId&&<button type="button" className="btn ghost sm" onClick={()=>setForm({...form,customer_code:token(form.business_name)})}>Yeni kod</button>}</div></label></section>}
      </div>
      <label className="radio"><input type="checkbox" checked={form.is_active} onChange={e=>setForm({...form,is_active:e.target.checked})}/> Kampanya aktif</label>
      <p className="muted small">Kodlar kaydedildikten sonra değişmedikçe sabit kalır. Pasife alınan kampanyaların kodları yeni kullanıma kapanır.</p>
      <div className="prow"><button className="btn gold" disabled={busy}>{busy?'Kaydediliyor…':'Kaydet'}</button><button type="button" className="btn ghost" onClick={()=>setForm(null)}>Vazgeç</button></div>
    </form></div>}
  </section>;
}
