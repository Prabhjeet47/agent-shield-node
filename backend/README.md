# AgentShield — backend (Node)

Graph foundation: FalkorDB schema, idempotent ingestion, and the allowlisted
query layer. **No LLM code lives here** — the investigation agent is a separate
repo (`agent-shield-python`) and reaches the graph only by calling the named
templates in `src/graph/queries/index.js` over HTTP.

## Run it

```bash
docker compose up -d     # FalkorDB on host port 6380, browser UI on 3100
npm install
npm run schema           # indexes + unique constraints (re-runnable)
npm run seed             # load fixtures/scenario-01
npm run seed             # again — proves idempotency
npm run query:paths      # print the attack path with its evidence
npm run verify           # the P1 exit criteria, exits non-zero on failure
npm run reset            # drop the graph
```

Host port 6380, not 6379 — something is already bound to 6379 locally.
Override with `FALKORDB_HOST` / `FALKORDB_PORT` / `FALKORDB_GRAPH`.

The FalkorDB image is pinned **by digest** in `docker-compose.yml`. Cypher
constraint and index syntax moves between releases; `latest` would break the
demo on someone else's machine.

## The scenario

`fixtures/scenario-01` freezes one situation, hand-written, no GitHub needed:

```
code-assistant  -CAN_INVOKE->      write_file
                -HAS_PERMISSION->  repo:contents:write  (scope: **)
                -CAN_ACCESS->      .github/workflows/**  (confidential)
                                   ↳ build.yml USES_SECRET PROD_DEPLOY_KEY (restricted)
```

The coding agent can rewrite the workflow file that holds the production
deploy key. No single edge is alarming; the chain is. A dependency advisory
on `node-fetch@2.6.1` sits alongside it as the lower-priority contrast case.

**The fix** is one scoped change: narrow `repo:contents:write` from `**` to
`src/**`. The path returns zero rows, and the agent can still write `src/**` —
that positive test is check 3 in `verify.js`.

## Layout

| Path | Job |
|---|---|
| `src/graph/model.js` | Labels, relationships, the `uid` merge key |
| `src/graph/client.js` | Connection, `read` (RO_QUERY) vs `write`, timeout |
| `src/graph/schema.js` | Indexes and unique constraints, re-runnable |
| `src/graph/ingest.js` | Snapshot load, upserts, stale pruning, validation |
| `src/graph/queries/index.js` | **The allowlist.** Contract with the Python repo |
| `src/scripts/` | schema, seed, query:paths, verify, reset |
| `fixtures/scenario-01/` | The frozen scenario + evidence |

## Rules this code holds to

- **MERGE on `uid` alone**, then `SET` the rest. Merging on a property map
  creates a duplicate the moment any property changes.
- **Nodes first, edges second.** An edge never references a missing endpoint.
- **A fixture is a complete snapshot.** Anything not reasserted under the
  current `snapshot_sha` is pruned — that is what makes a removed permission
  actually remove the path.
- **Reads go through `roQuery`.** A bug physically cannot write.
- **`tenant_id` is injected by the query layer**, never accepted from the
  caller's params, so no caller can address another tenant.
- **Every hop is written out literally.** No variable-length patterns, every
  template `LIMIT`ed, every query under a `TIMEOUT`.
- **No secret values in the graph.** `PROD_DEPLOY_KEY` is stored as a name.

One client gotcha: the falkordb Node client only honours an **uppercase**
`TIMEOUT` option. A lowercase `timeout` is accepted and silently ignored.

## Next (P2)

Express over the same query layer — `GET /api/findings`,
`/findings/:id/attack-paths`, `/findings/:id/evidence`, `POST /recompute` —
with findings *derived* from traversal by deterministic rules, not stored by
hand. Then a `POST /query/:template` endpoint so `agent-shield-python` can
call the allowlist.
