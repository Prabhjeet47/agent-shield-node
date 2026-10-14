/**
 * The slice of the AgentShield graph model that P1 needs.
 *
 * Full blueprint is 16 labels / 20 relationships. P1 ships only what the
 * agent -> tool -> permission -> resource traversal requires, plus the
 * package/vulnerability pair so there is a second, lower-priority finding
 * to contrast against.
 */

export const LABELS = [
  'Organization',
  'Project',
  'Repository',
  'Workflow',
  'SecretReference',
  'Agent',
  'MCPServer',
  'Tool',
  'Permission',
  'Resource',
  'Package',
  'Vulnerability',
  'Evidence',
]

export const RELATIONSHIPS = [
  'OWNS_PROJECT',
  'CONTAINS_REPOSITORY',
  'HAS_WORKFLOW',
  'USES_SECRET',
  'CONNECTS_TO',
  'CAN_INVOKE',
  'HAS_PERMISSION',
  'CAN_ACCESS',
  'CONTAINS_PACKAGE',
  'AFFECTED_BY',
]

/** Resource sensitivities that make a traversal worth reporting. */
export const SENSITIVE = ['confidential', 'restricted']

/** Provenance vocabulary — every edge must declare both. */
export const ASSERTION_SOURCES = ['declared', 'observed', 'static', 'inferred']
export const VALIDATION_STATES = ['candidate', 'needs_evidence', 'validated', 'disproven']

/**
 * The merge key. One property, one index, no composite-key ambiguity.
 * Every node in the graph is addressed by this and nothing else.
 */
export function uid(tenantId, label, externalId) {
  return `${tenantId}:${label}:${externalId}`
}
