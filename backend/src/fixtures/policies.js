// Policy checks run on every scan and on pull requests (GitHub check run).
// Replace with GET/PUT /api/projects/:id/policies; each save creates an immutable version.

export const FIELDS = ['Workflow file', 'Agent config', 'Action reference', 'Dependency']
export const OPS = ['contains', 'matches regex', 'does not contain']
export const MODES = { monitor: 'Monitor', warn: 'Warn', fail: 'Fail CI' }

export const POLICIES = [
  {
    id: 'pol_token_least_priv', name: 'Workflow token least privilege', desc: 'Workflows must not give the GITHUB_TOKEN write access to code.',
    on: true, mode: 'fail', version: 14, edited: '2 days ago by M. Okafor', scope: 'all',
    conditions: [{ field: 'Workflow file', op: 'contains', value: 'contents: write' }],
  },
  {
    id: 'pol_pin_actions', name: 'Actions pinned to a commit SHA', desc: 'Third-party actions must use a full commit SHA, not a tag.',
    on: true, mode: 'warn', version: 6, edited: '3 weeks ago by S. Shruti', scope: 'all',
    conditions: [{ field: 'Action reference', op: 'matches regex', value: 'uses:\\s*[\\w.-]+/[\\w.-]+@v\\d' }],
  },
  {
    id: 'pol_agent_paths', name: 'Agent file tools need a path allowlist', desc: 'File tools exposed to agents must be limited to listed folders.',
    on: true, mode: 'warn', version: 3, edited: '1 week ago by S. Shruti', scope: 'all',
    conditions: [{ field: 'Agent config', op: 'does not contain', value: 'allowed_paths' }],
  },
  {
    id: 'pol_prt_checkout', name: 'No pull_request_target with PR checkout', desc: 'Privileged workflows must not run code from the pull request.',
    on: true, mode: 'fail', version: 2, edited: '1 month ago by M. Okafor', scope: 'all',
    conditions: [{ field: 'Workflow file', op: 'contains', value: 'pull_request_target' }, { field: 'Workflow file', op: 'contains', value: 'github.event.pull_request.head' }],
  },
  {
    id: 'pol_crit_deps', name: 'Critical dependency advisories', desc: 'Report dependencies with a critical advisory and an available fix.',
    on: true, mode: 'monitor', version: 5, edited: '2 months ago by Team API', scope: 'production',
    conditions: [{ field: 'Dependency', op: 'matches regex', value: 'severity:\\s*critical' }],
  },
  {
    id: 'pol_secrets_agents', name: 'No secrets in agent-editable workflows', desc: 'Workflows an agent can edit must not read deploy secrets.',
    on: false, mode: 'warn', version: 1, edited: 'Draft', scope: 'production',
    conditions: [{ field: 'Workflow file', op: 'matches regex', value: 'secrets\\.(PROD|DEPLOY)' }],
  },
]

export const SAMPLES = {
  'build.yml (current)': `name: build
on: push
permissions:
  id-token: write
  contents: write
  pull-requests: write
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm test`,
  'build.yml (proposed fix)': `name: build
on: push
permissions:
  id-token: write
  contents: read
  pull-requests: write
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683
      - run: npm ci && npm test`,
  'release.yml': `on:
  push:
    tags: ['v*']
jobs:
  release:
    steps:
      - uses: tj-actions/changed-files@v35
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}`,
}

// Deterministic evaluation: every condition must match for the policy to trigger.
export function evaluate(policy, input) {
  const results = policy.conditions.map((c) => {
    let hit = false
    try {
      if (c.op === 'contains') hit = input.includes(c.value)
      if (c.op === 'does not contain') hit = !input.includes(c.value)
      if (c.op === 'matches regex') hit = new RegExp(c.value, 'm').test(input)
    } catch {
      return { ...c, hit: false, error: 'Invalid regular expression' }
    }
    return { ...c, hit }
  })
  return { results, triggered: results.length > 0 && results.every((r) => r.hit) }
}
