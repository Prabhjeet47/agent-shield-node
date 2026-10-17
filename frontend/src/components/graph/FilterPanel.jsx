import Icon from '../Icon.jsx'
import { EVIDENCE, SEV, TYPES } from '../../lib/constants.js'

const RISKS = ['low', 'med', 'high', 'crit']

export default function FilterPanel({
  paths, counts, nodeCount, edgeCount, query, setQuery, searchRef, onSearchEnter,
  pathId, setPathId, layout, setLayout, types, toggleType, risks, toggleRisk, open,
}) {
  return (
    <div className={`float fpanel${open ? ' open' : ''}`}>
      <div>
        <h1 className="h2" style={{ margin: 0 }}>Agent graph</h1>
        <div className="small muted">{nodeCount} nodes · {edgeCount} relationships</div>
      </div>

      <div className="inwrap">
        <Icon name="search" />
        <label htmlFor="graph-q" className="sr-only">Find a node</label>
        <input id="graph-q" ref={searchRef} className="input" style={{ paddingLeft: 32 }} placeholder="Find a node"
          value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onSearchEnter()} />
        <span className="kbd">/</span>
      </div>

      <div>
        <p className="flabel">Attack path</p>
        <div className="plist">
          <button type="button" className={`pitem${!pathId ? ' on' : ''}`} onClick={() => setPathId(null)}>
            <span>Whole graph</span>
          </button>
          {paths.map((p) => (
            <button key={p.id} type="button" className={`pitem${pathId === p.id ? ' on' : ''}`} onClick={() => setPathId(p.id)}>
              <span className="bd" style={{ color: SEV[p.sev].color }} />
              <span className="pmain"><span className="mono">{p.id}</span><span className="small muted">{p.title}</span></span>
              <span className="small muted">{p.state}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="flabel">Layout</p>
        <div className="seg" role="group" aria-label="Layout">
          {['force', 'hierarchy', 'radial'].map((l) => (
            <button key={l} type="button" className={layout === l ? 'on' : ''} onClick={() => setLayout(l)}>
              {l[0].toUpperCase() + l.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="flabel">Node type</p>
        {Object.entries(TYPES).filter(([t]) => counts[t]).map(([t, meta]) => (
          <label key={t} className="chk">
            <input type="checkbox" checked={types.has(t)} onChange={() => toggleType(t)} />
            <Icon name={meta.icon} size={14} />{meta.label}<span className="n">{counts[t]}</span>
          </label>
        ))}
      </div>

      <div>
        <p className="flabel">Risk level</p>
        <div className="chips">
          {RISKS.map((r) => (
            <button key={r} type="button" className={`chip${risks.has(r) ? ' on' : ''}`} aria-pressed={risks.has(r)} onClick={() => toggleRisk(r)}>
              <span className="bd" style={{ color: SEV[r].color }} />{SEV[r].label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="flabel">Line style</p>
        {Object.entries(EVIDENCE).map(([k, ev]) => (
          <div key={k} className="lgi">
            <svg width="28" height="6" aria-hidden="true"><line x1="0" y1="3" x2="28" y2="3" stroke={ev.color} strokeWidth="2" strokeDasharray={ev.dash} /></svg>
            {ev.label}
          </div>
        ))}
        <div className="small muted" style={{ marginTop: 6 }}>Double-click a node to show only its neighbours.</div>
      </div>
    </div>
  )
}
