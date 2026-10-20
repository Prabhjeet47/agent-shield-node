import { Router } from "express";
import { randomBytes } from "node:crypto";
import * as store from "../domain/store.js";
import { listAudit, verifyChain } from "../domain/audit.js";
import { getJob } from "../domain/jobs.js";
import { evaluate } from "../fixtures/policies.js";
import { CLOSED } from "../domain/lifecycle.js";
import * as ai from "../ai/client.js";
import { config } from "../config.js";
import { githubApp } from "../github.js";
import { listJobs } from "../domain/jobs.js";
import { fileContent, resetSamples, scanProject, scanStatus } from "../scan/scanner.js";
import { openPullRequestFor } from "../remediation/pr.js";

// Product API, /api/v1 (blueprint §08). Tenant- and project-scoped; long work returns 202 + job.
export const v1 = Router();
const PROJECT = "default";

v1.param("projectId", (req, res, next, id) => {
  if (id !== PROJECT) return res.status(404).json({ error: "not_found", message: `Project ${id} was not found.` });
  next();
});

// ---------- overview, graph, search ----------
v1.get("/projects/:projectId/overview", (req, res) => res.json(store.getOverview()));
v1.get("/projects/:projectId/graph", (req, res) => res.json({ ...store.getGraph(), snapshot: req.query.snapshot ?? store.getGraph().snapshots[0]?.id ?? "scan-214" }));

// ---------- scans (live mode: findings are derived from these) ----------
v1.post("/projects/:projectId/scans", (req, res) => {
  if (store.isDemo()) return res.status(409).json({ error: "demo_mode", message: "Scans run in live mode. Set DATA_MODE=live." });
  res.status(202).json(jobBody(scanProject({ reason: req.body?.reason ?? "manual", actor: req.user.name })));
});
v1.post("/projects/:projectId/samples/reset", (req, res) => {
  if (store.isDemo()) return res.status(409).json({ error: "demo_mode", message: "Sample repos are scanned in live mode only." });
  res.status(202).json(jobBody(resetSamples(req.user.name)));
});
v1.get("/projects/:projectId/scans", (req, res) => res.json({ scans: store.listScans(), ...scanStatus(), jobs: listJobs("scans").slice(0, 10) }));
v1.get("/projects/:projectId/attack-paths", (req, res) => res.json({ paths: store.listPaths() }));
v1.get("/projects/:projectId/search", (req, res) => res.json({ results: store.search(String(req.query.q ?? "")) }));

// ---------- findings ----------
v1.get("/projects/:projectId/findings", (req, res) => {
  const rows = store.listFindings().map(({ id, title, sev, status, repo, agent, detection, owner, age, score, confidence, path, fix }) =>
    ({ id, title, sev, status, repo, agent, detection, owner, age, score, confidence, path, fix }));
  res.json({ findings: rows, me: req.user.name, closed: CLOSED });
});
v1.get("/findings/:id", (req, res) => res.json(store.findFinding(req.params.id)));
v1.patch("/findings/:id", (req, res) => res.json(store.updateFinding(req.params.id, req.body ?? {}, req.user)));
v1.patch("/projects/:projectId/findings", (req, res) => {
  const { ids = [], patch = {} } = req.body ?? {};
  res.json({ findings: ids.map((id) => store.updateFinding(id, patch, req.user)) });
});
v1.get("/findings/:id/evidence", (req, res) => res.json({ evidence: store.findFinding(req.params.id).evidence }));
v1.post("/findings/:id/recompute-paths", (req, res) => {
  const f = store.findFinding(req.params.id);
  res.status(202).json(jobBody(ai.startInvestigation({ projectId: PROJECT, findingId: f.id, goal: "Recompute paths for this finding" })));
});

// ---------- investigations (AI agent A4) ----------
v1.post("/projects/:projectId/investigations", (req, res) => {
  const { finding_id, scope, goal, max_hops, max_paths } = req.body ?? {};
  if (finding_id) store.findFinding(finding_id);
  res.status(202).json(jobBody(ai.startInvestigation({ projectId: PROJECT, findingId: finding_id, scope, goal, maxHops: max_hops, maxPaths: max_paths })));
});
v1.get("/investigations/:id", (req, res) => res.json(store.getInvestigation(req.params.id)));
v1.get("/jobs/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "not_found", message: "Job not found." });
  res.json(job);
});

