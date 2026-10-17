import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../Icon.jsx'
import { useSearch } from '../../api/hooks.js'

const PAGES = [['Overview', '/'], ['Agent graph', '/graph'], ['Findings', '/findings'], ['Fixes', '/fixes'], ['Repositories', '/repositories'], ['Coding agents', '/agents'], ['Policies', '/policies'], ['Audit log', '/audit'], ['Integrations', '/integrations'], ['Settings', '/settings']].map(([label, to]) => ({ kind: 'Page', label, to }))

export default function CommandPalette({ onClose }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const { data, isFetching } = useSearch(query)
  const pages = PAGES.filter((it) => it.label.toLowerCase().includes(query.toLowerCase()))
  const hits = query.trim() ? [...(data?.results ?? []), ...pages].slice(0, 12) : PAGES
  const active = Math.min(index, Math.max(0, hits.length - 1))

  const open = (item) => { onClose(); navigate(item.to) }

  function onKeyDown(e) {
    if (e.key === 'Escape') onClose()
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(Math.min(active + 1, hits.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(Math.max(active - 1, 0)) }
    if (e.key === 'Enter' && hits[active]) open(hits[active])
  }

  return (
    <div className="ov" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pal" role="dialog" aria-modal="true" aria-label="Search">
        <div className="pal-in">
          <Icon name="search" size={18} />
          <label htmlFor="palette-q" className="sr-only">Search</label>
          <input id="palette-q" className="pal-input" autoFocus autoComplete="off" placeholder="Search findings, repos, agents…"
            value={query} onChange={(e) => { setQuery(e.target.value); setIndex(0) }} onKeyDown={onKeyDown} />
          <span className="kbd">esc</span>
        </div>
        <ul className="pal-list">
          {hits.length === 0 && <li className="pal-empty">{isFetching ? 'Searching…' : 'No matches. Try code-assistant or AP-0142.'}</li>}
          {hits.map((it, i) => (
            <li key={it.kind + it.label}>
              <button type="button" className={`pal-it${i === active ? ' on' : ''}`} onClick={() => open(it)} onMouseEnter={() => setIndex(i)}>
                {it.label}<small>{it.kind}</small>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
