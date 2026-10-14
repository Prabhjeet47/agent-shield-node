import { FalkorDB } from 'falkordb'

export const GRAPH_NAME = process.env.FALKORDB_GRAPH ?? 'agentshield'

const HOST = process.env.FALKORDB_HOST ?? '127.0.0.1'
const PORT = Number(process.env.FALKORDB_PORT ?? 6380)

/** Hard ceiling on every query the service issues, in milliseconds. */
export const QUERY_TIMEOUT_MS = Number(process.env.FALKORDB_TIMEOUT_MS ?? 5000)

let dbPromise = null

export function getDb() {
  dbPromise ??= FalkorDB.connect({ socket: { host: HOST, port: PORT } })
  return dbPromise
}

export async function getGraph() {
  const db = await getDb()
  return db.selectGraph(GRAPH_NAME)
}

export async function closeDb() {
  if (!dbPromise) return
  const db = await dbPromise
  dbPromise = null
  await db.close()
}

/**
 * Read-only query. Uses GRAPH.RO_QUERY so a bug — or, later, a model-driven
 * tool call — physically cannot write.
 *
 * Note the uppercase TIMEOUT: the client only forwards that spelling.
 * A lowercase `timeout` is accepted by the call and silently ignored.
 */
export async function read(cypher, params = {}, timeoutMs = QUERY_TIMEOUT_MS) {
  const graph = await getGraph()
  return graph.roQuery(cypher, { params, TIMEOUT: timeoutMs })
}

/** Write query. Only ingestion and schema setup may call this. */
export async function write(cypher, params = {}, timeoutMs = QUERY_TIMEOUT_MS) {
  const graph = await getGraph()
  return graph.query(cypher, { params, TIMEOUT: timeoutMs })
}