// ---------- remediations (AI agents A6 + A8, human approval in between) ----------
v1.get("/projects/:projectId/remediations", (req, res) => res.json({ remediations: store.listRemediations() }));
v1.get("/remediations/:id", (req, res) => res.json(store.findRemediation(req.params.id)));
v1.post("/findings/:id/remediations", (req, res) => {
  store.findFinding(req.params.id);
  res.status(202).json(jobBody(ai.startRemediation(req.params.id)));
});
v1.post("/remediations/:id/submit", (req, res) => res.json(store.submitRemediation(req.params.id, req.user)));
v1.post("/remediations/:id/approve", (req, res) => res.json(store.approveRemediation(req.params.id, req.body?.proposal_hash, req.user)));
v1.post("/remediations/:id/pull-requests", async (req, res, next) => {
  try {
    const r = store.assertCanOpenPullRequest(req.params.id);
    const pr = store.isDemo() ? null : await openPullRequestFor(r, { fileContent });
    res.json(store.openPullRequest(req.params.id, req.user, pr));
  } catch (err) {
    if (err.status) return next(err);
    next(Object.assign(new Error(`GitHub refused the pull request: ${err.message}`), { status: 502, code: "github_error" }));
  }
});
v1.post("/remediations/:id/verify", (req, res) => {
  const r = store.findRemediation(req.params.id);
  if (!["testing", "failed"].includes(r.state)) return res.status(409).json({ error: "invalid_transition", message: "Open the pull request before verifying." });
  res.status(202).json(jobBody(ai.startVerification(r.id)));
});

// ---------- agents ----------
v1.get("/projects/:projectId/agents", (req, res) => res.json({ agents: store.listAgents() }));
v1.get("/agents/:id", (req, res) => {
  const a = store.findAgent(req.params.id);
  res.json({ ...a, pathDetails: store.listPaths().filter((p) => a.paths.includes(p.id)) });
});

// ---------- policies ----------
v1.get("/projects/:projectId/policies", (req, res) => res.json({ policies: store.listPolicies(), ...store.policyMeta }));
v1.post("/projects/:projectId/policies", (req, res) => res.status(201).json(store.createPolicy(req.user)));
v1.put("/policies/:id", (req, res) => res.json(store.savePolicy(req.params.id, req.body, req.user)));
v1.post("/policies/:id/enabled", (req, res) => res.json(store.togglePolicy(req.params.id, req.body?.on, req.user)));
v1.post("/policies/:id/test", (req, res) => {
  const draft = req.body?.draft ?? store.findPolicy(req.params.id);
  res.json(evaluate(draft, String(req.body?.input ?? "")));
});

// ---------- audit, integrations, settings ----------
v1.get("/audit-events", (req, res) => res.json({ events: listAudit(), chain: verifyChain() }));
v1.get("/integrations", (req, res) => res.json({
  ai: { mode: ai.mode(), url: config.ai.url },
  github: { configured: !!githubApp },
  data: { mode: config.dataMode, sample_repos: config.sampleRepos, last_scan: store.listScans()[0] ?? null },
}));
v1.get("/projects/:projectId/settings", (req, res) => res.json(store.settings()));
v1.patch("/projects/:projectId/settings/org", (req, res) => res.json(store.updateOrg(req.body ?? {}, req.user)));
v1.post("/projects/:projectId/members", (req, res) => {
  const email = String(req.body?.email ?? "");
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(422).json({ error: "invalid_email", message: "Enter a valid email address." });
  res.status(201).json(store.inviteMember(email, req.user));
});
v1.patch("/projects/:projectId/members/:email", (req, res) => res.json(store.setRole(req.params.email, req.body?.role, req.user)));
v1.post("/projects/:projectId/api-keys", (req, res) => {
  const secret = `ask_live_${randomBytes(15).toString("base64url")}`;
  res.status(201).json({ key: store.createApiKey(req.body?.name, secret.slice(-4), req.user), secret });
});
v1.delete("/projects/:projectId/api-keys/:id", (req, res) => { store.revokeApiKey(req.params.id, req.user); res.status(204).end() });
v1.put("/projects/:projectId/settings/notifications", (req, res) => res.json(store.setNotifications(req.body, req.user)));

function jobBody(job) {
  return { job_id: job.id, status: job.status, status_url: `/api/v1/jobs/${job.id}`, ai_mode: ai.mode() };
}
