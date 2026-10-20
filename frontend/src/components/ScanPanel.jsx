import { api, p } from '../api/client.js'
import { useJob, useScans } from '../api/hooks.js'

// Scans are the source of every finding in live mode: read repos → build the graph →
// derive findings. This panel starts one and shows recent history.
export default function ScanPanel() {
  const { data, isLoading, error } = useScans()
  const run = useJob()
  const scans = data?.scans ?? []
  const busy = !!data?.running

  const start = () => run(() => api(p('/scans'), { method: 'POST', body: { reason: 'manual' } }), {
    started: ['Scan started', 'Reading repositories and rebuilding the graph.'],
    done: (r) => ['Scan finished', `${r?.findings ?? 0} finding(s), ${r?.paths ?? 0} attack path(s).`],
  })

  if (error?.code === 'demo_mode') return null
  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <div className="ch">
        <div>
          <h2 className="h2">Scans</h2>
          <div className="small muted">Each scan reads agent configs, workflows and manifests, rebuilds the graph and re-derives findings.</div>
        </div>
        <button type="button" className="btn primary" onClick={start} disabled={busy}>{busy ? 'Scanning…' : 'Scan now'}</button>
      </div>
      {isLoading ? <div className="small muted">Loading…</div> : scans.length === 0 ? (
        <div className="small muted">No scans yet. Connect a repository or keep the bundled sample enabled, then scan.</div>
      ) : (
        <div className="scrollx">
          <table className="mx">
            <thead><tr><th>Scan</th><th>Finished</th><th>Repositories</th><th>Findings</th><th>Paths</th><th>Notes</th></tr></thead>
            <tbody>
              {scans.slice(0, 8).map((s) => (
                <tr key={s.id}>
                  <td className="mono">{s.label}</td>
                  <td>{new Date(s.finishedAt).toLocaleString()}</td>
                  <td className="mono small">{s.commits}</td>
                  <td>{s.counts?.findings ?? 0}</td>
                  <td>{s.counts?.paths ?? 0}</td>
                  <td className="small muted">{[s.reason, s.advisoryError, ...(s.issues ?? []).map((i) => i.message)].filter(Boolean).join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
