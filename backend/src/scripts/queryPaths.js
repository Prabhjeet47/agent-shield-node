import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { runTemplate } from '../graph/queries/index.js'
import { closeDb } from '../graph/client.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const scenarioDir = path.resolve(here, '../../fixtures/scenario-01')
const scenario = JSON.parse(await readFile(path.join(scenarioDir, 'scenario.json'), 'utf8'))

const scope = { tenant_id: scenario.tenant_id, project_id: scenario.project_id }
const rows = await runTemplate('agent_to_sensitive_resource', scope)

if (!rows.length) {
  console.log('no paths to sensitive resources found')
  await closeDb()
  process.exit(0)
}

for (const row of rows) {
  console.log(`\n${'─'.repeat(72)}`)
  console.log(`${row.agent}  →  ${row.tool}  →  ${row.permission}  →  ${row.resource}`)
  console.log(`${'─'.repeat(72)}`)
  console.log(`  permission scope   ${row.permission_scope}`)
  console.log(`  resource           ${row.resource}  (${row.sensitivity})`)
  if (row.workflow_path) {
    console.log(`  workflow at path   ${row.workflow_path}  (permissions: ${row.workflow_permissions})`)
  }
  if (row.secret) {
    console.log(`  reachable secret   ${row.secret}  (${row.secret_sensitivity})`)
  }
  console.log(`  edge provenance    ${row.edge_sources.join(' → ')}`)
  console.log(`  edge validation    ${row.edge_validation.join(' → ')}`)

  const evidence = await runTemplate('evidence_by_ids', {
    ...scope,
    evidence_ids: [...new Set(row.evidence_ids)],
  })
  console.log(`  evidence (${evidence.length})`)
  for (const e of evidence) {
    console.log(`    · [${e.trust_level}] ${e.id} — ${e.supports_claim}`)
    console.log(`      limits: ${e.limitations}`)
  }
}

console.log(`\n${rows.length} candidate path(s). Connectivity is not proof of exploitability.`)
await closeDb()
