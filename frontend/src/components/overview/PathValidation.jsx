const TONE = { accent: 'var(--accent)', med: 'var(--med)', neutral: 'var(--border-strong)' }

export default function PathValidation({ validation }) {
  const all = validation.states.reduce((sum, s) => sum + s.count, 0) || 1
  return (
    <section className="card" aria-labelledby="pv-h">
      <div className="ch">
        <h2 className="h2" id="pv-h">Path validation</h2>
        <span className="badge b-neu">{validation.edges} edges</span>
      </div>
      <div className="vstates">
        {validation.states.map((s) => (
          <div key={s.label} className="vrow">
            <span>{s.label}</span><b>{s.count}</b>
            <div className="bar"><span style={{ width: `${(s.count / all) * 100}%`, background: TONE[s.tone] }} /></div>
          </div>
        ))}
      </div>
      <div className="vnote">
        <b style={{ color: 'var(--text)' }}>{validation.withEvidence} of {validation.edges} edges</b> have evidence:
        a workflow file, a scanner result or a sandbox test. Connected doesn't mean exploitable until a step is checked.
      </div>
    </section>
  )
}
