import { createHash } from "node:crypto";
import { FINDINGS, getFinding } from "../fixtures/findings.js";
import { AGENTS } from "../fixtures/agents.js";
import { FIXES } from "../fixtures/fixes.js";
import { POLICIES, SAMPLES, FIELDS, OPS, MODES } from "../fixtures/policies.js";
import { NODES, EDGES, GRAPH_PATHS, SNAPSHOTS } from "../fixtures/graph.js";
import { PROJECT, PATHS, VALIDATION, AGENTS as TOP_AGENTS, GRAPH as NEIGHBOURHOOD, HISTORY } from "../fixtures/overview.js";
import { appendAudit } from "./audit.js";
import { config } from "../config.js";
import { CLOSED, REMEDIATION_STEP, TransitionError, manualFindingTransition, pathStateFromSteps } from "./lifecycle.js";

// Project state. Each function here is the single place a change happens, so the API
// routes, the scanner and the AI callbacks share the same rules.
//
//   DATA_MODE=live (default): findings, paths, agents and the graph are DERIVED from
//     FalkorDB by scans (domain/derive.js); fixes and investigations come from the AI
//     service. State is persisted to disk (domain/persist.js).
//   DATA_MODE=demo: the original hand-written fixtures, for screenshots and UI work.

const clone = (x) => structuredClone(x);
const PATH_STATE = { Validated: "validated", "Needs evidence": "needs_evidence", Candidate: "candidate" };

export function proposalHash(file, diff) {
  return "sha256:" + createHash("sha256").update(JSON.stringify({ file, diff })).digest("hex");
}
export const shortHash = (h) => `${h.slice(0, 11)}…${h.slice(-4)}`;

const DEMO = config.dataMode === "demo";

function sharedState() {
  return {
  policies: POLICIES.map((p) => ({ ...clone(p), history: [{ version: p.version, edited: p.edited }] })),
  members: [
    { name: "S. Shruti", email: "s.shruti@northwind.dev", role: "admin", last: "Now" },
    { name: "M. Okafor", email: "m.okafor@northwind.dev", role: "admin", last: "18 min ago" },
    { name: "P. Nair", email: "p.nair@northwind.dev", role: "analyst", last: "1 h ago" },
    { name: "T. Ruiz", email: "t.ruiz@northwind.dev", role: "developer", last: "Yesterday" },
    { name: "L. Fischer", email: "l.fischer@northwind.dev", role: "auditor", last: "3 days ago" },
  ],
  apiKeys: [
    { id: "key_1", name: "ci-policy-tests", masked: "ask_live_••••••3f9a", scopes: "policies:test", created: "15 Oct", lastUsed: "12 min ago" },
    { id: "key_2", name: "sarif-upload", masked: "ask_live_••••••81c0", scopes: "scans:write", created: "2 Sep", lastUsed: "2 h ago" },
  ],
  org: { name: "Northwind Labs", domain: "northwind.dev", region: "in", retention: "400" },
  notifications: { Critical: [1, 1, 1], High: [1, 1, 0], Medium: [1, 0, 0], Low: [1, 0, 0], "Fix needs approval": [1, 1, 1] },
  };
}

function demoState() {
  return {

  project: { id: "default", ...clone(PROJECT) },
  findings: FINDINGS.map((f) => clone(getFinding(f.id))),
  paths: PATHS.map((p) => ({
    id: p.id, title: p.title, sev: p.sev, score: p.score, state: PATH_STATE[p.state.label],
    steps: p.steps.map(([kind, node, sensitive]) => ({ kind, node, sensitive: !!sensitive })),
    links: p.links, summary: GRAPH_PATHS.find((g) => g.id === p.id)?.title,
  })),
  agents: AGENTS.map((a) => ({ ...clone(a), why: TOP_AGENTS.find((t) => t.name === a.id)?.why ?? a.summary })),
  remediations: FIXES.map((f) => ({ ...clone(f), hash: proposalHash(f.file, f.diff) })),
  graph: { nodes: clone(NODES), edges: clone(EDGES), paths: clone(GRAPH_PATHS), snapshots: clone(SNAPSHOTS) },
  investigations: [],
    ...sharedState(),
  };
}

