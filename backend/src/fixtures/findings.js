// Sample findings. Replace with GET /api/projects/:id/findings and GET /api/findings/:id.
export const ME = 'S. Shruti'

export const FINDINGS = [
  { id: 'F-0121', title: 'Agent tool can reach restricted resource', sev: 'crit', status: 'investigating', repo: 'payments-service', agent: 'code-assistant', detection: 'Graph path', owner: 'S. Shruti', age: 2, score: 86, confidence: 'Strong', path: 'AP-0142', fix: 'R-031' },
  { id: 'F-0117', title: 'Workflow grants excessive write permissions', sev: 'high', status: 'in_remediation', repo: 'payments-service', detection: 'Static + graph', owner: 'Platform team', age: 5, score: 74, confidence: 'Confirmed', path: 'AP-0142', fix: 'R-031' },
  { id: 'F-0114', title: 'Unpinned third-party action with active advisory', sev: 'high', status: 'in_remediation', repo: 'internal-api', detection: 'SCA + graph', owner: 'Team API', age: 7, score: 71, confidence: 'Moderate', path: 'AP-0139', fix: 'R-029' },
  { id: 'F-0109', title: 'MCP server exposes unrestricted file read', sev: 'high', status: 'open', repo: 'docs-site', agent: 'docs-bot', detection: 'Graph path', owner: null, age: 3, score: 62, confidence: 'Tentative', path: 'AP-0131' },
  { id: 'F-0106', title: 'Release workflow can publish packages without review', sev: 'med', status: 'open', repo: 'internal-api', agent: 'release-helper', detection: 'Static + graph', owner: 'Team API', age: 4, score: 48, confidence: 'Moderate' },
  { id: 'F-0102', title: 'Fix did not pass positive regression test', sev: 'med', status: 'reopened', repo: 'payments-service', agent: 'code-assistant', detection: 'Verification', owner: 'S. Shruti', age: 1, score: 52, confidence: 'Confirmed', fix: 'R-024' },
  { id: 'F-0099', title: 'pull_request_target workflow checks out PR code', sev: 'med', status: 'pending_verification', repo: 'docs-site', detection: 'Static', owner: 'Dev Experience', age: 9, score: 45, confidence: 'Confirmed' },
  { id: 'F-0096', title: 'Dependency has an applicable advisory (lodash 4.17.20)', sev: 'med', status: 'open', repo: 'internal-api', detection: 'SCA + graph', owner: 'Team API', age: 14, score: 38, confidence: 'Moderate' },
  { id: 'F-0093', title: 'Secret referenced in a workflow agents can edit', sev: 'med', status: 'investigating', repo: 'payments-service', detection: 'Graph path', owner: 'AppSec', age: 6, score: 44, confidence: 'Moderate' },
  { id: 'F-0091', title: 'Agent config lacks an owner', sev: 'med', status: 'open', repo: 'internal-api', agent: 'release-helper', detection: 'Static', owner: null, age: 11, score: 30, confidence: 'Confirmed' },
  { id: 'F-0088', title: 'Staging token visible to docs build', sev: 'low', status: 'accepted_risk', repo: 'docs-site', detection: 'Secret scan', owner: 'S. Shruti', age: 21, score: 22, confidence: 'Confirmed' },
  { id: 'F-0085', title: 'Triage bot can label issues in all repos', sev: 'low', status: 'open', repo: 'payments-service', agent: 'triage-bot', detection: 'Static', owner: 'AppSec', age: 16, score: 18, confidence: 'Confirmed' },
  { id: 'F-0081', title: 'Workflow uses deprecated set-output command', sev: 'low', status: 'open', repo: 'payments-service', detection: 'Static', owner: 'Platform team', age: 19, score: 12, confidence: 'Confirmed' },
  { id: 'F-0077', title: 'Exposed staging token rotated', sev: 'high', status: 'verified_fixed', repo: 'internal-api', detection: 'Secret scan', owner: 'Team API', age: 30, score: 0, confidence: 'Confirmed' },
  { id: 'F-0072', title: 'Agent could push to main without review', sev: 'high', status: 'verified_fixed', repo: 'payments-service', agent: 'code-assistant', detection: 'Graph path', owner: 'AppSec', age: 41, score: 0, confidence: 'Confirmed' },
  { id: 'F-0069', title: 'Scanner flagged test fixture as a secret', sev: 'low', status: 'false_positive', repo: 'docs-site', detection: 'Secret scan', owner: 'Dev Experience', age: 44, score: 0, confidence: 'Tentative' },
]

export const CLOSED = ['verified_fixed', 'accepted_risk', 'false_positive']
export const SEV_ORDER = { crit: 0, high: 1, med: 2, low: 3 }

