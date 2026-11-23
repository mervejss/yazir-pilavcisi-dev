import { useMemo, useState } from 'react';
import { tl } from '@/lib/helpers';
import { printBill } from '@/lib/printBill';
import BillSplitter, { r2, splitRemaining, type SplitLine, type SplitPayment } from '@/components/ui/BillSplitter';

export type TableMethod = 'cash_at_table' | 'card_at_table' | 'iban';
export const TABLE_METHODS: { value: TableMethod; label: string }[] = [
  { value: 'cash_at_table', label: '💵 Nakit' },
  { value: 'card_at_table', label: '💳 Kart (POS)' },
  { value: 'iban', label: '🏦 IBAN' },
];

/** Hesap kapatma ödeme durumu. VARSAYILAN: toplu ödeme (split=false). */
export function useBillPay() {
  const [method, setMethod] = useState<TableMethod>('cash_at_table');
  const [split, setSplit] = useState(false);
  const [payments, setPayments] = useState<SplitPayment[]>([]);
  // "Kapatınca fişi yazdır" tercihi cihazda hatırlanır (varsayılan kapalı)
  const [printOnClose, setPrintOnCloseState] = useState<boolean>(() => { try { return localStorage.getItem('yz_print_bill') === '1'; } catch { return false; } });
  const setPrintOnClose = (v: boolean) => { setPrintOnCloseState(v); try { localStorage.setItem('yz_print_bill', v ? '1' : '0'); } catch { /* yoksay */ } };
  const reset = () => { setMethod('cash_at_table'); setSplit(false); setPayments([]); };
  return { method, setMethod, split, setSplit, payments, setPayments, printOnClose, setPrintOnClose, reset };
}
export type BillPay = ReturnType<typeof useBillPay>;

/** Masadaki (iptal edilmemiş) siparişlerden bölünebilir kalemler. Her ürün satırı ayrı; indirim/ücret/yuvarlama farkı tek "diğer" satırı. */
export function billLines(orders: any[]): { lines: SplitLine[]; total: number } {
  const lines: SplitLine[] = [];
  let itemsSum = 0;
  let total = 0;
  for (const o of orders) {
    total += Number(o.total || 0);
    const items: any[] = o.items || o.order_items || [];
    for (const i of items) {
      const qty = Math.max(1, Number(i.quantity) || 1);
      const unit = Number(i.unit_price) || 0;
      itemsSum += unit * qty;
      lines.push({ key: `${o.id}:${i.id}`, name: i.product_name, variant: i.variant_name, unit, qty, note: i.note });
    }
  }
  total = r2(total);
  const diff = r2(total - itemsSum);
  if (Math.abs(diff) >= 0.01) lines.push({ key: 'adj', name: 'Teslimat / indirim / yuvarlama', unit: diff, qty: 1 });
  return { lines, total };
}

/** Kapatmaya hazır mı? Toplu: her zaman. Bölünmüş: kalan 0 olmalı. */
export const billReady = (pay: BillPay, total: number) => !pay.split || (pay.payments.length > 0 && splitRemaining(pay.payments, total) <= 0.004);

export default function TableBillPanel({ orders, pay, busy = false, tableName = 'Masa' }: { orders: any[]; pay: BillPay; busy?: boolean; tableName?: string }) {
  const { lines, total } = useMemo(() => billLines(orders), [orders]);
  return (
    <div>
      <div className="bill-mode" role="tablist" aria-label="Ödeme türü">
        <button type="button" className={!pay.split ? 'on' : ''} disabled={busy} onClick={() => pay.setSplit(false)}>💰 Toplu öde</button>
        <button type="button" className={pay.split ? 'on' : ''} disabled={busy} onClick={() => pay.setSplit(true)}>👥 Böl / ayrı ayrı öde</button>
      </div>

      {!pay.split ? (
        <fieldset style={{ margin: '0.6rem 0' }}>
          <legend>Tahsilat Şekli</legend>
          {TABLE_METHODS.map((m) => (
            <label key={m.value} className="radio">
              <input type="radio" name="billPayMethod" checked={pay.method === m.value} onChange={() => pay.setMethod(m.value)} />
              {m.label}
            </label>
          ))}
        </fieldset>
      ) : (
        <BillSplitter
          lines={lines}
          total={total}
          methods={TABLE_METHODS}
          defaultMethod={pay.method}
          payments={pay.payments}
          onChange={pay.setPayments}
          busy={busy}
        />
      )}
      <div className="bill-print">
        <label className="radio" style={{ margin: 0 }}>
          <input type="checkbox" checked={pay.printOnClose} onChange={(e) => pay.setPrintOnClose(e.target.checked)} />
          Hesabı kapatınca fişi yazdır{pay.split ? ' (döküm + kişi başı fişler)' : ''}
        </label>
        <button type="button" className="btn ghost sm" disabled={busy || lines.length === 0}
          onClick={() => printBill({ tableName, lines, total, method: pay.split ? undefined : pay.method, payments: pay.split ? pay.payments : undefined, mode: pay.split && pay.payments.length > 0 ? 'both' : 'all' })}>
          🖨️ Şimdi yazdır
        </button>
      </div>
      {pay.split && <p className="small muted" style={{ marginTop: '0.4rem' }}>Hesap, tüm tutar ödemelere dağıtılınca kapatılabilir (toplam {tl(total)}).</p>}
    </div>
  );
}
