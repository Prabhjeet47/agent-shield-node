import { useMemo, useRef, useState } from 'react'
import { SEV } from '../../lib/constants.js'

const STACK = ['low', 'med', 'high', 'crit'] // bottom to top
const ORDER = ['crit', 'high', 'med', 'low'] // legend and tooltip
const W = 720
const H = 220
const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const total = (d) => STACK.reduce((sum, k) => sum + d[k], 0)

// Replays scan / push / fix events into one row per day.
function buildSeries({ today: todayIso, days, start, events }) {
  const today = new Date(todayIso)
  const current = { ...start }
  return Array.from({ length: days }, (_, day) => {
    const ev = events.find((e) => e[0] === day)
    if (ev) for (const k in ev[1]) current[k] += ev[1][k]
    const date = new Date(today)
    date.setDate(today.getDate() - (days - 1 - day))
    return { date, ...current, event: ev ? { text: ev[2], kind: ev[3] } : null }
  })
}

function stepPath(points) {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
}

export default function FindingsOverTime({ history }) {
  const [range, setRange] = useState(30)
  const [showTable, setShowTable] = useState(false)
  const [hover, setHover] = useState(null)
  const plotRef = useRef(null)
  const series = useMemo(() => buildSeries(history), [history])
  const data = useMemo(() => series.slice(-range), [series, range])

  const chart = useMemo(() => {
    const n = data.length
    const max = Math.max(...data.map(total))
    const step = max <= 8 ? 2 : max <= 16 ? 4 : 5
    const top = Math.ceil((max + 1) / step) * step
    const X = (i) => (i / (n - 1)) * W
    const Y = (v) => H - (v / top) * H
    const cum = data.map(() => 0)
    const layers = STACK.map((k) => {
      const base = [...cum]
      data.forEach((d, i) => { cum[i] += d[k] })
      // step-after: the count holds until the next event
      const upper = data.flatMap((_, i) => (i < n - 1 ? [[X(i), Y(cum[i])], [X(i + 1), Y(cum[i])]] : [[X(i), Y(cum[i])]]))
      const lower = data.flatMap((_, i) => (i < n - 1 ? [[X(i), Y(base[i])], [X(i + 1), Y(base[i])]] : [[X(i), Y(base[i])]])).reverse()
      const line = stepPath(upper)
      return { key: k, line, area: `${line} ${stepPath(lower).replace('M', 'L')} Z` }
    })
    const ticks = []
    for (let v = 0; v <= top; v += step) ticks.push(v)
    return { layers, ticks, top }
  }, [data])

  const n = data.length
  const xTicks = range === 7 ? [0, 1, 2, 3, 4, 5, 6] : range === 30 ? [0, 7, 14, 21, 29] : [0, 22, 44, 66, 89]
  const last = data[n - 1]
  const change = total(last) - total(data[0])
  const pct = (i) => `${(i / (n - 1)) * 100}%`

  function onMove(e) {
    const rect = plotRef.current.getBoundingClientRect()
    const i = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - rect.left) / rect.width) * (n - 1))))
    setHover({ i, x: (i / (n - 1)) * rect.width, width: rect.width })
  }

  const hd = hover && data[hover.i]
  const tipLeft = hover && (hover.x + 14 + 190 > hover.width ? hover.x - 14 - 190 : hover.x + 14)

  return (
    <section className="card" aria-labelledby="ot-h">
      <div className="ch">
        <div>
          <h2 className="h2" id="ot-h">Open findings over time</h2>
          <div className="small muted">
            {total(last)} open now · {change > 0 ? `+${change}` : change} over {range} days · stacked by severity
          </div>
        </div>
        <div className="acts">
          <div className="seg" role="group" aria-label="Time range">
            {[7, 30, 90].map((r) => (
              <button key={r} type="button" className={r === range ? 'on' : ''} onClick={() => { setRange(r); setHover(null) }}>{r}d</button>
            ))}
          </div>
          <button type="button" className="btn sm ghost" aria-pressed={showTable} onClick={() => setShowTable((v) => !v)}>Table</button>
        </div>
      </div>

      <div className="legend top">
        {ORDER.map((k) => (
          <span key={k} className="lg"><i className="sw" style={{ background: SEV[k].color }} />{SEV[k].label} <b>{last[k]}</b></span>
        ))}
        <span className="lg"><i className="mk" style={{ position: 'static', transform: 'none' }} />scan or push</span>
        <span className="lg"><i className="mk mk-fix" style={{ position: 'static', transform: 'none' }} />fix verified</span>
      </div>

      <div className="chartw">
        <div className="yax" aria-hidden="true">
          {chart.ticks.map((v) => <span key={v} style={{ top: `${(1 - v / chart.top) * 100}%` }}>{v}</span>)}
        </div>
        <div className="plot" ref={plotRef} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          <div className="gl">
            {chart.ticks.map((v) => <div key={v} className={v === 0 ? 'base' : ''} style={{ top: `${(1 - v / chart.top) * 100}%` }} />)}
          </div>
          <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
            aria-label={`Open findings over the last ${range} days, from ${total(data[0])} to ${total(last)}`}>
            {chart.layers.map((l) => (
              <g key={l.key}>
                <path d={l.area} fill={SEV[l.key].color} fillOpacity=".16" stroke="none" />
                <path d={l.line} fill="none" stroke={SEV[l.key].color} strokeWidth="2" />
              </g>
            ))}
          </svg>
          {data.map((d, i) => d.event && <i key={i} className={`mk mk-${d.event.kind}`} style={{ left: pct(i) }} />)}
          {hd && (
            <>
              <div className="xhair" style={{ left: hover.x }} />
              <div className="ctip" style={{ left: tipLeft }}>
                <div className="d">{hover.i === n - 1 ? 'Today' : fmt(hd.date)}</div>
                {ORDER.map((k) => (
                  <div key={k} className="r"><i className="sw" style={{ background: SEV[k].color }} />{SEV[k].label}<b>{hd[k]}</b></div>
                ))}
                <div className="r tot">Total open<b>{total(hd)}</b></div>
                {hd.event && <div className="ev">{hd.event.text}</div>}
              </div>
            </>
          )}
        </div>
      </div>
      <div className="xax" aria-hidden="true">
        {xTicks.map((i) => <span key={i} style={{ left: pct(i) }}>{i === n - 1 ? 'Today' : fmt(data[i].date)}</span>)}
      </div>

      {showTable && (
        <div className="tblwrap">
          <table>
            <thead><tr><th>Date</th><th>Critical</th><th>High</th><th>Medium</th><th>Low</th><th>Total</th><th>Event</th></tr></thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.date.toISOString()}>
                  <td>{fmt(d.date)}</td><td>{d.crit}</td><td>{d.high}</td><td>{d.med}</td><td>{d.low}</td><td>{total(d)}</td><td>{d.event?.text ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
