import { useEffect } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import Icon from '@/components/ui/Icon';

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useThemeStore();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const dark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`theme-toggle-btn ${className}`}
      title={dark ? 'Açık moda geç' : 'Koyu moda geç'}
      aria-label="Temayı değiştir"
    >
      <Icon name={dark ? 'sun' : 'moon'} size={17} />
      <span className="tt-label">{dark ? 'Açık' : 'Koyu'}</span>
    </button>
  );
}