function liveState() {
  const base = sharedState();
  return {
    ...base,
    project: { id: "default", org: base.org.name, name: config.projectName, repos: 0, agents: 0, graphUpdated: "never", stale: null },
    findings: [],
    paths: [],
    agents: [],
    remediations: [],
    graph: { nodes: [], edges: [], paths: [], snapshots: [] },
    investigations: [],
    scans: [],
    history: [],
    derived: { neighbourhood: { nodes: [], edges: [] }, validation: { edges: 0, withEvidence: 0 }, evidenceIds: [], repos: [] },
  };
}

let state = DEMO ? demoState() : liveState();
export const isDemo = () => DEMO;
export const exportState = () => state;
export function importState(saved) {
  state = { ...liveState(), ...saved };
}

const notFound = (what, id) => Object.assign(new Error(`${what} ${id} was not found.`), { status: 404, code: "not_found" });
const byId = (list, id, what) => list.find((x) => x.id === id) ?? (() => { throw notFound(what, id) })();

// ---------- reads ----------
export const getProject = () => state.project;
const DAY = 86_400_000;
const withAge = (f) => { if (f.firstSeen) f.age = Math.max(0, Math.floor((Date.now() - Date.parse(f.firstSeen)) / DAY)); return f };
export const listFindings = () => state.findings.map(withAge);
export const findFinding = (id) => withAge(byId(state.findings, id, "Finding"));
export const listPaths = () => state.paths;
// Counts are derived from live findings so every page shows the same number.
const withLiveCounts = (a) => ({ ...a, findings: state.findings.filter((f) => f.agent === a.id && !CLOSED.includes(f.status)).length });
export const listAgents = () => state.agents.map(withLiveCounts);
export const findAgent = (id) => withLiveCounts(byId(state.agents, id, "Agent"));
export const listRemediations = () => state.remediations;
export const findRemediation = (id) => byId(state.remediations, id, "Remediation");
export const listPolicies = () => state.policies;
export const findPolicy = (id) => byId(state.policies, id, "Policy");
export const getGraph = () => state.graph;
export const getInvestigation = (id) => state.investigations.find((x) => x.investigation_id === id) ?? (() => { throw notFound("Investigation", id) })();
export const policyMeta = { SAMPLES, FIELDS, OPS, MODES };
export const settings = () => ({ org: state.org, members: state.members, apiKeys: state.apiKeys, notifications: state.notifications });

export function getOverview() {
  const open = state.findings.filter((f) => !CLOSED.includes(f.status));
  const bySev = (s) => open.filter((f) => f.sev === s).length;
  const active = state.remediations.filter((r) => r.state !== "verified");
  const count = (st) => active.filter((r) => r.state === st).length;
  const verified30d = state.remediations.filter((r) => r.state === "verified" && (!r.verifiedAt || Date.now() - Date.parse(r.verifiedAt) < 30 * DAY)).length;
  const project = DEMO
    ? { ...state.project, repos: new Set(state.findings.map((f) => f.repo)).size, agents: state.agents.length }
    : { ...state.project, repos: state.derived.repos.length, agents: state.agents.length, graphUpdated: ago(state.scans.at(-1)?.finishedAt) };
  return {
    project,
    kpis: {
      openFindings: open.length,
      bySeverity: { crit: bySev("crit"), high: bySev("high"), med: bySev("med"), low: bySev("low") },
      paths: {
        validated: state.paths.filter((p) => p.state === "validated").length,
        needs_evidence: state.paths.filter((p) => p.state === "needs_evidence").length,
        candidate: state.paths.filter((p) => p.state === "candidate").length,
        open: state.paths.filter((p) => p.state !== "disproven").length,
        total: state.paths.length,
      },
      // Same groupings as the Fixes page tabs.
      fixes: {
        inProgress: active.length,
        draft: count("draft"),
        needsApproval: count("approval"),
        readyForPr: count("pr"),
        inCi: count("testing"),
        failed: count("failed"),
        needsYou: count("draft") + count("approval") + count("pr") + count("failed"),
      },
      verified30d: DEMO ? 7 : verified30d,
    },
    validation: { ...(DEMO ? VALIDATION : state.derived.validation), states: [
      { label: "Validated", count: state.paths.filter((p) => p.state === "validated").length, tone: "accent" },
      { label: "Needs evidence", count: state.paths.filter((p) => p.state === "needs_evidence").length, tone: "med" },
      { label: "Candidate", count: state.paths.filter((p) => p.state === "candidate").length, tone: "neutral" },
      { label: "Disproven", count: state.paths.filter((p) => p.state === "disproven").length, tone: "neutral" },
    ] },
    history: DEMO ? { ...HISTORY, today: HISTORY.today.toISOString() } : liveHistory(),
    topPaths: [...state.paths].sort((a, b) => b.score - a.score).slice(0, 3),
    topAgents: listAgents().sort((a, b) => b.score - a.score).map((a) => ({ name: a.id, score: a.score, sev: a.sev, why: a.why })),
    neighbourhood: DEMO ? NEIGHBOURHOOD : state.derived.neighbourhood,
    fixes: active.slice(0, 3),
  };
}


