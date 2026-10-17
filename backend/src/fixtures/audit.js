// Seed audit rows. domain/audit.js chains them with SHA-256 on startup.
export const RAW = [
  ['16 Oct 10:41:12', 'S. Shruti', 'user', 'finding.status_changed', 'F-0121', 'success', { from: 'open', to: 'investigating' }],
  ['16 Oct 10:38:02', 'investigation-agent', 'system', 'evidence.added', 'F-0121', 'success', { kind: 'ai_hypothesis', job: 'inv-7f3c' }],
  ['16 Oct 10:22:47', 'M. Okafor', 'user', 'remediation.approved', 'R-029', 'success', { proposal_hash: 'sha256:5e0a…b913', branch: 'agentshield/pin-actions' }],
  ['16 Oct 10:22:51', 'github-app', 'integration', 'pull_request.created', 'internal-api#482', 'success', { remediation: 'R-029', auto_merge: false }],
  ['16 Oct 10:04:19', 'github-webhook', 'integration', 'scan.completed', 'payments-service@3a9f1c2', 'success', { scan: 214, nodes_changed: 14 }],
  ['16 Oct 09:58:03', 'verifier', 'system', 'verification.failed', 'R-024', 'failure', { test: 'positive: docs PR flow', finding_reopened: 'F-0102' }],
  ['16 Oct 09:58:04', 'verifier', 'system', 'finding.status_changed', 'F-0102', 'success', { from: 'pending_verification', to: 'reopened' }],
  ['16 Oct 09:31:40', 'github-app', 'integration', 'repository.sync_failed', 'internal-api', 'failure', { attempt: 2, next_retry: '6 min' }],
  ['16 Oct 09:12:08', 'S. Shruti', 'user', 'policy.updated', 'pol_pin_actions', 'success', { version: '5 → 6', mode: 'monitor → warn' }],
  ['15 Oct 18:44:10', 'T. Ruiz', 'user', 'remediation.approve_denied', 'R-031', 'denied', { reason: 'role developer cannot approve' }],
  ['15 Oct 17:20:33', 'S. Shruti', 'user', 'finding.risk_accepted', 'F-0088', 'success', { until: '2027-01-15', rationale_saved: true }],
  ['15 Oct 16:42:57', 'verifier', 'system', 'sandbox_test.completed', 'AP-0142', 'success', { test: 'write-access deploy.yml', exit: 0 }],
  ['15 Oct 15:05:12', 'M. Okafor', 'user', 'member.role_changed', 'p.nair@northwind.dev', 'success', { from: 'viewer', to: 'analyst' }],
  ['15 Oct 14:30:00', 'github-webhook', 'integration', 'webhook.rejected', 'delivery 7d1c…', 'denied', { reason: 'invalid signature' }],
  ['15 Oct 11:18:45', 'S. Shruti', 'user', 'api_key.created', 'ci-policy-tests', 'success', { scopes: 'policies:test' }],
  ['15 Oct 09:02:13', 'github-app', 'integration', 'installation.repositories_added', 'docs-site', 'success', { by: 'S. Shruti' }],
  ['14 Oct 22:10:41', 'scanner-import', 'integration', 'sarif.imported', 'payments-service', 'success', { tool: 'Semgrep 1.92', results: 37 }],
  ['14 Oct 16:55:09', 'M. Okafor', 'user', 'export.created', 'findings.csv', 'success', { rows: 13 }],
]

