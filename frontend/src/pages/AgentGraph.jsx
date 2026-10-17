import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import GraphCanvas from '../components/graph/GraphCanvas.jsx'
import FilterPanel from '../components/graph/FilterPanel.jsx'
import NodeDrawer from '../components/graph/NodeDrawer.jsx'
import { LAYOUTS } from '../components/graph/layouts.js'
import Icon from '../components/Icon.jsx'
import { useToast } from '../components/layout/Toast.jsx'
import { ErrorState, Loading } from '../components/ui/ListState.jsx'
import { api, p as projectPath } from '../api/client.js'
import { useGraph, useJob } from '../api/hooks.js'
import { TYPES } from '../lib/constants.js'

const EMPTY = { nodes: [], edges: [], paths: [], snapshots: [] }
const toggle = (set, v) => { const s = new Set(set); s.has(v) ? s.delete(v) : s.add(v); return s }

export default function AgentGraph() {
  const [snapshot, setSnapshot] = useState('scan-214')
  const { data, isLoading, error, refetch } = useGraph(snapshot)
  if (isLoading) return <main className="content"><h1>Agent graph</h1><section className="card tcard"><Loading rows={6} /></section></main>
  if (error) return <main className="content"><h1>Agent graph</h1><section className="card"><ErrorState title="Couldn't load the graph" onRetry={refetch}>{error.message}</ErrorState></section></main>
  return <GraphView graph={data ?? EMPTY} snapshot={snapshot} setSnapshot={setSnapshot} />
}

function GraphView({ graph, snapshot, setSnapshot }) {
  const { nodes: NODES, edges: EDGES, paths: GRAPH_PATHS, snapshots: SNAPSHOTS } = graph
  const byId = useMemo(() => Object.fromEntries(NODES.map((n) => [n.id, n])), [NODES])
  const toast = useToast()
  const runJob = useJob()
  const [params, setParams] = useSearchParams()
  const pathId = GRAPH_PATHS.some((p) => p.id === params.get('path')) ? params.get('path') : null
  const setPathId = (id) => setParams(id ? { path: id } : {}, { replace: true })

  const [layout, setLayout] = useState('hierarchy')
  const [types, setTypes] = useState(() => new Set(Object.keys(TYPES)))
  const [risks, setRisks] = useState(() => new Set(['low', 'med', 'high', 'crit']))
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [focus, setFocus] = useState(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const searchRef = useRef(null)

  const pos = useMemo(() => LAYOUTS[layout](NODES, EDGES), [layout, NODES, EDGES])
  const nodes = useMemo(() => NODES.filter((n) => types.has(n.type) && risks.has(n.risk)), [NODES, types, risks])
  const counts = useMemo(() => NODES.reduce((c, n) => ({ ...c, [n.type]: (c[n.type] ?? 0) + 1 }), {}), [NODES])

  // What to emphasise: an attack path, a focused neighbourhood, or search matches.
  const { activeNodes, activeEdges } = useMemo(() => {
    if (pathId) {
      const es = EDGES.filter((e) => e.path === pathId)
      return { activeEdges: new Set(es.map((e) => e.id)), activeNodes: new Set(es.flatMap((e) => [e.from, e.to])) }
    }
    if (focus) {
      const es = EDGES.filter((e) => e.from === focus || e.to === focus)
      return { activeEdges: new Set(es.map((e) => e.id)), activeNodes: new Set([focus, ...es.flatMap((e) => [e.from, e.to])]) }
    }
    if (query.trim()) {
      const hits = new Set(NODES.filter((n) => n.id.toLowerCase().includes(query.trim().toLowerCase())).map((n) => n.id))
      return { activeNodes: hits, activeEdges: new Set(EDGES.filter((e) => hits.has(e.from) && hits.has(e.to)).map((e) => e.id)) }
    }
    return { activeNodes: null, activeEdges: null }
  }, [pathId, focus, query, NODES, EDGES])

  const labelEdges = useMemo(() => {
    const s = new Set(pathId ? EDGES.filter((e) => e.path === pathId).map((e) => e.id) : [])
    if (selected) EDGES.forEach((e) => (e.from === selected || e.to === selected) && s.add(e.id))
    return s
  }, [pathId, selected, EDGES])

  useEffect(() => {
    const onKey = (e) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)
      if (e.key === '/' && !typing) { e.preventDefault(); searchRef.current?.focus() }
      if (e.key === 'Escape' && !typing) { setSelected(null); setFocus(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const selectedNode = selected ? byId[selected] : null
  const snap = SNAPSHOTS.find((s) => s.id === snapshot) ?? SNAPSHOTS[0]

  return (
    <div className="gpage">
      <GraphCanvas
        nodes={nodes} edges={EDGES} pos={pos} selected={selected}
        activeNodes={activeNodes} activeEdges={activeEdges} labelEdges={labelEdges}
        onSelect={setSelected} onFocus={(id) => { setFocus(id); setSelected(id); setPathId(null) }}
        onBackground={() => setSelected(null)} fitIds={(pathId || focus) && activeNodes ? [...activeNodes] : null}
      >
        <button type="button" className="float ptoggle btn sm" onClick={() => setPanelOpen((v) => !v)} aria-expanded={panelOpen}>
          <Icon name="list" size={14} />Filters
        </button>
        <FilterPanel
          open={panelOpen} paths={GRAPH_PATHS} counts={counts} nodeCount={nodes.length} edgeCount={EDGES.length}
          query={query} setQuery={(q) => { setQuery(q); setFocus(null) }} searchRef={searchRef}
          onSearchEnter={() => activeNodes?.size && setSelected([...activeNodes][0])}
          pathId={pathId} setPathId={(id) => { setPathId(id); setFocus(null) }}
          layout={layout} setLayout={setLayout}
          types={types} toggleType={(t) => setTypes((s) => toggle(s, t))}
          risks={risks} toggleRisk={(r) => setRisks((s) => toggle(s, r))}
        />

        {focus && (
          <div className="float focusbar">
            Showing neighbours of <b className="mono">{focus}</b>
            <button type="button" className="btn sm ghost" onClick={() => setFocus(null)}>Show all</button>
          </div>
        )}

        <div className="float tl">
          <Icon name="clock" size={14} />
          <label htmlFor="snapshot" className="small muted">Snapshot</label>
          <select id="snapshot" className="input select" value={snapshot}
            onChange={(e) => { setSnapshot(e.target.value); toast('Snapshot loaded', SNAPSHOTS.find((s) => s.id === e.target.value).label) }}>
            {SNAPSHOTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <span className="mono muted tlc">{snap.commit}</span>
        </div>

        {selectedNode && (
          <NodeDrawer
            key={selectedNode.id} node={selectedNode} edges={EDGES} paths={GRAPH_PATHS}
            onClose={() => setSelected(null)} onSelect={setSelected}
            onHighlight={(id) => { setPathId(id); setFocus(null) }}
            onProposeFix={(n) => toast('Fix drafted', `A scoped change for ${n.id} is ready for review in Fixes.`)}
            onInvestigate={(n) => runJob(() => api(projectPath('/investigations'), { method: 'POST', body: { scope: { node_ids: [n.id] }, goal: `Paths through ${n.id}` } }),
              { started: ['Investigation queued', `Exploring paths through ${n.id}.`], done: (r) => ['Investigation complete', `${r.paths.length} paths checked.`] })}
          />
        )}
      </GraphCanvas>
    </div>
  )
}
