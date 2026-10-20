// Risk engine (blueprint §09). Deterministic, documented, explainable:
//
//   risk_score = 100 × Σ (weight × factor), every factor normalised to 0–1.
//
// The LLM never sets severity or confidence — only this module does, from
// graph facts and evidence quality. Weights sum to 1.

export const PATH_WEIGHTS = {
  secret: 0.3,        // the path ends at a secret (restricted 1, confidential 0.6)
  sensitivity: 0.2,   // sensitivity of the reached resource
  validation: 0.2,    // how well every edge is evidenced
  mutation: 0.15,     // the tool can change things (write / mutating)
  exposure: 0.15,     // the agent reads untrusted input (PR text, issues, web)
};

const SENS = { restricted: 1, confidential: 0.7, internal: 0.2, public: 0 };
const VALID = { validated: 1, needs_evidence: 0.5, candidate: 0.3, disproven: 0 };

export function pathState(validations) {
  if (validations.some((v) => v === "disproven")) return "disproven";
  if (validations.length && validations.every((v) => v === "validated")) return "validated";
  if (validations.some((v) => v === "needs_evidence")) return "needs_evidence";
  return "candidate";
}

export function severityOf(score) {
  if (score >= 80) return "crit";
  if (score >= 60) return "high";
  if (score >= 35) return "med";
  return "low";
}

/** Blueprint confidence bands, from the evidence actually cited. */
export function confidenceOf(state, evidence) {
  if (state !== "validated") return "Tentative";
  const types = new Set(evidence.map((e) => e.source_type));
  if (types.has("sandbox_test")) return "Strong";
  if (types.has("runtime_event")) return "Confirmed";
  return "Moderate"; // static analysis shows the condition; runtime untested
}

export function scorePath({ secretSensitivity, resourceSensitivity, state, mutating, verb, readsUntrusted }) {
  const factors = [
    ["Reaches a secret", secretSensitivity === "restricted" ? 1 : secretSensitivity ? 0.6 : 0, "secret"],
    ["Sensitivity of the reached resource", SENS[resourceSensitivity] ?? 0.2, "sensitivity"],
    ["Every step backed by evidence", VALID[state] ?? 0.3, "validation"],
    ["Tool can modify what it reaches", mutating || verb === "write" ? 1 : 0.2, "mutation"],
    ["Agent reads untrusted input", readsUntrusted ? 1 : 0.3, "exposure"],
  ];
  const score = Math.round(100 * factors.reduce((s, [, v, k]) => s + PATH_WEIGHTS[k] * v, 0));
  return { score, sev: severityOf(score), factors: factors.map(([label, v]) => [label, Math.round(v * 100) / 100]) };
}

const ADVISORY_BASE = { critical: 85, high: 65, medium: 40, low: 15 };
export function scoreAdvisory(severity, { production = true } = {}) {
  const base = ADVISORY_BASE[severity] ?? 40;
  const score = Math.round(production ? base : base * 0.6);
  return {
    score,
    sev: severityOf(score),
    factors: [["Advisory severity", (ADVISORY_BASE[severity] ?? 40) / 100], ["Runtime dependency", production ? 1 : 0.6], ["Reachability of vulnerable code", 0]],
  };
}

export function scoreWorkflow({ readsRestrictedSecret, writeAll, untrustedTrigger }) {
  const factors = [
    ["Token can write to the repository", writeAll ? 1 : 0.7],
    ["Workflow reads a restricted secret", readsRestrictedSecret ? 1 : 0],
    ["Runs on untrusted pull request events", untrustedTrigger ? 1 : 0],
  ];
  const score = Math.round(100 * (0.4 * factors[0][1] + 0.35 * factors[1][1] + 0.25 * factors[2][1]));
  return { score, sev: severityOf(score), factors };
}
