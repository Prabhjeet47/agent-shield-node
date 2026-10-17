import { Fragment, useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { useToast } from '../components/layout/Toast.jsx'
import { Empty } from '../components/ui/ListState.jsx'
import { PageHead } from '../components/ui/bits.jsx'
import { useAudit } from '../api/hooks.js'
import { ErrorState, Loading } from '../components/ui/ListState.jsx'
import { fmtTime } from '../lib/format.js'

const NONE = []

const COLS = '28px 140px 150px minmax(160px,1fr) minmax(200px,1.3fr) minmax(160px,1fr) 96px'
const RESULT = { success: 'b-low', failure: 'b-crit', denied: 'b-high' }

// Supports plain text plus field:value terms, e.g. "actor:shruti action:policy".
function matches(ev, query) {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean).every((term) => {
    const [field, value] = term.includes(':') ? term.split(/:(.*)/) : [null, term]
    if (field && field in ev) return String(ev[field]).toLowerCase().includes(value)
    return `${ev.id} ${ev.actor} ${ev.action} ${ev.target} ${ev.result}`.toLowerCase().includes(term)
  })
}

export default function AuditLog() {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [result, setResult] = useState('all')
  const [kind, setKind] = useState('all')
  const [open, setOpen] = useState(null)
  const { data, isLoading, error, refetch } = useAudit()
  const EVENTS = data?.events ?? NONE
  const list = useMemo(() => EVENTS.filter((e) => (result === 'all' || e.result === result) && (kind === 'all' || e.kind === kind) && matches(e, q)), [EVENTS, q, result, kind])

  return (
    <main className="content">
      <PageHead
        title="Audit log"
        sub={`${list.length} events · append-only, SHA-256 hash chain ${data?.chain?.ok ? 'verified' : data ? 'BROKEN' : 'checking…'} · kept for 400 days`}
        actions={<button type="button" className="btn" onClick={() => toast('Preparing export', `${list.length} events as CSV.`)}><Icon name="list" />Export CSV</button>}
      />

      <div className="toolbar">
        <div className="inwrap" style={{ width: 'min(420px,100%)' }}>
          <Icon name="search" />
          <label htmlFor="audit-q" className="sr-only">Search events</label>
          <input id="audit-q" className="input mono" style={{ paddingLeft: 32, fontSize: 12.5 }} placeholder="actor:okafor action:approved target:R-029"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="select" aria-label="Actor type" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">Any actor</option><option value="user">People</option><option value="system">AgentShield</option><option value="integration">Integrations</option>
        </select>
        <select className="select" aria-label="Result" value={result} onChange={(e) => setResult(e.target.value)}>
          <option value="all">Any result</option><option value="success">Success</option><option value="failure">Failure</option><option value="denied">Denied</option>
        </select>
      </div>

      <section className="card tcard">
        {isLoading ? <Loading /> : error ? <ErrorState title="Couldn't load the audit log" onRetry={refetch}>{error.message}</ErrorState> : list.length === 0 ? (
          <Empty icon="search" title="No events match this query" action={<button type="button" className="btn" onClick={() => { setQ(''); setResult('all'); setKind('all') }}>Clear query</button>}>
            Check the field names (actor, action, target, result) or remove a filter. Queries ignore case.
          </Empty>
        ) : (
          <div className="scrollx"><div style={{ minWidth: 1000 }}>
            <div className="tr head" style={{ gridTemplateColumns: COLS }}>
              <span /><span className="cell">Time (IST)</span><span className="cell">Event ID</span><span className="cell">Actor</span>
              <span className="cell">Action</span><span className="cell">Target</span><span className="cell">Result</span>
            </div>
            {list.map((e) => (
              <Fragment key={e.id}>
                <div className="tr body" style={{ gridTemplateColumns: COLS, minHeight: 44 }} role="button" tabIndex={0} aria-expanded={open === e.id}
                  onClick={() => setOpen(open === e.id ? null : e.id)} onKeyDown={(k) => k.key === 'Enter' && setOpen(open === e.id ? null : e.id)}>
                  <span className="cell muted">{open === e.id ? '▾' : '▸'}</span>
                  <span className="cell mono small">{fmtTime(e.time)}</span>
                  <span className="cell mono small muted">{e.id}</span>
                  <span className="cell"><span className="ttl" style={{ fontWeight: 400 }}>{e.actor}</span><span className="sub2">{e.kind}</span></span>
                  <span className="cell mono small">{e.action}</span>
                  <span className="cell mono small ttl" style={{ fontWeight: 400 }}>{e.target}</span>
                  <span className="cell"><span className={`badge ${RESULT[e.result]}`}>{e.result}</span></span>
                </div>
                {open === e.id && (
                  <div className="detail-row">
                    <pre className="evb" style={{ borderRadius: 8, border: '1px solid var(--border)' }}>{JSON.stringify({ id: e.id, actor: e.actor, action: e.action, target: e.target, result: e.result, ...e.detail, hash: e.hash, prev_hash: e.prev_hash }, null, 2)}</pre>
                  </div>
                )}
              </Fragment>
            ))}
          </div></div>
        )}
      </section>
    </main>
  )
}
