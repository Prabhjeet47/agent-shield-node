import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../Icon.jsx'




export default function AgentGraph({ graph: GRAPH }) {
  const byId = Object.fromEntries(GRAPH.nodes.map((n) => [n.id, n]))
  const [selected, setSelected] = useState('r1')
  const node = byId[selected]
  return (
    <section className="card" aria-labelledby="g-h">
      <div className="ch">
        <div>
          <h2 className="h2" id="g-h">Agent graph</h2>
          <div className="small muted">code-assistant neighbourhood · 1 validated path</div>
        </div>
        <Link to="/graph?path=AP-0142">Open full graph</Link>
      </div>
      <div className="gscroll">
        <div className="mini">
          <svg className="medge" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {GRAPH.edges.map(([a, b, hot]) => (
              <line key={a + b} x1={byId[a].x} y1={byId[a].y} x2={byId[b].x} y2={byId[b].y}
                stroke={hot ? 'var(--accent)' : 'var(--border-strong)'} strokeWidth={hot ? 2 : 1.5} className={hot ? 'flowing' : ''} />
            ))}
          </svg>
          {GRAPH.nodes.map((n) => (
            <button key={n.id} type="button" className={`mnode ${n.kind}${n.id === selected ? ' sel' : ''}`}
              style={{ left: `${n.x}%`, top: `${n.y}%` }} onClick={() => setSelected(n.id)} aria-label={n.label}>
              <span className="msv"><Icon name={n.icon} /></span>
              <span className="mlabel">{n.label}</span>
            </button>
          ))}
          <div className="ginfo"><b className="mono">{node.label}</b><br />{node.detail}</div>
        </div>
      </div>
    </section>
  )
}
