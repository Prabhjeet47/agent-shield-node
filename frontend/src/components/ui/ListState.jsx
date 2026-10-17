import Icon from '../Icon.jsx'

// The three states every list ships with (from the States board).
export function Loading({ rows = 5 }) {
  return (
    <div aria-busy="true" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div className="skel" style={{ width: 70, height: 20 }} />
          <div className="skel" style={{ flex: 1, height: 14 }} />
          <div className="skel" style={{ width: 110, height: 14 }} />
        </div>
      ))}
    </div>
  )
}

export function Empty({ icon = 'check', title, children, action }) {
  return (
    <div className="state">
      <div className="ill"><Icon name={icon} size={22} /></div>
      <div className="h3">{title}</div>
      <p>{children}</p>
      {action}
    </div>
  )
}

export function ErrorState({ title, children, onRetry, requestId }) {
  return (
    <div className="state err" role="alert">
      <div className="ill"><Icon name="alert" size={22} /></div>
      <div className="h3">{title}</div>
      <p>{children}</p>
      <div className="acts"><button type="button" className="btn" onClick={onRetry}>Retry</button></div>
      {requestId && <span className="mono muted">request_id {requestId}</span>}
    </div>
  )
}
