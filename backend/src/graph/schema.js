import { ConstraintType, EntityType } from 'falkordb'
import { getGraph } from './client.js'
import { LABELS } from './model.js'

/**
 * Indexes and constraints. Safe to re-run — "already indexed" / "already
 * exists" are expected on every run after the first.
 *
 * Order matters: FalkorDB requires an exact-match index on a property
 * before a unique constraint can be created over it.
 */
export async function applySchema({ log = () => {} } = {}) {
  const graph = await getGraph()
  const result = { indexes: 0, constraints: 0, skipped: 0 }

  for (const label of LABELS) {
    if (await tolerate(() => graph.query(`CREATE INDEX FOR (n:${label}) ON (n.uid)`), result)) {
      result.indexes++
      log(`index  ${label}.uid`)
    }
  }

  // Tenant scoping is filtered on every read, so it is worth an index too.
  for (const label of LABELS) {
    if (await tolerate(() => graph.query(`CREATE INDEX FOR (n:${label}) ON (n.tenant_id)`), result)) {
      result.indexes++
    }
  }

  // The traversal's terminal filter.
  await tolerate(() => graph.query('CREATE INDEX FOR (n:Resource) ON (n.sensitivity)'), result)

  for (const label of LABELS) {
    const ok = await tolerate(
      () => graph.constraintCreate(ConstraintType.UNIQUE, EntityType.NODE, label, 'uid'),
      result,
    )
    if (ok) {
      result.constraints++
      log(`unique ${label}.uid`)
    }
  }

  return result
}

/** Runs a schema statement, swallowing only "it already exists" style errors. */
async function tolerate(fn, result) {
  try {
    await fn()
    return true
  } catch (err) {
    const msg = String(err?.message ?? err).toLowerCase()
    if (msg.includes('already') || msg.includes('exist')) {
      result.skipped++
      return false
    }
    throw err
  }
}
