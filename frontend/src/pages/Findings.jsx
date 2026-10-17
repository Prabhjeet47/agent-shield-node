import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { useToast } from '../components/layout/Toast.jsx'
import { Empty, ErrorState, Loading } from '../components/ui/ListState.jsx'
import { Owner, PageHead, Severity, Status } from '../components/ui/bits.jsx'
import { SEV } from '../lib/constants.js'
import { api, p } from '../api/client.js'
import { useAction, useFindings } from '../api/hooks.js'

const SEV_ORDER = { crit: 0, high: 1, med: 2, low: 3 }
const CLOSED = ['verified_fixed', 'accepted_risk', 'false_positive']
const NONE = []

const PAGE = 8
const COLS = '40px 108px minmax(240px,2.4fr) minmax(150px,1fr) 120px 170px 150px 64px'
const VIEWS = [
  { id: 'open', label: 'All open', test: (f) => !CLOSED.includes(f.status) },
  { id: 'mine', label: 'Assigned to me', test: (f, me) => f.owner === me && !CLOSED.includes(f.status) },
  { id: 'paths', label: 'On an attack path', test: (f) => f.path && !CLOSED.includes(f.status) },
  { id: 'closed', label: 'Closed', test: (f) => CLOSED.includes(f.status) },
]

export default function Findings() {
  const navigate = useNavigate()
  const toast = useToast()
  const { data, isLoading, error, refetch } = useFindings()
  const rows = data?.findings ?? NONE
  const ME = data?.me
  const phase = isLoading ? 'loading' : error ? 'error' : 'ready'
  const [view, setView] = useState('open')
  const [q, setQ] = useState('')
  const [sevs, setSevs] = useState(() => new Set(Object.keys(SEV)))
  const [repo, setRepo] = useState('all')
  const [sort, setSort] = useState('severity')
  const [picked, setPicked] = useState(() => new Set())
  const [page, setPage] = useState(0)

  const viewTest = VIEWS.find((v) => v.id === view).test
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const out = rows.filter((f) => viewTest(f, ME) && sevs.has(f.sev) && (repo === 'all' || f.repo === repo)
      && (!needle || `${f.id} ${f.title} ${f.repo} ${f.agent ?? ''}`.toLowerCase().includes(needle)))
    const by = {
      severity: (a, b) => SEV_ORDER[a.sev] - SEV_ORDER[b.sev] || b.score - a.score,
      newest: (a, b) => a.age - b.age,
      repo: (a, b) => a.repo.localeCompare(b.repo),
    }[sort]
    return out.sort(by)
  }, [rows, viewTest, ME, sevs, repo, q, sort])

  const pages = Math.max(1, Math.ceil(list.length / PAGE))
  const current = Math.min(page, pages - 1)
  const shown = list.slice(current * PAGE, current * PAGE + PAGE)
  const openCount = rows.filter((f) => !CLOSED.includes(f.status)).length
  const crit = rows.filter((f) => f.sev === 'crit' && !CLOSED.includes(f.status)).length
  const allPicked = shown.length > 0 && shown.every((f) => picked.has(f.id))

  const togglePick = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleSev = (k) => { setSevs((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n }); setPage(0) }
  const clearFilters = () => { setSevs(new Set(Object.keys(SEV))); setRepo('all'); setQ(''); setPage(0) }

  const bulkAction = useAction(({ ids, patch }) => api(p('/findings'), { method: 'PATCH', body: { ids, patch } }),
    { success: (res) => ['Updated', `${res.findings.length} finding${res.findings.length === 1 ? '' : 's'} changed.`] })
  function bulk(patch) {
    bulkAction.mutate({ ids: [...picked], patch }, { onSuccess: () => setPicked(new Set()) })
  }

  function exportCsv() {
    const head = 'id,severity,title,repository,agent,detection,status,owner,age_days'
    const body = list.map((f) => [f.id, SEV[f.sev].label, `"${f.title}"`, f.repo, f.agent ?? '', f.detection, f.status, f.owner ?? '', f.age].join(','))
    const url = URL.createObjectURL(new Blob([[head, ...body].join('\n')], { type: 'text/csv' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: 'agentshield-findings.csv' })
    a.click()
    URL.revokeObjectURL(url)
    toast('Export started', `${list.length} findings in this view.`)
  }

  return (
    <main className="content">
      <PageHead
        title="Findings"
        sub={`${openCount} open · ${crit} critical · median time to triage 3 h`}
        actions={<button type="button" className="btn" onClick={exportCsv}><Icon name="list" />Export CSV</button>}
      />

      <div className="views" role="tablist" aria-label="Saved views">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" role="tab" aria-selected={view === v.id} className={`view${view === v.id ? ' on' : ''}`}
            onClick={() => { setView(v.id); setPage(0); setPicked(new Set()) }}>
            {v.label}<span className="n">{rows.filter((f) => v.test(f, ME)).length}</span>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <div className="inwrap">
          <Icon name="search" />
          <label htmlFor="find-q" className="sr-only">Search findings</label>
          <input id="find-q" className="input" style={{ paddingLeft: 32 }} placeholder="Search by ID, title, repo or agent"
            value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} />
        </div>
        {Object.entries(SEV).map(([k, s]) => (
          <button key={k} type="button" className={`chip${sevs.has(k) ? ' on' : ''}`} aria-pressed={sevs.has(k)} onClick={() => toggleSev(k)}>
            <span className="bd" style={{ color: s.color }} />{s.label}
          </button>
        ))}
        <label htmlFor="find-repo" className="sr-only">Repository</label>
        <select id="find-repo" className="select" value={repo} onChange={(e) => { setRepo(e.target.value); setPage(0) }}>
          <option value="all">All repositories</option>
          {[...new Set(rows.map((f) => f.repo))].map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <span className="spacer" />
        <label htmlFor="find-sort" className="small muted">Sort</label>
        <select id="find-sort" className="select" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="severity">Severity</option>
          <option value="newest">Newest first</option>
          <option value="repo">Repository A–Z</option>
        </select>
      </div>

      <section className="card tcard" aria-label="Findings">
        {picked.size > 0 && (
          <div className="bulk">
            <b>{picked.size} selected</b><span className="muted">·</span>
            <button type="button" className="btn sm" onClick={() => bulk({ owner: ME })}>Assign to me</button>
            <button type="button" className="btn sm" onClick={() => bulk({ status: 'investigating' })}>Mark investigating</button>
            <span className="small muted">Findings close only after a fix passes verification.</span>
            <span className="spacer" />
            <button type="button" className="btn sm ghost" onClick={() => setPicked(new Set())}>Clear selection</button>
          </div>
        )}
        {phase === 'loading' && <Loading rows={6} />}
        {phase === 'error' && (
          <ErrorState title="Couldn't load findings" requestId="req_8f3a91c2e7" onRetry={refetch}>
            {error?.message}. Your data is safe. Retry, or check that the API is running.
          </ErrorState>
        )}
        {phase === 'ready' && list.length === 0 && (
          <Empty title="No findings match this view" action={<button type="button" className="btn" onClick={clearFilters}>Clear filters</button>}>
            Nothing matches these filters. Try widening the severity filter or switch to All open.
          </Empty>
        )}
        {phase === 'ready' && list.length > 0 && (
          <div className="scrollx">
            <div style={{ minWidth: 980 }}>
              <div className="tr head" style={{ gridTemplateColumns: COLS }}>
                <span className="cell"><input type="checkbox" className="cb" aria-label="Select all on this page" checked={allPicked}
                  onChange={() => setPicked((s) => { const n = new Set(s); shown.forEach((f) => (allPicked ? n.delete(f.id) : n.add(f.id))); return n })} /></span>
                <span className="cell">Severity</span><span className="cell">Finding</span><span className="cell">Affects</span>
                <span className="cell">Risk</span><span className="cell">Status</span><span className="cell">Owner</span><span className="cell">Age</span>
              </div>
              {shown.map((f) => (
                <div key={f.id} className={`tr body${picked.has(f.id) ? ' sel' : ''}`} style={{ gridTemplateColumns: COLS }}
                  onClick={() => navigate(`/findings/${f.id}`)} role="link" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate(`/findings/${f.id}`)}>
                  <span className="cell" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" className="cb" aria-label={`Select ${f.id}`} checked={picked.has(f.id)} onChange={() => togglePick(f.id)} />
                  </span>
                  <span className="cell"><Severity value={f.sev} /></span>
                  <span className="cell"><span className="ttl">{f.title}</span><span className="sub2 mono">{f.id} · {f.detection}{f.path ? ` · ${f.path}` : ''}</span></span>
                  <span className="cell"><span className="ttl mono" style={{ fontWeight: 400, fontSize: 12.5 }}>{f.repo}</span>{f.agent && <span className="sub2">agent: {f.agent}</span>}</span>
                  <span className="cell mono">{f.score || '—'}</span>
                  <span className="cell"><Status value={f.status} /></span>
                  <span className="cell"><Owner name={f.owner} /></span>
                  <span className="cell small muted">{f.age}d</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {phase === 'ready' && list.length > 0 && (
          <div className="tfoot">
            <span className="small muted">Showing {current * PAGE + 1}–{current * PAGE + shown.length} of {list.length}</span>
            <div className="acts">
              <button type="button" className="btn sm" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</button>
              <button type="button" className="btn sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Next</button>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
