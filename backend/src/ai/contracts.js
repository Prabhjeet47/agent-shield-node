import { z } from "zod";

// Hand-off contracts with the AI services (report §10). Versioned; the AI team publishes
// the same shapes from Pydantic. Anything that fails validation is rejected, not guessed at.
export const CONTRACT_VERSION = "2026-10-17";

const Basis = z.enum(["observed", "config", "tested", "declared", "inferred"]);

export const InvestigationResult = z.object({
  contract_version: z.string().optional(),
  investigation_id: z.string(),
  project_id: z.string(),
  finding_id: z.string().optional(),
  prompt_version: z.string().optional(),
  paths: z.array(z.object({
    path_id: z.string().optional(),
    title: z.string().max(200),
    steps: z.array(z.object({
      kind: z.string().max(40),
      node: z.string().max(200),
      edge: z.string().max(60).optional(),
      basis: Basis.optional(),
      evidence_ids: z.array(z.string()).default([]),
    })).min(1).max(6),
    contradicted: z.boolean().default(false),
  })).max(20),
  claims: z.array(z.object({
    text: z.string().max(600),
    evidence_ids: z.array(z.string()).default([]),
    kind: z.enum(["fact", "hypothesis"]),
  })).default([]),
  blast_radius: z.record(z.string(), z.number()).default({}),
  open_questions: z.array(z.string()).default([]),
});

export const ProposalResult = z.object({
  contract_version: z.string().optional(),
  finding_id: z.string(),
  strategy: z.string().max(80),
  title: z.string().max(160),
  summary: z.string().max(600),
  file: z.string().max(300),
  diff: z.array(z.tuple([z.enum([" ", "+", "-"]), z.string().max(400)])).min(1).max(200),
  expected_effect: z.string().max(300),
  risk: z.string().max(300),
  path_ids: z.array(z.string()).default([]),
  checks: z.array(z.object({ name: z.string(), detail: z.string() })).default([]),
});

export const VerificationResult = z.object({
  contract_version: z.string().optional(),
  remediation_id: z.string(),
  proposal_hash: z.string(),
  commit_sha: z.string().optional(),
  negatives: z.object({ passed: z.number().int().min(0), total: z.number().int().min(0) }),
  positives: z.object({ passed: z.number().int().min(0), total: z.number().int().min(0) }),
  path_state_after: z.enum(["removed", "downgraded", "unchanged"]),
  ci_run_url: z.string().url().optional(),
  checks: z.array(z.object({ name: z.string(), state: z.enum(["pass", "fail"]), detail: z.string() })).default([]),
});

// Report §11.11: a claim without evidence is a hypothesis, whatever the model said.
export function enforceCitations(claims, knownEvidenceIds) {
  return claims.map((c) => {
    const cited = c.evidence_ids.filter((id) => knownEvidenceIds.has(id));
    return { ...c, evidence_ids: cited, kind: cited.length ? c.kind : "hypothesis" };
  });
}