function ago(iso) {
  if (!iso) return "never";
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

// Open findings per day, replayed from scan / fix events (same shape as the demo HISTORY).
function liveHistory() {
  const days = 90;
  const today = new Date();
  const byDay = new Map();
  for (const h of state.history) {
    const day = days - 1 - Math.floor((today - new Date(h.at)) / DAY);
    if (day < 0 || day >= days) continue;
    const cur = byDay.get(day) ?? [day, { crit: 0, high: 0, med: 0, low: 0 }, h.text, h.kind];
    for (const k in h.delta) cur[1][k] += h.delta[k];
    cur[2] = h.text;
    byDay.set(day, cur);
  }
  return { today: today.toISOString(), days, start: { crit: 0, high: 0, med: 0, low: 0 }, events: [...byDay.values()].sort((a, b) => a[0] - b[0]) };
}

export function search(q) {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const hits = [
    ...state.findings.map((f) => ({ kind: "Finding", label: `${f.id} · ${f.title}`, to: `/findings/${f.id}` })),
    ...state.paths.map((p) => ({ kind: "Path", label: `${p.id} · ${p.summary ?? p.title}`, to: `/graph?path=${p.id}` })),
    ...state.agents.map((a) => ({ kind: "Agent", label: a.id, to: `/agents/${a.id}` })),
    ...state.remediations.map((r) => ({ kind: "Fix", label: `${r.id} · ${r.title}`, to: "/fixes" })),
    ...[...new Set(state.findings.map((f) => f.repo))].map((r) => ({ kind: "Repo", label: r, to: "/repositories" })),
  ]
  return hits.filter((h) => `${h.kind} ${h.label}`.toLowerCase().includes(needle)).slice(0, 12);
}

// ---------- findings ----------
export function updateFinding(id, patch, user) {
  const f = findFinding(id);
  if (patch.owner !== undefined) {
    f.owner = patch.owner;
    appendAudit({ actor: user.name, action: "finding.assigned", target: id, detail: { owner: patch.owner } });
  }
  if (patch.status && patch.status !== f.status) {
    const from = f.status;
    f.status = manualFindingTransition(f, patch.status, patch);
    if (patch.status === "accepted_risk") f.acceptedUntil = patch.expires;
    appendAudit({ actor: user.name, action: patch.status === "accepted_risk" ? "finding.risk_accepted" : "finding.status_changed", target: id,
      detail: { from, to: f.status, ...(patch.rationale ? { rationale: patch.rationale } : {}), ...(patch.expires ? { until: patch.expires } : {}) } });
  }
  if (patch.comment) {
    f.activity.unshift(["Just now", user.name, `commented: ${patch.comment}`]);
    appendAudit({ actor: user.name, action: "finding.commented", target: id });
  }
  return f;
}

// ---------- scans (live mode) ----------
const SEVS = ["crit", "high", "med", "low"];
const PATH_LABEL = { validated: "Validated", needs_evidence: "Needs evidence", candidate: "Candidate", disproven: "Disproven" };
const openBySev = () => Object.fromEntries(SEVS.map((k) => [k, state.findings.filter((f) => f.sev === k && !CLOSED.includes(f.status)).length]));
const clock = () => new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export const listScans = () => [...state.scans].reverse();
export const lastScan = () => state.scans.at(-1) ?? null;
export const knownEvidenceIds = () => new Set(state.derived?.evidenceIds ?? []);

// Merges a fresh derivation into the project. Findings are matched by a stable key,
// so a rescan keeps status, owner, activity and fixes. Only a verification run may
// close a finding (lifecycle.js); a scan that no longer sees a condition only flags it.
export function applyScan(derived, scan) {
  const before = openBySev();
  const now = new Date().toISOString();
  const seen = new Set();
  const FIELDS = ["title", "sev", "score", "confidence", "repo", "agent", "detection", "path", "summary", "impact", "factors", "steps", "links", "refs", "evidence_ids"];
  for (const d of derived.findings) {
    seen.add(d.key);
    const fields = Object.fromEntries(FIELDS.map((k) => [k, d[k]]));
    const f = state.findings.find((x) => x.key === d.key);
    if (f) {
      const hypotheses = f.evidence.filter((e) => e.hypothesis);
      Object.assign(f, fields, { evidence: [...d.evidence, ...hypotheses], lastSeen: now, missing: false });
      if (f.status === "verified_fixed") {
        f.status = "reopened";
        f.activity.unshift([clock(), scan.label, "found this condition again after it was verified fixed"]);
        appendAudit({ actor: "scanner", kind: "system", action: "finding.reopened", target: f.id, detail: { scan: scan.id } });
      }
    } else {
      state.findings.push({
        ...fields, key: d.key, id: d.id, evidence: d.evidence, status: "open", owner: d.defaultOwner ?? null,
        firstSeen: now, lastSeen: now, age: 0, missing: false,
        checks: [["wait", "Verification plan", "Created when a fix is proposed", "—"]],
        activity: [[clock(), scan.label, d.path ? `opened this finding from path ${d.path}` : "opened this finding"]],
      });
      appendAudit({ actor: "scanner", kind: "system", action: "finding.opened", target: d.id, detail: { scan: scan.id, severity: d.sev, score: d.score } });
    }
  }
  for (const f of state.findings) {
    if (f.key && !seen.has(f.key) && !f.missing && !CLOSED.includes(f.status)) {
      f.missing = true;
      f.activity.unshift([clock(), scan.label, "did not find this condition. Run verification to close it."]);
    }
  }

  const prev = new Map(state.paths.map((p) => [p.id, p]));
  state.paths = derived.paths.map((p) => {
    const old = prev.get(p.id);
    const keep = old?.stateSource === "investigation" && old.state !== "validated";
    return {
      id: p.id, title: p.title, sev: p.sev, score: p.score, state: keep ? old.state : p.state, stateSource: keep ? "investigation" : "scan",
      steps: p.steps, links: p.links, summary: p.summary, refs: p.refs, evidence_ids: p.evidence_ids, hops: p.hops, key: p.key,
    };
  });
  state.agents = derived.agents;
  state.graph = {
    nodes: derived.graph.nodes,
    edges: derived.graph.edges,
    paths: state.paths.map((p) => ({ id: p.id, title: p.summary, sev: p.sev, state: PATH_LABEL[p.state] ?? "Candidate" })),
    snapshots: [{ id: scan.id, label: `${scan.label} · ${clock()}`, commit: scan.commits }, ...state.graph.snapshots.filter((x) => x.id !== scan.id)].slice(0, 10),
  };
  state.derived = { neighbourhood: derived.neighbourhood, validation: derived.validation, evidenceIds: derived.evidenceIds, repos: derived.repos };

  const after = openBySev();
  const delta = Object.fromEntries(SEVS.map((k) => [k, after[k] - before[k]]).filter(([, v]) => v));
  if (Object.keys(delta).length || !state.history.length) state.history.push({ at: now, delta, text: `${scan.label}: ${derived.repos.map((r) => r.split("/").pop()).join(", ") || "no repositories"}`, kind: "scan" });
  state.scans = [...state.scans, scan].slice(-20);
  return { findings: derived.findings.length, open: after };
}

// ---------- remediations ----------
function setFindingStatus(ids, status, actor) {
  for (const id of ids) {
    const f = state.findings.find((x) => x.id === id);
    if (f && f.status !== status) {
      appendAudit({ actor, kind: "system", action: "finding.status_changed", target: id, detail: { from: f.status, to: status } });
      f.status = status;
    }
  }
}
const stepFor = (r) => { r.step = REMEDIATION_STEP[r.state]; return r };

export function submitRemediation(id, user) {
  const r = findRemediation(id);
  if (r.state !== "draft") throw new TransitionError("Only drafts can be sent for approval.");
  Object.assign(r, { state: "approval", note: "Waiting for approval" });
  appendAudit({ actor: user.name, action: "remediation.submitted", target: id, detail: { proposal_hash: r.hash } });
  return stepFor(r);
}

// Approval binds to the exact proposal hash the approver reviewed (blueprint: remediation integrity).
export function approveRemediation(id, reviewedHash, user) {
  const r = findRemediation(id);
  if (user.role !== "admin") {
    appendAudit({ actor: user.name, action: "remediation.approve_denied", target: id, result: "denied", detail: { reason: `role ${user.role} cannot approve` } });
    throw Object.assign(new Error("Only admins can approve fixes."), { status: 403, code: "forbidden" });
  }
  if (r.state !== "approval") throw new TransitionError("This fix isn't waiting for approval.");
  if (reviewedHash !== r.hash) throw new TransitionError("The proposal changed since you reviewed it. Review the new diff and approve again.", "hash_mismatch");
  Object.assign(r, { state: "pr", note: "Approved · ready to open a pull request", approvedBy: user.name });
  setFindingStatus(r.solves, "in_remediation", "remediation-workflow");
  appendAudit({ actor: user.name, action: "remediation.approved", target: id, detail: { proposal_hash: r.hash } });
  return stepFor(r);
}

export function assertCanOpenPullRequest(id) {
  const r = findRemediation(id);
  if (r.state !== "pr" || !r.approvedBy) throw new TransitionError("A pull request needs an approved proposal first.", "approval_required");
  return r;
}

// pr = { ref, url, number, branch, simulated } from remediation/pr.js
export function openPullRequest(id, user, pr = null) {
  const r = assertCanOpenPullRequest(id);
  const info = pr ?? { ref: `${r.repo}#${490 + state.remediations.indexOf(r)}`, simulated: true };
  Object.assign(r, {
    state: "testing", pr: info.ref, prUrl: info.url ?? null, prBranch: info.branch ?? null, prSimulated: !!info.simulated,
    note: info.simulated ? "Simulated PR (GitHub App not connected for this repo) · ready to verify" : "Pull request open · ready to verify",
  });
  setFindingStatus(r.solves, "pending_verification", "remediation-workflow");
  appendAudit({ actor: "github-app", kind: "integration", action: info.simulated ? "pull_request.simulated" : "pull_request.created", target: r.pr,
    detail: { remediation: id, auto_merge: false, opened_by: user.name, ...(info.url ? { url: info.url } : {}) } });
  return stepFor(r);
}

// ---------- AI hand-offs (validated by ai/contracts.js before they reach here) ----------
export function ingestInvestigation(result, evidenceIds) {
  const inv = { ...result, received_at: new Date().toISOString(), paths: result.paths.map((p) => ({ ...p, state: pathStateFromSteps(p.steps, p.contradicted) })) };
  state.investigations.push(inv);
  for (const p of inv.paths) {
    const existing = p.path_id && state.paths.find((x) => x.id === p.path_id);
    if (existing) {
      if (existing.state !== p.state) appendAudit({ actor: "risk-engine", kind: "system", action: "path.state_changed", target: existing.id, detail: { from: existing.state, to: p.state } });
      existing.state = p.state;
      existing.stateSource = "investigation";
    }
  }
  if (result.finding_id) {
    const f = state.findings.find((x) => x.id === result.finding_id);
    if (f) {
      f.activity.unshift(["Just now", "investigation-agent", `completed ${inv.investigation_id}: ${inv.paths.length} path(s), ${inv.claims.filter((c) => c.kind === "fact").length} cited claim(s)`]);
      // Hypotheses are shown so reviewers can test them, never used for scoring (report §11.11).
      f.evidence = f.evidence.filter((e) => !(e.hypothesis && e.source?.startsWith("investigation-agent")));
      for (const c of inv.claims.filter((x) => x.kind === "hypothesis").slice(0, 5)) {
        f.evidence.push({ type: "AI hypothesis", source: `investigation-agent · ${inv.investigation_id}`, trust: "Unverified", hash: "—", when: "just now",
          claim: c.text, hypothesis: true, code: [[1, "Not used for scoring. Shown so reviewers can test it."]] });
      }
      f.investigation = inv.investigation_id;
    }
  }
  appendAudit({ actor: "investigation-agent", kind: "system", action: "investigation.completed", target: inv.investigation_id,
    detail: { paths: inv.paths.length, evidence_cited: evidenceIds.size, prompt_version: inv.prompt_version ?? "unknown" } });
  return inv;
}

// Findings that share the root cause: graph paths through the same permission are
// broken by the same scoped change, so one verified fix closes all of them.
function sameRootCause(f) {
  if (f.refs?.kind !== "path" || !f.refs.permission_uid) return [];
  return state.findings.filter((x) => x.id !== f.id && x.refs?.kind === "path" && x.refs.permission_uid === f.refs.permission_uid && !CLOSED.includes(x.status));
}

export function ingestProposal(p) {
  const id = `R-0${32 + state.remediations.length}`;
  const related = sameRootCause(findFinding(p.finding_id));
  const r = {
    id, title: p.title, repo: findFinding(p.finding_id).repo, solves: [p.finding_id, ...related.map((x) => x.id)], path: p.path_ids[0],
    paths: [...new Set([...p.path_ids, ...related.map((x) => x.path)].filter(Boolean))],
    step: 0, state: "draft", note: "Draft ready for review", proposedBy: "remediation-planner", age: "just now",
    file: p.file, diff: p.diff, hash: proposalHash(p.file, p.diff), effect: p.expected_effect, risk: p.risk, strategy: p.strategy, summary: p.summary,
    checks: p.checks.map((c) => ["wait", c.name, c.detail]),
    refs: findFinding(p.finding_id).refs ?? null,
    repository: findFinding(p.finding_id).refs?.repository ?? null,
  };
  state.remediations.unshift(r);
  const f = findFinding(p.finding_id);
  f.fix = id;
  for (const x of related) {
    x.fix = id;
    x.activity.unshift(["Just now", "remediation-planner", `${id} also breaks this path (same permission as ${f.id})`]);
  }
  appendAudit({ actor: "remediation-planner", kind: "system", action: "remediation.proposed", target: id, detail: { finding: p.finding_id, proposal_hash: r.hash } });
  return r;
}

// Closure rule (report §11.10): verified_fixed only when every negative is blocked,
// positives meet the bar, and the path is gone or downgraded.
export function ingestVerification(v) {
  const r = findRemediation(v.remediation_id);
  if (v.proposal_hash !== r.hash) throw new TransitionError("Verification ran against a different proposal.", "hash_mismatch");
  const passed = v.negatives.passed === v.negatives.total && v.negatives.total > 0
    && v.positives.total > 0 && v.positives.passed / v.positives.total >= 0.98 && v.path_state_after !== "unchanged";
  r.checks = v.checks.map((c) => [c.state, c.name, c.detail]);
  if (passed) {
    r.verifiedAt = new Date().toISOString();
    Object.assign(r, { state: "verified", note: `Verified · negatives ${v.negatives.passed}/${v.negatives.total}, positives ${v.positives.passed}/${v.positives.total}` });
    const closed = r.solves.map((fid) => state.findings.find((x) => x.id === fid)).filter((x) => x && !CLOSED.includes(x.status));
    setFindingStatus(r.solves, "verified_fixed", "verifier");
    if (!DEMO && closed.length) {
      const delta = {};
      for (const x of closed) delta[x.sev] = (delta[x.sev] ?? 0) - 1;
      state.history.push({ at: new Date().toISOString(), delta, text: `Fix verified: ${r.title}`, kind: "fix" });
    }
    for (const pid of (r.paths ?? [r.path]).filter(Boolean)) {
      const path = state.paths.find((x) => x.id === pid);
      if (path) path.state = "disproven";
    }
  } else {
    Object.assign(r, { state: "failed", note: "A verification check failed", failure: v.checks.find((c) => c.state === "fail")?.detail });
    setFindingStatus(r.solves, "reopened", "verifier");
  }
  appendAudit({ actor: "verifier", kind: "system", action: passed ? "verification.passed" : "verification.failed", target: r.id, result: passed ? "success" : "failure",
    detail: { negatives: v.negatives, positives: v.positives, path_state_after: v.path_state_after } });
  return stepFor(r);
}

// ---------- policies ----------
export function savePolicy(id, draft, user) {
  const p = findPolicy(id);
  const version = p.version + 1;
  Object.assign(p, { name: draft.name, mode: draft.mode, scope: draft.scope, conditions: draft.conditions, version, edited: `just now by ${user.name}` });
  p.history.push({ version, edited: p.edited });
  appendAudit({ actor: user.name, action: "policy.updated", target: id, detail: { version, mode: draft.mode } });
  return p;
}
export function togglePolicy(id, on, user) {
  const p = findPolicy(id);
  p.on = !!on;
  appendAudit({ actor: user.name, action: on ? "policy.enabled" : "policy.disabled", target: id });
  return p;
}
export function createPolicy(user) {
  const p = { id: `pol_new_${Date.now().toString(36)}`, name: "New policy", desc: "Describe what this check enforces.", on: false, mode: "monitor", version: 0, edited: "Draft", scope: "all",
    conditions: [{ field: "Workflow file", op: "contains", value: "" }], history: [] };
  state.policies.push(p);
  appendAudit({ actor: user.name, action: "policy.created", target: p.id });
  return p;
}

// ---------- settings ----------
export function updateOrg(patch, user) { Object.assign(state.org, patch); appendAudit({ actor: user.name, action: "org.updated", target: state.org.name, detail: patch }); return state.org }
export function inviteMember(email, user) {
  const m = { name: email.split("@")[0], email, role: "developer", last: "Invited" };
  state.members.push(m);
  appendAudit({ actor: user.name, action: "member.invited", target: email });
  return m;
}
export function setRole(email, role, user) {
  const m = state.members.find((x) => x.email === email) ?? (() => { throw notFound("Member", email) })();
  appendAudit({ actor: user.name, action: "member.role_changed", target: email, detail: { from: m.role, to: role } });
  m.role = role;
  return m;
}
export function createApiKey(name, secretTail, user) {
  const k = { id: `key_${Date.now().toString(36)}`, name: name || "new-key", masked: `ask_live_••••••${secretTail}`, scopes: "scans:write", created: "Today", lastUsed: "Never" };
  state.apiKeys.unshift(k);
  appendAudit({ actor: user.name, action: "api_key.created", target: k.name, detail: { scopes: k.scopes } });
  return k;
}
export function revokeApiKey(id, user) {
  const k = byId(state.apiKeys, id, "API key");
  state.apiKeys = state.apiKeys.filter((x) => x.id !== id);
  appendAudit({ actor: user.name, action: "api_key.revoked", target: k.name });
}
export function setNotifications(matrix, user) { state.notifications = matrix; appendAudit({ actor: user.name, action: "notifications.updated", target: "project" }); return matrix }
