// Sample graph for the payments-platform project, shaped like the FalkorDB model:
// Agent / Repository → Workflow / MCPServer → Tool / Action → Permission / Advisory → File → Secret.
// Served by GET /api/v1/projects/:id/graph. Replace with FalkorDB queries from the AI/graph services.

export const NODES = [
  { id: 'code-assistant', type: 'Agent', risk: 'crit', score: 86, source: 'Declared in .agentshield.yml', repo: 'payments-service', note: 'Coding agent owned by AppSec.' },
  { id: 'payments-service', type: 'Repository', risk: 'high', source: 'GitHub App', repo: 'payments-service', note: 'Default branch main · synced 4 min ago.' },
  { id: 'internal-api', type: 'Repository', risk: 'high', source: 'GitHub App', repo: 'internal-api', note: 'Graph data is 26 h old.' },
  { id: 'docs-bot', type: 'Agent', risk: 'med', score: 54, source: 'Declared in .agentshield.yml', repo: 'docs-site', note: 'Writes and updates docs pages.' },
  { id: 'release-helper', type: 'Agent', risk: 'med', score: 41, source: 'Declared in .agentshield.yml', repo: 'internal-api', note: 'Publishes internal packages.' },
  { id: 'triage-bot', type: 'Agent', risk: 'low', score: 18, source: 'Declared in .agentshield.yml', repo: 'payments-service', note: 'Labels and comments on issues.' },

  { id: 'build.yml', type: 'Workflow', risk: 'high', source: 'Static: .github/workflows/build.yml', repo: 'payments-service', note: 'Runs on every push to main.' },
  { id: 'release.yml', type: 'Workflow', risk: 'high', source: 'Static: .github/workflows/release.yml', repo: 'internal-api', note: 'Runs on version tags.' },
  { id: 'fs-mcp', type: 'MCPServer', risk: 'med', source: 'Declared in mcp.json', repo: 'docs-site', note: 'v0.6.2 · root set to the repository checkout.' },

  { id: 'write_file', type: 'Tool', risk: 'crit', source: 'Observed in sandbox run #118', repo: 'payments-service', note: 'Writes any path in the checkout.' },
  { id: 'read_file', type: 'Tool', risk: 'low', source: 'Observed in sandbox run #118', repo: 'payments-service', note: 'Reads files in the checkout.' },
  { id: 'changed-files@v35', type: 'Action', risk: 'high', source: 'Static: release.yml line 18', repo: 'internal-api', note: 'tj-actions/changed-files, pinned to a tag, not a SHA.' },
  { id: 'fs.read_file', type: 'Tool', risk: 'med', source: 'Declared by fs-mcp', repo: 'docs-site', note: 'No folder allowlist.' },
  { id: 'npm.publish', type: 'Tool', risk: 'med', source: 'Declared in .agentshield.yml', repo: 'internal-api', note: 'Publishes to the internal registry.' },
  { id: 'issues.create', type: 'Tool', risk: 'low', source: 'Declared in .agentshield.yml', repo: 'payments-service', note: 'Creates and labels issues.' },

  { id: 'contents: write', type: 'Permission', risk: 'crit', source: 'Static: build.yml line 9', repo: 'payments-service', note: 'GITHUB_TOKEN can push to the repository.' },
  { id: 'contents: read', type: 'Permission', risk: 'low', source: 'Static: ci.yml line 7', repo: 'payments-service', note: 'Read-only token scope.' },
  { id: 'GHSA-mrrh-fwg8-r2c3', type: 'Advisory', risk: 'high', source: 'GitHub Advisory Database', repo: 'internal-api', note: 'Affected versions could print secrets to build logs.' },
  { id: 'fs: repo/**', type: 'Permission', risk: 'med', source: 'Static: mcp.json', repo: 'docs-site', note: 'Read access to the whole checkout.' },
  { id: 'packages: write', type: 'Permission', risk: 'med', source: 'Static: release.yml line 6', repo: 'internal-api', note: 'Can publish packages.' },
  { id: 'issues: write', type: 'Permission', risk: 'low', source: 'Static: triage.yml line 5', repo: 'payments-service', note: 'Issue comments and labels only.' },

  { id: 'deploy.yml', type: 'File', risk: 'crit', source: 'Static: sensitivity restricted', repo: 'payments-service', note: 'Production deploy workflow.' },
  { id: 'src/**', type: 'File', risk: 'low', source: 'Static: sensitivity internal', repo: 'payments-service', note: 'Application source code.' },
  { id: '.env.staging', type: 'File', risk: 'med', source: 'Static: sensitivity confidential', repo: 'docs-site', note: 'Staging settings. Present in checkout? Not yet confirmed.' },

  { id: 'PROD_DEPLOY_KEY', type: 'Secret', risk: 'crit', source: 'Reference only, value never stored', repo: 'payments-service', note: 'Used by deploy.yml.' },
  { id: 'NPM_TOKEN', type: 'Secret', risk: 'high', source: 'Reference only, value never stored', repo: 'internal-api', note: 'Used by release.yml.' },
]

