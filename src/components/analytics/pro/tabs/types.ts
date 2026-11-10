import type { Analysis, AOrder, AnalyticsSettings, DateRange, Gran } from '@/lib/analyticsData';
import type { TableUsageRow } from '@/hooks/useAnalyticsData';
import type { FinResult, FinSettings } from '@/lib/finance';

export interface TabProps {
  a: Analysis;
  cur: AOrder[];
  prev: AOrder[];
  range: DateRange;
  platform: string;
  compare: boolean;
  settings: AnalyticsSettings;
  onSettings: (s: AnalyticsSettings) => void;
  gran: Gran;
  onGran: (g: Gran) => void;
  courierNames: Record<string, string>;
  tableUsage: TableUsageRow[];
  /** Trendyol cari hesap (gerçek) rakamları; yoksa null → tahmini oranlar */
  fin: FinResult | null;
  finSettings: FinSettings;
}
