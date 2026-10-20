import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import { createJob, getJob, updateJob } from "../domain/jobs.js";
import * as store from "../domain/store.js";
import { InvestigationResult, ProposalResult, VerificationResult, CONTRACT_VERSION, enforceCitations } from "./contracts.js";
import { fileContent, mergeIntoSample } from "../scan/scanner.js";
import { persistSoon } from "../domain/persist.js";

// The only door between this API and the AI services (report §6: intelligence plane).
// remote: POST work to the AI service; it answers later on /api/v1/internal/ai/* (signed).
// replay: no AI service configured, so results are built from fixtures after a short delay,
//         then go through exactly the same validation and ingest code.
export const mode = () => (config.ai.url ? "remote" : "replay");

export function sign(body) {
  return "sha256=" + createHmac("sha256", config.ai.secret).update(body).digest("hex");
}
export function verifySignature(body, header) {
  if (!config.ai.secret || !header) return false;
  const a = Buffer.from(sign(body)), b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function dispatch(kind, job, payload) {
  const body = JSON.stringify({ contract_version: CONTRACT_VERSION, job_id: job.id, ...payload,
    callback_url: `${config.publicApiUrl}/api/v1/internal/ai/${kind}/${job.id}` });
  const res = await fetch(`${config.ai.url}/v1/${kind}`, {
    method: "POST", body, signal: AbortSignal.timeout(10_000),
    headers: { "content-type": "application/json", "x-agentshield-signature": sign(body) },
  });
  if (!res.ok) throw new Error(`AI service answered ${res.status}`);
  updateJob(job.id, { status: "running", step: `Sent to AI service (${kind})` });
}

// Called by the internal callback route and by replay mode alike.
export function accept(kind, jobId, raw) {
  try {
    if (kind === "investigations") {
      const parsed = InvestigationResult.parse(raw);
      // Citable evidence = graph edges (demo/replay) + Evidence records from the last scan (live).
      const known = new Set([...store.getGraph().edges.map((e) => e.id), ...store.knownEvidenceIds()]);
      const result = store.ingestInvestigation({ ...parsed, claims: enforceCitations(parsed.claims, known) }, known);
      return updateJob(jobId, { status: "succeeded", step: "Investigation stored", result: { investigation_id: result.investigation_id, paths: result.paths.map((p) => ({ title: p.title, state: p.state })) } });
    }
    if (kind === "remediations") {
      const r = store.ingestProposal(ProposalResult.parse(raw));
      return updateJob(jobId, { status: "succeeded", step: "Proposal drafted", result: { remediation_id: r.id } });
    }
    if (kind === "verifications") {
      const r = store.ingestVerification(VerificationResult.parse(raw));
      // Sample repos: a verified fix on a simulated PR is merged so the graph follows it.
      if (r.state === "verified" && r.prSimulated) mergeIntoSample(r);
      return updateJob(jobId, { status: "succeeded", step: `Verification ${r.state}`, result: { remediation_id: r.id, state: r.state } });
    }
  } catch (err) {
    updateJob(jobId, { status: "failed", step: "Result rejected", error: err.issues ? "Result did not match the contract" : err.message });
    throw err;
  } finally {
    persistSoon();
  }
}

// The AI service reports a job it could not complete (no safe fix, graph unavailable…).
export function fail(kind, jobId, message) {
  return updateJob(jobId, { status: "failed", step: `AI service could not complete the ${kind.replace(/s$/, "")}`, error: String(message ?? "Failed").slice(0, 500) });
}

function replay(kind, job, build, delays = [700, 1600]) {
  setTimeout(() => updateJob(job.id, { status: "running", step: "Replay: loading graph region" }), delays[0]);
  setTimeout(() => { try { accept(kind, job.id, build()) } catch (err) { console.error("replay result rejected", err.message) } }, delays[1]);
}

// A remote job that never reports back must not hang in the UI forever.
const JOB_TIMEOUT_MS = Number(process.env.AI_JOB_TIMEOUT_MS ?? 10 * 60_000);

function start(kind, ref, payload, build) {
  const job = createJob(kind, ref);
  if (mode() === "remote") {
    dispatch(kind, job, payload).catch((err) => updateJob(job.id, { status: "failed", error: `Could not reach the AI service: ${err.message}` }));
    setTimeout(() => {
      const j = getJob(job.id);
      if (j && !["succeeded", "failed"].includes(j.status)) {
        updateJob(job.id, { status: "failed", step: "Timed out", error: `The AI service did not report back within ${Math.round(JOB_TIMEOUT_MS / 60_000)} min. Check that it can reach this API (PUBLIC_API_URL / its Node base URL).` });
      }
    }, JOB_TIMEOUT_MS).unref();
  } else {
    replay(kind, job, build);
  }
  return job;
}

// ---------- public API used by routes ----------
// What the AI sees of a finding: facts and graph references, not UI decoration.
function findingBrief(f) {
  return {
    id: f.id, title: f.title, sev: f.sev, score: f.score, status: f.status, repo: f.repo, agent: f.agent ?? null,
    detection: f.detection, path: f.path ?? null, summary: f.summary, evidence_ids: f.evidence_ids ?? [], refs: f.refs ?? null,
  };
}
const graphScope = () => ({ tenant_id: config.tenantId, project_id: "default" });

export function startInvestigation({ projectId, findingId, scope, goal, maxHops = 5, maxPaths = 20 }) {
  const finding = findingId ? store.findFinding(findingId) : null;
  const known = store.listPaths().filter((p) => !finding?.path || p.id === finding.path);
  return start("investigations", findingId ?? projectId, {
    ...graphScope(), finding_id: findingId, finding: finding ? findingBrief(finding) : null, scope, goal,
    max_hops: Math.min(maxHops, 5), max_paths: Math.min(maxPaths, 20),
    known_paths: known.map((p) => ({ path_id: p.id, state: p.state, ...(p.refs ?? {}) })),
  }, () => replayInvestigation(projectId, findingId));
}

// Files the planner may edit, at the commit the last scan read.
function filesFor(f) {
  const r = f.refs ?? {};
  const wanted = r.kind === "path" ? [r.permission_declared_in] : r.kind === "package" ? [r.manifest] : [r.workflow_path];
  return wanted.filter(Boolean).map((path) => ({ repository: r.repository, path, content: fileContent(r.repository, path) })).filter((x) => x.content != null);
}

export function startRemediation(findingId) {
  const f = store.findFinding(findingId);
  return start("remediations", findingId, { ...graphScope(), finding_id: findingId, finding: findingBrief(f), files: filesFor(f) }, () => replayProposal(findingId));
}
export function startVerification(remediationId) {
  const r = store.findRemediation(remediationId);
  return start("verifications", remediationId, {
    ...graphScope(), remediation_id: r.id, proposal_hash: r.hash, pr: r.pr, pr_url: r.prUrl ?? null, pr_simulated: !!r.prSimulated, path_id: r.path,
    finding_ids: r.solves,
    proposal: { strategy: r.strategy, repository: r.repository, file: r.file, diff: r.diff, refs: r.refs ?? null, path_ids: r.path ? [r.path] : [] },
  }, () => replayVerification(r));
}

// ---------- replay builders (stand-ins for the AI team's agents A4, A6, A8) ----------
const BASIS = { validated: "config", needs: "inferred", inferred: "inferred" };

function replayInvestigation(projectId, findingId) {
  const graph = store.getGraph();
  const finding = findingId ? store.findFinding(findingId) : null;
  const pathIds = finding?.path ? [finding.path] : store.listPaths().map((p) => p.id);
  const paths = pathIds.map((pid) => {
    const edges = graph.edges.filter((e) => e.path === pid);
    const steps = edges.map((e) => ({ kind: graph.nodes.find((n) => n.id === e.from)?.type ?? "Node", node: e.from, edge: e.rel,
      basis: e.evidence.startsWith("Sandbox") || e.evidence.startsWith("Observed") ? "tested" : BASIS[e.state], evidence_ids: e.state === "validated" ? [e.id] : [] }));
    const last = edges.at(-1);
    if (last) steps.push({ kind: graph.nodes.find((n) => n.id === last.to)?.type ?? "Node", node: last.to, evidence_ids: [] });
    return { path_id: pid, title: graph.paths.find((p) => p.id === pid)?.title ?? pid, steps, contradicted: false };
  }).filter((p) => p.steps.length);
  const cited = paths.flatMap((p) => p.steps.flatMap((s) => s.evidence_ids));
  return {
    investigation_id: `inv-${randomBytes(2).toString("hex")}`, project_id: projectId, finding_id: findingId, prompt_version: "replay@fixtures",
    paths,
    claims: [
      { text: `${paths.length} path(s) checked against stored evidence.`, evidence_ids: cited.slice(0, 3), kind: "fact" },
      { text: "Untrusted PR text could steer the agent toward these tools.", evidence_ids: [], kind: "fact" }, // uncited: becomes a hypothesis
    ],
    blast_radius: { files: 3, secrets: 1 },
  };
}

const TEMPLATES = {
  "F-0096": { strategy: "dependency_upgrade", title: "Upgrade lodash to 4.17.21", file: "package.json",
    diff: [[" ", '"dependencies": {'], ["-", '  "lodash": "4.17.20"'], ["+", '  "lodash": "4.17.21"'], [" ", "}"]],
    expected_effect: "Removes the advisory match.", risk: "Low. Patch release." },
  "F-0091": { strategy: "declare_owner", title: "Declare an owner for release-helper", file: ".agentshield.yml",
    diff: [[" ", "  - name: release-helper"], ["+", "    owner: team-api"]], expected_effect: "Ownership recorded for triage.", risk: "None." },
};
function replayProposal(findingId) {
  const f = store.findFinding(findingId);
  const t = TEMPLATES[findingId] ?? { strategy: "least_privilege_workflow_permissions", title: `Scope permissions for ${f.id}`, file: ".github/workflows/build.yml",
    diff: [[" ", "permissions:"], ["-", "  contents: write"], ["+", "  contents: read"]], expected_effect: "Removes unnecessary write access.", risk: "Low." };
  return { finding_id: findingId, summary: f.summary.slice(0, 300), path_ids: f.path ? [f.path] : [],
    checks: [{ name: "Static policy check", detail: "Proposal passes current policies" }, { name: "Negative test", detail: "Risky action is blocked" }, { name: "Positive test", detail: "Normal developer work still passes" }], ...t };
}
function replayVerification(r) {
  const fail = r.id === "R-024";
  return {
    remediation_id: r.id, proposal_hash: r.hash, commit_sha: randomBytes(4).toString("hex"),
    negatives: { passed: 3, total: 3 }, positives: fail ? { passed: 29, total: 30 } : { passed: 30, total: 30 },
    path_state_after: fail ? "downgraded" : "removed",
    checks: [
      { name: "Negative tests", state: "pass", detail: "3 of 3 risky actions blocked" },
      { name: "Positive tests", state: fail ? "fail" : "pass", detail: fail ? "Docs pull request flow needs file writes" : "30 of 30 normal tasks pass" },
      { name: "Graph recompute", state: "pass", detail: fail ? "Path downgraded" : "Path removed" },
    ],
  };
}
