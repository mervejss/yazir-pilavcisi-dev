import { SOURCE_COLORS } from '@/lib/constants';

interface SourceChipProps {
  source: string;
  extRef?: string | null;
}

export default function SourceChip({ source, extRef }: SourceChipProps) {
  const code = source.toLowerCase();
  return (
    <span className="src" style={{ background: SOURCE_COLORS[code] || '#6b6556' }}>
      {source}
      {extRef && ` · ${extRef}`}
    </span>
  );
}
