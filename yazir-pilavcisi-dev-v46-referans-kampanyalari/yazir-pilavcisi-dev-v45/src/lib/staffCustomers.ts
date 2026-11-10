import { supabase } from '@/lib/supabase';

export interface FoundCustomer {
  id: string;
  full_name: string;
  phone: string | null;
  notes: string | null;
  has_account: boolean;
  order_count: number;
  last_order_at: string | null;
  last_address: { title?: string; address?: string | null; district?: string | null; lat?: number | null; lng?: number | null } | null;
}

export interface HistoryItem {
  variant_id: string | null;
  product_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price: number;
  current_price: number | null;
  is_available: boolean;
}

export interface HistoryOrder {
  id: string;
  order_no: number;
  created_at: string;
  status: string;
  order_type: 'delivery' | 'pickup' | 'dine_in';
  source: string;
  total: number;
  payment_method: string | null;
  address: string | null;
  district: string | null;
  lat: number | null;
  lng: number | null;
  note: string | null;
  items: HistoryItem[];
}

export interface HistoryAddress {
  id: string;
  title: string;
  address: string;
  district: string | null;
  lat: number | null;
  lng: number | null;
  is_default: boolean;
}

export interface CustomerHistory {
  customer: { id: string; full_name: string; phone: string | null; notes: string | null; has_account: boolean } | null;
  addresses: HistoryAddress[];
  orders: HistoryOrder[];
}

/** SQL 25 çalıştırılmamışsa true */
export const isMissingFn = (e: any) =>
  !!e && (e.code === 'PGRST202' || e.code === '42883' || /could not find the function|does not exist/i.test(e.message || ''));

export async function searchCustomers(q: string): Promise<{ missing: boolean; list: FoundCustomer[] }> {
  const { data, error } = await supabase.rpc('staff_find_customers', { p_q: q, p_limit: 8 } as any);
  if (error) return { missing: isMissingFn(error), list: [] };
  return { missing: false, list: ((data || []) as unknown as FoundCustomer[]).map((c) => ({ ...c, order_count: Number(c.order_count) })) };
}

export async function loadCustomerHistory(id: string): Promise<CustomerHistory | null> {
  const { data, error } = await supabase.rpc('staff_customer_history', { p_customer: id, p_limit: 12 } as any);
  if (error || !data) return null;
  return data as unknown as CustomerHistory;
}

/** Telefonu tek biçime getirir: 05XXXXXXXXX. Geçersizse null. */
export function normalizePhone(raw: string): string | null {
  let d = (raw || '').replace(/\D/g, '');
  if (d.startsWith('90') && d.length === 12) d = d.slice(2);
  if (d.length === 10 && d.startsWith('5')) d = '0' + d;
  return d.length === 11 && d.startsWith('0') ? d : null;
}

export const phoneKey = (raw: string) => (raw || '').replace(/\D/g, '').slice(-10);

export const fmtPhone = (p?: string | null) => {
  const n = p ? normalizePhone(p) : null;
  return n ? `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7, 9)} ${n.slice(9)}` : p || '';
};
