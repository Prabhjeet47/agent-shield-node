// One place to read and change the colour theme, so the top bar and Settings stay in sync.
const KEY = 'agentshield-theme'
const EVENT = 'agentshield-theme'

export function getThemeChoice() {
  try { return localStorage.getItem(KEY) || 'dark' } catch { return 'dark' }
}

export function resolvedTheme(choice = getThemeChoice()) {
  if (choice === 'system') return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  return choice
}

export function applyTheme(choice) {
  document.documentElement.dataset.theme = resolvedTheme(choice)
  try { localStorage.setItem(KEY, choice) } catch { /* storage blocked */ }
  window.dispatchEvent(new Event(EVENT))
}

export function onThemeChange(fn) {
  window.addEventListener(EVENT, fn)
  return () => window.removeEventListener(EVENT, fn)
}
