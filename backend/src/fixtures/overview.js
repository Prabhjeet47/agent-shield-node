// Overview-only fixtures. KPIs, fixes and activity are computed from the other stores.

export const PROJECT = {
  org: 'Northwind Labs',
  name: 'payments-platform',
  repos: 3,
  agents: 4,
  graphUpdated: '4 min ago',
  stale: { repo: 'internal-api', hours: 26 },
}

export const PATHS = [
  {
    id: 'AP-0142', title: 'code-assistant can rewrite the production deploy workflow', sev: 'crit', score: 86,
    state: { label: 'Validated', cls: 'b-acc' },
    steps: [['Agent', 'code-assistant'], ['Tool', 'write_file'], ['Permission', 'contents: write'], ['File', 'deploy.yml', true], ['Secret', 'PROD_DEPLOY_KEY', true]],
    links: ['', '', '', ''],
  },
  {
    id: 'AP-0139', title: 'Unpinned action in release.yml may read the npm token', sev: 'high', score: 71,
    state: { label: 'Needs evidence', cls: 'b-med' },
    steps: [['Workflow', 'release.yml'], ['Action', 'changed-files@v35'], ['Advisory', 'GHSA-mrrh-fwg8', true], ['Secret', 'NPM_TOKEN', true]],
    links: ['', '', 'need'],
  },
  {
    id: 'AP-0131', title: 'docs-bot file server may reach staging settings', sev: 'med', score: 54,
    state: { label: 'Candidate', cls: 'b-neu' },
    steps: [['Agent', 'docs-bot'], ['Tool', 'read_file'], ['Permission', 'fs: repo/**'], ['File', '.env.staging', true]],
    links: ['', '', 'inf'],
  },
]

export const VALIDATION = {
  edges: 11,
  withEvidence: 9,
  states: [
    { label: 'Validated', count: 1, color: 'var(--accent)' },
    { label: 'Needs evidence', count: 1, color: 'var(--med)' },
    { label: 'Candidate', count: 1, color: 'var(--border-strong)' },
    { label: 'Disproven', count: 0, color: 'var(--border-strong)' },
  ],
}

export const AGENTS = [
  { name: 'code-assistant', score: 86, sev: 'crit', why: 'write_file + contents: write reaches deploy.yml' },
  { name: 'docs-bot', score: 54, sev: 'med', why: 'read_file has no folder allowlist' },
  { name: 'release-helper', score: 41, sev: 'med', why: 'packages: write on internal-api' },
  { name: 'triage-bot', score: 18, sev: 'low', why: 'issues: write only, no code access' },
]

export const GRAPH = {
  nodes: [
    { id: 'a', kind: 'agent', label: 'code-assistant', x: 10, y: 42, icon: 'bot', detail: 'Coding agent · owner AppSec · 31 tool calls observed' },
    { id: 't1', kind: 'tool', label: 'write_file', x: 30, y: 22, icon: 'wrench', detail: 'Tool via mcp-github · observed' },
    { id: 't2', kind: 'tool', label: 'read_file', x: 30, y: 60, icon: 'wrench', detail: 'Tool via mcp-github · observed' },
    { id: 'p1', kind: 'perm', label: 'contents: write', x: 51, y: 22, icon: 'lock', detail: 'GITHUB_TOKEN scope declared in build.yml' },
    { id: 'p2', kind: 'perm', label: 'contents: read', x: 51, y: 60, icon: 'lock', detail: 'Read-only scope' },
    { id: 'r1', kind: 'res hot', label: 'deploy.yml', x: 71, y: 22, icon: 'file', detail: 'Restricted file · sandbox test confirmed write access' },
    { id: 'r2', kind: 'res', label: 'src/**', x: 71, y: 60, icon: 'file', detail: 'Application source · internal' },
    { id: 's1', kind: 'res hot', label: 'PROD_DEPLOY_KEY', x: 89, y: 22, icon: 'key', detail: 'Secret reference only · value never stored' },
  ],
  edges: [['a', 't1', true], ['t1', 'p1', true], ['p1', 'r1', true], ['r1', 's1', true], ['a', 't2'], ['t2', 'p2'], ['p2', 'r2'], ['p1', 'r2']],
}

// Open findings per day are replayed from these events, so every step in the chart has a cause.
export const HISTORY = {
  today: new Date(2026, 9, 16),
  days: 90,
  start: { crit: 0, high: 1, med: 4, low: 3 },
  events: [
    [10, { high: 1, med: 2, low: 1 }, 'Scan: internal-api connected', 'scan'],
    [22, { med: -1, low: -1 }, 'Fix verified: pin actions in ci.yml', 'fix'],
    [35, { high: 1 }, 'Push: release.yml added to internal-api', 'scan'],
    [48, { med: -1 }, 'Fix verified: remove unused deploy token', 'fix'],
    [60, { med: 1 }, 'Investigation: docs-bot path AP-0131 found', 'scan'],
    [70, { high: -1, low: -1 }, 'Fix verified: rotate staging token', 'fix'],
    [75, { med: -1, low: -1 }, 'Fix verified: lodash upgrade in docs-site', 'fix'],
    [80, { crit: 1, high: 1, med: 1 }, 'Scan: code-assistant connected, AP-0142 validated', 'scan'],
    [84, { low: 1 }, 'Push: payments-service 3a9f1c2', 'scan'],
    [87, { med: 1 }, 'Verification failed: F-0102 reopened', 'scan'],
  ],
}