// [from, relationship, to, evidence state, evidence text, attack path]
export const EDGES = [
  ['code-assistant', 'CAN_INVOKE', 'write_file', 'validated', 'Observed 31 write_file calls in sandbox run #118.', 'AP-0142'],
  ['code-assistant', 'CAN_INVOKE', 'read_file', 'validated', 'Observed in sandbox run #118.'],
  ['write_file', 'HAS_PERMISSION', 'contents: write', 'validated', 'Tool runs with the build.yml token (build.yml line 9).', 'AP-0142'],
  ['read_file', 'HAS_PERMISSION', 'contents: read', 'validated', 'ci.yml line 7.'],
  ['contents: write', 'CAN_ACCESS', 'deploy.yml', 'validated', 'Sandbox test wrote to .github/workflows/deploy.yml (exit 0).', 'AP-0142'],
  ['contents: write', 'CAN_ACCESS', 'src/**', 'validated', 'Token scope covers the whole repository.'],
  ['contents: read', 'CAN_ACCESS', 'src/**', 'validated', 'Read-only scope.'],
  ['deploy.yml', 'USES_SECRET', 'PROD_DEPLOY_KEY', 'validated', 'deploy.yml line 42: secrets.PROD_DEPLOY_KEY.', 'AP-0142'],
  ['payments-service', 'HAS_WORKFLOW', 'build.yml', 'validated', 'Found in .github/workflows.'],
  ['build.yml', 'GRANTS', 'contents: write', 'validated', 'build.yml line 9: permissions: contents: write.'],
  ['internal-api', 'HAS_WORKFLOW', 'release.yml', 'validated', 'Found in .github/workflows.'],
  ['release.yml', 'USES_ACTION', 'changed-files@v35', 'validated', 'release.yml line 18.', 'AP-0139'],
  ['changed-files@v35', 'AFFECTED_BY', 'GHSA-mrrh-fwg8-r2c3', 'validated', 'v35 is inside the affected version range.', 'AP-0139'],
  ['GHSA-mrrh-fwg8-r2c3', 'EXPOSES', 'NPM_TOKEN', 'needs', 'Not yet confirmed that NPM_TOKEN is in the step environment.', 'AP-0139'],
  ['release.yml', 'USES_SECRET', 'NPM_TOKEN', 'validated', 'release.yml line 31.'],
  ['docs-bot', 'CONNECTS_TO', 'fs-mcp', 'validated', 'Declared in mcp.json.', 'AP-0131'],
  ['fs-mcp', 'PROVIDES', 'fs.read_file', 'validated', 'Tool list returned by fs-mcp.', 'AP-0131'],
  ['fs.read_file', 'HAS_PERMISSION', 'fs: repo/**', 'validated', 'mcp.json root is "./".', 'AP-0131'],
  ['fs: repo/**', 'CAN_ACCESS', '.env.staging', 'inferred', 'Path pattern match only. No sandbox test yet.', 'AP-0131'],
  ['release-helper', 'CAN_INVOKE', 'npm.publish', 'validated', 'Declared tool.'],
  ['npm.publish', 'HAS_PERMISSION', 'packages: write', 'validated', 'release.yml line 6.'],
  ['triage-bot', 'CAN_INVOKE', 'issues.create', 'validated', 'Declared tool.'],
  ['issues.create', 'HAS_PERMISSION', 'issues: write', 'validated', 'triage.yml line 5.'],
].map(([from, rel, to, state, evidence, path], i) => ({ id: `e${i}`, from, rel, to, state, evidence, path }))

export const GRAPH_PATHS = [
  { id: 'AP-0142', title: 'code-assistant → PROD_DEPLOY_KEY', sev: 'crit', state: 'Validated' },
  { id: 'AP-0139', title: 'release.yml → NPM_TOKEN', sev: 'high', state: 'Needs evidence' },
  { id: 'AP-0131', title: 'docs-bot → .env.staging', sev: 'med', state: 'Candidate' },
]

export const SNAPSHOTS = [
  { id: 'scan-214', label: 'Scan #214 · 4 min ago', commit: 'payments-service@3a9f1c2' },
  { id: 'scan-213', label: 'Scan #213 · yesterday', commit: 'payments-service@9be04d1' },
  { id: 'scan-209', label: 'Scan #209 · 7 days ago', commit: 'internal-api@51c7a2e' },
]

