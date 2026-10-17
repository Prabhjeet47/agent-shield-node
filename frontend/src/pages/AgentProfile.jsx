import { Link, useParams } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { Empty } from '../components/ui/ListState.jsx'
import { SEV } from '../lib/constants.js'
import { useAgent } from '../api/hooks.js'
import { ErrorState, Loading } from '../components/ui/ListState.jsx'

const GRADE = { ok: ['✓', 'g-ok', 'Scoped'], warn: ['~', 'g-warn', 'Broad'], risk: ['!', 'g-risk', 'Unrestricted'], none: ['–', 'g-none', 'No access'] }

export default function AgentProfile() {
  const { id } = useParams()
  const { data: a, isLoading, error, refetch } = useAgent(id)
  if (isLoading) return <main className="content"><section className="card tcard"><Loading /></section></main>
  if (error && error.status !== 404) return <main className="content"><section className="card"><ErrorState title="Couldn't load this agent" onRetry={refetch}>{error.message}</ErrorState></section></main>
  if (!a) {
    return (
      <main className="content">
        <Empty icon="bot" title="Agent not found" action={<Link className="btn" to="/agents">Back to agents</Link>}>
          {id} isn't declared in any connected repository.
        </Empty>
      </main>
    )
  }
  const done = a.hardening.filter((h) => h[1]).length
  const paths = a.pathDetails

  return (
    <main className="content">
      <div className="ph">
        <div>
          <nav className="crumbs" aria-label="Breadcrumb"><Link to="/agents">Coding agents</Link><span>/</span><span className="mono">{a.id}</span></nav>
          <div className="ahead" style={{ marginTop: 10 }}>
            <span className="aic" style={{ width: 48, height: 48 }}><Icon name="bot" size={24} /></span>
            <div>
              <h1 className="mono" style={{ fontSize: 24 }}>{a.id}</h1>
              <div className="pt" style={{ marginTop: 4 }}>
                <span className={`badge ${SEV[a.sev].cls}`}>Risk {a.score}</span>
                <span className="badge b-neu">{a.model}</span>
                <span className="badge b-neu">via {a.via}</span>
                <span className="small muted">Owner · {a.owner ?? 'none declared'}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="acts">
          <Link className="btn" to={a.paths[0] ? `/graph?path=${a.paths[0]}` : '/graph'}><Icon name="graph" />View in graph</Link>
          <a className="btn primary" href="#perms" onClick={(e) => { e.preventDefault(); document.getElementById('perms').scrollIntoView({ behavior: 'smooth' }) }}>Review permissions</a>
        </div>
      </div>

      <div className="stats">
        <div className="card"><div className="sl">Tools</div><div className="sv">{a.tools.length}</div><div className="small muted">{a.tools.filter((t) => t[1].startsWith('Observed')).length} observed in sandbox</div></div>
        <div className="card"><div className="sl">Attack paths</div><div className="sv" style={{ color: paths.length ? 'var(--crit-t)' : undefined }}>{paths.length}</div><div className="small muted">{paths.length ? paths.map((p) => p.id).join(', ') : 'None reach a restricted resource'}</div></div>
        <div className="card"><div className="sl">Open findings</div><div className="sv">{a.findings}</div><div className="small muted">in {a.repo}</div></div>
        <div className="card"><div className="sl">Hardening</div><div className="sv">{done} / {a.hardening.length}</div><div className="small muted">{a.hardening.length - done} recommended controls missing</div></div>
      </div>

      <div className="g2">
        <section className="card" id="perms">
          <div className="ch"><div><h2 className="h2">Permissions matrix</h2><div className="small muted">Effective access through this agent's tools and tokens</div></div></div>
          <div className="scrollx">
            <table className="mx">
              <thead><tr><th>Resource</th><th>Read</th><th>Write</th><th>Use secret</th><th>External</th></tr></thead>
              <tbody>
                {a.matrix.map(([res, ...cells]) => (
                  <tr key={res}><td>{res}</td>{cells.map((g, i) => (
                    <td key={i}><span className={`cellg ${GRADE[g][1]}`} title={GRADE[g][2]}>{GRADE[g][0]}</span></td>
                  ))}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="legend">
            {Object.values(GRADE).map(([sym, cls, label]) => <span key={label} className="lg"><span className={`cellg ${cls}`} style={{ width: 22, height: 20 }}>{sym}</span>{label}</span>)}
          </div>
        </section>

        <section className="card">
          <div className="ch"><div><h2 className="h2">Tools</h2><div className="small muted">What the agent can call, and where we learned it</div></div></div>
          {a.tools.map(([tool, source, perm]) => (
            <div key={tool} className="pol">
              <Icon name="wrench" />
              <div style={{ flex: 1, minWidth: 0 }}><div className="mono">{tool}</div><div className="small muted">{source}</div></div>
              <span className="tag">{perm}</span>
            </div>
          ))}
        </section>

        <section className="card">
          <div className="ch"><h2 className="h2">Attack paths through this agent</h2><Link to="/graph">Open graph</Link></div>
          {paths.length === 0 ? <p className="small muted" style={{ margin: 0 }}>No path from this agent reaches a confidential or restricted resource in the latest scan.</p>
            : paths.map((p) => (
              <div key={p.id} className="pol">
                <span className={`badge ${SEV[p.sev].cls}`}>{SEV[p.sev].label}</span>
                <span className="mono">{p.id}</span>
                <span className="small muted" style={{ flex: 1 }}>{p.summary ?? p.title} · {p.state.replace('_', ' ')}</span>
                <Link to={`/graph?path=${p.id}`}>Highlight</Link>
              </div>
            ))}
        </section>

        <section className="card">
          <div className="ch"><div><h2 className="h2">Hardening checklist</h2><div className="small muted">{done} of {a.hardening.length} recommended controls in place</div></div><Link to="/policies">Manage policies</Link></div>
          {a.hardening.map(([name, ok, why]) => (
            <div key={name} className="pol">
              <span className={`cic ${ok ? 'pass' : 'fail'}`}>{ok ? '✓' : '!'}</span>
              <div style={{ flex: 1 }}><div>{name}</div>{why && <div className="small muted">{why}</div>}</div>
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}
