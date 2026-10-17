import { TYPES } from '../../lib/constants.js'

export const W = 1200
export const H = 720

function byLayer(nodes) {
  const layers = []
  for (const n of nodes) (layers[TYPES[n.type].layer] ??= []).push(n)
  return layers.map((l) => l ?? [])
}

// Columns from left (who acts) to right (what is at risk).
export function hierarchy(nodes) {
  const pos = {}
  const layers = byLayer(nodes)
  layers.forEach((col, li) => {
    const gap = Math.min(104, (H - 80) / Math.max(col.length, 1))
    col.forEach((n, i) => {
      pos[n.id] = { x: 90 + li * ((W - 180) / (layers.length - 1)), y: H / 2 + (i - (col.length - 1) / 2) * gap }
    })
  })
  return pos
}

// Rings: agents and repos inside, secrets on the outside.
export function radial(nodes) {
  const pos = {}
  byLayer(nodes).forEach((ring, li) => {
    const r = 70 + li * 58
    ring.forEach((n, i) => {
      const a = (i / ring.length) * Math.PI * 2 + li * 0.45
      pos[n.id] = { x: W / 2 + Math.cos(a) * r * 1.5, y: H / 2 + Math.sin(a) * r }
    })
  })
  return pos
}

// Deterministic spring layout seeded from the hierarchy, so it looks the same every load.
export function force(nodes, edges) {
  const pos = hierarchy(nodes)
  const ids = nodes.map((n) => n.id)
  const ideal = 120
  for (let iter = 0; iter < 260; iter++) {
    const cool = 1 - iter / 260
    const d = Object.fromEntries(ids.map((id) => [id, { x: 0, y: 0 }]))
    for (let a = 0; a < ids.length; a++) {
      for (let b = a + 1; b < ids.length; b++) {
        const p = pos[ids[a]], q = pos[ids[b]]
        let dx = p.x - q.x, dy = p.y - q.y
        const dist = Math.max(Math.hypot(dx, dy), 1)
        const push = (ideal * ideal) / dist / dist
        dx *= push / dist; dy *= push / dist
        d[ids[a]].x += dx; d[ids[a]].y += dy; d[ids[b]].x -= dx; d[ids[b]].y -= dy
      }
    }
    for (const e of edges) {
      const p = pos[e.from], q = pos[e.to]
      if (!p || !q) continue
      const dx = q.x - p.x, dy = q.y - p.y
      const dist = Math.max(Math.hypot(dx, dy), 1)
      const pull = (dist - ideal) / dist / 6
      d[e.from].x += dx * pull; d[e.from].y += dy * pull; d[e.to].x -= dx * pull; d[e.to].y -= dy * pull
    }
    for (const id of ids) {
      const p = pos[id]
      p.x += Math.max(-24, Math.min(24, d[id].x + (W / 2 - p.x) * 0.004)) * cool
      p.y += Math.max(-24, Math.min(24, d[id].y + (H / 2 - p.y) * 0.004)) * cool
    }
  }
  return pos
}

export const LAYOUTS = { force, hierarchy, radial }
