import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { SEV } from '../../lib/constants.js'

const STATE = { validated: ['Validated', 'b-acc'], needs_evidence: ['Needs evidence', 'b-med'], candidate: ['Candidate', 'b-neu'], disproven: ['Disproven', 'b-low'] }

export default function TopAttackPaths({ paths }) {
  return (
    <section className="card" aria-labelledby="ap-h">
      <div className="ch">
        <div>
          <h2 className="h2" id="ap-h">Top attack paths</h2>
          <div className="small muted">Ranked by risk. A path stays a candidate until each step has evidence.</div>
        </div>
        <Link to="/graph">View all</Link>
      </div>
      <ol className="paths">
        {paths.map((p) => (
          <li key={p.id} className="path">
            <div>
              <div className="pt">
                <span className="mono muted">{p.id}</span>
                <span className={`badge ${SEV[p.sev].cls}`}><i className="bd" />{SEV[p.sev].label}</span>
                <span className={`badge ${STATE[p.state][1]}`}>{STATE[p.state][0]}</span>
              </div>
              <div className="pt" style={{ marginTop: 6 }}><Link to={`/graph?path=${p.id}`}>{p.title}</Link></div>
              <div className="chain">
                {p.steps.map((s, i) => (
                  <Fragment key={i}>
                    <span className={`step${s.sensitive ? ' sens' : ''}`}><em>{s.kind}</em><span>{s.node}</span></span>
                    {i < p.steps.length - 1 && <i className={`lnk ${p.links[i] ?? ''}`} />}
                  </Fragment>
                ))}
              </div>
            </div>
            <div className="score">
              <span className="small muted">Risk</span><br />
              <b>{p.score}</b>
              <div className="bar"><span style={{ width: `${p.score}%`, background: SEV[p.sev].color }} /></div>
            </div>
          </li>
        ))}
      </ol>
      <div className="legend">
        <span className="lg"><i style={{ background: 'var(--accent)' }} />evidence</span>
        <span className="lg"><i style={{ background: 'repeating-linear-gradient(90deg,var(--med) 0 4px,transparent 4px 7px)' }} />needs evidence</span>
        <span className="lg"><i style={{ background: 'repeating-linear-gradient(90deg,var(--text-3) 0 2px,transparent 2px 5px)' }} />inferred</span>
      </div>
    </section>
  )
}
