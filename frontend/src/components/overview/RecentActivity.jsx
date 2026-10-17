import { Link } from 'react-router-dom'
import { useAudit } from '../../api/hooks.js'
import { describeEvent, timeAgo } from '../../lib/format.js'

const COLOR = { success: 'var(--accent)', failure: 'var(--crit)', denied: 'var(--high)' }

export default function RecentActivity() {
  const { data } = useAudit()
  const events = data?.events.slice(0, 5) ?? []
  return (
    <section className="card" aria-labelledby="ac-h">
      <div className="ch">
        <h2 className="h2" id="ac-h">Recent activity</h2>
        <Link to="/audit">Audit log</Link>
      </div>
      <ul className="feed">
        {events.map((e) => (
          <li key={e.id}>
            <span className="fdot" style={{ background: e.kind === 'integration' ? 'var(--low)' : COLOR[e.result] }} />
            <span><span className="who">{e.actor}</span> <span className="what">{describeEvent(e.action)}</span> <code>{e.target}</code></span>
            <span className="small muted">{timeAgo(e.time)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
