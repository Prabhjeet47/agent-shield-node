import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadScenario, ingestSnapshot } from '../graph/ingest.js'
import { runTemplate } from '../graph/queries/index.js'
import { closeDb } from '../graph/client.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const scenarioDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(here, '../../fixtures/scenario-01')

const snapshot = await loadScenario(scenarioDir)
console.log(`seeding ${snapshot.scenario.id}: ${snapshot.scenario.title}\n`)

const stats = await ingestSnapshot(snapshot, { log: (line) => console.log(line) })

const [counts] = await runTemplate('graph_counts', {
  tenant_id: snapshot.scenario.tenant_id,
  project_id: snapshot.scenario.project_id,
})

console.log(
  `\nupserted ${stats.nodes} nodes / ${stats.edges} edges` +
    (stats.prunedNodes || stats.prunedEdges
      ? `, pruned ${stats.prunedNodes} stale nodes / ${stats.prunedEdges} stale edges`
      : ''),
)
console.log(`graph now holds ${counts.nodes} nodes / ${counts.relationships} relationships`)

await closeDb()
