import { RANGE_OPTIONS, type RangeKey } from '@/lib/analytics';

interface Props {
  value: RangeKey;
  onChange: (k: RangeKey) => void;
  from: string;
  to: string;
  onCustom: (from: string, to: string) => void;
}

/** Tarih aralığı seçici (hazır aralıklar + özel tarih) */
export default function RangePicker({ value, onChange, from, to, onCustom }: Props) {
  return (
    <div className="rp">
      <div className="rp-pills" role="tablist" aria-label="Tarih aralığı">
        {RANGE_OPTIONS.map((r) => (
          <button key={r.key} type="button" className={value === r.key ? 'on' : ''} onClick={() => onChange(r.key)}>
            {r.label}
          </button>
        ))}
      </div>
      {value === 'custom' && (
        <div className="rp-custom">
          <input type="date" value={from} onChange={(e) => onCustom(e.target.value, to)} aria-label="Başlangıç" />
          <span>–</span>
          <input type="date" value={to} onChange={(e) => onCustom(from, e.target.value)} aria-label="Bitiş" />
        </div>
      )}
    </div>
  );
}
