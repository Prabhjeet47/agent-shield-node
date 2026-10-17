import { useNavigate } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { api, p } from '../api/client.js'
import { useJob, useOverview } from '../api/hooks.js'
import { useToast } from '../components/layout/Toast.jsx'
import { ErrorState, Loading } from '../components/ui/ListState.jsx'
import KpiCards from '../components/overview/KpiCards.jsx'
import FindingsOverTime from '../components/overview/FindingsOverTime.jsx'
import PathValidation from '../components/overview/PathValidation.jsx'
import TopAttackPaths from '../components/overview/TopAttackPaths.jsx'
import TopRiskyAgents from '../components/overview/TopRiskyAgents.jsx'
import AgentGraph from '../components/overview/AgentGraph.jsx'
import RecentActivity from '../components/overview/RecentActivity.jsx'
import FixPipeline from '../components/overview/FixPipeline.jsx'

export default function Overview() {
  const navigate = useNavigate()
  const toast = useToast()
  const runJob = useJob()
  const { data, isLoading, error, refetch } = useOverview()

  if (isLoading) return <main className="content"><h1>Overview</h1><section className="card tcard"><Loading rows={8} /></section></main>
  if (error) return <main className="content"><h1>Overview</h1><section className="card"><ErrorState title="Couldn't load the overview" onRetry={refetch}>{error.message}. Is the API running on port 4000?</ErrorState></section></main>

  const { project } = data
  const investigate = () => runJob(() => api(p('/investigations'), { method: 'POST', body: { goal: 'Find validated paths from agent tools or workflow permissions to restricted resources', max_hops: 5, max_paths: 20 } }),
    { started: ['Investigation queued', 'The investigation agent is walking agent → tool → permission → resource paths.'], done: (r) => ['Investigation complete', `${r.paths.length} paths checked: ${r.paths.map((x) => x.state.replace('_', ' ')).join(', ')}.`] })

  return (
    <main className="content">
      <div className="ph">
        <div>
          <h1>Overview</h1>
          <p className="sub">{project.repos} repositories · {project.agents} coding agents · graph updated {project.graphUpdated}</p>
        </div>
        <div className="acts">
          <button type="button" className="btn" onClick={() => navigate('/graph')}><Icon name="graph" />Open graph</button>
          <button type="button" className="btn primary" onClick={investigate}><Icon name="investigate" />Run investigation</button>
        </div>
      </div>

      {project.stale && (
        <div className="notice" role="status">
          <Icon name="clock" size={18} />
          <span><b>{project.stale.repo}</b> hasn't synced for {project.stale.hours} hours. Paths through it may be out of date.</span>
          <button type="button" className="btn sm" onClick={() => toast('Resync started', `${project.stale.repo} is being re-scanned.`)}>
            <Icon name="sync" size={14} />Resync
          </button>
        </div>
      )}

      <KpiCards kpis={data.kpis} />
      <div className="g21"><FindingsOverTime history={data.history} /><PathValidation validation={data.validation} /></div>
      <div className="g21"><TopAttackPaths paths={data.topPaths} /><TopRiskyAgents agents={data.topAgents} /></div>
      <div className="g21"><AgentGraph graph={data.neighbourhood} /><RecentActivity /></div>
      <FixPipeline fixes={data.fixes} />
      <p className="small muted" style={{ margin: 0, textAlign: 'center' }}>Data from /api/v1 (sample project). AI results come from the AI service, or replay mode when it isn't configured.</p>
    </main>
  )
}
