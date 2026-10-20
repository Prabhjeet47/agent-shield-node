import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { write as writeTo, GRAPH_NAME, QUERY_TIMEOUT_MS } from './client.js'
import { LABELS, RELATIONSHIPS, uid } from './model.js'

/**
 * Loads a scenario directory into a plain { scenario, nodes, edges } object.
 * Kept separate from ingestion so tests can mutate the snapshot in memory
 * (that is how the "apply the fix" check works without editing files).
 */
export async function loadScenario(dir) {
  const scenario = JSON.parse(await readFile(path.join(dir, 'scenario.json'), 'utf8'))
  const nodes = []
  const edges = []

  for (const file of scenario.files) {
    const part = JSON.parse(await readFile(path.join(dir, file), 'utf8'))
    for (const node of part.nodes ?? []) nodes.push({ ...node, _file: file })
    for (const edge of part.edges ?? []) edges.push({ ...edge, _file: file })
  }

  return { scenario, nodes, edges }
}

/**
 * Upserts a complete snapshot.
 *
 * Two passes — every node first, then every edge — so an edge never
 * references an endpoint that does not exist yet.
 *
 * Idempotency rests on one rule: MERGE on `uid` and nothing else, then SET
 * the rest. Merging on a property map would create a second node the moment
 * any property changed.
 *
 * Because a fixture file is a *complete* snapshot, anything left carrying an
 * older snapshot_sha afterwards is gone from the source and is deleted. That
 * cleanup is what makes a removed permission actually remove the path.
 */
export async function ingestSnapshot({ scenario, nodes, edges }, { log = () => {}, graph = GRAPH_NAME } = {}) {
  const write = (cypher, params) => writeTo(cypher, params, QUERY_TIMEOUT_MS, graph)
  const { tenant_id, project_id, snapshot_sha, source } = scenario
  const now = new Date().toISOString()
  const stats = { nodes: 0, edges: 0, prunedNodes: 0, prunedEdges: 0 }

  validate(nodes, edges)

  const byLabel = groupBy(nodes, (n) => n.label)
  for (const [label, rows] of byLabel) {
    const params = rows.map((n) => ({
      uid: uid(tenant_id, label, n.external_id),
      props: {
        tenant_id,
        project_id,
        external_id: n.external_id,
        name: n.name ?? n.external_id,
        source,
        snapshot_sha,
        ...stringifyDeep(n.props ?? {}),
      },
    }))

    await write(
      `UNWIND $rows AS row
       MERGE (n:${label} {uid: row.uid})
       ON CREATE SET n += row.props, n.created_at = $now
       ON MATCH  SET n += row.props, n.updated_at = $now`,
      { rows: params, now },
    )
    stats.nodes += params.length
    log(`  ${String(params.length).padStart(3)} ${label}`)
  }

  const byType = groupBy(edges, (e) => e.type)
  for (const [type, rows] of byType) {
    const params = rows.map((e) => ({
      from: uid(tenant_id, e.from.label, e.from.external_id),
      to: uid(tenant_id, e.to.label, e.to.external_id),
      props: {
        assertion_source: e.props?.assertion_source ?? 'inferred',
        validation_status: e.props?.validation_status ?? 'candidate',
        observed_at: e.props?.observed_at ?? null,
        evidence_ids: e.props?.evidence_ids ?? [],
        tenant_id,
        project_id,
        snapshot_sha,
        ...stringifyDeep(omit(e.props ?? {}, [
          'assertion_source', 'validation_status', 'observed_at', 'evidence_ids',
        ])),
      },
    }))

    // Endpoints are matched by uid only — labels are already encoded in it.
    await write(
      `UNWIND $rows AS row
       MATCH (a {uid: row.from}), (b {uid: row.to})
       MERGE (a)-[r:${type}]->(b)
       ON CREATE SET r += row.props, r.created_at = $now
       ON MATCH  SET r += row.props, r.updated_at = $now`,
      { rows: params, now },
    )
    stats.edges += params.length
    log(`  ${String(params.length).padStart(3)} ${type}`)
  }

  Object.assign(stats, await pruneStale({ tenant_id, project_id, snapshot_sha }, { graph }))
  return stats
}

/**
 * Removes graph elements this tenant/project owns that the current snapshot
 * did not reassert. Edges first, then nodes, so nothing is detached blindly.
 */
export async function pruneStale({ tenant_id, project_id, snapshot_sha }, { graph = GRAPH_NAME } = {}) {
  const write = (cypher, params) => writeTo(cypher, params, QUERY_TIMEOUT_MS, graph)
  const scope = { tenant_id, project_id, snapshot_sha }

  const edgeRes = await write(
    `MATCH ()-[r]->()
     WHERE r.tenant_id = $tenant_id
       AND r.project_id = $project_id
       AND r.snapshot_sha <> $snapshot_sha
     DELETE r`,
    scope,
  )

  const nodeRes = await write(
    `MATCH (n)
     WHERE n.tenant_id = $tenant_id
       AND n.project_id = $project_id
       AND n.snapshot_sha <> $snapshot_sha
     DETACH DELETE n`,
    scope,
  )

  return {
    prunedEdges: edgeRes?.metadata?.['Relationships deleted'] ?? 0,
    prunedNodes: nodeRes?.metadata?.['Nodes deleted'] ?? 0,
  }
}

function validate(nodes, edges) {
  const seen = new Set()
  for (const n of nodes) {
    if (!LABELS.includes(n.label)) {
      throw new Error(`${n._file}: unknown label "${n.label}"`)
    }
    if (!n.external_id) throw new Error(`${n._file}: node missing external_id`)
    const key = `${n.label}:${n.external_id}`
    if (seen.has(key)) throw new Error(`${n._file}: duplicate node ${key}`)
    seen.add(key)
  }
  for (const e of edges) {
    if (!RELATIONSHIPS.includes(e.type)) {
      throw new Error(`${e._file}: unknown relationship "${e.type}"`)
    }
    for (const side of ['from', 'to']) {
      const ref = e[side]
      const key = `${ref.label}:${ref.external_id}`
      if (!seen.has(key)) {
        throw new Error(`${e._file}: ${e.type} ${side} references missing node ${key}`)
      }
    }
  }
}

/**
 * FalkorDB properties hold primitives and arrays of primitives, not nested
 * maps. Anything structured is JSON-encoded rather than silently dropped.
 */
function stringifyDeep(props) {
  const out = {}
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined) continue
    if (Array.isArray(v)) {
      out[k] = v.every((x) => typeof x !== 'object') ? v : JSON.stringify(v)
    } else if (typeof v === 'object') {
      out[k] = JSON.stringify(v)
    } else {
      out[k] = v
    }
  }
  return out
}

function omit(obj, keys) {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)))
}

function groupBy(items, keyOf) {
  const map = new Map()
  for (const item of items) {
    const key = keyOf(item)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(item)
  }
  return map
}
