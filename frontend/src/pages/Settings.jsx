import { useEffect, useState } from 'react'
import { api, p } from '../api/client.js'
import { useAction, useSettings } from '../api/hooks.js'
import { ErrorState, Loading } from '../components/ui/ListState.jsx'
import Icon from '../components/Icon.jsx'
import { useToast } from '../components/layout/Toast.jsx'
import { Avatar, PageHead } from '../components/ui/bits.jsx'
import { applyTheme, getThemeChoice } from '../lib/theme.js'

const SECTIONS = [['org', 'Organisation', 'shield'], ['team', 'Team and roles', 'bot'], ['keys', 'API keys', 'key'], ['notify', 'Notifications', 'bell'], ['look', 'Appearance', 'sun']]
const ROLES = { admin: 'Can change policies, integrations and members', analyst: 'Triages findings and proposes fixes', developer: 'Sees findings for their repos and reviews PRs', auditor: 'Read-only access to findings and the audit log' }

export default function Settings() {
  const [section, setSection] = useState('org')
  const { data, isLoading, error, refetch } = useSettings()
  return (
    <main className="content">
      <PageHead title="Settings" sub="Northwind Labs · payments-platform" />
      <div className="layout">
        <nav className="vtabs" aria-label="Settings sections">
          {SECTIONS.map(([id, label, icon]) => (
            <button key={id} type="button" className={`vtab${section === id ? ' on' : ''}`} aria-current={section === id} onClick={() => setSection(id)}>
              <Icon name={icon} />{label}
            </button>
          ))}
        </nav>
        <div className="panel">
          {section === 'look' ? <LookPanel />
            : isLoading ? <section className="card tcard"><Loading /></section>
            : error ? <section className="card"><ErrorState title="Couldn't load settings" onRetry={refetch}>{error.message}</ErrorState></section>
            : <>
              {section === 'org' && <OrgPanel key={JSON.stringify(data.org)} org={data.org} />}
              {section === 'team' && <TeamPanel members={data.members} />}
              {section === 'keys' && <KeysPanel keys={data.apiKeys} />}
              {section === 'notify' && <NotifyPanel key={JSON.stringify(data.notifications)} initial={data.notifications} />}
            </>}
        </div>
      </div>
    </main>
  )
}

function OrgPanel({ org }) {
  const toast = useToast()
  const [form, setForm] = useState(org)
  const saveOrg = useAction((body) => api(p('/settings/org'), { method: 'PATCH', body }), { success: ['Settings saved', 'Changes apply to everyone in this organisation.'] })
  const dirty = JSON.stringify(form) !== JSON.stringify(org)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  return (
    <>
      <section className="card">
        <h2 className="h2">Organisation</h2>
        <p className="small muted" style={{ margin: '4px 0 18px' }}>Applies to every project in this workspace.</p>
        <div className="form">
          <div className="field"><label htmlFor="org-name">Organisation name</label><input id="org-name" className="input" value={form.name} onChange={set('name')} /></div>
          <div className="field"><label htmlFor="org-domain">Primary domain</label><input id="org-domain" className="input" value={form.domain} onChange={set('domain')} /><span className="help">People with this email domain can request access.</span></div>
          <div className="field"><label htmlFor="org-region">Data region</label>
            <select id="org-region" className="select" value={form.region} onChange={set('region')}><option value="in">India (Mumbai)</option><option value="eu">EU (Frankfurt)</option><option value="us">US (Oregon)</option></select>
            <span className="help">Where findings, evidence and audit logs are stored.</span></div>
          <div className="field"><label htmlFor="org-ret">Audit log retention</label>
            <select id="org-ret" className="select" value={form.retention} onChange={set('retention')}><option value="400">400 days</option><option value="730">2 years</option><option value="2555">7 years</option></select></div>
        </div>
        <div className="sbar" style={{ marginTop: 20 }}>
          <span className="small muted">{dirty ? 'You have unsaved changes' : 'All changes saved'}</span>
          <div className="acts">
            <button type="button" className="btn" disabled={!dirty} onClick={() => setForm(org)}>Discard</button>
            <button type="button" className="btn primary" disabled={!dirty || saveOrg.isPending} onClick={() => saveOrg.mutate(form)}>Save changes</button>
          </div>
        </div>
      </section>
      <section className="card" style={{ borderColor: 'rgba(239,68,68,.35)' }}>
        <h2 className="h2">Delete organisation</h2>
        <p className="small muted" style={{ margin: '4px 0 14px' }}>Removes all projects, findings and policies. Audit records that must be kept by law are retained. This can't be undone.</p>
        <button type="button" className="btn danger" onClick={() => toast('Contact an owner', 'Only the organisation owner can delete it, after confirming by email.')}>Delete organisation</button>
      </section>
    </>
  )
}

