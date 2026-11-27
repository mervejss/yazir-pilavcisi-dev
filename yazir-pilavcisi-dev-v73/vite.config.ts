import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { MAINTENANCE_MODE } from './src/config/maintenance';

/**
 * Bakım modunda index.html içindeki yedek içeriği (menü/sipariş bağlantıları) bakım metniyle değiştirir;
 * böylece JavaScript yüklenmeden önce bile menü/sipariş bağlantıları görünmez.
 * Bakım kapalıyken HİÇBİR şeyi değiştirmez.
 */
function maintenanceHtml(): Plugin {
  const fallback =
    '<div id="root"><main style="min-height:100vh;display:grid;place-items:center;padding:1.5rem;text-align:center;' +
    'font-family:system-ui,sans-serif;color:#f5f5f2;background:#0b0a08"><div style="max-width:480px">' +
    '<img src="/logo.png" alt="Yazır Pilavcısı" style="height:72px;width:auto;margin-bottom:1.2rem">' +
    '<h1 style="font-size:1.7rem;margin:0 0 .6rem">Geçici Bakım Çalışması</h1>' +
    '<p style="line-height:1.6;margin:0">Şu anda sistemimiz geçici olarak bakımda. Hizmetlerimiz kısa süreliğine kullanıma kapalıdır. Anlayışınız için teşekkür ederiz.</p>' +
    '</div></main></div>';
  return {
    name: 'yazir-maintenance-html',
    transformIndexHtml(html) {
      if (!MAINTENANCE_MODE) return html;
      return html
        .replace(/<div id="root">[\s\S]*?<\/main>\s*<\/div>/, fallback)
        .replace(/<title>[\s\S]*?<\/title>/, '<title>Bakımdayız | Yazır Pilavcısı</title>')
        .replace(
          /(<meta name="description" content=")[^"]*(")/,
          '$1Sistemimiz geçici olarak bakımdadır. Anlayışınız için teşekkür ederiz.$2',
        );
    },
  };
}

export default defineConfig({
  plugins: [react(), maintenanceHtml()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2019',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
