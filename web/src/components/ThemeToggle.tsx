import { useCallback, useState } from 'react'
import { applyTheme, getStoredTheme, type ThemeMode } from '../lib/theme'
import { IconMoon, IconSun } from './NavIcons'

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() => getStoredTheme())

  const toggle = useCallback(() => {
    const next: ThemeMode = mode === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setMode(next)
  }, [mode])

  const isLight = mode === 'light'

  return (
    <button
      type="button"
      className="btn btn--icon btn--ghost"
      onClick={toggle}
      aria-pressed={isLight}
      aria-label={isLight ? 'تفعيل الوضع الداكن' : 'تفعيل الوضع الفاتح'}
      title={isLight ? 'وضع داكن' : 'وضع فاتح'}
    >
      {isLight ? <IconMoon /> : <IconSun />}
    </button>
  )
}
