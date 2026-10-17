import { useMemo, useState } from 'react'
import { api, p as projectPath } from '../api/client.js'
import { useAction, usePolicies } from '../api/hooks.js'
import { ErrorState, Loading } from '../components/ui/ListState.jsx'
import Icon from '../components/Icon.jsx'
import { useToast } from '../components/layout/Toast.jsx'
import { PageHead } from '../components/ui/bits.jsx'


const VERDICT = {
  fail: ['fail', 'Would fail the CI check'],
  warn: ['warn', 'Would pass with a warning'],
  monitor: ['monitor', 'Would record a finding only'],
}

export default function Policies() {
  const { data, isLoading, error, refetch } = usePolicies()
  if (isLoading) return <main className="content"><h1>Policies</h1><section className="card tcard"><Loading /></section></main>
  if (error) return <main className="content"><h1>Policies</h1><section className="card"><ErrorState title="Couldn't load policies" onRetry={refetch}>{error.message}</ErrorState></section></main>
  return <PolicyEditor {...data} />
}

function PolicyEditor({ policies, SAMPLES, FIELDS, OPS, MODES }) {
  const toast = useToast()
  const [selId, setSelId] = useState(policies[0].id)
  const saved = policies.find((p) => p.id === selId) ?? policies[0]
  const [draft, setDraft] = useState(saved)
  const [sample, setSample] = useState(Object.keys(SAMPLES)[0])
  const [input, setInput] = useState(SAMPLES[Object.keys(SAMPLES)[0]])
  const [test, setTest] = useState(null)
  const create = useAction(() => api(projectPath('/policies'), { method: 'POST' }))
  const saveMut = useAction((d) => api(`/policies/${d.id}`, { method: 'PUT', body: d }), { success: (p) => ['Policy saved', `${p.name} v${p.version} applies from the next scan. Earlier versions stay available for rollback.`] })
  const toggleMut = useAction(({ id, on }) => api(`/policies/${id}/enabled`, { method: 'POST', body: { on } }), { success: (p) => [p.on ? 'Policy turned on' : 'Policy turned off', p.on ? 'Runs on the next scan and pull request.' : 'Scans no longer evaluate this check.'] })
  const testMut = useAction(({ id, draft: d, input: text }) => api(`/policies/${id}/test`, { method: 'POST', body: { draft: d, input: text } }))
  const strip = ({ history, ...rest }) => rest // eslint-disable-line no-unused-vars
  const dirty = JSON.stringify(strip(draft)) !== JSON.stringify(strip(saved))
  const active = policies.filter((p) => p.on).length

  const select = (p) => { setSelId(p.id); setDraft(p); setTest(null) }
  const setCond = (i, patch) => setDraft((d) => ({ ...d, conditions: d.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) }))
  const toggleOn = (p) => toggleMut.mutate({ id: p.id, on: !p.on }, { onSuccess: (res) => { if (p.id === selId) setDraft((d) => ({ ...d, on: res.on })) } })
  const save = () => saveMut.mutate(draft, { onSuccess: (res) => setDraft(res) })
  const run = () => testMut.mutate({ id: draft.id, draft, input }, { onSuccess: setTest })
  const verdict = useMemo(() => (test ? (test.triggered ? VERDICT[draft.mode] : ['pass', 'Would pass']) : null), [test, draft.mode])

  return (
    <main className="content">
      <PageHead
        title="Policies"
        sub={`${active} of ${policies.length} checks on · run on every scan and as a GitHub check on pull requests`}
        actions={<button type="button" className="btn primary" disabled={create.isPending} onClick={() => create.mutate(undefined, { onSuccess: select })}>New policy</button>}
      />

      <div className="split">
        <section className="card polist" aria-label="Policies">
          {policies.map((p) => (
            <div key={p.id} className={`poitem${p.id === selId ? ' sel' : ''}`} onClick={() => select(p)} role="button" tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && select(p)}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 500 }}>{p.name}</div>
                <div className="small muted">{p.desc}</div>
                <div className="pt" style={{ marginTop: 8 }}>
                  <span className={`badge ${p.mode === 'fail' ? 'b-crit' : p.mode === 'warn' ? 'b-med' : 'b-acc'}`}>{MODES[p.mode]}</span>
                  <span className="small muted mono">v{p.version}</span>
                </div>
              </div>
              <button type="button" className={`toggle${p.on ? ' on' : ''}`} aria-pressed={p.on} aria-label={`${p.on ? 'Turn off' : 'Turn on'} ${p.name}`}
                onClick={(e) => { e.stopPropagation(); toggleOn(p) }} />
            </div>
          ))}
        </section>

        <div className="col">
          <section className="card">
            <div className="ch">
              <div style={{ minWidth: 0, flex: 1 }}>
                <label htmlFor="pol-name" className="sr-only">Policy name</label>
                <input id="pol-name" className="input" style={{ fontSize: 16, fontWeight: 600, height: 38 }} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                <div className="small muted mono" style={{ marginTop: 6 }}>{draft.id} · v{saved.version} · edited {saved.edited}</div>
              </div>
              <div className="seg" role="group" aria-label="Mode">
                {Object.entries(MODES).map(([k, label]) => (
                  <button key={k} type="button" className={`m-${k}${draft.mode === k ? ' on' : ''}`} onClick={() => setDraft({ ...draft, mode: k })}>{label}</button>
                ))}
              </div>
            </div>

            <p className="flabel">Conditions · all must match</p>
            <div className="rules">
              {draft.conditions.map((c, i) => (
                <div key={i} className="rule">
                  <span className="kw">{i === 0 ? 'IF' : 'AND'}</span>
                  <select className="select" aria-label="Field" value={c.field} onChange={(e) => setCond(i, { field: e.target.value })}>{FIELDS.map((f) => <option key={f}>{f}</option>)}</select>
                  <select className="select op" aria-label="Operator" value={c.op} onChange={(e) => setCond(i, { op: e.target.value })}>{OPS.map((o) => <option key={o}>{o}</option>)}</select>
                  <input className="input mono val" aria-label="Value" value={c.value} onChange={(e) => setCond(i, { value: e.target.value })} />
                  <button type="button" className="iconbtn" aria-label="Remove condition" disabled={draft.conditions.length === 1}
                    onClick={() => setDraft((d) => ({ ...d, conditions: d.conditions.filter((_, j) => j !== i) }))}>✕</button>
                </div>
              ))}
            </div>
            <button type="button" className="btn sm ghost" style={{ marginTop: 8 }}
              onClick={() => setDraft((d) => ({ ...d, conditions: [...d.conditions, { field: 'Workflow file', op: 'contains', value: '' }] }))}>+ Add condition</button>

            <div className="then">
              <span className="kw" style={{ width: 56 }}>THEN</span>
              <span>{draft.mode === 'fail' ? 'Fail the AgentShield check on the pull request' : draft.mode === 'warn' ? 'Pass the check with a warning' : 'Record a finding only'}</span>
              <span className="muted">for</span>
              <select className="select" aria-label="Scope" value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value })}>
                <option value="all">All repositories (3)</option>
                <option value="production">Production repositories (2)</option>
              </select>
            </div>

            <div className="sbar" style={{ marginTop: 18 }}>
              <span className="small muted">{dirty ? 'Unsaved changes. Saving creates a new version; old versions stay available for rollback.' : 'No changes'}</span>
              <div className="acts">
                <button type="button" className="btn" disabled={!dirty} onClick={() => { setDraft(saved); toast('Changes discarded', '') }}>Discard</button>
                <button type="button" className="btn primary" disabled={!dirty} onClick={save}>Save as v{saved.version + 1}</button>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="ch"><div><h2 className="h2">Test panel</h2><div className="small muted">Check a file against this draft. Nothing is saved or sent.</div></div></div>
            <div className="field">
              <label htmlFor="pol-sample">Sample</label>
              <select id="pol-sample" className="select" value={sample} onChange={(e) => { setSample(e.target.value); setInput(SAMPLES[e.target.value]); setTest(null) }}>
                {Object.keys(SAMPLES).map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="pol-input">File contents</label>
              <textarea id="pol-input" className="ta mono" style={{ minHeight: 180, fontSize: 12 }} value={input} onChange={(e) => { setInput(e.target.value); setTest(null) }} />
            </div>
            <div className="acts" style={{ margin: '12px 0' }}>
              <button type="button" className="btn primary" onClick={run}><Icon name="check" />Run test</button>
            </div>
            {test ? (
              <div className="result" role="status">
                <div className={`rh ${verdict[0]}`}><span>{verdict[1]}</span><span className="small mono">evaluated by the API</span></div>
                {test.results.map((r, i) => (
                  <div key={i} className="cond">
                    <span className={r.hit ? 'ok' : 'no'}>{r.hit ? '✓' : '○'}</span>
                    <span>{r.field} <b>{r.op}</b> <span className="mono">{r.value || '(empty)'}</span></span>
                    {r.error && <span className="badge b-crit">{r.error}</span>}
                  </div>
                ))}
              </div>
            ) : <p className="small muted" style={{ margin: 0 }}>Run a test to see which conditions match and what the check would report.</p>}
          </section>
        </div>
      </div>
    </main>
  )
}
