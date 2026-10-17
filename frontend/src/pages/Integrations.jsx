import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { useToast } from '../components/layout/Toast.jsx'
import { PageHead } from '../components/ui/bits.jsx'
import { useIntegrations } from '../api/hooks.js'

const GROUPS = [
  { title: 'Source control', items: [
    { id: 'github', logo: 'GH', name: 'GitHub App', desc: 'Reads workflows, agent config and dependencies from the repositories you pick. Opens fix PRs only after approval.', status: 'connected', meta: '3 of 41 repositories · read + PRs', manage: '/repositories' },
  ] },
  { title: 'CI checks', items: [
    { id: 'actions', logo: 'GA', name: 'GitHub Actions check', desc: 'Runs policy checks on every pull request and reports pass, warn or fail with links to evidence.', status: 'connected', meta: 'Last run 12 min ago · payments-service#491' },
    { id: 'gitlab', logo: 'GL', name: 'GitLab CI', desc: 'Same checks for GitLab pipelines.', status: 'later', meta: 'After the MVP' },
  ] },
  { title: 'Scanner imports', items: [
    { id: 'semgrep', logo: 'SG', name: 'Semgrep', desc: 'Import SAST results as SARIF and link them to graph entities.', status: 'connected', meta: 'Last import 14 Oct · 37 results' },
    { id: 'trivy', logo: 'TV', name: 'Trivy', desc: 'Dependency and container advisories as SARIF.', status: 'connected', meta: 'Last import 2 h ago · 12 results' },
    { id: 'gitleaks', logo: 'GL', name: 'Gitleaks', desc: 'Secret scanning results. Values are never stored, only references.', status: 'connected', meta: 'Last import 2 h ago · 1 result' },
    { id: 'codeql', logo: 'CQ', name: 'CodeQL', desc: 'GitHub code scanning alerts as SARIF.', status: 'available', setup: 'sarif' },
  ] },
  { title: 'Alerts and tickets', items: [
    { id: 'slack', logo: 'SL', name: 'Slack', desc: 'Post critical findings and approval requests to a channel.', status: 'connected', meta: '#sec-alerts' },
    { id: 'jira', logo: 'JR', name: 'Jira', desc: 'Open an issue for every critical or high finding, linked both ways.', status: 'available', setup: 'jira' },
  ] },
]

const SARIF_STEP = `- name: Upload CodeQL results to AgentShield
  uses: agentshield/upload-sarif@v1
  with:
    file: results/codeql.sarif
    project: payments-platform
    api-key: \${{ secrets.AGENTSHIELD_API_KEY }}`

