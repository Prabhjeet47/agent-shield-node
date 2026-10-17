import { NavLink } from 'react-router-dom'
import Icon from '../Icon.jsx'
import { useOverview } from '../../api/hooks.js'

const SECTIONS = [
  { items: [
    { to: '/', icon: 'grid', label: 'Overview', end: true },
    { to: '/graph', icon: 'graph', label: 'Agent graph', count: 'paths' },
    { to: '/findings', icon: 'alert', label: 'Findings', count: 'findings' },
    { to: '/fixes', icon: 'wrench', label: 'Fixes', count: 'fixes', neutral: true },
  ] },
  { title: 'Inventory', items: [
    { to: '/repositories', icon: 'repo', label: 'Repositories' },
    { to: '/agents', icon: 'bot', label: 'Coding agents' },
  ] },
  { title: 'Govern', items: [
    { to: '/policies', icon: 'shield', label: 'Policies' },
    { to: '/audit', icon: 'list', label: 'Audit log' },
    { to: '/integrations', icon: 'plug', label: 'Integrations' },
    { to: '/settings', icon: 'gear', label: 'Settings' },
  ] },
]

export default function Sidebar() {
  const { data } = useOverview()
  // Same definitions as the Overview KPIs and the Fixes page 'Needs you' tab.
  const counts = data && { paths: data.kpis.paths.open, findings: data.kpis.openFindings, fixes: data.kpis.fixes.needsYou }
  const project = data?.project
  return (
    <aside className="sb" aria-label="Main navigation">
      <div className="brand">
        <span className="logo"><Icon name="shield" /></span>
        <span className="lbl">AgentShield</span>
      </div>
      {SECTIONS.map((section, i) => (
        <div key={i} style={{ display: 'contents' }}>
          {section.title && <div className="navsec lbl">{section.title}</div>}
          {section.items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="nav tip" data-tip={item.label}>
              <Icon name={item.icon} size={18} />
              <span className="lbl">{item.label}</span>
              {item.count && counts?.[item.count] > 0 && <span className={`cnt${item.neutral ? ' neu' : ''}`}>{counts[item.count]}</span>}
            </NavLink>
          ))}
        </div>
      ))}
      <div className="sb-foot">
        <div className="org">
          <span className="orgav">{project?.org?.[0] ?? '·'}</span>
          <span className="lbl"><b>{project?.org ?? 'Loading…'}</b>{project?.name}</span>
        </div>
      </div>
    </aside>
  )
}
