import { applySchema } from '../graph/schema.js'
import { closeDb } from '../graph/client.js'

const result = await applySchema({ log: (line) => console.log(`  ${line}`) })
console.log(
  `\nschema: ${result.indexes} indexes created, ${result.constraints} constraints created, ${result.skipped} already present`,
)
await closeDb()
