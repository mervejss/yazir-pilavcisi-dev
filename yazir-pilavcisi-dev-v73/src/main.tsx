import React from 'react';
import ReactDOM from 'react-dom/client';
import { MAINTENANCE_MODE } from './config/maintenance';
import './styles/global.css';

async function boot() {
  const root = ReactDOM.createRoot(document.getElementById('root')!);

  // BAKIM MODU: yalnızca bağımsız bakım ekranı yüklenir. Uygulama (router, Supabase, oturum,
  // menü, sipariş, admin, kurye…) HİÇ yüklenmez → ağ isteği, giriş ve işlem yok.
  if (MAINTENANCE_MODE) {
    const { default: MaintenanceApp } = await import('./maintenance/MaintenanceApp');
    root.render(
      <React.StrictMode>
        <MaintenanceApp />
      </React.StrictMode>,
    );
    return;
  }

  const [{ BrowserRouter }, { Toaster }, { default: App }] = await Promise.all([
    import('react-router-dom'),
    import('react-hot-toast'),
    import('./App'),
  ]);

  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
        <Toaster
          position="top-right"
          // Bildirimleri sabit üst navigasyonun altına al; admin alarm çubuğının
          // üzerinde katman oluşturmasın ve alarm butonlarının tıklanmasını engellemesin.
          containerStyle={{
            top: 'calc(76px + env(safe-area-inset-top))',
            right: '16px',
            zIndex: 240,
          }}
          toastOptions={{
            duration: 3000,
            style: {
              background: '#14120e',
              color: '#f5f5f2',
              border: '1px solid #d4af37',
              borderRadius: '12px',
            },
          }}
        />
      </BrowserRouter>
    </React.StrictMode>,
  );
}

boot();

// Hafif service worker (yalnızca üretimde): ana ekrana eklenebilirlik + çevrimdışı bilgi sayfası
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