// Rich detail for the flagship finding; the others get a shorter generated version below.
const DETAIL = {
  'F-0121': {
    summary: 'code-assistant can call write_file, which runs with the build workflow token. That token has contents: write, so the agent can change .github/workflows/deploy.yml, and that file reads PROD_DEPLOY_KEY. A malicious instruction in a pull request or issue could use this to change how production is deployed.',
    impact: 'Unauthorised change to the production deploy pipeline and use of the production deploy key.',
    factors: [['Path validated by sandbox test', 0.9], ['Reaches a restricted secret', 1], ['Agent reads untrusted PR text', 0.7], ['No branch protection on .github/', 0.8]],
    steps: [['Agent', 'code-assistant'], ['Tool', 'write_file'], ['Permission', 'contents: write'], ['File', 'deploy.yml', true], ['Secret', 'PROD_DEPLOY_KEY', true]],
    links: [['CAN_INVOKE', ''], ['HAS_PERMISSION', ''], ['CAN_ACCESS', ''], ['USES_SECRET', '']],
    evidence: [
      { type: 'Workflow config', source: 'payments-service/.github/workflows/build.yml', trust: 'Static', hash: 'sha256:4be1…9a02', when: 'Scan #214 · 4 min ago', claim: 'The build token has contents: write.',
        code: [[7, 'permissions:'], [8, '  id-token: write'], [9, '  contents: write', true], [10, '  pull-requests: write']] },
      { type: 'Sandbox test', source: 'verification run #118 · ephemeral runner', trust: 'Reproducible test', hash: 'sha256:c71d…e3f4', when: 'Yesterday 16:42', claim: 'write_file can modify deploy.yml with this token.',
        code: [[1, '$ agentshield test write-access --tool write_file --path .github/workflows/deploy.yml'], [2, 'write ok (12 bytes), reverted'], [3, 'exit 0', true]] },
      { type: 'Workflow config', source: 'payments-service/.github/workflows/deploy.yml', trust: 'Static', hash: 'sha256:0d9e…11ab', when: 'Scan #214 · 4 min ago', claim: 'deploy.yml reads the production deploy key.',
        code: [[40, '      - name: Deploy'], [41, '        env:'], [42, '          DEPLOY_KEY: ${{ secrets.PROD_DEPLOY_KEY }}', true]] },
      { type: 'AI hypothesis', source: 'investigation-agent · inv-7f3c', trust: 'Unverified', hash: '—', when: '31 min ago', claim: 'A prompt in a PR description could ask the agent to edit deploy.yml.', hypothesis: true,
        code: [[1, 'Not used for scoring. Shown so reviewers can test it.']] },
    ],
    proposal: {
      id: 'R-031', strategy: 'least_privilege_workflow_permissions', hash: 'sha256:9f2c…a71e', file: '.github/workflows/build.yml',
      summary: 'Restrict the build workflow token to read-only repository contents.',
      diff: [[' ', 'permissions:'], [' ', '  id-token: write'], ['-', '  contents: write'], ['+', '  contents: read'], [' ', '  pull-requests: write']],
      breaks: 'AP-0142 at the HAS_PERMISSION step', risk: 'Low. The build job only reads code and runs tests.',
    },
    checks: [
      ['pass', 'Static policy: workflow token least privilege', 'Proposal passes against policy v14', 'Before merge'],
      ['wait', 'Negative test: write_file cannot modify deploy.yml', 'Runs after the PR merges', 'After merge'],
      ['wait', 'Positive test: build and unit tests still pass', 'Runs on the PR', 'On PR'],
      ['wait', 'Graph recompute: AP-0142 removed or downgraded', 'Runs after the next scan', 'After scan'],
    ],
    activity: [
      ['31 min ago', 'investigation-agent', 'added an AI hypothesis to Evidence'],
      ['2 h ago', 'S. Shruti', 'changed status to Investigating'],
      ['2 h ago', 'S. Shruti', 'assigned this finding to themself'],
      ['Yesterday', 'Verifier', 'ran sandbox test #118: write access confirmed'],
      ['2 days ago', 'Scan #209', 'opened this finding from path AP-0142'],
    ],
  },
}

export function getFinding(id) {
  const f = FINDINGS.find((x) => x.id === id)
  if (!f) return null
  const d = DETAIL[id] ?? {
    summary: `${f.title} in ${f.repo}${f.agent ? `, involving ${f.agent}` : ''}. Found by ${f.detection.toLowerCase()} analysis.`,
    impact: f.sev === 'low' ? 'Limited impact. Worth fixing as hardening.' : 'Could widen what an agent or workflow can change if combined with another weakness.',
    factors: [['Severity of affected resource', f.score / 100], ['Evidence quality', f.confidence === 'Confirmed' ? 1 : f.confidence === 'Strong' ? 0.8 : f.confidence === 'Moderate' ? 0.6 : 0.3]],
    steps: null,
    evidence: [{ type: f.detection, source: `${f.repo} · scan #214`, trust: 'Static', hash: 'sha256:7a11…c0de', when: 'Scan #214', claim: f.title, code: [[1, `# ${f.title}`]] }],
    proposal: null,
    checks: [['wait', 'Verification plan', 'Created when a fix is proposed', '—']],
    activity: [[`${f.age} days ago`, 'Scan', 'opened this finding']],
  }
  return { ...f, ...d }
}