export default function Integrations() {
  const toast = useToast()
  const [connected, setConnected] = useState(() => new Set())
  const [setup, setSetup] = useState(null)
  const ai = useIntegrations().data?.ai
  const total = GROUPS.flatMap((g) => g.items).filter((i) => i.status === 'connected' || connected.has(i.id)).length

  return (
    <main className="content">
      <PageHead title="Integrations" sub={`${total} connected · code and scan results come in, checks and alerts go out`} />
      <section className="col" style={{ gap: 12 }}>
        <h2 className="h2">AI services</h2>
        <div className="card icard" style={{ maxWidth: 720 }}>
          <div className="ahead">
            <span className="ilogo">AI</span>
            <div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>Investigation, remediation and verification agents</div>
              {ai?.mode === 'remote' ? <span className="small" style={{ color: 'var(--low-t)' }}>● Connected to the AI service</span>
                : <span className="small" style={{ color: 'var(--med-t)' }}>● Replay mode: results come from sample fixtures</span>}
            </div>
          </div>
          <p className="small" style={{ margin: 0, color: 'var(--text-2)' }}>
            The API sends investigation, fix and verification jobs to the AI service and accepts results only if they match the agreed contracts.
            Severity, path state and closure are always decided by the API, never by the model. Set <span className="mono">AI_SERVICE_URL</span> and <span className="mono">AI_SHARED_SECRET</span> in backend/.env to connect.
          </p>
        </div>
      </section>
      {GROUPS.map((g) => (
        <section key={g.title} className="col" style={{ gap: 12 }}>
          <h2 className="h2">{g.title}</h2>
          <div className="icards">
            {g.items.map((it) => {
              const isOn = it.status === 'connected' || connected.has(it.id)
              return (
                <div key={it.id} className="card icard">
                  <div className="ahead">
                    <span className="ilogo">{it.logo}</span>
                    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600 }}>{it.name}</div>
                      {isOn ? <span className="small" style={{ color: 'var(--low-t)' }}>● Connected</span>
                        : it.status === 'later' ? <span className="small muted">Not in this version</span> : <span className="small muted">Not connected</span>}
                    </div>
                  </div>
                  <p className="small" style={{ margin: 0, color: 'var(--text-2)' }}>{it.desc}</p>
                  <div className="sbar" style={{ marginTop: 'auto' }}>
                    <span className="small muted">{isOn ? (it.meta ?? 'Verified just now') : it.meta ?? ''}</span>
                    {it.manage ? <Link className="btn sm" to={it.manage}>Manage</Link>
                      : isOn ? <button type="button" className="btn sm" onClick={() => toast(`${it.name}`, 'Settings saved.')}>Settings</button>
                      : it.status === 'later' ? null
                      : <button type="button" className="btn sm primary" onClick={() => setSetup(it)}>Connect</button>}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}

      {setup && <SetupPanel item={setup} onClose={() => setSetup(null)}
        onDone={() => { setConnected((s) => new Set(s).add(setup.id)); toast(`${setup.name} connected`, 'Results will appear on the next scan.'); setSetup(null) }} />}
    </main>
  )
}

function SetupPanel({ item, onClose, onDone }) {
  const [phase, setPhase] = useState('setup')
  useEffect(() => {
    if (phase !== 'waiting') return
    const t = setTimeout(() => setPhase('verified'), 1800)
    return () => clearTimeout(t)
  }, [phase])
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="side" role="dialog" aria-modal="true" aria-label={`Connect ${item.name}`}>
        <div className="dsec dhead"><div><div className="small muted">Connect</div><div className="h2">{item.name}</div></div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="dscroll">
          {item.setup === 'sarif' ? (
            <>
              <p style={{ margin: 0, color: 'var(--text-2)' }}>Add this step after your CodeQL analysis. Store the API key from Settings as a repository secret.</p>
              <pre className="evb" style={{ borderRadius: 10, border: '1px solid var(--border)' }}>{SARIF_STEP}</pre>
            </>
          ) : (
            <div className="form" style={{ gridTemplateColumns: '1fr' }}>
              <div className="field"><label htmlFor="jira-site">Jira site</label><input id="jira-site" className="input" defaultValue="northwind.atlassian.net" /></div>
              <div className="field"><label htmlFor="jira-proj">Project key</label><input id="jira-proj" className="input mono" defaultValue="SEC" /><span className="help">Critical and high findings open an issue here.</span></div>
            </div>
          )}
          {phase === 'waiting' && <div className="note info"><Icon name="clock" /><div><b>Waiting for a test event…</b>Run the workflow once. Most connections verify in under a minute.</div></div>}
          {phase === 'verified' && <div className="note ok"><Icon name="check" /><div><b>Connection verified</b>Received a test upload from payments-service.</div></div>}
        </div>
        <div className="dfoot">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          {phase === 'verified' ? <button type="button" className="btn primary" onClick={onDone}>Done</button>
            : <button type="button" className="btn primary" disabled={phase === 'waiting'} onClick={() => setPhase('waiting')}>{phase === 'waiting' ? 'Checking…' : 'Test connection'}</button>}
        </div>
      </aside>
    </>
  )
}
