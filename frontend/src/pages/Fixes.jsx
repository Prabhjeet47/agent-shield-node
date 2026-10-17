import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { Empty, ErrorState, Loading } from '../components/ui/ListState.jsx'
import { PageHead } from '../components/ui/bits.jsx'
import { FIX_STEPS } from '../lib/constants.js'
import { shortHash } from '../lib/format.js'
import { api } from '../api/client.js'
import { useAction, useJob, useRemediations } from '../api/hooks.js'

const VIEWS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'you', label: 'Needs you', test: (f) => f.state === 'approval' || f.state === 'draft' || f.state === 'failed' || f.state === 'pr' },
  { id: 'progress', label: 'In progress', test: (f) => f.state === 'testing' },
  { id: 'done', label: 'Verified', test: (f) => f.state === 'verified' },
]
const NOTE_COLOR = { approval: 'var(--accent-text)', failed: 'var(--crit-t)', verified: 'var(--low-t)' }
const NONE = []

function Progress({ fix }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="fsteps">
        {FIX_STEPS.map((s, i) => {
          const cls = fix.state === 'verified' || i < fix.step ? 'done' : i === fix.step ? (fix.state === 'failed' ? 'bad' : 'now') : ''
          return <i key={s} className={cls} />
        })}
      </div>
      <div className="flabels" style={{ marginTop: 4 }}>{FIX_STEPS.map((l) => <span key={l}>{l}</span>)}</div>
    </div>
  )
}

// Fix lifecycle (blueprint §11): draft → approval → approved → PR + CI → verification.
// Each button calls the API, which enforces the rules (hash-bound approval, no PR before approval).
function useFixActions() {
  const runJob = useJob()
  const submit = useAction((f) => api(`/remediations/${f.id}/submit`, { method: 'POST' }), { success: (r) => ['Sent for approval', `${r.id} is ready for an approver.`] })
  const approve = useAction((f) => api(`/remediations/${f.id}/approve`, { method: 'POST', body: { proposal_hash: f.hash } }), { success: (r) => ['Fix approved', `Bound to ${shortHash(r.hash)}. Editing the diff resets this approval.`] })
  const openPr = useAction((f) => api(`/remediations/${f.id}/pull-requests`, { method: 'POST' }), { success: (r) => ['Pull request opened', `${r.pr} · no auto-merge.`] })
  const verify = (f) => runJob(() => api(`/remediations/${f.id}/verify`, { method: 'POST' }),
    { started: ['Verification started', 'Running negative and positive tests, then recomputing the graph.'], done: (r) => [r.state === 'verified' ? 'Fix verified' : 'Verification failed', r.state === 'verified' ? 'The finding is closed as verified fixed.' : 'The finding was reopened. See what failed.'] })
  return { submit, approve, openPr, verify, busy: submit.isPending || approve.isPending || openPr.isPending }
}

export default function Fixes() {
  const { data, isLoading, error, refetch } = useRemediations()
  const fixes = data?.remediations ?? NONE
  const [view, setView] = useState('all')
  const [openId, setOpenId] = useState(null)
  const actions = useFixActions()
  const list = fixes.filter(VIEWS.find((v) => v.id === view).test)
  const open = fixes.find((f) => f.id === openId)

  const action = (f) => {
    if (f.state === 'approval') return <button type="button" className="btn primary" disabled={actions.busy} onClick={() => actions.approve.mutate(f)}>Approve</button>
    if (f.state === 'draft') return <button type="button" className="btn" onClick={() => setOpenId(f.id)}>Review</button>
    if (f.state === 'pr') return <button type="button" className="btn primary" disabled={actions.busy} onClick={() => actions.openPr.mutate(f)}>Create PR</button>
    if (f.state === 'testing') return <button type="button" className="btn" onClick={() => actions.verify(f)}>Run verification</button>
    if (f.state === 'failed') return <button type="button" className="btn danger" onClick={() => setOpenId(f.id)}>See what failed</button>
    return <button type="button" className="btn ghost" onClick={() => setOpenId(f.id)}>View</button>
  }

  return (
    <main className="content">
      <PageHead title="Fixes" sub="Every fix is reviewed, tested, and only marked done after a passing check." />

      <div className="views" role="tablist" aria-label="Fix views">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" role="tab" aria-selected={view === v.id} className={`view${view === v.id ? ' on' : ''}`} onClick={() => setView(v.id)}>
            {v.label}<span className="n">{fixes.filter(v.test).length}</span>
          </button>
        ))}
      </div>

      {isLoading ? <section className="card tcard"><Loading /></section>
        : error ? <section className="card"><ErrorState title="Couldn't load fixes" onRetry={refetch}>{error.message}</ErrorState></section>
        : list.length === 0 ? <section className="card"><Empty title="Nothing here" icon="check">No fixes in this view right now.</Empty></section>
        : (
          <div className="col" style={{ gap: 12 }}>
            {list.map((f) => (
              <section key={f.id} className="card hov fixrow">
                <div style={{ minWidth: 0 }}>
                  <button type="button" className="linkbtn" style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', fontFamily: 'inherit' }} onClick={() => setOpenId(f.id)}>{f.title}</button>
                  <div className="small muted" style={{ marginTop: 2 }}>
                    <span className="mono">{f.id}</span> · <span className="mono">{f.repo}</span> · solves {f.solves.map((s, i) => <span key={s}>{i ? ', ' : ''}<Link to={`/findings/${s}`} className="mono">{s}</Link></span>)}
                  </div>
                  <div className="small" style={{ marginTop: 8, fontWeight: 600, color: NOTE_COLOR[f.state] ?? 'var(--text-2)' }}>{f.note}</div>
                </div>
                <Progress fix={f} />
                <div className="fixact">{action(f)}</div>
              </section>
            ))}
          </div>
        )}

      {open && <FixPanel fix={open} actions={actions} onClose={() => setOpenId(null)} />}
    </main>
  )
}

