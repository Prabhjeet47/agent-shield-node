import { useEffect, useState } from 'react'
import Icon from '../Icon.jsx'
import { applyTheme, onThemeChange } from '../../lib/theme.js'

const currentTheme = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')

export default function TopBar({ onSearch }) {
  const [theme, setTheme] = useState(currentTheme)
  useEffect(() => onThemeChange(() => setTheme(currentTheme())), [])

  const toggleTheme = () => applyTheme(theme === 'light' ? 'dark' : 'light')

  return (
    <header className="top">
      <button className="search" type="button" onClick={onSearch}>
        <Icon name="search" />
        <span>Search findings, repos, agents…</span>
        <span className="kbd">⌘K</span>
      </button>
      <div className="spacer" />
      <div className="sync" title="GitHub App connected">
        <i className="dot" />
        <span className="lbl">GitHub synced 4 min ago</span>
      </div>
      <button className="iconbtn tip" type="button" onClick={toggleTheme}
        data-tip={theme === 'light' ? 'Dark theme' : 'Light theme'} aria-label="Switch theme">
        <Icon name="sun" size={18} />
      </button>
      <button className="iconbtn tip" type="button" data-tip="1 fix needs your approval" aria-label="Notifications">
        <Icon name="bell" size={18} />
        <i className="ndot" />
      </button>
      <span className="avatar" title="Signed in as MK">MK</span>
    </header>
  )
}
