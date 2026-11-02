import { useEffect } from 'react';
import { useThemeStore } from '@/stores/themeStore';

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useThemeStore();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`theme-toggle-btn ${className}`}
      title={theme === 'dark' ? 'Açık Moda Geç' : 'Koyu Moda Geç'}
      aria-label="Tema Değiştir"
    >
      {theme === 'dark' ? '☀️ Açık Mod' : '🌙 Koyu Mod'}
    </button>
  );
}
