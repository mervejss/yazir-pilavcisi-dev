export default function LoadingSpinner({ text = 'Yükleniyor...' }: { text?: string }) {
  return (
    <div className="center" style={{ padding: '3rem' }}>
      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
      <p className="muted">{text}</p>
    </div>
  );
}
