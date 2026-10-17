// Finding lifecycle from the blueprint. verified_fixed is only set by a passing verification run.
export const STATUS = {
  open: { label: 'Open', cls: 's-open' },
  investigating: { label: 'Investigating', cls: 's-inv' },
  in_remediation: { label: 'In remediation', cls: 's-rem' },
  pending_verification: { label: 'Pending verification', cls: 's-ver' },
  verified_fixed: { label: 'Verified fixed', cls: 's-fix' },
  accepted_risk: { label: 'Accepted risk', cls: 's-acc' },
  false_positive: { label: 'False positive', cls: 's-fp' },
  reopened: { label: 'Reopened', cls: 's-reo' },
}
