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

## Live product (P2)

`DATA_MODE=live` (default) turns the API into the real product loop. Nothing is
hand-written any more: findings are **derived** from the graph by deterministic
rules, and the AI service (`agentshield-ai` repo) investigates, proposes fixes
and verifies them.

```
GitHub repo / sample repo ─► scan ─► FalkorDB ─► derive ─► findings · paths · agents · graph
                                                    │
     UI ─► investigate ─► AI (A4) ── reads graph only via the allowlist (signed)
     UI ─► propose fix ─► AI (A6) ── scoped diff from the real file
     UI ─► submit ─► approve (hash-bound) ─► PR (GitHub App, or simulated for samples)
     UI ─► verify ─► AI (A8) ── what-if: diff applied in a throwaway graph
                          └─► all risky reaches gone + normal reaches kept ─► verified_fixed
```

### Run it end to end

```bash
docker compose up -d                       # FalkorDB
cp .env.example .env                       # set AI_SHARED_SECRET (same as the AI service)
npm install && npm run dev                 # API on :4000, scans the sample repo on first start
cd ../frontend && npm install && npm run dev   # UI on :5173
# in agentshield-ai:  make up   (AI service on :8090)   then   make e2e
```

| Piece | Where |
|---|---|
| Scanner: agents.yml, workflows, package.json → snapshot with evidence | `src/scan/` |
| Advisories (OSV, same-major fix selection) | `src/scan/osv.js` |
| Findings / paths / agents / graph view derived from templates | `src/domain/derive.js` |
| Deterministic risk score + confidence bands (LLM never sets severity) | `src/domain/risk.js` |
| Rescan merge (status/owner/fix survive; verified fixes reopen if seen again) | `store.applyScan` |
| One fix closes every finding with the same root-cause permission | `store.ingestProposal` |
| Signed internal API for the AI service: templates, what-if, job failure | `src/v1/internal.js` |
| Real PRs through the GitHub App, simulated (and merged) for sample repos | `src/remediation/` |
| Persistence of state, jobs, audit chain and scan sources | `src/domain/persist.js` → `data/` |

New product endpoints: `POST /api/v1/projects/default/scans`, `GET …/scans`,
`POST …/samples/reset` (restores the bundled sample repo for repeatable demos).

Internal endpoints (HMAC-signed with `AI_SHARED_SECRET`): `POST /api/v1/internal/graph/query/:template`,
`POST /api/v1/internal/graph/what-if`, `POST /api/v1/internal/ai/:kind/:jobId[/failed]`.

New allowlisted templates: `agent_capabilities`, `vulnerable_packages`, `workflows`,
`project_graph`, `project_evidence`; `agent_to_sensitive_resource` additionally
returns per-edge evidence and ids. `npm run verify` still passes unchanged.

Not built yet: authentication / authorisation (every request is the dev user),
multi-tenant / multi-project, PostgreSQL (state is a JSON file), sandbox runtime tests.
