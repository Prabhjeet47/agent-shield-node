import { read } from '../client.js'

/**
 * The allowlist.
 *
 * Callers pass a template NAME and parameters. Nobody supplies Cypher —
 * not this service's own API, and not the investigation agent living in
 * agent-shield-python, which reaches the graph only by calling these
 * templates by name over HTTP. Every template is read-only, tenant-filtered,
 * hop-bounded and LIMITed here rather than by whoever is calling.
 *
 * This file is the contract between the two repos. Adding a capability for
 * the agent means adding a template here, never loosening the interface.
 */

const TEMPLATES = {
  /**
   * The core traversal: which agent tools can reach a sensitive resource,
   * and does that resource carry a secret?
   *
   * Hops are written out literally — no variable-length patterns — so the
   * cost is bounded by construction.
   */
  agent_to_sensitive_resource: {
    description: 'Paths from an agent through a tool permission to a confidential or restricted resource.',
    params: ['agent_uid'],
    cypher: `
      MATCH (a:Agent)-[ci:CAN_INVOKE]->(t:Tool)
            -[hp:HAS_PERMISSION]->(p:Permission)
            -[ca:CAN_ACCESS]->(r:Resource)
      WHERE a.tenant_id  = $tenant_id
        AND a.project_id = $project_id
        AND r.tenant_id  = $tenant_id
        AND r.sensitivity IN ['confidential', 'restricted']
        AND ($agent_uid IS NULL OR a.uid = $agent_uid)
      OPTIONAL MATCH (w:Workflow)-[us:USES_SECRET]->(s:SecretReference)
      WHERE w.resource_uid = r.uid AND w.tenant_id = $tenant_id
      RETURN a.uid            AS agent_uid,
             a.name           AS agent,
             t.name           AS tool,
             p.name           AS permission,
             p.scope          AS permission_scope,
             r.uid            AS resource_uid,
             r.name           AS resource,
             r.sensitivity    AS sensitivity,
             w.path           AS workflow_path,
             w.permissions_raw AS workflow_permissions,
             s.name           AS secret,
             s.sensitivity    AS secret_sensitivity,
             [ci.assertion_source, hp.assertion_source, ca.assertion_source]    AS edge_sources,
             [ci.validation_status, hp.validation_status, ca.validation_status] AS edge_validation,
             ci.evidence_ids + hp.evidence_ids + ca.evidence_ids                AS evidence_ids
      ORDER BY sensitivity DESC, agent, tool
      LIMIT 100
    `,
  },

  /** Repository context for a detail page: workflows, packages, secrets. */
  repo_context: {
    description: 'Workflows, secrets and packages belonging to one repository.',
    params: ['repo_uid'],
    cypher: `
      MATCH (repo:Repository {uid: $repo_uid})
      WHERE repo.tenant_id = $tenant_id AND repo.project_id = $project_id
      OPTIONAL MATCH (repo)-[:HAS_WORKFLOW]->(w:Workflow)-[:USES_SECRET]->(s:SecretReference)
      OPTIONAL MATCH (repo)-[:CONTAINS_PACKAGE]->(pkg:Package)-[:AFFECTED_BY]->(v:Vulnerability)
      RETURN repo.name AS repository,
             repo.default_branch AS default_branch,
             collect(DISTINCT {
               path: w.path, permissions: w.permissions_raw,
               triggers: w.triggers, secret: s.name, secret_sensitivity: s.sensitivity
             }) AS workflows,
             collect(DISTINCT {
               package: pkg.name, version: pkg.version,
               advisory: v.name, severity: v.severity, fixed_in: v.fixed_in
             }) AS packages
      LIMIT 1
    `,
  },

  /** Evidence backing one specific claim, for the Evidence tab. */
  evidence_by_ids: {
    description: 'Evidence records by id, with provenance and stated limitations.',
    params: ['evidence_ids'],
    cypher: `
      MATCH (e:Evidence)
      WHERE e.tenant_id = $tenant_id
        AND e.external_id IN $evidence_ids
      RETURN e.external_id    AS id,
             e.name           AS name,
             e.source_type    AS source_type,
             e.source_ref     AS source_ref,
             e.trust_level    AS trust_level,
             e.collected_at   AS collected_at,
             e.content_hash   AS content_hash,
             e.supports_claim AS supports_claim,
             e.limitations    AS limitations,
             e.excerpt        AS excerpt
      ORDER BY trust_level, id
      LIMIT 50
    `,
  },

  /** What a single permission can reach — used to prove a fix is scoped. */
  permission_reach: {
    description: 'Every resource one permission grants access to.',
    params: ['permission_uid'],
    cypher: `
      MATCH (p:Permission {uid: $permission_uid})-[ca:CAN_ACCESS]->(r:Resource)
      WHERE p.tenant_id = $tenant_id AND p.project_id = $project_id
      RETURN p.name AS permission,
             p.scope AS scope,
             r.name AS resource,
             r.sensitivity AS sensitivity,
             ca.validation_status AS validation_status
      ORDER BY sensitivity DESC, resource
      LIMIT 100
    `,
  },

  /** Counts, for the idempotency check and health display. */
  graph_counts: {
    description: 'Node and relationship totals for a tenant/project.',
    params: [],
    cypher: `
      MATCH (n) WHERE n.tenant_id = $tenant_id AND n.project_id = $project_id
      WITH count(n) AS nodes
      MATCH ()-[r]->() WHERE r.tenant_id = $tenant_id AND r.project_id = $project_id
      RETURN nodes, count(r) AS relationships
    `,
  },
}

export function listTemplates() {
  return Object.entries(TEMPLATES).map(([name, t]) => ({
    name,
    description: t.description,
    params: t.params,
  }))
}

/**
 * Runs an allowlisted template.
 *
 * `tenant_id` and `project_id` come from the caller today and will come from
 * the authenticated session in P2 — they are deliberately NOT part of the
 * template's declared params, so a caller cannot choose a different tenant
 * by passing one in.
 */
export async function runTemplate(name, { tenant_id, project_id, ...params } = {}) {
  const template = TEMPLATES[name]
  if (!template) {
    throw new Error(`unknown query template "${name}". Allowed: ${Object.keys(TEMPLATES).join(', ')}`)
  }
  if (!tenant_id || !project_id) {
    throw new Error(`template "${name}" requires tenant_id and project_id`)
  }

  const bound = { tenant_id, project_id }
  for (const key of template.params) {
    bound[key] = params[key] ?? null
  }

  const unknown = Object.keys(params).filter((k) => !template.params.includes(k))
  if (unknown.length) {
    throw new Error(`template "${name}" does not accept: ${unknown.join(', ')}`)
  }

  const result = await read(template.cypher, bound)
  return result.data ?? []
}
