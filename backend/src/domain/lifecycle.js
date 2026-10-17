// Deterministic state machines (report §11.10). The AI proposes; this code decides.

export const FINDING_STATES = ["open", "investigating", "in_remediation", "pending_verification", "verified_fixed", "accepted_risk", "false_positive", "reopened"];
export const CLOSED = ["verified_fixed", "accepted_risk", "false_positive"];

// States a person may set directly. The rest are set by approvals, PRs and verification runs.
const MANUAL = { open: true, investigating: true, accepted_risk: true, false_positive: true };

export class TransitionError extends Error {
  constructor(message, code = "invalid_transition") { super(message); this.status = 409; this.code = code; }
}

export function manualFindingTransition(finding, to, { rationale, expires } = {}) {
  if (!FINDING_STATES.includes(to)) throw new TransitionError(`Unknown status "${to}".`, "unknown_status");
  if (to === "verified_fixed") throw new TransitionError("Verified fixed is set only by a passing verification run.", "verification_required");
  if (!MANUAL[to]) throw new TransitionError(`"${to}" is set automatically by the fix workflow.`, "system_only");
  if (to === "accepted_risk") {
    if (!rationale || rationale.trim().length < 10) throw new TransitionError("Accepting risk needs a rationale of at least 10 characters.", "rationale_required");
    if (!expires || Number.isNaN(Date.parse(expires))) throw new TransitionError("Accepting risk needs a review date.", "expiry_required");
  }
  if (to === "false_positive" && (!rationale || rationale.trim().length < 10)) {
    throw new TransitionError("Marking a false positive needs a short reason.", "rationale_required");
  }
  return to;
}

// Path state from an Investigation (report §11.10): validated only when every edge has
// strong basis AND cited evidence; inferred or uncited edges need evidence.
const STRONG = new Set(["observed", "config", "tested"]);
export function pathStateFromSteps(steps, contradicted = false) {
  if (contradicted) return "disproven";
  const edges = steps.filter((s) => s.edge);
  if (edges.length === 0) return "candidate";
  const allStrong = edges.every((s) => STRONG.has(s.basis) && s.evidence_ids.length > 0);
  if (allStrong) return "validated";
  return edges.some((s) => s.basis === "inferred") ? "needs_evidence" : "candidate";
}

// Remediation states and the step shown in the UI progress bar.
export const REMEDIATION_STEP = { draft: 0, approval: 1, pr: 2, testing: 3, failed: 3, verified: 4 };
