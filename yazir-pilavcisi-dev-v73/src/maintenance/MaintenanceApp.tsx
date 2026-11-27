import { useEffect } from 'react';
import { MAINTENANCE_COPY, isStaffPath } from '@/config/maintenance';
import './maintenance.css';

/**
 * Bakım ekranı. Bilerek BAĞIMSIZ: router, Supabase, oturum, sepet, menü… hiçbirini yüklemez,
 * ağ isteği yapmaz, tıklanabilir bağlantı/form içermez.
 */
export default function MaintenanceApp() {
  const staff = isStaffPath(window.location.pathname);
  const copy = staff ? MAINTENANCE_COPY.staff : MAINTENANCE_COPY.customer;

  useEffect(() => {
    document.title = staff ? 'Personel Sistemi Bakımda | Yazır Pilavcısı' : 'Bakımdayız | Yazır Pilavcısı';
  }, [staff]);

  return (
    <main className="mt-wrap" role="main">
      <section className="mt-card" role="status" aria-live="polite">
        <img className="mt-logo" src="/logo.png" alt="Yazır Pilavcısı" draggable={false} />

        <div className="mt-icon" aria-hidden="true">
          {staff ? (
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="10.5" width="16" height="10" rx="2.5" />
              <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a4 4 0 0 0-5 5L3.5 17.5a1.8 1.8 0 0 0 2.5 2.5l6.2-6.2a4 4 0 0 0 5-5l-2.4 2.4-2.1-.5-.5-2.1z" />
            </svg>
          )}
        </div>

        <h1 className="mt-title">{copy.title}</h1>
        <p className="mt-text">{copy.text}</p>
        {copy.note ? <p className="mt-note">{copy.note}</p> : null}

        <div className="mt-status">
          <span className="mt-dot" aria-hidden="true" />
          Bakım çalışması devam ediyor
        </div>
      </section>

      <p className="mt-foot">© Yazır Pilavcısı</p>
    </main>
  );
}