function FixPanel({ fix: f, actions, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const run = (mutation) => mutation.mutate(f, { onSuccess: onClose })

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="side" role="dialog" aria-modal="true" aria-label={f.title}>
        <div className="dsec dhead">
          <div style={{ minWidth: 0 }}><div className="small muted mono">{f.id} · {f.repo}</div><div className="h2">{f.title}</div></div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="dscroll">
          <Progress fix={f} />
          {f.failure && <div className="note warn"><Icon name="alert" /><div><b>What failed</b>{f.failure}</div></div>}
          <div>
            <p className="flabel">Proposed change</p>
            <div className="evc">
              <div className="evh"><span className="mono">{f.file}</span><span className="small mono" title={f.hash}>{shortHash(f.hash)}</span></div>
              <pre className="evb">{f.diff.map(([sign, text], i) => (
                <span key={i} className={sign === '+' ? 'add' : sign === '-' ? 'del' : ''} style={{ display: 'block' }}>{sign} {text}</span>
              ))}</pre>
            </div>
          </div>
          <dl className="facts" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div><dt>Expected effect</dt><dd>{f.effect}</dd></div>
            <div><dt>Risk of change</dt><dd>{f.risk}</dd></div>
            <div><dt>Proposed by</dt><dd>{f.proposedBy} · {f.age}</dd></div>
            <div><dt>Approved by</dt><dd>{f.approvedBy ?? 'Not yet'}</dd></div>
            <div><dt>Pull request</dt><dd className="mono">{f.pr ?? '—'}</dd></div>
            <div><dt>Attack path</dt><dd>{f.path ? <Link to={`/graph?path=${f.path}`}>{f.path}</Link> : '—'}</dd></div>
          </dl>
          <div>
            <p className="flabel">Verification</p>
            <ul className="checks">
              {f.checks.map(([state, name, detail]) => (
                <li key={name}>
                  <span className={`cic ${state === 'run' ? 'wait' : state}`}>{state === 'pass' ? '✓' : state === 'fail' ? '✕' : state === 'run' ? '◔' : '…'}</span>
                  <div><div style={{ fontWeight: 500 }}>{name}</div><div className="small muted">{detail}</div></div>
                  <span className="badge b-neu">{state === 'run' ? 'Running' : state === 'wait' ? 'Waiting' : state === 'pass' ? 'Passed' : 'Failed'}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="small muted" style={{ margin: 0 }}>Approval is tied to this exact diff. Propose, approve, merge and verify are separate permissions, and AgentShield never merges on its own.</p>
        </div>
        <div className="dfoot">
          <button type="button" className="btn" onClick={onClose}>Close</button>
          {f.state === 'draft' && <button type="button" className="btn primary" onClick={() => run(actions.submit)}>Send for approval</button>}
          {f.state === 'approval' && <button type="button" className="btn primary" onClick={() => run(actions.approve)}>Approve</button>}
          {f.state === 'pr' && <button type="button" className="btn primary" onClick={() => run(actions.openPr)}>Create PR</button>}
          {(f.state === 'testing' || f.state === 'failed') && <button type="button" className="btn primary" onClick={() => { actions.verify(f); onClose() }}>{f.state === 'failed' ? 'Re-run verification' : 'Run verification'}</button>}
        </div>
      </aside>
    </>
  )
}
