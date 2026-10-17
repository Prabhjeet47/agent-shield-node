import { Fragment, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, p } from '../api/client.js'
import { useAction, useFinding, useJob, useRemediation } from '../api/hooks.js'
import { ErrorState, Loading } from '../components/ui/ListState.jsx'
import { shortHash } from '../lib/format.js'
import Icon from '../components/Icon.jsx'
import { Empty } from '../components/ui/ListState.jsx'
import { Owner, Severity, Status, Tabs } from '../components/ui/bits.jsx'
import { STATUS } from '../lib/status.js'
import { SEV } from '../lib/constants.js'

// verified_fixed is set by the verifier, never by hand.
const MANUAL = ['open', 'investigating', 'in_remediation', 'pending_verification', 'accepted_risk', 'false_positive']

export default function FindingDetail() {
  const { id } = useParams()
  const { data: base, isLoading, error, refetch } = useFinding(id)
  if (isLoading) return <main className="content"><section className="card tcard"><Loading rows={6} /></section></main>
  if (error && error.status !== 404) return <main className="content"><section className="card"><ErrorState title="Couldn't load this finding" onRetry={refetch}>{error.message}</ErrorState></section></main>
  if (!base) {
    return (
      <main className="content">
        <Empty icon="alert" title="Finding not found" action={<Link className="btn" to="/findings">Back to findings</Link>}>
          {id} doesn't exist in this project, or you don't have access to it.
        </Empty>
      </main>
    )
  }
  return <Detail base={base} />
}

const ME = 'S. Shruti' // until login exists; the API acts as the dev user

