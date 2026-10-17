import { SEV } from '../../lib/constants.js'
import { STATUS } from '../../lib/status.js'

export function Status({ value }) {
  const s = STATUS[value]
  return <span className={`status ${s.cls}`}><i className="sdot" />{s.label}</span>
}

export function Severity({ value }) {
  return <span className={`badge ${SEV[value].cls}`}><i className="bd" />{SEV[value].label}</span>
}

const AV_COLORS = ['#5457E6', '#0E7490', '#B45309', '#7C3AED', '#BE185D', '#15803D']
export function Avatar({ name }) {
  if (!name) return <span className="av" style={{ background: 'var(--surface-2)', color: 'var(--text-3)' }}>–</span>
  const initials = name.split(/[\s.]+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  const color = AV_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_COLORS.length]
  return <span className="av" style={{ background: color }}>{initials}</span>
}

export function Owner({ name }) {
  return <span className="owner"><Avatar name={name} /><span className="ttl" style={{ fontWeight: 400 }}>{name ?? 'Unassigned'}</span></span>
}

export function Tabs({ tabs, value, onChange, label }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} className={`tab${value === t.id ? ' on' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}{t.count != null && <span className="n">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function PageHead({ title, sub, actions, crumbs }) {
  return (
    <div className="ph">
      <div>
        {crumbs}
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {actions && <div className="acts">{actions}</div>}
    </div>
  )
}
