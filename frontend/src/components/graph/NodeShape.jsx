// Node outlines from the design: circle (agents, repos), rounded square (tools, permissions),
// hexagon (workflows, servers, advisories), cylinder (files, secrets).
const SHAPES = {
  circle: 'M24 3a21 21 0 1 1 0 42a21 21 0 1 1 0-42z',
  square: 'M14 4h20a10 10 0 0 1 10 10v20a10 10 0 0 1-10 10H14A10 10 0 0 1 4 34V14A10 10 0 0 1 14 4z',
  hex: 'M24 3l18.2 10.5v21L24 45 5.8 34.5v-21z',
  cyl: 'M7 11c0-3.3 7.6-6 17-6s17 2.7 17 6v26c0 3.3-7.6 6-17 6s-17-2.7-17-6z M7 11c0 3.3 7.6 6 17 6s17-2.7 17-6',
}

export default function NodeShape({ shape }) {
  return (
    <svg className="shp" viewBox="0 0 48 48" aria-hidden="true">
      <path d={SHAPES[shape]} />
    </svg>
  )
}
