import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { addDaysISO, businessDateISO, getOpenStatus } from '@/lib/helpers';
import type { BusinessSettings, OpeningHour, OpeningHourOverride } from '@/types/database';

/**
 * İşletme ayarları + haftalık çalışma saatleri + güne özel saat değişiklikleri.
 * - Her 60 sn'de bir veriyi yeniler (admin değişikliği ziyaretçide kısa sürede görünür).
 * - `status`: sitede gösterilecek açık/kapalı durumu (her 30 sn yeniden hesaplanır).
 */
let overridesMissingUntil = 0;

export function useBusinessSettings() {
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [hours, setHours] = useState<OpeningHour[]>([]);
  const [overrides, setOverrides] = useState<OpeningHourOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(async () => {
    const settRes = await supabase.from('business_settings').select('*').eq('id', 1).single();
    const hourRes = await supabase.from('opening_hours').select('*').order('day_of_week');
    // Dünden itibaren olan özel günler (dünden sarkan pencere için dün de gerekli)
    const fromDate = addDaysISO(businessDateISO(), -2);
    // Tablo yoksa (09_hours_overrides.sql / 35_finance_daily_cargo.sql çalıştırılmadı) her ziyaretçide 404 üretmemek için 30 dk boyunca tekrar sorma
    const skipOv = overridesMissingUntil > Date.now();
    const ovRes: { data: any[] | null; error: any } = skipOv
      ? { data: [], error: null }
      : await supabase
        .from('opening_hours_overrides')
        .select('*')
        .gte('override_date', fromDate)
        .order('override_date');
    if (!skipOv && ovRes.error) overridesMissingUntil = Date.now() + 30 * 60_000;
    if (settRes.data) setSettings(settRes.data as unknown as BusinessSettings);
    if (hourRes.data) setHours(hourRes.data as unknown as OpeningHour[]);
    // Tablo henüz oluşturulmadıysa (09_hours_overrides.sql çalıştırılmadı) sessizce boş kabul et
    setOverrides(ovRes.error ? [] : ((ovRes.data || []) as unknown as OpeningHourOverride[]));
    setLoading(false);
  }, []);

  useEffect(() => {
    refetch();
    // Ayarlar nadiren değişir: 5 dakikada bir (eskiden 60 sn) ve yalnızca sekme görünürken; her ziyaretçide çalıştığı için egress'in büyük kalemiydi
    const refreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible') refetch();
    }, 5 * 60_000);
    const tickTimer = setInterval(() => setTick((t) => t + 1), 30_000);
    let lastFetch = Date.now();
    const onVisible = () => {
      // Sekme öne gelince, son yüklemeden 2 dk geçtiyse tazele (sık sekme değişiminde sorgu yağmuru olmasın)
      if (document.visibilityState === 'visible' && Date.now() - lastFetch > 120_000) {
        lastFetch = Date.now();
        refetch();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(refreshTimer);
      clearInterval(tickTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refetch]);

  // tick: saat ilerledikçe açık/kapalı durumunu yeniden hesapla
  const status = useMemo(
    () => getOpenStatus(hours, overrides, settings?.is_accepting_orders),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hours, overrides, settings?.is_accepting_orders, tick],
  );

  return { settings, hours, overrides, status, loading, refetch };
}
