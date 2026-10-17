import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { Empty } from '../components/ui/ListState.jsx'
import { Owner, PageHead, Severity } from '../components/ui/bits.jsx'
import { SEV } from '../lib/constants.js'
import { useAgents } from '../api/hooks.js'
import { ErrorState, Loading } from '../components/ui/ListState.jsx'

const NONE = []

const BANDS = { all: [0, 100], crit: [80, 100], high: [60, 79], med: [40, 59], low: [0, 39] }
const COLS = 'minmax(200px,1.6fr) 150px 150px 150px 90px 120px 110px'

export default function Agents() {
  const navigate = useNavigate()
  const [repo, setRepo] = useState('all')
  const [risk, setRisk] = useState('all')
  const [mode, setMode] = useState('cards')
  const { data, isLoading, error, refetch } = useAgents()
  const AGENTS = data?.agents ?? NONE
  const list = useMemo(() => AGENTS.filter((a) => (repo === 'all' || a.repo === repo)
    && a.score >= BANDS[risk][0] && a.score <= BANDS[risk][1]).sort((a, b) => b.score - a.score), [AGENTS, repo, risk])
  const above = AGENTS.filter((a) => a.score >= 60).length

  return (
    <main className="content">
      <PageHead
        title="Coding agents"
        sub={`${AGENTS.length} declared · ${list.length} shown · ${above} above the risk threshold`}
        actions={<a className="btn" href="#declare" onClick={(e) => { e.preventDefault(); document.getElementById('declare')?.scrollIntoView({ behavior: 'smooth' }) }}><Icon name="bot" />Declare an agent</a>}
      />

      <div className="toolbar">
        <label htmlFor="ag-repo" className="sr-only">Repository</label>
        <select id="ag-repo" className="select" value={repo} onChange={(e) => setRepo(e.target.value)}>
          <option value="all">All repositories</option>
          {[...new Set(AGENTS.map((a) => a.repo))].map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <label htmlFor="ag-risk" className="sr-only">Risk</label>
        <select id="ag-risk" className="select" value={risk} onChange={(e) => setRisk(e.target.value)}>
          <option value="all">Any risk</option>
          <option value="crit">Critical (80+)</option>
          <option value="high">High (60–79)</option>
          <option value="med">Medium (40–59)</option>
          <option value="low">Low (under 40)</option>
        </select>
        <span className="spacer" />
        <div className="seg" role="group" aria-label="View">
          <button type="button" className={mode === 'cards' ? 'on' : ''} onClick={() => setMode('cards')}>Cards</button>
          <button type="button" className={mode === 'table' ? 'on' : ''} onClick={() => setMode('table')}>Table</button>
        </div>
      </div>

      {isLoading ? <section className="card tcard"><Loading /></section> : error ? <section className="card"><ErrorState title="Couldn't load agents" onRetry={refetch}>{error.message}</ErrorState></section> : list.length === 0 ? (
        <section className="card">
          <Empty icon="bot" title="No agents match" action={<button type="button" className="btn" onClick={() => { setRepo('all'); setRisk('all') }}>Reset filters</button>}>
            No declared agent matches these filters. Agents appear here after a scan finds them in a repository's .agentshield.yml.
          </Empty>
        </section>
      ) : mode === 'cards' ? (
        <div className="acards">
          {list.map((a) => (
            <button key={a.id} type="button" className="card hov acard" onClick={() => navigate(`/agents/${a.id}`)}>
              <div className="ahead">
                <span className="aic"><Icon name="bot" size={20} /></span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="ttl mono">{a.id}</div>
                  <div className="sub2">{a.repo} · {a.model}</div>
                </div>
                <span className={`badge ${SEV[a.sev].cls}`}>{a.score}</span>
              </div>
              <div className="small" style={{ color: 'var(--text-2)' }}>{a.summary}</div>
              <div className="tags">{a.tools.map(([t]) => <span key={t} className="tag">{t}</span>)}</div>
              <div className="ameta">
                <div><b>{a.tools.length}</b><span>tools</span></div>
                <div><b style={{ color: a.paths.length ? 'var(--crit-t)' : undefined }}>{a.paths.length}</b><span>attack paths</span></div>
                <div><b>{a.findings}</b><span>open findings</span></div>
              </div>
              <div className="small muted">Owner: {a.owner ?? <span style={{ color: 'var(--med-t)' }}>none declared</span>} · via {a.via}</div>
            </button>
          ))}
        </div>
      ) : (
        <section className="card tcard">
          <div className="scrollx"><div style={{ minWidth: 920 }}>
            <div className="tr head" style={{ gridTemplateColumns: COLS }}>
              <span className="cell">Agent</span><span className="cell">Repository</span><span className="cell">Connects via</span>
              <span className="cell">Owner</span><span className="cell">Tools</span><span className="cell">Attack paths</span><span className="cell">Risk</span>
            </div>
            {list.map((a) => (
              <div key={a.id} className="tr body" style={{ gridTemplateColumns: COLS }} role="link" tabIndex={0}
                onClick={() => navigate(`/agents/${a.id}`)} onKeyDown={(e) => e.key === 'Enter' && navigate(`/agents/${a.id}`)}>
                <span className="cell"><span className="ttl mono">{a.id}</span><span className="sub2">{a.summary}</span></span>
                <span className="cell mono small">{a.repo}</span>
                <span className="cell mono small">{a.via}</span>
                <span className="cell"><Owner name={a.owner} /></span>
                <span className="cell">{a.tools.length}</span>
                <span className="cell">{a.paths.join(', ') || '—'}</span>
                <span className="cell"><Severity value={a.sev} /> <span className="mono small">{a.score}</span></span>
              </div>
            ))}
          </div></div>
        </section>
      )}

      <section className="card" id="declare">
        <h2 className="h2">Declare an agent</h2>
        <p className="small muted" style={{ margin: '4px 0 12px' }}>Add an .agentshield.yml file to the repository. The next scan picks it up and maps its tools and permissions.</p>
        <pre className="evb" style={{ borderRadius: 10, border: '1px solid var(--border)' }}>{`agents:
  - name: code-assistant
    owner: appsec
    connects_via: mcp-github
    tools: [read_file, write_file, open_pull_request]
    allowed_paths: [src/**, docs/**]   # recommended`}</pre>
      </section>
    </main>
  )
}