function TeamPanel({ members }) {
  const [email, setEmail] = useState('')
  const invite = useAction((mail) => api(p('/members'), { method: 'POST', body: { email: mail } }), { success: ['Invite sent', 'The join link expires in 7 days.'] })
  const setRole = useAction(({ mail, role }) => api(p(`/members/${encodeURIComponent(mail)}`), { method: 'PATCH', body: { role } }), { success: (m) => ['Role updated', `${m.name} is now ${m.role}.`] })
  const cols = 'minmax(180px,1.3fr) minmax(200px,1.4fr) 150px 110px'
  return (
    <section className="card">
      <div className="ch"><div><h2 className="h2">Team and roles</h2><div className="small muted">{members.length} members · only admins can change policies and approve fixes</div></div></div>
      <form className="toolbar" style={{ marginBottom: 16 }} onSubmit={(e) => { e.preventDefault(); if (!/^\S+@\S+\.\S+$/.test(email)) return; invite.mutate(email, { onSuccess: () => setEmail('') }) }}>
        <label htmlFor="invite" className="sr-only">Email to invite</label>
        <input id="invite" className="input" style={{ width: 'min(320px,100%)' }} placeholder="name@northwind.dev" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="submit" className="btn primary" disabled={!/^\S+@\S+\.\S+$/.test(email)}>Invite member</button>
      </form>
      <div className="scrollx"><div style={{ minWidth: 680 }}>
        <div className="grow head" style={{ gridTemplateColumns: cols }}><span>Member</span><span>Email</span><span>Role</span><span>Last active</span></div>
        {members.map(({ name, email: mail, role, last }, i) => (
          <div key={mail} className="grow" style={{ gridTemplateColumns: cols }}>
            <span className="owner"><Avatar name={name} />{name}</span>
            <span className="mono small muted">{mail}</span>
            <select className="select" aria-label={`Role for ${name}`} value={role} disabled={i === 0} title={ROLES[role]}
              onChange={(e) => setRole.mutate({ mail, role: e.target.value })}>
              {Object.keys(ROLES).map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
            </select>
            <span className="small muted">{last}</span>
          </div>
        ))}
      </div></div>
      <div className="vnote" style={{ marginTop: 16 }}>{Object.entries(ROLES).map(([r, d]) => <div key={r}><b style={{ color: 'var(--text)' }}>{r[0].toUpperCase() + r.slice(1)}</b> · {d}</div>)}</div>
    </section>
  )
}

function KeysPanel({ keys }) {
  const toast = useToast()
  const [fresh, setFresh] = useState(null)
  const [name, setName] = useState('')
  const createKey = useAction((n) => api(p('/api-keys'), { method: 'POST', body: { name: n } }))
  const revoke = useAction((k) => api(p(`/api-keys/${k.id}`), { method: 'DELETE' }), { success: (_, k) => ['Key revoked', `${k.name} stops working immediately.`] })
  const cols = 'minmax(150px,1fr) 190px 140px 90px 100px 80px'
  // The API creates the secret and returns it once; only a masked form is stored.
  const create = () => createKey.mutate(name, { onSuccess: (res) => { setFresh(res.secret); setName('') } })
  return (
    <section className="card">
      <div className="ch"><div><h2 className="h2">API keys</h2><div className="small muted">Used by CI to upload scan results and run policy checks. Stored hashed.</div></div></div>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <label htmlFor="key-name" className="sr-only">Key name</label>
        <input id="key-name" className="input" style={{ width: 'min(260px,100%)' }} placeholder="Key name, e.g. github-actions" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="button" className="btn primary" onClick={create}>Create key</button>
      </div>
      {fresh && (
        <div className="newkey" style={{ marginBottom: 16 }}>
          <span className="mono" style={{ overflowWrap: 'anywhere', flex: 1 }}>{fresh}</span>
          <button type="button" className="btn sm" onClick={() => navigator.clipboard.writeText(fresh).then(() => toast('Copied to clipboard', 'Store it in your secrets manager.'), () => toast('Copy failed', 'Select the key and copy it manually.'))}>Copy</button>
          <span className="small muted" style={{ flexBasis: '100%' }}>Copy it now. For security it won't be shown again.</span>
        </div>
      )}
      <div className="scrollx"><div style={{ minWidth: 760 }}>
        <div className="grow head" style={{ gridTemplateColumns: cols }}><span>Name</span><span>Key</span><span>Scopes</span><span>Created</span><span>Last used</span><span /></div>
        {keys.map((key) => (
          <div key={key.id} className="grow" style={{ gridTemplateColumns: cols }}>
            <span>{key.name}</span><span className="mono small">{key.masked}</span><span className="tag" style={{ justifySelf: 'start' }}>{key.scopes}</span><span className="small muted">{key.created}</span><span className="small muted">{key.lastUsed}</span>
            <button type="button" className="btn sm ghost" onClick={() => revoke.mutate(key)}>Revoke</button>
          </div>
        ))}
      </div></div>
    </section>
  )
}

function NotifyPanel({ initial }) {
  const channels = ['In-app', 'Email', 'Slack']
  const [m, setM] = useState(initial)
  const saveN = useAction((body) => api(p('/settings/notifications'), { method: 'PUT', body }), { success: ['Notifications saved', ''] })
  return (
    <section className="card">
      <div className="ch"><div><h2 className="h2">Notifications</h2><div className="small muted">Where alerts go. Applies to findings you own or watch.</div></div></div>
      <div className="scrollx">
        <table className="nmx">
          <thead><tr><th>Event</th>{channels.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>{Object.entries(m).map(([row, vals]) => (
            <tr key={row}><td>{row}</td>{vals.map((v, i) => (
              <td key={i}><input type="checkbox" aria-label={`${row} via ${channels[i]}`} checked={!!v}
                onChange={() => setM((x) => ({ ...x, [row]: x[row].map((y, j) => (j === i ? 1 - y : y)) }))} /></td>
            ))}</tr>
          ))}</tbody>
        </table>
      </div>
      <div className="sbar" style={{ marginTop: 16 }}>
        <span className="small muted">Weekly summary every Monday at 09:00 IST</span>
        <button type="button" className="btn primary" disabled={saveN.isPending} onClick={() => saveN.mutate(m)}>Save</button>
      </div>
    </section>
  )
}

function LookPanel() {
  const [choice, setChoice] = useState(getThemeChoice)
  const [compact, setCompact] = useState(false)
  useEffect(() => { document.documentElement.classList.toggle('compact', compact) }, [compact])
  const pick = (c) => { setChoice(c); applyTheme(c) }
  const previews = { dark: ['#12141A', '#0A0B0F'], light: ['#FFFFFF', '#F6F7F9'], system: ['#12141A', '#F6F7F9'] }
  return (
    <section className="card">
      <h2 className="h2">Appearance</h2>
      <p className="small muted" style={{ margin: '4px 0 18px' }}>Saved on this device.</p>
      <p className="flabel">Theme</p>
      <div className="themes">
        {Object.entries(previews).map(([c, [a, b]]) => (
          <button key={c} type="button" className={`themecard${choice === c ? ' on' : ''}`} aria-pressed={choice === c} onClick={() => pick(c)}>
            <span className="prev"><span style={{ background: a }} /><span style={{ background: b }} /></span>
            <span>{c === 'system' ? 'Match system' : c[0].toUpperCase() + c.slice(1)}</span>
          </button>
        ))}
      </div>
      <p className="flabel" style={{ marginTop: 22 }}>Density</p>
      <div className="seg" role="group" aria-label="Density">
        <button type="button" className={!compact ? 'on' : ''} onClick={() => setCompact(false)}>Comfortable</button>
        <button type="button" className={compact ? 'on' : ''} onClick={() => setCompact(true)}>Compact</button>
      </div>
      <p className="help" style={{ marginTop: 8 }}>Compact tightens table rows. Motion follows your system's reduce-motion setting.</p>
    </section>
  )
}
