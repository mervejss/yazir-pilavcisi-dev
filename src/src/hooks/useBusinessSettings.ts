import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { BusinessSettings, OpeningHour } from '@/types/database';

export function useBusinessSettings() {
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [hours, setHours] = useState<OpeningHour[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const settRes = await supabase.from('business_settings').select('*').eq('id', 1).single();
      const hourRes = await supabase.from('opening_hours').select('*').order('day_of_week');
      if (settRes.data) setSettings(settRes.data as unknown as BusinessSettings);
      if (hourRes.data) setHours(hourRes.data as unknown as OpeningHour[]);
      setLoading(false);
    };
    fetch();
  }, []);

  return { settings, hours, loading };
}