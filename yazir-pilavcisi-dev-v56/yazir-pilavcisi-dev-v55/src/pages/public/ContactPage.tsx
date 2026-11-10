import { useState } from 'react';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { supabase } from '@/lib/supabase';
import { FEEDBACK_TYPE_LABELS } from '@/lib/constants';
import { contactLinks, whatsappLink } from '@/lib/contact';
import Icon from '@/components/ui/Icon';
import toast from 'react-hot-toast';

export default function ContactPage() {
  const { settings } = useBusinessSettings();
  const links = contactLinks(settings);
  const [form, setForm] = useState({ name: '', contact: '', type: 'suggestion', message: '' });
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase.from('feedback').insert({
        name: form.name || 'Anonim',
        contact: form.contact || null,
        type: form.type as any,
        message: form.message,
      });
      if (error) throw error;
      setSent(true);
      toast.success('Mesajınız bize ulaştı');
    } catch (err: any) {
      toast.error(err.message || 'Gönderilemedi');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page two">
      <section>
        <h1>İletişim</h1>
        <p>{links.address}</p>
        <p><a href={`tel:${settings?.phone?.replace(/\s/g, '') || ''}`}>{settings?.phone}</a></p>
        {settings?.whatsapp && (
          <p><a href={whatsappLink(settings.whatsapp) || '#'} target="_blank" rel="noreferrer">WhatsApp Hattı</a></p>
        )}

        <div className="contact-social">
          <h3>Bizi sosyal medyada takip edin</h3>
          <p className="muted">Günün menüsü, kampanyalar ve mutfaktan kareler için bizi takip edin.</p>
          <a className="contact-insta" href={links.instagramUrl} target="_blank" rel="noreferrer">
            <Icon name="instagram" size={22} />
            <span><b>Instagram</b><small>{links.instagramHandle}</small></span>
          </a>
        </div>

        <div className="contact-map">
          <iframe
            title="Yazır Pilavcısı konumu — Google Harita"
            src={links.mapEmbedUrl}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>
        <div className="contact-map-actions">
          <a className="btn gold sm" href={links.mapDirUrl} target="_blank" rel="noreferrer"><Icon name="navigation" size={15} /> Yol tarifi al</a>
          <a className="btn ghost sm" href={links.mapOpenUrl} target="_blank" rel="noreferrer"><Icon name="external" size={15} /> Haritada aç</a>
        </div>
      </section>
      <section>
        <h2>Görüş, öneri, şikayet</h2>
        <p className="muted">Tüm alanlar isteğe bağlı. İsterseniz adınızı yazmadan gönderebilirsiniz.</p>
        {sent ? (
          <div className="note big">Mesajınız bize ulaştı, teşekkürler.</div>
        ) : (
          <form className="form" onSubmit={submit}>
            <label>Ad soyad<input value={form.name} onChange={set('name')} /></label>
            <label>Telefon veya e-posta<input value={form.contact} onChange={set('contact')} /></label>
            <label>
              Konu
              <select value={form.type} onChange={set('type')}>
                {Object.entries(FEEDBACK_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
            <label>Mesajınız<textarea required rows={4} value={form.message} onChange={set('message')} /></label>
            <button type="submit" className="btn gold" disabled={submitting}>
              {submitting ? 'Gönderiliyor...' : 'Gönder'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
