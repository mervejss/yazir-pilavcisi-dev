import { SOURCE_COLORS, SOURCE_EMOJI, SOURCE_LABELS } from '@/lib/constants';

interface SourceChipProps {
  source: string;
  extRef?: string | null;
  /** true ise sipariş numarası eklenmez (kart sağ üstünde yalnızca kaynak adı) */
  compact?: boolean;
}

export default function SourceChip({ source, extRef, compact }: SourceChipProps) {
  const code = (source || '').toLowerCase();
  return (
    <span className="src" style={{ background: SOURCE_COLORS[code] || '#6b6556' }} title={extRef ? `Platform sipariş no: ${extRef}` : undefined}>
      <span aria-hidden="true">{SOURCE_EMOJI[code] || '•'}</span> {SOURCE_LABELS[code] || source}
      {!compact && extRef && ` · ${extRef}`}
    </span>
  );
}