function Detail({ base: f }) {
  const runJob = useJob()
  const [tab, setTab] = useState('overview')
  const [pendingRisk, setPendingRisk] = useState(false)
  const [draft, setDraft] = useState('')
  const { status, owner } = f
  const fix = useRemediation(f.fix).data
  const patch = useAction((body) => api(`/findings/${f.id}`, { method: 'PATCH', body }),
    { success: (res, body) => body.status ? ['Status updated', `${f.id} is now ${STATUS[res.status].label.toLowerCase()}.`] : body.owner ? ['Assigned to you', f.id] : ['Comment added', ''] })
  const approve = useAction(() => api(`/remediations/${fix.id}/approve`, { method: 'POST', body: { proposal_hash: fix.hash } }), { success: ['Fix approved', 'You can now open the pull request.'] })
  const openPr = useAction(() => api(`/remediations/${fix.id}/pull-requests`, { method: 'POST' }), { success: (r) => ['Pull request opened', `${r.pr} · CI checks starting. No auto-merge.`] })
  const approved = !!fix?.approvedBy
  const investigate = () => runJob(() => api(p('/investigations'), { method: 'POST', body: { finding_id: f.id, goal: `Paths for ${f.id}` } }),
    { started: ['Investigation queued', `Looking for paths through ${f.repo}.`], done: (r) => ['Investigation complete', r.paths.length ? r.paths.map((x) => `${x.title}: ${x.state.replace('_', ' ')}`).join(' · ') : 'No path reaches a sensitive resource.'] })
  const proposeFix = () => runJob(() => api(`/findings/${f.id}/remediations`, { method: 'POST' }),
    { started: ['Drafting a fix', 'The remediation planner is preparing a scoped change.'], done: (r) => ['Fix drafted', `${r.remediation_id} is ready for review.`] })

  function changeStatus(next) {
    if (next === 'accepted_risk') { setPendingRisk(true); return }
    if (next === 'false_positive') { patch.mutate({ status: next, rationale: 'Marked as a false positive from the finding page.' }); return }
    patch.mutate({ status: next })
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'path', label: 'Attack path' },
    { id: 'evidence', label: 'Evidence', count: f.evidence.length },
    { id: 'fix', label: 'Fix' },
    { id: 'verify', label: 'Verification' },
    { id: 'activity', label: 'Activity', count: f.activity.length },
  ]

  return (
    <main className="content">
      <div className="ph">
        <div style={{ minWidth: 0 }}>
          <nav className="crumbs" aria-label="Breadcrumb"><Link to="/findings">Findings</Link><span>/</span><span className="mono">{f.id}</span></nav>
          <div className="pt" style={{ margin: '10px 0 6px' }}>
            <Severity value={f.sev} />
            <span className="badge b-neu">{f.detection}</span>
            {f.path && <span className="badge b-acc">{f.path}</span>}
          </div>
          <h1>{f.title}</h1>
          <p className="sub">
            Found {f.age} day{f.age === 1 ? '' : 's'} ago · <span className="mono">{f.repo}</span>{f.agent && <> · agent <span className="mono">{f.agent}</span></>}
          </p>
        </div>
        <div className="acts">
          {owner !== ME && <button type="button" className="btn" onClick={() => patch.mutate({ owner: ME })}>Assign to me</button>}
          {f.path && <Link className="btn" to={`/graph?path=${f.path}`}><Icon name="graph" />Open in graph</Link>}
          <label htmlFor="status" className="sr-only">Status</label>
          <select id="status" className="select" value={status} onChange={(e) => changeStatus(e.target.value)}>
            {Object.entries(STATUS).map(([k, s]) => (
              <option key={k} value={k} disabled={!MANUAL.includes(k)}>{s.label}{k === 'verified_fixed' ? ' (set by verification)' : ''}</option>
            ))}
          </select>
        </div>
      </div>

      {pendingRisk && <AcceptRisk onCancel={() => setPendingRisk(false)}
        onSave={(why, until) => patch.mutate({ status: 'accepted_risk', rationale: why, expires: until }, { onSuccess: () => setPendingRisk(false) })} />}

      <Tabs tabs={tabs} value={tab} onChange={setTab} label="Finding sections" />

      {tab === 'overview' && (
        <div className="g12">
          <div className="col">
            <section className="card">
              <h2 className="h2" style={{ marginBottom: 10 }}>Summary</h2>
              <p style={{ margin: 0, color: 'var(--text-2)', lineHeight: 1.65, maxWidth: '72ch' }}>{f.summary}</p>
              <div className="note warn" style={{ marginTop: 16 }}>
                <Icon name="alert" />
                <div><b>Possible impact</b>{f.impact}</div>
              </div>
            </section>
            <section className="card">
              <h2 className="h2" style={{ marginBottom: 14 }}>Details</h2>
              <dl className="facts">
                <div><dt>Status</dt><dd><Status value={status} /></dd></div>
                <div><dt>Owner</dt><dd><Owner name={owner} /></dd></div>
                <div><dt>Repository</dt><dd className="mono">{f.repo}</dd></div>
                <div><dt>Agent</dt><dd className="mono">{f.agent ?? '—'}</dd></div>
                <div><dt>Detection</dt><dd>{f.detection}</dd></div>
                <div><dt>First seen</dt><dd>{f.age} days ago · scan #{214 - f.age}</dd></div>
                <div><dt>Last seen</dt><dd>Scan #214 · 4 min ago</dd></div>
                <div><dt>Linked fix</dt><dd className="mono">{f.fix ?? '—'}</dd></div>
              </dl>
            </section>
          </div>
          <section className="card">
            <div className="ch"><h2 className="h2">Risk score</h2><span className={`badge ${SEV[f.sev].cls}`}>{SEV[f.sev].label}</span></div>
            <div className="sv" style={{ fontSize: 36, lineHeight: '44px' }}>{f.score || '—'}<small className="muted" style={{ fontSize: 14 }}> / 100</small></div>
            <div className="small muted" style={{ margin: '4px 0 16px' }}>Confidence: <b style={{ color: 'var(--text)' }}>{f.confidence}</b></div>
            <div className="vstates">
              {f.factors.map(([label, v]) => (
                <div key={label} className="vrow">
                  <span className="small">{label}</span><b className="small">{Math.round(v * 100)}%</b>
                  <div className="bar"><span style={{ width: `${v * 100}%`, background: 'var(--accent)' }} /></div>
                </div>
              ))}
            </div>
            <div className="vnote">The score is computed from these stored factors. An AI hypothesis never sets the score or severity.</div>
          </section>
        </div>
      )}

      {tab === 'path' && (
        <section className="card">
          <div className="ch">
            <div><h2 className="h2">Attack path</h2><div className="small muted">{f.path ? `${f.path} · ${f.steps?.length ?? 0} steps` : 'No graph path linked'}</div></div>
            {f.path && <Link to={`/graph?path=${f.path}`}>Open in graph</Link>}
          </div>
          {f.steps ? (
            <>
              <div className="fchain">
                {f.steps.map(([kind, name, sens], i) => (
                  <Fragment key={i}>
                    <div className={`fnode${sens ? ' sens' : ''}`}>
                      <span className="fnum">{i + 1}</span>
                      <div className="fbox"><em>{kind}</em><span>{name}</span></div>
                    </div>
                    {i < f.steps.length - 1 && (
                      <div className={`flink ${f.links[i][1]}`}><span>{f.links[i][0]}</span><i /></div>
                    )}
                  </Fragment>
                ))}
              </div>
              <div className="note ok" style={{ marginTop: 16 }}>
                <Icon name="check" />
                <div><b>Every step has evidence</b>Three steps come from workflow files and one from a sandbox test. See the Evidence tab.</div>
              </div>
            </>
          ) : (
            <Empty icon="graph" title="No path for this finding" action={<button type="button" className="btn" onClick={investigate}>Run investigation</button>}>
              This finding came from {f.detection.toLowerCase()} analysis. Run an investigation to check whether it connects to a restricted resource.
            </Empty>
          )}
        </section>
      )}

      {tab === 'evidence' && (
        <section className="card">
          <div className="ch"><div><h2 className="h2">Evidence</h2><div className="small muted">Source facts first. AI hypotheses are labelled and never used for scoring.</div></div></div>
          {f.evidence.map((ev, i) => (
            <div key={i} className="evc">
              <div className="evh">
                <span><b style={{ color: 'var(--text)' }}>{ev.type}</b> · <span className="mono">{ev.source}</span></span>
                <span className={`badge ${ev.hypothesis ? 'b-med' : 'b-acc'}`}>{ev.trust}</span>
              </div>
              <pre className="evb">{ev.code.map(([ln, text, hot]) => (
                <span key={ln} style={{ display: 'block' }}><span className="ln">{ln}</span>{hot ? <mark>{text}</mark> : text}</span>
              ))}</pre>
              <div className="evm"><span>Supports: <b style={{ color: 'var(--text-2)' }}>{ev.claim}</b></span><span>{ev.when}</span><span className="mono">{ev.hash}</span></div>
            </div>
          ))}
        </section>
      )}

      {tab === 'fix' && (
        fix ? (
          <div className="g12">
            <section className="card">
              <div className="ch"><div><h2 className="h2">Proposed fix · <span className="mono">{fix.id}</span></h2><div className="small muted">{fix.title}</div></div></div>
              <div className="evc">
                <div className="evh"><span className="mono">{fix.file}</span><span className="small mono">{shortHash(fix.hash)}</span></div>
                <pre className="evb">{fix.diff.map(([sign, text], i) => (
                  <span key={i} className={sign === '+' ? 'add' : sign === '-' ? 'del' : ''} style={{ display: 'block' }}>{sign} {text}</span>
                ))}</pre>
              </div>
              <dl className="facts" style={{ marginTop: 16 }}>
                <div><dt>Expected effect</dt><dd>{fix.effect}</dd></div>
                <div><dt>Risk of change</dt><dd>{fix.risk}</dd></div>
                <div><dt>Status</dt><dd>{fix.note}</dd></div>
                <div><dt>Pull request</dt><dd className="mono">{fix.pr ?? '—'}</dd></div>
              </dl>
            </section>
            <section className="card">
              <h2 className="h2" style={{ marginBottom: 12 }}>Approval</h2>
              {approved ? (
                <div className="note ok"><Icon name="check" /><div><b>Approved by {fix.approvedBy}</b>Bound to <span className="mono">{shortHash(fix.hash)}</span>. Any change to the diff resets this approval.</div></div>
              ) : (
                <div className="note info"><Icon name="lock" /><div><b>{fix.state === 'draft' ? 'Draft' : 'Needs approval'}</b>Approving binds to proposal hash <span className="mono">{shortHash(fix.hash)}</span>, this repo and branch.</div></div>
              )}
              <div className="acts" style={{ marginTop: 16 }}>
                {fix.state === 'approval' && <button type="button" className="btn primary" disabled={approve.isPending} onClick={() => approve.mutate()}>Approve fix</button>}
                {fix.state === 'draft' && <Link className="btn primary" to="/fixes">Review in Fixes</Link>}
                <button type="button" className="btn" disabled={fix.state !== 'pr' || openPr.isPending} onClick={() => openPr.mutate()}>Create pull request</button>
              </div>
              <p className="small muted" style={{ marginTop: 14 }}>Propose, approve, apply and verify are separate permissions. AgentShield never merges on its own.</p>
            </section>
          </div>
        ) : (
          <section className="card">
            <Empty icon="wrench" title="No fix proposed yet" action={<button type="button" className="btn primary" onClick={proposeFix}>Propose a fix</button>}>
              The remediation planner drafts a scoped change for this finding. It needs approval before a pull request is opened.
            </Empty>
          </section>
        )
      )}

      {tab === 'verify' && (
        <section className="card">
          <div className="ch"><div><h2 className="h2">Verification</h2><div className="small muted">A finding closes as verified fixed only when every check passes.</div></div></div>
          <ul className="checks">
            {(fix?.checks ?? f.checks).map(([state, name, detail, when]) => (
              <li key={name}>
                <span className={`cic ${state}`}>{state === 'pass' ? '✓' : state === 'fail' ? '✕' : '…'}</span>
                <div><div style={{ fontWeight: 500 }}>{name}</div><div className="small muted">{detail}</div></div>
                <span className="badge b-neu">{when ?? (state === 'pass' ? 'Passed' : state === 'fail' ? 'Failed' : 'Waiting')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'activity' && (
        <section className="card">
          <h2 className="h2" style={{ marginBottom: 16 }}>Activity</h2>
          <ul className="tline">
            {f.activity.map(([when, who, what], i) => (
              <li key={i}><span className="tdot" /><b>{who}</b> <span style={{ color: 'var(--text-2)' }}>{what}</span><div className="small muted">{when}</div></li>
            ))}
          </ul>
          <form style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}
            onSubmit={(e) => { e.preventDefault(); if (!draft.trim()) return; patch.mutate({ comment: draft.trim() }, { onSuccess: () => setDraft('') }) }}>
            <label htmlFor="comment" className="small muted">Add a comment</label>
            <textarea id="comment" className="ta" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Notes for the team. Saved to the audit log." />
            <div><button type="submit" className="btn primary" disabled={!draft.trim()}>Comment</button></div>
          </form>
        </section>
      )}
    </main>
  )
}

function AcceptRisk({ onCancel, onSave }) {
  const [why, setWhy] = useState('')
  const [until, setUntil] = useState('2027-01-15')
  return (
    <section className="card" style={{ borderColor: 'rgba(234,179,8,.4)' }}>
      <h2 className="h2">Accept this risk</h2>
      <p className="small muted" style={{ margin: '4px 0 14px' }}>Accepted risk is not the same as fixed. It needs a reason and a review date, and it is recorded in the audit log.</p>
      <div className="form">
        <div className="field"><label htmlFor="why">Reason</label><textarea id="why" className="ta" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why is this acceptable for now?" /></div>
        <div className="field"><label htmlFor="until">Review by</label><input id="until" type="date" className="input" value={until} onChange={(e) => setUntil(e.target.value)} /></div>
      </div>
      <div className="acts" style={{ marginTop: 14 }}>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn primary" disabled={why.trim().length < 10 || !until} onClick={() => onSave(why.trim(), until)}>Accept risk</button>
      </div>
    </section>
  )
}
