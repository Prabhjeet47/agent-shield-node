function SegBar({ parts, label }) {
  return (
    <div className="segbar" aria-label={label}>
      {parts.filter(([n]) => n > 0).map(([flex, color], i) => <i key={i} style={{ flex, background: color }} />)}
    </div>
  )
}

export default function KpiCards({ kpis }) {
  const { bySeverity: s, paths, fixes } = kpis
  return (
    <section className="kpis" aria-label="Key figures">
      <div className="card hov">
        <div className="kl">Open findings<span className="badge b-neu">{kpis.openFindings}</span></div>
        <div className="kv">{kpis.openFindings}</div>
        <div className="kf">{s.crit} critical · {s.high} high · {s.med} medium · {s.low} low</div>
        <SegBar label={`${s.crit} critical, ${s.high} high, ${s.med} medium, ${s.low} low`}
          parts={[[s.crit, 'var(--crit)'], [s.high, 'var(--high)'], [s.med, 'var(--med)'], [s.low, 'var(--low)']]} />
      </div>
      <div className="card hov">
        <div className="kl">Validated attack paths{paths.validated > 0 && <span className="badge b-crit"><i className="bd" />needs action</span>}</div>
        <div className="kv">{paths.validated} <small>of {paths.total} candidates</small></div>
        <div className="kf">Backed by evidence on every step</div>
        <SegBar label={`${paths.validated} validated, ${paths.needs_evidence} need evidence, ${paths.candidate} candidate`}
          parts={[[paths.validated, 'var(--accent)'], [paths.needs_evidence, 'var(--med)'], [paths.candidate, 'var(--border-strong)']]} />
      </div>
      <div className="card hov">
        <div className="kl">Fixes in progress{fixes.needsYou > 0 && <span className="badge b-acc">{fixes.needsYou} need you</span>}</div>
        <div className="kv">{fixes.inProgress}</div>
        <div className="kf">{[[fixes.draft, 'draft'], [fixes.needsApproval, 'awaiting approval'], [fixes.readyForPr, 'ready for PR'], [fixes.inCi, 'in CI'], [fixes.failed, 'failed a check']].filter(([n]) => n > 0).map(([n, l]) => `${n} ${l}`).join(' · ')}</div>
      </div>
      <div className="card hov">
        <div className="kl">Verified fixes · 30 days</div>
        <div className="kv">{kpis.verified30d}</div>
        <div className="kf">closed after passing checks</div>
      </div>
    </section>
  )
}
