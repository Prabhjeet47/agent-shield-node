// Sample remediations. Replace with GET /api/projects/:id/remediations and
// POST /api/remediations/:id/approve | /pull-requests | /verify.

export const FIX_STEPS = ['Proposed', 'Approved', 'Pull request', 'Testing', 'Verified']

export const FIXES = [
  {
    id: 'R-031', title: 'Make build.yml read-only', repo: 'payments-service', solves: ['F-0121', 'F-0117'], path: 'AP-0142',
    step: 1, state: 'approval', note: 'Waiting for your approval', proposedBy: 'investigation-agent', age: '2 h ago',
    hash: 'sha256:9f2c…a71e', file: '.github/workflows/build.yml',
    diff: [[' ', 'permissions:'], [' ', '  id-token: write'], ['-', '  contents: write'], ['+', '  contents: read'], [' ', '  pull-requests: write']],
    effect: 'Breaks AP-0142 at the HAS_PERMISSION step.', risk: 'Low. The build job only reads code and runs tests.',
    checks: [['pass', 'Static policy check', 'Passes Workflow token least privilege v14'], ['wait', 'Negative test', 'write_file cannot modify deploy.yml'], ['wait', 'Positive test', 'Build and unit tests still pass'], ['wait', 'Graph recompute', 'AP-0142 removed after the next scan']],
  },
  {
    id: 'R-029', title: 'Pin changed-files action to a safe commit', repo: 'internal-api', solves: ['F-0114'], path: 'AP-0139',
    step: 3, state: 'testing', note: 'Tests running: 2 of 5 passed', proposedBy: 'S. Shruti', age: '1 day ago', approvedBy: 'M. Okafor', pr: 'internal-api#482',
    hash: 'sha256:5e0a…b913', file: '.github/workflows/release.yml',
    diff: [['-', '      - uses: tj-actions/changed-files@v35'], ['+', '      - uses: tj-actions/changed-files@0e58ed8671d6b60d0890c21b07f8835ace038e67 # v46.0.1']],
    effect: 'Removes the advisory match on AP-0139.', risk: 'Low. Same action, fixed version.',
    checks: [['pass', 'Static policy check', 'Passes Actions pinned to a commit SHA v6'], ['pass', 'Advisory recheck', 'v46.0.1 is outside the affected range'], ['run', 'Positive test', 'Release dry run on a test tag'], ['wait', 'Negative test', 'Secrets not printed in logs'], ['wait', 'Graph recompute', 'AP-0139 removed after the next scan']],
  },
  {
    id: 'R-027', title: 'Limit docs bot to the docs/ folder', repo: 'docs-site', solves: ['F-0109'], path: 'AP-0131',
    step: 0, state: 'draft', note: 'Draft ready for review', proposedBy: 'investigation-agent', age: '3 h ago',
    hash: 'sha256:a1b8…44c2', file: 'mcp.json',
    diff: [[' ', '"fs-mcp": {'], ['-', '  "root": "./"'], ['+', '  "root": "./docs",'], ['+', '  "deny": [".env*", "config/**"]'], [' ', '}']],
    effect: 'Breaks AP-0131 at the CAN_ACCESS step.', risk: 'Medium. Check that docs-bot never needs files outside docs/.',
    checks: [['wait', 'Static policy check', 'Agent file tools need a path allowlist v3'], ['wait', 'Negative test', 'read_file cannot open .env.staging'], ['wait', 'Positive test', 'docs-bot can still edit docs pages']],
  },
  {
    id: 'R-024', title: 'Remove write_file from code-assistant', repo: 'payments-service', solves: ['F-0102'],
    step: 3, state: 'failed', note: 'A regression test failed', proposedBy: 'S. Shruti', age: '3 days ago', approvedBy: 'M. Okafor', pr: 'payments-service#477 (merged)',
    hash: 'sha256:c3d4…09fe', file: '.agentshield.yml',
    diff: [[' ', 'tools:'], [' ', '  - read_file'], ['-', '  - write_file'], [' ', '  - open_pull_request']],
    effect: 'Blocked the risky write, but also blocked normal docs work.', risk: 'High for developer workflow.',
    checks: [['pass', 'Negative test', 'write_file cannot modify deploy.yml'], ['fail', 'Positive test', 'Docs pull request flow needs file writes'], ['wait', 'Graph recompute', 'Not run because a test failed']],
    failure: 'The agent could no longer open docs pull requests. Suggested next step: allow writes only inside docs/ instead of removing the tool.',
  },
  {
    id: 'R-019', title: 'Rotate exposed staging token', repo: 'internal-api', solves: ['F-0077'],
    step: 4, state: 'verified', note: 'Verified on 9 Oct', proposedBy: 'Team API', age: '1 week ago', approvedBy: 'M. Okafor', pr: 'internal-api#466 (merged)',
    hash: 'sha256:77e0…2b1a', file: '.github/workflows/staging.yml',
    diff: [['-', '      STAGING_TOKEN: ${{ secrets.STAGING_TOKEN_2023 }}'], ['+', '      STAGING_TOKEN: ${{ secrets.STAGING_TOKEN }}']],
    effect: 'Old token revoked; new one scoped to staging only.', risk: 'Low.',
    checks: [['pass', 'Secret scan', 'Old token no longer present'], ['pass', 'Positive test', 'Staging deploy succeeded'], ['pass', 'Graph recompute', 'Path removed in scan #205']],
  },
]
