import express, { Router } from "express";
import { config } from "../config.js";
import { accept, fail, verifySignature } from "../ai/client.js";
import { getJob } from "../domain/jobs.js";
import { listTemplates, runTemplate } from "../graph/queries/index.js";
import { whatIf } from "../scan/scanner.js";

// Service-to-service routes for the AI service (agent-shield-python). Every request is
// signed with AI_SHARED_SECRET (HMAC-SHA256 over the raw body, header
// x-agentshield-signature: sha256=<hex>). Bodies to /ai/* must match ai/contracts.js;
// anything else is rejected and the job is marked failed.
export const internal = Router();

const KINDS = ["investigations", "remediations", "verifications"];

// Raw body + signature check + JSON parse, for every route below.
internal.use(express.text({ type: "*/*", limit: "2mb" }), (req, res, next) => {
  const raw = typeof req.body === "string" ? req.body : "";
  if (!verifySignature(raw, req.get("x-agentshield-signature"))) {
    return res.status(401).json({ error: "bad_signature", message: "Missing or invalid x-agentshield-signature." });
  }
  try {
    req.json = raw ? JSON.parse(raw) : {};
  } catch {
    return res.status(400).json({ error: "invalid_json", message: "Body is not valid JSON." });
  }
  next();
});

// One tenant until auth exists: the scope must be this deployment's, so a caller can
// never address another tenant's graph (the query layer injects it, never the caller).
function graphScope(req, res) {
  const { tenant_id, project_id } = req.json;
  if (tenant_id !== config.tenantId || project_id !== "default") {
    res.status(403).json({ error: "wrong_scope", message: "tenant_id/project_id do not match this deployment." });
    return null;
  }
  return { tenant_id, project_id };
}

internal.post("/ai/:kind/:jobId", (req, res) => {
  if (!KINDS.includes(req.params.kind)) return res.status(404).json({ error: "unknown_kind" });
  if (!getJob(req.params.jobId)) return res.status(404).json({ error: "unknown_job" });
  try {
    const job = accept(req.params.kind, req.params.jobId, req.json);
    res.status(202).json({ job_id: job.id, status: job.status });
  } catch (err) {
    res.status(err.issues ? 422 : err.status ?? 400).json({ error: err.issues ? "contract_violation" : err.code ?? "rejected", message: err.message, issues: err.issues });
  }
});

// The AI service reports a job it could not complete (e.g. no safe automated fix).
internal.post("/ai/:kind/:jobId/failed", (req, res) => {
  if (!KINDS.includes(req.params.kind)) return res.status(404).json({ error: "unknown_kind" });
  if (!getJob(req.params.jobId)) return res.status(404).json({ error: "unknown_job" });
  const job = fail(req.params.kind, req.params.jobId, req.json.error);
  res.status(202).json({ job_id: job.id, status: job.status });
});

// The allowlisted graph templates — the only way the AI reads the graph.
internal.post("/graph/templates", (req, res) => res.json({ templates: listTemplates() }));

internal.post("/graph/query/:template", async (req, res, next) => {
  const scope = graphScope(req, res);
  if (!scope) return;
  try {
    const rows = await runTemplate(req.params.template, { ...scope, ...(req.json.params ?? {}) });
    res.json({ template: req.params.template, rows });
  } catch (err) {
    if (/unknown query template|does not accept|requires tenant_id/.test(err.message)) {
      return res.status(422).json({ error: "template_rejected", message: err.message });
    }
    next(err);
  }
});

// Graph recompute with a proposed diff applied, in a throwaway graph (the verifier's check).
internal.post("/graph/what-if", async (req, res, next) => {
  const scope = graphScope(req, res);
  if (!scope) return;
  const { repository, file, diff } = req.json;
  if (!repository || !file || !Array.isArray(diff)) {
    return res.status(422).json({ error: "invalid_request", message: "Send repository, file and diff." });
  }
  try {
    res.json(await whatIf({ repository, file, diff }));
  } catch (err) {
    if (err.status && err.status < 500) return res.status(err.status).json({ error: err.code ?? "rejected", message: err.message });
    next(err);
  }
});
