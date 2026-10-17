import { useEffect, useRef, useState } from 'react'
import Icon from '../Icon.jsx'
import NodeShape from './NodeShape.jsx'
import { EVIDENCE, TYPES } from '../../lib/constants.js'
import { H, W } from './layouts.js'

const R = 24 // node radius in graph units; edges stop at the outline
const MIN_K = 0.35
const MAX_K = 2.5
const clampK = (k) => Math.min(MAX_K, Math.max(MIN_K, k))

function fitView(pos, ids, rect) {
  const pts = ids.map((id) => pos[id]).filter(Boolean)
  if (!pts.length || !rect.width) return { x: 0, y: 0, k: 1 }
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
  const minX = Math.min(...xs) - 90, maxX = Math.max(...xs) + 90
  const minY = Math.min(...ys) - 60, maxY = Math.max(...ys) + 70
  // leave room for the floating filter panel on wide screens
  const left = rect.width > 900 ? 290 : 0
  const k = clampK(Math.min((rect.width - left - 40) / (maxX - minX), (rect.height - 100) / (maxY - minY), 1.3))
  return {
    k,
    x: left + (rect.width - left - (maxX - minX) * k) / 2 - minX * k,
    y: (rect.height - 60 - (maxY - minY) * k) / 2 - minY * k,
  }
}

export default function GraphCanvas({ nodes, edges, pos, selected, activeNodes, activeEdges, labelEdges, onSelect, onFocus, onBackground, fitIds, children }) {
  const wrapRef = useRef(null)
  const drag = useRef(null)
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const [panning, setPanning] = useState(false)
  const fitKey = (fitIds ?? nodes.map((n) => n.id)).join('|')

  // Fit to the highlighted path (or everything shown) whenever the layout, filters or size change.
  useEffect(() => {
    const el = wrapRef.current
    const ids = fitKey.split('|')
    const ro = new ResizeObserver(() => setView(fitView(pos, ids, el.getBoundingClientRect())))
    ro.observe(el)
    return () => ro.disconnect()
  }, [pos, fitKey])

  // Wheel zoom around the cursor (needs a non-passive listener).
  useEffect(() => {
    const el = wrapRef.current
    const onWheel = (e) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      setView((v) => {
        const k = clampK(v.k * Math.exp(-e.deltaY * 0.0015))
        return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  function zoomBy(f) {
    const rect = wrapRef.current.getBoundingClientRect()
    const cx = rect.width / 2, cy = rect.height / 2
    setView((v) => {
      const k = clampK(v.k * f)
      return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k }
    })
  }

  function onPointerDown(e) {
    if (e.button !== 0 || e.target.closest('.node, .float, .drawer')) return
    drag.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
    setPanning(true)
  }
  function onPointerMove(e) {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
    setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }))
  }
  function onPointerUp() {
    const d = drag.current
    drag.current = null
    setPanning(false)
    if (d && !d.moved) onBackground()
  }

  const shown = new Set(nodes.map((n) => n.id))
  return (
    <div ref={wrapRef} className={`gwrap${panning ? ' panning' : ''}`}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <div className="glayer" style={{ width: W, height: H, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
        <svg className="edge" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
          <defs>
            {Object.entries({ hot: 'var(--accent)', validated: 'var(--border-strong)', needs: 'var(--med)', inferred: 'var(--text-3)' }).map(([k, c]) => (
              <marker key={k} id={`arr-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill={c} />
              </marker>
            ))}
          </defs>
          {edges.filter((e) => shown.has(e.from) && shown.has(e.to)).map((e) => {
            const p = pos[e.from], q = pos[e.to]
            const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1
            const ux = dx / len, uy = dy / len
            const hot = activeEdges?.has(e.id) && e.state === 'validated'
            const dim = activeEdges && !activeEdges.has(e.id)
            const stroke = hot ? 'var(--accent)' : e.state === 'validated' ? 'var(--border-strong)' : EVIDENCE[e.state].color
            return (
              <g key={e.id} className={dim ? 'dim' : ''}>
                <path d={`M${p.x + ux * R},${p.y + uy * R} L${q.x - ux * (R + 4)},${q.y - uy * (R + 4)}`}
                  stroke={stroke} strokeWidth={activeEdges?.has(e.id) ? 2.5 : 1.5} strokeDasharray={EVIDENCE[e.state].dash}
                  className={hot ? 'live' : ''} markerEnd={`url(#arr-${hot ? 'hot' : e.state})`} />
                {labelEdges.has(e.id) && (
                  <text x={(p.x + q.x) / 2} y={(p.y + q.y) / 2 - 6} className="elabel" textAnchor="middle">{e.rel}</text>
                )}
              </g>
            )
          })}
        </svg>
        {nodes.map((n) => {
          const t = TYPES[n.type]
          const cls = [
            'node', n.type === 'Agent' ? 'agent' : '', t.dashed ? 'user' : '', `r-${n.risk}`,
            n.id === selected ? 'sel' : '', activeNodes && !activeNodes.has(n.id) ? 'dim' : '',
            n.risk === 'crit' && n.type !== 'Agent' ? 'threat' : '',
          ].join(' ')
          const p = pos[n.id]
          return (
            <button key={n.id} type="button" className={cls} style={{ left: p.x, top: p.y }}
              onClick={() => onSelect(n.id)} onDoubleClick={() => onFocus(n.id)} aria-label={`${t.label} ${n.id}`}>
              <NodeShape shape={t.shape} />
              <span className="ni"><Icon name={t.icon} size={18} /></span>
              <span className="nl">{n.id}</span>
            </button>
          )
        })}
      </div>

      <div className="float gctl" role="group" aria-label="Zoom">
        <button type="button" className="iconbtn" onClick={() => zoomBy(1.25)} aria-label="Zoom in">+</button>
        <span className="mono muted">{Math.round(view.k * 100)}%</span>
        <button type="button" className="iconbtn" onClick={() => zoomBy(0.8)} aria-label="Zoom out">−</button>
        <button type="button" className="iconbtn" onClick={() => setView(fitView(pos, [...shown], wrapRef.current.getBoundingClientRect()))} aria-label="Fit to screen">
          <Icon name="grid" size={15} />
        </button>
      </div>
      {children}
    </div>
  )
}
