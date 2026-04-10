export const OSTADI_THEME_KEY = 'ostadi-theme'

export type ThemeMode = 'light' | 'dark'

export function getStoredTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(OSTADI_THEME_KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* ignore */
  }
  return 'light'
}

export function applyTheme(mode: ThemeMode): void {
  if (mode === 'dark') {
    document.documentElement.dataset.theme = 'dark'
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
  try {
    localStorage.setItem(OSTADI_THEME_KEY, mode)
  } catch {
    /* ignore */
  }
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute('content', mode === 'light' ? '#ffffff' : '#0a0e14')
  }
}

export function initThemeFromStorage(): void {
  applyTheme(getStoredTheme())
}
