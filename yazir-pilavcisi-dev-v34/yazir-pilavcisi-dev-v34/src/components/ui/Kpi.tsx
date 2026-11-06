interface KpiProps {
  label: string;
  value: string | number;
  sub?: string;
}

export default function Kpi({ label, value, sub }: KpiProps) {
  return (
    <div className="kpi">
      <small>{label}</small>
      <b>{value}</b>
      {sub && <span>{sub}</span>}
    </div>
  );
}
