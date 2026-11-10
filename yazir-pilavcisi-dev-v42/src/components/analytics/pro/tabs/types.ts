import type { Analysis, AOrder, AnalyticsSettings, DateRange, Gran } from '@/lib/analyticsData';
import type { TableUsageRow } from '@/hooks/useAnalyticsData';

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
}
