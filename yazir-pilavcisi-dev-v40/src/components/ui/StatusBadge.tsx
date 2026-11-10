import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@/lib/constants';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export default function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  return (
    <span
      className={`st ${status} ${className}`}
      style={{ background: ORDER_STATUS_COLORS[status] || '#e8e5dc' }}
    >
      {ORDER_STATUS_LABELS[status] || status}
    </span>
  );
}
