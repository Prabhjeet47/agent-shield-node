import { useState } from 'react'
import Icon from '../Icon.jsx'
import { EVIDENCE, SEV, TYPES } from '../../lib/constants.js'

export default function NodeDrawer({ node, edges, paths, onClose, onSelect, onHighlight, onProposeFix, onInvestigate }) {
  const [openEdge, setOpenEdge] = useState(null)
  const t = TYPES[node.type]
  const links = edges.filter((e) => e.from === node.id || e.to === node.id)
  const pathIds = [...new Set(links.map((e) => e.path).filter(Boolean))]
  const weakest = links.some((e) => e.state === 'inferred') ? 'inferred' : links.some((e) => e.state === 'needs') ? 'needs' : 'validated'

  return (
    <aside className="drawer" aria-label={`${node.id} details`}>
      <div className="dsec dhead">
        <div style={{ minWidth: 0 }}>
          <div className="small muted">{t.label}</div>
          <div className="dtitle mono">{node.id}</div>
          <div className="pt" style={{ marginTop: 8 }}>
            <span className={`badge ${SEV[node.risk].cls}`}><i className="bd" />{SEV[node.risk].label} risk</span>
            <span className={`badge ${EVIDENCE[weakest].cls}`}>{weakest === 'validated' ? 'All links have evidence' : EVIDENCE[weakest].label}</span>
          </div>
        </div>
        <button type="button" className="iconbtn" onClick={onClose} aria-label="Close details">✕</button>
      </div>

      <div className="dscroll">
        {node.score != null && (
          <div className="dsec">
            <h3>Risk score</h3>
            <div className="kv">{node.score}<small> / 100</small></div>
            <div className="bar"><span style={{ width: `${node.score}%`, background: SEV[node.risk].color }} /></div>
          </div>
        )}

        <div className="dsec">
          <h3>Details</h3>
          <dl className="kvg">
            <dt>Type</dt><dd>{t.label}</dd>
            <dt>Repository</dt><dd className="mono">{node.repo}</dd>
            <dt>Source</dt><dd title={node.source}>{node.source}</dd>
            <dt>Snapshot</dt><dd>Scan #214</dd>
          </dl>
          <p className="small muted" style={{ margin: '10px 0 0' }}>{node.note}</p>
        </div>

        <div className="dsec">
          <h3>Relationships <span className="badge b-neu">{links.length}</span></h3>
          <ul className="rels">
            {links.map((e) => {
              const out = e.from === node.id
              const other = out ? e.to : e.from
              return (
                <li key={e.id}>
                  <button type="button" className="rel" aria-expanded={openEdge === e.id} onClick={() => setOpenEdge(openEdge === e.id ? null : e.id)}>
                    <span className="muted">{out ? '→' : '←'}</span>
                    <span className="mono relname">{e.rel}</span>
                    <span className={`badge ${EVIDENCE[e.state].cls}`}>{EVIDENCE[e.state].label}</span>
                  </button>
                  <div className="relto">
                    <button type="button" className="linkbtn mono" onClick={() => onSelect(other)}>{other}</button>
                  </div>
                  {openEdge === e.id && <div className="evid"><b>Evidence</b>{e.evidence}</div>}
                </li>
              )
            })}
          </ul>
        </div>

        <div className="dsec">
          <h3>Attack paths</h3>
          {pathIds.length === 0 ? (
            <p className="small muted" style={{ margin: 0 }}>Not part of any attack path in this snapshot.</p>
          ) : pathIds.map((id) => {
            const p = paths.find((x) => x.id === id)
            return (
              <div key={id} className="thr">
                <span className={`badge ${SEV[p.sev].cls}`}>{SEV[p.sev].label}</span>
                <span className="mono">{id}</span>
                <span className="small muted" style={{ flex: 1, minWidth: 0 }}>{p.state}</span>
                <button type="button" className="btn sm ghost" onClick={() => onHighlight(id)}>Highlight</button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="dfoot">
        {pathIds.length > 0 && (
          <button type="button" className="btn" onClick={() => onProposeFix(node)}><Icon name="wrench" />Propose fix</button>
        )}
        <button type="button" className="btn primary" onClick={() => onInvestigate(node)}><Icon name="investigate" />Open investigation</button>
      </div>
    </aside>
  )
}
