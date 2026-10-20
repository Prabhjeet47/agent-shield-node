// Presentation constants: labels, colours and shapes. All data comes from /api/v1.

export const SEV = {
  crit: { label: 'Critical', cls: 'b-crit', color: 'var(--crit)' },
  high: { label: 'High', cls: 'b-high', color: 'var(--high)' },
  med: { label: 'Medium', cls: 'b-med', color: 'var(--med)' },
  low: { label: 'Low', cls: 'b-low', color: 'var(--low)' },
}

export const TYPES = {
  Agent: { label: 'Agent', shape: 'circle', icon: 'bot', layer: 0 },
  Repository: { label: 'Repository', shape: 'circle', icon: 'repo', layer: 0, dashed: true },
  Workflow: { label: 'Workflow', shape: 'hex', icon: 'list', layer: 1 },
  MCPServer: { label: 'MCP server', shape: 'hex', icon: 'plug', layer: 1 },
  Tool: { label: 'Tool', shape: 'square', icon: 'wrench', layer: 2 },
  Action: { label: 'Action', shape: 'square', icon: 'graph', layer: 2 },
  Package: { label: 'Package', shape: 'square', icon: 'graph', layer: 2 },
  Permission: { label: 'Permission', shape: 'square', icon: 'lock', layer: 3 },
  Advisory: { label: 'Advisory', shape: 'hex', icon: 'alert', layer: 3 },
  File: { label: 'File', shape: 'cyl', icon: 'file', layer: 4 },
  Secret: { label: 'Secret', shape: 'cyl', icon: 'key', layer: 5 },
}

export const EVIDENCE = {
  validated: { label: 'Evidence', cls: 'b-acc', color: 'var(--accent)', dash: '' },
  needs: { label: 'Needs evidence', cls: 'b-med', color: 'var(--med)', dash: '6 5' },
  inferred: { label: 'Inferred', cls: 'b-neu', color: 'var(--text-3)', dash: '2 5' },
}

export const FIX_STEPS = ['Proposed', 'Approved', 'Pull request', 'Testing', 'Verified']
