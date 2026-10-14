/**
 * The P1 exit criteria, as executable checks.
 *
 * If this exits 0, the graph foundation is done and P2 can start.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadScenario, ingestSnapshot } from '../graph/ingest.js'
import { runTemplate } from '../graph/queries/index.js'
import { applySchema } from '../graph/schema.js'
import { closeDb } from '../graph/client.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const scenarioDir = path.resolve(here, '../../fixtures/scenario-01')

let failures = 0

function check(name, ok, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`)
  if (!ok) failures++
  return ok
}

await applySchema()

const base = await loadScenario(scenarioDir)
const scope = { tenant_id: base.scenario.tenant_id, project_id: base.scenario.project_id }

// ── 1. Ingestion is idempotent ───────────────────────────────────────────
console.log('\n1. idempotent ingestion')
await ingestSnapshot(base)
const [first] = await runTemplate('graph_counts', scope)
await ingestSnapshot(base)
const [second] = await runTemplate('graph_counts', scope)

check(
  'seeding twice leaves counts unchanged',
  first.nodes === second.nodes && first.relationships === second.relationships,
  `${first.nodes}n/${first.relationships}r then ${second.nodes}n/${second.relationships}r`,
)

// ── 2. The traversal returns the expected path ───────────────────────────
console.log('\n2. multi-hop traversal')
const paths = await runTemplate('agent_to_sensitive_resource', scope)
check('exactly one path to a sensitive resource', paths.length === 1, `got ${paths.length}`)

const p = paths[0] ?? {}
check('path is agent → tool → permission → resource',
  p.agent === 'code-assistant' &&
  p.tool === 'write_file' &&
  p.permission === 'repo:contents:write' &&
  p.resource === '.github/workflows/**',
  [p.agent, p.tool, p.permission, p.resource].join(' → '))
check('traversal reaches the restricted secret',
  p.secret === 'PROD_DEPLOY_KEY' && p.secret_sensitivity === 'restricted',
  `${p.secret} (${p.secret_sensitivity})`)

// ── 3. Removing the permission removes the path ──────────────────────────
console.log('\n3. the fix breaks the path')
const fixed = applyRemediation(base)
await ingestSnapshot(fixed)

const afterFix = await runTemplate('agent_to_sensitive_resource', scope)
check('no path to a sensitive resource after the fix', afterFix.length === 0, `got ${afterFix.length}`)

const reach = await runTemplate('permission_reach', {
  ...scope,
  permission_uid: `${scope.tenant_id}:Permission:repo:contents:write`,
})
check('positive test: the agent can still write src/**',
  reach.some((r) => r.resource === 'src/**'),
  reach.map((r) => r.resource).join(', ') || 'nothing')
check('scope was actually narrowed', reach.every((r) => r.scope === 'src/**'),
  reach[0]?.scope ?? 'n/a')

// ── 4. Provenance on every step, and state restores ──────────────────────
console.log('\n4. provenance and restore')
await ingestSnapshot(base)
const restored = await runTemplate('agent_to_sensitive_resource', scope)
check('reverting the fix brings the path back', restored.length === 1, `got ${restored.length}`)

const r0 = restored[0] ?? {}
const sources = r0.edge_sources ?? []
const validation = r0.edge_validation ?? []
check('every edge declares an assertion_source',
  sources.length === 3 && sources.every(Boolean), sources.join(' → '))
check('every edge declares a validation_status',
  validation.length === 3 && validation.every(Boolean), validation.join(' → '))

const evidence = await runTemplate('evidence_by_ids', {
  ...scope,
  evidence_ids: [...new Set(r0.evidence_ids ?? [])],
})
check('every path step resolves to stored evidence', evidence.length >= 2, `${evidence.length} records`)
check('each evidence record states its limitations',
  evidence.length > 0 && evidence.every((e) => e.limitations))

// ── Guardrails ───────────────────────────────────────────────────────────
console.log('\n5. query layer guardrails')
check('unknown templates are rejected', await rejects(() => runTemplate('drop_everything', scope)))
check('missing tenant scope is rejected', await rejects(() => runTemplate('graph_counts', {})))
check('undeclared params are rejected',
  await rejects(() => runTemplate('graph_counts', { ...scope, cypher: 'MATCH (n) DELETE n' })))

console.log(
  failures === 0
    ? '\nP1 exit criteria met.\n'
    : `\n${failures} check(s) failed.\n`,
)

await closeDb()
process.exit(failures === 0 ? 0 : 1)

/**
 * The P4 remediation, applied in memory: narrow repo:contents:write from **
 * to src/** and drop the CAN_ACCESS edge that scope was granting.
 */
function applyRemediation(snapshot) {
  const WORKFLOW_RESOURCE = 'repo-path:.github/workflows/**'
  return {
    scenario: { ...snapshot.scenario, snapshot_sha: 'fixture-0002-remediated' },
    nodes: snapshot.nodes.map((n) =>
      n.label === 'Permission' && n.external_id === 'repo:contents:write'
        ? { ...n, props: { ...n.props, scope: 'src/**' } }
        : n,
    ),
    edges: snapshot.edges.filter(
      (e) =>
        !(
          e.type === 'CAN_ACCESS' &&
          e.from.external_id === 'repo:contents:write' &&
          e.to.external_id === WORKFLOW_RESOURCE
        ),
    ),
  }
}

async function rejects(fn) {
  try {
    await fn()
    return false
  } catch {
    return true
  }
}
