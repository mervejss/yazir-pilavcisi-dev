import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { CourierDetail, CourierOverviewRow, CustomerDetail, CustomerOverview } from '@/types/analytics';

interface State<T> {
  data: T | null;
  loading: boolean;
  /** SQL dosyası henüz çalıştırılmamış */
  missing: boolean;
  error: string | null;
}

function isMissing(msg: string) {
  return /could not find the function|does not exist|schema cache|report_courier|report_customer/i.test(msg);
}

function useRpc<T>(name: string, params: Record<string, unknown> | null): State<T> & { reload: () => void } {
  const key = JSON.stringify(params);
  const [st, setSt] = useState<State<T>>({ data: null, loading: true, missing: false, error: null });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!params) {
      setSt({ data: null, loading: false, missing: false, error: null });
      return;
    }
    let alive = true;
    setSt((s) => ({ ...s, loading: true }));
    supabase.rpc(name as any, params as any).then(({ data, error }) => {
      if (!alive) return;
      if (error) setSt({ data: null, loading: false, missing: isMissing(error.message), error: error.message });
      else setSt({ data: data as T, loading: false, missing: false, error: null });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, key, tick]);

  return { ...st, reload };
}

export function useCourierOverview(from: string, to: string, sla: number) {
  return useRpc<CourierOverviewRow[]>('report_courier_overview', { p_from: from, p_to: to, p_sla_min: sla });
}

export function useCourierDetail(courierId: string | null, from: string, to: string, sla: number) {
  return useRpc<CourierDetail>('report_courier_detail', courierId ? { p_courier: courierId, p_from: from, p_to: to, p_sla_min: sla } : null);
}

export function useCustomerOverview(from: string, to: string) {
  return useRpc<CustomerOverview>('report_customer_overview', { p_from: from, p_to: to });
}

export function useCustomerDetail(customerId: string | null) {
  return useRpc<CustomerDetail>('report_customer_detail', customerId ? { p_customer: customerId } : null);
}
