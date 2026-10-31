import { useApp } from '../store.jsx'

export default function ThemeToggle() {
  const { theme, toggleTheme, t } = useApp()
  const dark = theme === 'dark'
  return (
    <button className="theme-toggle" onClick={toggleTheme} title={dark ? t('lightMode') : t('darkMode')} aria-label={dark ? t('lightMode') : t('darkMode')}>
      {dark ? '☀️' : '🌙'}
    </button>
  )
}
