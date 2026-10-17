// Sample coding agents, declared in each repo's .agentshield.yml.
// Replace with GET /api/projects/:id/agents and GET /api/agents/:id.

// Matrix grades: ok = scoped, warn = broad, risk = unrestricted, none = no access
export const AGENTS = [
  {
    id: 'code-assistant', sev: 'crit', score: 86, repo: 'payments-service', owner: 'AppSec', model: 'claude-sonnet', via: 'mcp-github',
    paths: ['AP-0142'], findings: 3, summary: 'Writes code and opens pull requests in payments-service.',
    tools: [
      ['write_file', 'Observed in sandbox run #118', 'contents: write'],
      ['read_file', 'Observed in sandbox run #118', 'contents: read'],
      ['open_pull_request', 'Declared', 'pull-requests: write'],
    ],
    matrix: [
      ['Repository contents', 'ok', 'risk', 'none', 'none'],
      ['Workflows (.github/)', 'ok', 'risk', 'none', 'none'],
      ['Secrets (by reference)', 'none', 'none', 'warn', 'none'],
      ['Pull requests', 'ok', 'ok', 'none', 'none'],
      ['Network egress', 'none', 'none', 'none', 'warn'],
    ],
    hardening: [
      ['Least-privilege workflow token', false, 'build.yml grants contents: write'],
      ['Path allowlist on file tools', false, 'write_file can write any path'],
      ['Branch protection on .github/', false, 'main allows direct workflow edits'],
      ['Actions pinned to commit SHA', true, ''],
      ['Owner declared', true, ''],
      ['Untrusted PR text marked as data', true, ''],
    ],
  },
  {
    id: 'docs-bot', sev: 'med', score: 54, repo: 'docs-site', owner: 'Dev Experience', model: 'claude-haiku', via: 'fs-mcp',
    paths: ['AP-0131'], findings: 1, summary: 'Writes and updates documentation pages.',
    tools: [['fs.read_file', 'Declared by fs-mcp', 'fs: repo/**'], ['fs.write_file', 'Declared by fs-mcp', 'fs: docs/**']],
    matrix: [
      ['Repository contents', 'warn', 'ok', 'none', 'none'],
      ['Workflows (.github/)', 'warn', 'none', 'none', 'none'],
      ['Config and env files', 'risk', 'none', 'none', 'none'],
      ['Pull requests', 'ok', 'ok', 'none', 'none'],
      ['Network egress', 'none', 'none', 'none', 'none'],
    ],
    hardening: [
      ['Path allowlist on file tools', false, 'fs-mcp root is the whole checkout'],
      ['Least-privilege workflow token', true, ''],
      ['Actions pinned to commit SHA', true, ''],
      ['Owner declared', true, ''],
      ['Untrusted PR text marked as data', true, ''],
    ],
  },
  {
    id: 'release-helper', sev: 'med', score: 41, repo: 'internal-api', owner: null, model: 'claude-sonnet', via: 'built-in tools',
    paths: [], findings: 2, summary: 'Bumps versions and publishes internal packages.',
    tools: [['npm.publish', 'Declared', 'packages: write'], ['git.tag', 'Declared', 'contents: write']],
    matrix: [
      ['Repository contents', 'ok', 'warn', 'none', 'none'],
      ['Workflows (.github/)', 'ok', 'none', 'none', 'none'],
      ['Packages', 'ok', 'warn', 'none', 'warn'],
      ['Pull requests', 'ok', 'none', 'none', 'none'],
      ['Network egress', 'none', 'none', 'none', 'warn'],
    ],
    hardening: [
      ['Owner declared', false, 'No owner in .agentshield.yml'],
      ['Review before publish', false, 'Publishes without an approval step'],
      ['Least-privilege workflow token', true, ''],
      ['Actions pinned to commit SHA', false, 'release.yml uses changed-files@v35'],
    ],
  },
  {
    id: 'triage-bot', sev: 'low', score: 18, repo: 'payments-service', owner: 'AppSec', model: 'claude-haiku', via: 'mcp-github',
    paths: [], findings: 1, summary: 'Labels and comments on new issues.',
    tools: [['issues.create', 'Declared', 'issues: write'], ['issues.label', 'Declared', 'issues: write']],
    matrix: [
      ['Repository contents', 'none', 'none', 'none', 'none'],
      ['Issues', 'ok', 'ok', 'none', 'none'],
      ['Pull requests', 'ok', 'none', 'none', 'none'],
      ['Network egress', 'none', 'none', 'none', 'none'],
    ],
    hardening: [
      ['Least-privilege workflow token', true, ''],
      ['Owner declared', true, ''],
      ['Scoped to one repository', false, 'App installation covers all 3 repos'],
    ],
  },
]
