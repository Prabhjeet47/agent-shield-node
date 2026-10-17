const PHRASES = {
  'finding.status_changed': 'changed the status of', 'finding.assigned': 'assigned', 'finding.commented': 'commented on',
  'finding.risk_accepted': 'accepted risk on', 'evidence.added': 'added evidence to', 'remediation.approved': 'approved the fix',
  'remediation.approve_denied': 'was denied approving', 'remediation.proposed': 'proposed a fix', 'remediation.submitted': 'sent for approval',
  'pull_request.created': 'opened pull request', 'scan.completed': 'scanned', 'verification.failed': 'failed verification for',
  'verification.passed': 'verified the fix', 'repository.sync_failed': 'failed to sync', 'policy.updated': 'updated policy',
  'investigation.completed': 'completed investigation', 'path.state_changed': 'changed the state of path', 'sandbox_test.completed': 'ran a sandbox test on',
}
export const describeEvent = (action) => PHRASES[action] ?? action.replace(/[._]/g, ' ')

export function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso)) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.round(s / 60)} min`
  if (s < 86400) return `${Math.round(s / 3600)} h`
  return `${Math.round(s / 86400)} d`
}

export const fmtTime = (iso) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
export const shortHash = (h) => (h ? `${h.slice(0, 11)}…${h.slice(-4)}` : '—')
