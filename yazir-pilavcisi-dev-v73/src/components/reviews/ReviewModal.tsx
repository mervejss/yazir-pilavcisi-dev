import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import Stars, { StarRatingInput } from '@/components/ui/Stars';
import { tl } from '@/lib/helpers';
import type { ReviewableOrder } from '@/hooks/useMyReviews';

interface Props {
  order: ReviewableOrder | null;
  onClose: () => void;
  onSaved: () => void;
}

const MAX = 1000;

/** Teslim edilen siparişi lezzet / teslimat(kurye) / servis olarak puanlama + yorum yazma, düzenleme, silme */
export default function ReviewModal({ order, onClose, onSaved }: Props) {
  const [taste, setTaste] = useState(0);
  const [delivery, setDelivery] = useState(0);
  const [service, setService] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [thanks, setThanks] = useState(false);

  const isDelivery = order?.order_type === 'delivery';
  const editing = !!order?.review_id;

  useEffect(() => {
    if (!order) return;
    setTaste(order.taste_rating || 0);
    setDelivery(order.delivery_rating || 0);
    setService(order.service_rating || 0);
    setComment(order.comment || '');
    setThanks(false);
  }, [order]);

  const parts = [taste, service, ...(isDelivery ? [delivery] : [])].filter((x) => x > 0);
  const overall = parts.length ? parts.reduce((a, b) => a + b, 0) / (isDelivery ? 3 : 2) : 0;
  const complete = taste > 0 && service > 0 && (!isDelivery || delivery > 0);

  const submit = async () => {
    if (!order || !complete) return;
    setBusy(true);
    const { error } = await supabase.rpc('submit_order_review', {
      p_order_id: order.order_id,
      p_taste: taste,
      p_delivery: isDelivery ? delivery : null,
      p_service: service,
      p_comment: comment.trim(),
    });
    setBusy(false);
    if (error) return void toast.error(error.message);
    setThanks(true);
    onSaved();
    setTimeout(onClose, 1700);
  };

  const remove = async () => {
    if (!order) return;
    setBusy(true);
    const { error } = await supabase.rpc('delete_order_review', { p_order_id: order.order_id });
    setBusy(false);
    setAskDelete(false);
    if (error) return void toast.error(error.message);
    toast.success('Yorumunuz silindi');
    onSaved();
    onClose();
  };

  return (
    <>
      <Modal open={!!order} onClose={() => !busy && onClose()}>
        {order && !thanks && (
          <div className="rvm">
            <div className="rvm-head">
              <div className="rvm-badge">⭐</div>
              <div>
                <h2>{editing ? 'Yorumunu Düzenle' : 'Siparişini Değerlendir'}</h2>
                <p className="muted small">
                  Sipariş #{order.order_no} · {tl(order.total)}
                  {order.items ? ` · ${order.items.length > 70 ? order.items.slice(0, 70) + '…' : order.items}` : ''}
                </p>
              </div>
            </div>

            <StarRatingInput icon="😋" label="Lezzet" hint="Yemeğin tadı, sıcaklığı, porsiyonu" value={taste} onChange={setTaste} />
            {isDelivery && <StarRatingInput icon="🛵" label="Teslimat (Kurye)" hint="Hız, kurye tavrı, paketin durumu" value={delivery} onChange={setDelivery} />}
            <StarRatingInput icon="🤝" label="Servis" hint="Sipariş alma, iletişim, genel ilgi" value={service} onChange={setService} />
            <p className="muted small" style={{ margin: '0.2rem 0 0' }}>İpucu: yıldızın sol yarısına tıklarsanız yarım puan verirsiniz.</p>

            <div className="rvm-overall">
              <span>Genel puanınız</span>
              <Stars rating={overall} size={22} />
              <b>{overall ? overall.toFixed(1) : '–'}</b>
            </div>

            <label className="fld">
              Yorumunuz <span className="muted small">(isteğe bağlı)</span>
              <textarea rows={4} maxLength={MAX} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Deneyiminizi anlatın: pilav nasıldı, teslimat nasıl geçti?" />
              <small className="rvm-count">{comment.length}/{MAX}</small>
            </label>

            <div className="rvm-foot">
              {editing ? (
                <button type="button" className="btn ghost sm danger-txt" onClick={() => setAskDelete(true)} disabled={busy}>🗑️ Yorumumu sil</button>
              ) : <span />}
              <div className="rvm-foot-r">
                <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>Vazgeç</button>
                <button type="button" className="btn gold" onClick={submit} disabled={busy || !complete}>
                  {busy ? 'Gönderiliyor…' : editing ? 'Güncelle' : 'Yorumu Gönder'}
                </button>
              </div>
            </div>
            {!complete && <p className="muted small center" style={{ margin: 0 }}>Göndermek için tüm puanları seçin.</p>}
          </div>
        )}

        {order && thanks && (
          <div className="rvm-thanks">
            <div className="rvm-burst">
              {Array.from({ length: 14 }).map((_, i) => (
                <i key={i} style={{ ['--a' as any]: `${(360 / 14) * i}deg`, ['--d' as any]: `${i * 40}ms` }} />
              ))}
              <span>⭐</span>
            </div>
            <h2>Teşekkür ederiz!</h2>
            <p className="muted">Değerlendirmeniz bizim için çok değerli.</p>
          </div>
        )}
      </Modal>

      <ConfirmationModal
        open={askDelete}
        onClose={() => setAskDelete(false)}
        onConfirm={remove}
        title="Yorumu sil"
        message="Bu siparişe yazdığınız yorum ve puanlar silinecek. İsterseniz sonra yeniden değerlendirebilirsiniz."
        confirmLabel="Evet, sil"
        loading={busy}
      />
    </>
  );
}
