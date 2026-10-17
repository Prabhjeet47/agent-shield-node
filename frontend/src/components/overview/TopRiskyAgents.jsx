import { Link } from 'react-router-dom'
import { SEV } from '../../lib/constants.js'

export default function TopRiskyAgents({ agents }) {
  return (
    <section className="card" aria-labelledby="ra-h">
      <div className="ch">
        <h2 className="h2" id="ra-h">Top risky agents</h2>
        <Link to="/agents">View all</Link>
      </div>
      <ol className="rank">
        {agents.map((a, i) => (
          <li key={a.name}>
            <span className="mono muted">{String(i + 1).padStart(2, '0')}</span>
            <div className="rn">
              <Link to={`/agents/${a.name}`}>{a.name}</Link>
              <div className="small muted">{a.why}</div>
              <div className="bar"><span style={{ width: `${a.score}%`, background: SEV[a.sev].color }} /></div>
            </div>
            <span className={`badge ${SEV[a.sev].cls}`}>{a.score}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
