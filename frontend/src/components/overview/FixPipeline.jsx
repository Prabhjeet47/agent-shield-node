import { Link } from 'react-router-dom'
import { api } from '../../api/client.js'
import { useAction } from '../../api/hooks.js'
import { FIX_STEPS } from '../../lib/constants.js'

const cls = (r, i) => (r.state === 'verified' || i < r.step ? 'done' : i === r.step ? (r.state === 'failed' ? 'bad' : 'now') : '')

export default function FixPipeline({ fixes }) {
  const approve = useAction((r) => api(`/remediations/${r.id}/approve`, { method: 'POST', body: { proposal_hash: r.hash } }),
    { success: ['Fix approved', 'Editing the diff will reset this approval.'] })
  return (
    <section className="card" aria-labelledby="fx-h">
      <div className="ch">
        <div>
          <h2 className="h2" id="fx-h">Fix pipeline</h2>
          <div className="small muted">A finding closes only after its checks pass</div>
        </div>
        <Link to="/fixes">All fixes</Link>
      </div>
      <div className="fixes wide">
        {fixes.map((r) => (
          <div key={r.id} className="fix">
            <div className="frow"><span className="t">{r.title}</span></div>
            <div className="frow"><span className="mono">{r.repo}</span><span className="mono">·</span><span className="mono">{r.pr ?? r.id}</span></div>
            <div>
              <div className="fsteps">{FIX_STEPS.map((s, i) => <i key={s} className={cls(r, i)} />)}</div>
              <div className="flabels" style={{ marginTop: 4 }}>{FIX_STEPS.map((l) => <span key={l}>{l === 'Pull request' ? 'PR' : l}</span>)}</div>
            </div>
            <div className="frow">
              <span className="small" style={{ color: r.state === 'failed' ? 'var(--crit-t)' : 'var(--text-2)' }}>{r.note}</span>
              <span className="spacer" />
              {r.state === 'approval' && (
                <>
                  <button type="button" className="btn sm primary" disabled={approve.isPending} onClick={() => approve.mutate(r)}>Approve</button>
                  <Link to="/fixes" className="btn sm ghost">Review diff</Link>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
