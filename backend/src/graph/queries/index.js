import { read, GRAPH_NAME, QUERY_TIMEOUT_MS } from '../client.js'

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
             ci.evidence_ids + hp.evidence_ids + ca.evidence_ids                AS evidence_ids,
             [ci.evidence_ids, hp.evidence_ids, ca.evidence_ids]                AS edge_evidence,
             t.uid            AS tool_uid,
             t.mutating       AS tool_mutating,
             p.uid            AS permission_uid,
             p.verb           AS permission_verb,
             p.declared_in    AS permission_declared_in,
             p.line           AS permission_line,
             a.repository     AS repository,
             a.owner          AS agent_owner,
             a.kind           AS agent_kind,
             a.reads_untrusted_input AS agent_reads_untrusted,
             w.uid            AS workflow_uid,
             us.evidence_ids  AS secret_evidence,
             us.validation_status AS secret_validation
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

  /** Every capability an agent has, sensitive or not — Agents page matrix and positive tests. */
  agent_capabilities: {
    description: 'Every agent → tool → permission → resource reach, with provenance.',
    params: [],
    cypher: `
      MATCH (a:Agent)-[ci:CAN_INVOKE]->(t:Tool)-[hp:HAS_PERMISSION]->(p:Permission)-[ca:CAN_ACCESS]->(r:Resource)
      WHERE a.tenant_id = $tenant_id AND a.project_id = $project_id
      RETURN a.uid AS agent_uid, a.name AS agent, a.repository AS repository, a.owner AS owner, a.model AS model,
             a.kind AS agent_kind, a.reads_untrusted_input AS reads_untrusted,
             t.uid AS tool_uid, t.name AS tool, t.mutating AS mutating, t.server AS server,
             p.uid AS permission_uid, p.name AS permission, p.verb AS verb, p.scope AS scope,
             r.uid AS resource_uid, r.name AS resource, r.kind AS resource_kind, r.sensitivity AS sensitivity,
             [ci.validation_status, hp.validation_status, ca.validation_status] AS edge_validation,
             [ci.assertion_source, hp.assertion_source, ca.assertion_source]    AS edge_sources,
             ci.evidence_ids + hp.evidence_ids + ca.evidence_ids                AS evidence_ids
      ORDER BY agent, tool, resource
      LIMIT 500
    `,
  },

  /** Dependencies inside an advisory's affected range. */
  vulnerable_packages: {
    description: 'Packages matched to a vulnerability advisory, per repository.',
    params: [],
    cypher: `
      MATCH (repo:Repository)-[cp:CONTAINS_PACKAGE]->(pkg:Package)-[af:AFFECTED_BY]->(v:Vulnerability)
      WHERE repo.tenant_id = $tenant_id AND repo.project_id = $project_id
      RETURN repo.uid AS repo_uid, repo.full_name AS repository, pkg.uid AS package_uid, pkg.name AS package,
             pkg.version AS version, pkg.spec AS spec, pkg.manifest AS manifest, pkg.line AS line,
             v.name AS advisory, v.severity AS severity, v.fixed_in AS fixed_in, v.affected_range AS affected_range,
             v.summary AS summary, v.url AS url,
             cp.evidence_ids + af.evidence_ids AS evidence_ids
      ORDER BY severity, package
      LIMIT 200
    `,
  },

  /** Workflows with their token permissions, triggers and secrets. */
  workflows: {
    description: 'CI workflows with permissions, triggers, actions and secrets.',
    params: [],
    cypher: `
      MATCH (repo:Repository)-[hw:HAS_WORKFLOW]->(w:Workflow)
      WHERE repo.tenant_id = $tenant_id AND repo.project_id = $project_id
      OPTIONAL MATCH (w)-[us:USES_SECRET]->(s:SecretReference)
      RETURN repo.full_name AS repository, w.uid AS workflow_uid, w.name AS name, w.path AS path,
             w.permissions_raw AS permissions, w.write_scopes AS write_scopes, w.triggers AS triggers,
             w.unpinned_actions AS unpinned_actions, w.evidence_id AS evidence_id,
             collect(DISTINCT {name: s.name, sensitivity: s.sensitivity}) AS secrets
      ORDER BY repository, path
      LIMIT 200
    `,
  },

  /** The whole project graph, for the Agent Graph page. */
  project_graph: {
    description: 'All relationships in the project with endpoint labels and provenance.',
    params: [],
    cypher: `
      MATCH (a)-[r]->(b)
      WHERE r.tenant_id = $tenant_id AND r.project_id = $project_id
        AND NOT a:Evidence AND NOT b:Evidence AND NOT a:Project AND NOT a:Organization
      RETURN a.uid AS from_uid, labels(a)[0] AS from_label, a.name AS from_name, a.repository AS from_repo,
             a.sensitivity AS from_sensitivity, a.full_name AS from_full_name,
             type(r) AS rel, r.validation_status AS validation, r.assertion_source AS source, r.evidence_ids AS evidence_ids,
             b.uid AS to_uid, labels(b)[0] AS to_label, b.name AS to_name, b.repository AS to_repo,
             b.sensitivity AS to_sensitivity, b.full_name AS to_full_name
      LIMIT 1000
    `,
  },

  /** All evidence in the project — resolves citations without a round trip per claim. */
  project_evidence: {
    description: 'Every evidence record in the project.',
    params: [],
    cypher: `
      MATCH (e:Evidence)
      WHERE e.tenant_id = $tenant_id AND e.project_id = $project_id
      RETURN e.external_id AS id, e.name AS name, e.source_type AS source_type, e.source_ref AS source_ref,
             e.trust_level AS trust_level, e.collected_at AS collected_at, e.content_hash AS content_hash,
             e.supports_claim AS supports_claim, e.limitations AS limitations, e.excerpt AS excerpt,
             e.excerpt_lines AS excerpt_lines, e.repository AS repository, e.file AS file
      ORDER BY id
      LIMIT 1000
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
export async function runTemplate(name, { tenant_id, project_id, ...params } = {}, { graph = GRAPH_NAME } = {}) {
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

  const result = await read(template.cypher, bound, QUERY_TIMEOUT_MS, graph)
  return result.data ?? []
}
