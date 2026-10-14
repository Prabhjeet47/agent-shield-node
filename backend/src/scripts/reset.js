import { getGraph, closeDb, GRAPH_NAME } from '../graph/client.js'

const graph = await getGraph()
try {
  await graph.delete()
  console.log(`dropped graph "${GRAPH_NAME}"`)
} catch (err) {
  if (String(err?.message ?? err).toLowerCase().includes('not exist')) {
    console.log(`graph "${GRAPH_NAME}" does not exist`)
  } else {
    throw err
  }
}
await closeDb()
