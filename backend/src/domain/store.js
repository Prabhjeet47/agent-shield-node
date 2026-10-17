import { createHash } from "node:crypto";
import { FINDINGS, getFinding } from "../fixtures/findings.js";
import { AGENTS } from "../fixtures/agents.js";
import { FIXES } from "../fixtures/fixes.js";
import { POLICIES, SAMPLES, FIELDS, OPS, MODES } from "../fixtures/policies.js";
import { NODES, EDGES, GRAPH_PATHS, SNAPSHOTS } from "../fixtures/graph.js";
import { PROJECT, PATHS, VALIDATION, AGENTS as TOP_AGENTS, GRAPH as NEIGHBOURHOOD, HISTORY } from "../fixtures/overview.js";
import { appendAudit } from "./audit.js";
import { CLOSED, REMEDIATION_STEP, TransitionError, manualFindingTransition, pathStateFromSteps } from "./lifecycle.js";

// In-memory project state seeded from fixtures. Each function here is the single place a
// change happens, so the API routes and the AI callbacks share the same rules.
// Swap this module for PostgreSQL + FalkorDB without touching the routes.

const clone = (x) => structuredClone(x);
const PATH_STATE = { Validated: "validated", "Needs evidence": "needs_evidence", Candidate: "candidate" };

export function proposalHash(file, diff) {
  return "sha256:" + createHash("sha256").update(JSON.stringify({ file, diff })).digest("hex");
}
export const shortHash = (h) => `${h.slice(0, 11)}…${h.slice(-4)}`;

const state = {
  project: { id: "default", ...clone(PROJECT) },
  findings: FINDINGS.map((f) => clone(getFinding(f.id))),
  paths: PATHS.map((p) => ({
    id: p.id, title: p.title, sev: p.sev, score: p.score, state: PATH_STATE[p.state.label],
    steps: p.steps.map(([kind, node, sensitive]) => ({ kind, node, sensitive: !!sensitive })),
    links: p.links, summary: GRAPH_PATHS.find((g) => g.id === p.id)?.title,
  })),
  agents: AGENTS.map((a) => ({ ...clone(a), why: TOP_AGENTS.find((t) => t.name === a.id)?.why ?? a.summary })),
  remediations: FIXES.map((f) => ({ ...clone(f), hash: proposalHash(f.file, f.diff) })),
  policies: POLICIES.map((p) => ({ ...clone(p), history: [{ version: p.version, edited: p.edited }] })),
  graph: { nodes: clone(NODES), edges: clone(EDGES), paths: clone(GRAPH_PATHS), snapshots: clone(SNAPSHOTS) },
  investigations: [],
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

const notFound = (what, id) => Object.assign(new Error(`${what} ${id} was not found.`), { status: 404, code: "not_found" });
const byId = (list, id, what) => list.find((x) => x.id === id) ?? (() => { throw notFound(what, id) })();

// ---------- reads ----------
export const getProject = () => state.project;
export const listFindings = () => state.findings;
export const findFinding = (id) => byId(state.findings, id, "Finding");
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
  return {
    project: { ...state.project, repos: new Set(state.findings.map((f) => f.repo)).size, agents: state.agents.length },
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
      verified30d: 7,
    },
    validation: { ...VALIDATION, states: [
      { label: "Validated", count: state.paths.filter((p) => p.state === "validated").length, tone: "accent" },
      { label: "Needs evidence", count: state.paths.filter((p) => p.state === "needs_evidence").length, tone: "med" },
      { label: "Candidate", count: state.paths.filter((p) => p.state === "candidate").length, tone: "neutral" },
      { label: "Disproven", count: state.paths.filter((p) => p.state === "disproven").length, tone: "neutral" },
    ] },
    history: { ...HISTORY, today: HISTORY.today.toISOString() },
    topPaths: [...state.paths].sort((a, b) => b.score - a.score).slice(0, 3),
    topAgents: listAgents().sort((a, b) => b.score - a.score).map((a) => ({ name: a.id, score: a.score, sev: a.sev, why: a.why })),
    neighbourhood: NEIGHBOURHOOD,
    fixes: active.slice(0, 3),
  };
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

export function openPullRequest(id, user) {
  const r = findRemediation(id);
  if (r.state !== "pr" || !r.approvedBy) throw new TransitionError("A pull request needs an approved proposal first.", "approval_required");
  const number = 490 + state.remediations.indexOf(r);
  Object.assign(r, { state: "testing", note: "CI checks running", pr: `${r.repo}#${number}` });
  setFindingStatus(r.solves, "pending_verification", "remediation-workflow");
  appendAudit({ actor: "github-app", kind: "integration", action: "pull_request.created", target: r.pr, detail: { remediation: id, auto_merge: false, opened_by: user.name } });
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
    }
  }
  if (result.finding_id) {
    const f = state.findings.find((x) => x.id === result.finding_id);
    if (f) f.activity.unshift(["Just now", "investigation-agent", `completed ${inv.investigation_id}: ${inv.paths.length} path(s), ${inv.claims.filter((c) => c.kind === "fact").length} cited claim(s)`]);
  }
  appendAudit({ actor: "investigation-agent", kind: "system", action: "investigation.completed", target: inv.investigation_id,
    detail: { paths: inv.paths.length, evidence_cited: evidenceIds.size, prompt_version: inv.prompt_version ?? "unknown" } });
  return inv;
}

export function ingestProposal(p) {
  const id = `R-0${32 + state.remediations.length}`;
  const r = {
    id, title: p.title, repo: findFinding(p.finding_id).repo, solves: [p.finding_id], path: p.path_ids[0],
    step: 0, state: "draft", note: "Draft ready for review", proposedBy: "remediation-planner", age: "just now",
    file: p.file, diff: p.diff, hash: proposalHash(p.file, p.diff), effect: p.expected_effect, risk: p.risk, strategy: p.strategy, summary: p.summary,
    checks: p.checks.map((c) => ["wait", c.name, c.detail]),
  };
  state.remediations.unshift(r);
  const f = findFinding(p.finding_id);
  f.fix = id;
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
    Object.assign(r, { state: "verified", note: `Verified · negatives ${v.negatives.passed}/${v.negatives.total}, positives ${v.positives.passed}/${v.positives.total}` });
    setFindingStatus(r.solves, "verified_fixed", "verifier");
    for (const pid of [r.path].filter(Boolean)) {
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
