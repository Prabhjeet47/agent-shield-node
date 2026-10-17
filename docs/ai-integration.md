# Connecting the AI services to the AgentShield API

This is the contract between the product API (`backend/`, Node) and the AI services
(investigation, remediation planning and verification, owned by the AI team). It follows
the AI & Agentic Architecture Report, §10 (hand-off contracts) and §11.10 (state machines).

## Who decides what

| The AI services | The API |
|---|---|
| Find paths, gather evidence, draft fixes, run tests | Validates every result against the contracts below |
| Return claims with `evidence_ids` | Turns any claim without known evidence into a `hypothesis` |
| Report each edge's `basis` | Sets the path state (`validated`, `needs_evidence`, `candidate`, `disproven`) |
| Report test results | Decides `verified_fixed` or `reopened` |
| Draft a diff | Computes the `proposal_hash`; approval is bound to it |

The AI never sets severity, risk score, path state or finding status.

## How a job flows

1. The UI calls the API (for example `POST /api/v1/projects/default/investigations`). The API answers `202` with a `job_id`.
2. The API sends the work to the AI service:
   `POST {AI_SERVICE_URL}/v1/{investigations|remediations|verifications}`.
   The body includes `contract_version`, `job_id`, the inputs, and a `callback_url`.
   The AI service should answer `202` straight away.
3. When the work is done, the AI service posts the result to the `callback_url`:
   `POST {PUBLIC_API_URL}/api/v1/internal/ai/{kind}/{job_id}`.
4. The API checks the signature and the contract, stores the result, applies the state rules, writes an audit event, and marks the job `succeeded`.
   The UI polls `GET /api/v1/jobs/{job_id}` and refreshes.

**Signing.** Every request in both directions carries `X-AgentShield-Signature: sha256=<hex>`.
This is an HMAC-SHA256 of the raw body using `AI_SHARED_SECRET`.
- A wrong signature returns `401`.
- A body that doesn't match the contract returns `422` with `issues`, and the job is marked `failed`.

**Replay mode.** If `AI_SERVICE_URL` is empty, the API builds results from fixtures and sends them through the same validation code. The frontend works fully before the AI service exists.

## Requests the API sends

| Kind | Body fields |
|---|---|
| `investigations` | `project_id`, `finding_id?`, `scope?`, `goal`, `max_hops` (≤5), `max_paths` (≤20) |
| `remediations` | `finding_id`, `finding` (full finding with summary and evidence) |
| `verifications` | `remediation_id`, `proposal_hash`, `pr`, `path_id` |

## Results the API accepts (source of truth: `backend/src/ai/contracts.js`)

**Investigation** (agent A4)
```json
{
  "investigation_id": "inv-123", "project_id": "default", "finding_id": "F-0109", "prompt_version": "investigator@v7",
  "paths": [{
    "path_id": "AP-0131", "title": "docs-bot to .env.staging", "contradicted": false,
    "steps": [
      { "kind": "Agent", "node": "docs-bot", "edge": "CONNECTS_TO", "basis": "config", "evidence_ids": ["e15"] },
      { "kind": "File", "node": ".env.staging" }
    ]
  }],
  "claims": [{ "text": "Sandbox read succeeded", "evidence_ids": ["e18"], "kind": "fact" }],
  "blast_radius": { "files": 3, "secrets": 1 }, "open_questions": []
}
```
`basis` is one of `observed | config | tested | declared | inferred`. A path is `validated` only when
every edge has `observed`, `config` or `tested` basis and at least one known evidence id.

**Proposal** (agent A6)
```json
{
  "finding_id": "F-0096", "strategy": "dependency_upgrade", "title": "Upgrade lodash to 4.17.21",
  "summary": "…", "file": "package.json",
  "diff": [[" ", "\"dependencies\": {"], ["-", "  \"lodash\": \"4.17.20\""], ["+", "  \"lodash\": \"4.17.21\""]],
  "expected_effect": "Removes the advisory match.", "risk": "Low.", "path_ids": [],
  "checks": [{ "name": "Negative test", "detail": "Risky action is blocked" }]
}
```
The API creates the remediation as a `draft` and computes its `proposal_hash`. A person must send it
for approval and approve it. Approval is bound to the hash.

**VerificationRun** (agent A8)
```json
{
  "remediation_id": "R-031", "proposal_hash": "sha256:…", "commit_sha": "c41e9d0",
  "negatives": { "passed": 3, "total": 3 }, "positives": { "passed": 30, "total": 30 },
  "path_state_after": "removed", "ci_run_url": "https://github.com/…",
  "checks": [{ "name": "Positive tests", "state": "pass", "detail": "30 of 30 normal tasks pass" }]
}
```
Closes as `verified_fixed` only if all negatives pass, at least 98% of positives pass, and
`path_state_after` isn't `unchanged`. Otherwise the finding is `reopened`. A `proposal_hash` that
doesn't match the approved proposal is rejected.

## Running it locally

```bash
cd backend && cp .env.example .env && npm install && npm run dev   # API on :4000 (replay mode)
cd frontend && npm install && npm run dev                          # UI on :5173, /api proxied to :4000
```
To point at the AI service, set `AI_SERVICE_URL`, `AI_SHARED_SECRET` and `PUBLIC_API_URL` in `backend/.env`.

## Product API used by the frontend (`/api/v1`)

| Method | Path | Notes |
|---|---|---|
| GET | `/projects/:id/overview` | KPIs, history, paths, agents, fixes |
| GET | `/projects/:id/graph?snapshot=` | nodes, edges, paths, snapshots |
| GET | `/projects/:id/attack-paths` · `/search?q=` | |
| GET / PATCH | `/projects/:id/findings` · `/findings/:id` | PATCH applies the state rules (409 on invalid transition) |
| POST | `/projects/:id/investigations` · `/findings/:id/recompute-paths` | 202 + job |
| GET | `/jobs/:id` · `/investigations/:id` | |
| GET | `/projects/:id/remediations` · `/remediations/:id` | |
| POST | `/findings/:id/remediations` | 202 + job (AI drafts a fix) |
| POST | `/remediations/:id/submit` · `/approve` `{proposal_hash}` · `/pull-requests` | admin only for approve; hash must match |
| POST | `/remediations/:id/verify` | 202 + job |
| GET | `/projects/:id/agents` · `/agents/:id` | |
| GET / POST / PUT | `/projects/:id/policies` · `/policies/:id` · `/policies/:id/enabled` · `/policies/:id/test` | |
| GET | `/audit-events` | events + hash-chain check |
| GET / PATCH / POST / PUT / DELETE | `/projects/:id/settings…` · `/members` · `/api-keys` | |

Data currently lives in memory, seeded from `backend/src/fixtures/`. `backend/src/domain/store.js`
is the single place to swap in PostgreSQL and FalkorDB without changing the routes.
