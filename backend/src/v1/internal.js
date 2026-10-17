import express, { Router } from "express";
import { accept, verifySignature } from "../ai/client.js";
import { getJob } from "../domain/jobs.js";

// Callbacks from the AI services. Signed with AI_SHARED_SECRET (HMAC-SHA256 over the raw body).
// Bodies must match ai/contracts.js; anything else is rejected and the job is marked failed.
export const internal = Router();

internal.post("/ai/:kind/:jobId", express.text({ type: "*/*", limit: "2mb" }), (req, res) => {
  if (!verifySignature(req.body, req.get("x-agentshield-signature"))) return res.status(401).json({ error: "bad_signature" });
  if (!["investigations", "remediations", "verifications"].includes(req.params.kind)) return res.status(404).json({ error: "unknown_kind" });
  if (!getJob(req.params.jobId)) return res.status(404).json({ error: "unknown_job" });
  try {
    const job = accept(req.params.kind, req.params.jobId, JSON.parse(req.body));
    res.status(202).json({ job_id: job.id, status: job.status });
  } catch (err) {
    res.status(err.issues ? 422 : err.status ?? 400).json({ error: err.issues ? "contract_violation" : err.code ?? "rejected", message: err.message, issues: err.issues });
  }
});
