import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import BillSplitter, { normalizeRefs, r2, type SplitLine, type SplitPayment } from '@/components/ui/BillSplitter';
import { supabase } from '@/lib/supabase';
import { runOrQueue } from '@/lib/offlineQueue';
import { tl } from '@/lib/helpers';

export type SplitMethod = 'cash_on_delivery' | 'card_on_delivery' | 'iban';
export const SPLIT_LABELS: Record<SplitMethod, string> = {
  cash_on_delivery: '💵 Nakit',
  card_on_delivery: '💳 Kart',
  iban: '🏦 IBAN',
};
const METHODS = (Object.keys(SPLIT_LABELS) as SplitMethod[]).map((value) => ({ value, label: SPLIT_LABELS[value] }));

interface DetailItem { id: string; name: string; variant: string | null; qty: number; unit_price: number; line_total: number; note: string | null }
interface Detail {
  id: string; order_no: number; status: string; payment_method: string | null;
  subtotal: number; delivery_fee: number; discount: number; total: number;
  items: DetailItem[]; splits: Array<{ seq: number; label: string | null; method: SplitMethod; amount: number; lines: unknown }>;
}

const defaultMethod = (pm: string | null | undefined): SplitMethod =>
  pm === 'card_on_delivery' || pm === 'card_at_table' ? 'card_on_delivery' : pm === 'iban' ? 'iban' : 'cash_on_delivery';

interface Props {
  orderId: string | null;
  customerName?: string | null;
  onClose: () => void;
}

/** Kurye: kalem kalem fiyatlar + kişi bazlı ayrı ödeme (ortak BillSplitter: kare seçim, kısmi adet, eşit böl, elle tutar) */
export default function OrderDetailSheet({ orderId, customerName, onClose }: Props) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [err, setErr] = useState('');
  const [payments, setPayments] = useState<SplitPayment[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    let off = false;
    setDetail(null);
    setErr('');
    setPayments([]);
    supabase.rpc('courier_order_detail', { p_order: orderId } as any).then(({ data, error }) => {
      if (off) return;
      if (error) {
        setErr(/courier_order_detail|function|does not exist/i.test(error.message) ? 'Bu özellik için yönetici sql/31_courier_split_payments.sql dosyasını çalıştırmalı.' : error.message);
        return;
      }
      const d = data as unknown as Detail;
      setDetail(d);
      setPayments((d.splits || []).map((x) => ({ label: x.label || '', method: x.method, amount: Number(x.amount), lines: normalizeRefs(x.lines) })));
    });
    return () => { off = true; };
  }, [orderId]);

  // Kalemler (çok adetli ürün tek satır; kısmi adet seçilebilir) + ücret / indirim / yuvarlama
  const lines = useMemo<SplitLine[]>(() => {
    if (!detail) return [];
    const out: SplitLine[] = detail.items.map((i) => ({ key: i.id, name: i.name, variant: i.variant, unit: Number(i.unit_price), qty: Math.max(1, Number(i.qty) || 1), note: i.note }));
    if (Number(detail.delivery_fee) > 0) out.push({ key: 'fee', name: 'Teslimat ücreti', unit: Number(detail.delivery_fee), qty: 1 });
    if (Number(detail.discount) > 0) out.push({ key: 'disc', name: 'İndirim', unit: -Number(detail.discount), qty: 1 });
    const diff = r2(Number(detail.total) - out.reduce((a, l) => a + l.unit * l.qty, 0));
    if (Math.abs(diff) >= 0.01) out.push({ key: 'adj', name: 'Diğer / yuvarlama', unit: diff, qty: 1 });
    return out;
  }, [detail]);

  const persist = useCallback(async (next: SplitPayment[]) => {
    if (!orderId) return;
    const prev = payments;
    setPayments(next);
    setSaving(true);
    const r = await runOrQueue('courier_save_splits', { p_order: orderId, p_splits: next }, { label: `#${detail?.order_no ?? ''} ayrı ödemeler`, orderId, dedupeKey: `splits:${orderId}` });
    setSaving(false);
    if (!r.ok) { toast.error(r.error); setPayments(prev); }
    else if (r.queued) toast('📵 Bağlantı yok — ödeme kaydedildi, bağlantı gelince gönderilecek', { duration: 5000 });
  }, [orderId, payments, detail?.order_no]);

  const total = Number(detail?.total || 0);

  return (
    <Modal open={!!orderId} onClose={onClose} size="wide" className="osd">
      <div className="pe-head">
        <div>
          <h2>🧾 Sipariş #{detail?.order_no ?? ''} detayı</h2>
          {customerName && <p className="muted small">{customerName}</p>}
        </div>
        <button type="button" className="icon-circle" onClick={onClose} aria-label="Kapat">✕</button>
      </div>

      {err && <div className="note">{err}</div>}
      {!detail && !err && <div className="cr-empty"><div className="gold-spinner" /></div>}

      {detail && (
        <>
          <div className="osd-sum" style={{ marginTop: 0 }}>
            <div><span>Ara toplam</span><b>{tl(Number(detail.subtotal))}</b></div>
            {Number(detail.delivery_fee) > 0 && <div><span>Teslimat</span><b>{tl(Number(detail.delivery_fee))}</b></div>}
            {Number(detail.discount) > 0 && <div><span>İndirim</span><b>-{tl(Number(detail.discount))}</b></div>}
          </div>
          <BillSplitter
            lines={lines}
            total={total}
            methods={METHODS}
            defaultMethod={defaultMethod(detail.payment_method)}
            payments={payments}
            onChange={persist}
            busy={saving}
            footerNote={`Kalan, siparişin ana ödeme yöntemiyle (${SPLIT_LABELS[defaultMethod(detail.payment_method)]}) hesaplanır.`}
          />
        </>
      )}
    </Modal>
  );
}
