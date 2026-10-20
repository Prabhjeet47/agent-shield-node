import { createHash } from "node:crypto";
import { runTemplate } from "../graph/queries/index.js";
import { confidenceOf, pathState, scoreAdvisory, scorePath, scoreWorkflow, severityOf } from "./risk.js";

// Findings are DERIVED from graph traversal by deterministic rules — never
// stored by hand (README P2). Everything here is a pure function of what the
// allowlisted templates return, so re-deriving after a scan is idempotent and
// the same graph always yields the same findings, ids and scores.

const hash = (s, n = 6) => createHash("sha256").update(s).digest("hex").slice(0, n).toUpperCase();
const repoShort = (full) => String(full ?? "").split("/").pop();
const uniq = (xs) => [...new Set(xs.filter(Boolean))];
const SENSITIVE = new Set(["confidential", "restricted"]);
const SEV_RANK = { crit: 3, high: 2, med: 1, low: 0 };

const EVIDENCE_TYPE = {
  github_workflow_config: "Workflow config", agent_config: "Agent config", deterministic_check: "Scope check",
  package_manifest: "Package manifest", scanner_result: "Advisory match", runtime_event: "Runtime event", sandbox_test: "Sandbox test",
};
const EVIDENCE_TRUST = {
  github_workflow_config: "Static", agent_config: "Static", package_manifest: "Static",
  deterministic_check: "Deterministic check", scanner_result: "Scanner result", runtime_event: "Observed", sandbox_test: "Reproducible test",
};
const UI_TYPE = {
  Agent: "Agent", Repository: "Repository", Workflow: "Workflow", MCPServer: "MCPServer", Tool: "Tool",
  Permission: "Permission", Resource: "File", SecretReference: "Secret", Package: "Package", Vulnerability: "Advisory",
};
const EDGE_STATE = { validated: "validated", needs_evidence: "needs", candidate: "inferred", inferred: "inferred", disproven: "inferred" };
const LINK = { validated: "", needs_evidence: "need", candidate: "inf", inferred: "inf" };

function uiEvidence(e, when) {
  let code;
  try {
    code = JSON.parse(e.excerpt_lines ?? "[]");
  } catch {
    code = [];
  }
  if (!code.length) code = String(e.excerpt ?? "").split("\n").map((t, i) => [i + 1, t, false]);
  return {
    id: e.id, type: EVIDENCE_TYPE[e.source_type] ?? e.source_type, source: e.source_ref,
    trust: EVIDENCE_TRUST[e.source_type] ?? "Static", hash: shortHash(e.content_hash), when,
    claim: e.supports_claim, limitations: e.limitations, code,
  };
}
const shortHash = (h) => (h ? `${h.slice(0, 11)}…${h.slice(-4)}` : "—");

// ── attack paths ──────────────────────────────────────────────────────────────
function buildPaths(rows, evidence) {
  const byKey = new Map();
  for (const r of rows) {
    const key = `${r.agent_uid}|${r.tool_uid}|${r.permission_uid}|${r.resource_uid}`;
    const entry = byKey.get(key) ?? { key, row: r, secrets: [] };
    if (r.secret) entry.secrets.push({ name: r.secret, sensitivity: r.secret_sensitivity, workflow: r.workflow_path, workflow_uid: r.workflow_uid, evidence: r.secret_evidence ?? [], validation: r.secret_validation });
    byKey.set(key, entry);
  }
  return [...byKey.values()].map(({ key, row: r, secrets }) => {
    const secret = secrets.sort((a, b) => (b.sensitivity === "restricted") - (a.sensitivity === "restricted"))[0] ?? null;
    const hops = [
      { rel: "CAN_INVOKE", validation: r.edge_validation[0], source: r.edge_sources[0], evidence_ids: r.edge_evidence?.[0] ?? [] },
      { rel: "HAS_PERMISSION", validation: r.edge_validation[1], source: r.edge_sources[1], evidence_ids: r.edge_evidence?.[1] ?? [] },
      { rel: "CAN_ACCESS", validation: r.edge_validation[2], source: r.edge_sources[2], evidence_ids: r.edge_evidence?.[2] ?? [] },
    ];
    if (secret) hops.push({ rel: "USES_SECRET", validation: secret.validation ?? "validated", source: "static", evidence_ids: secret.evidence });
    const state = pathState(hops.map((h) => h.validation));
    const evidenceIds = uniq(hops.flatMap((h) => h.evidence_ids));
    const cited = evidenceIds.map((id) => evidence.get(id)).filter(Boolean);
    const risk = scorePath({
      secretSensitivity: secret?.sensitivity, resourceSensitivity: r.sensitivity, state,
      mutating: r.tool_mutating, verb: r.permission_verb, readsUntrusted: r.agent_reads_untrusted,
    });
    const selfEdit = r.resource === ".agentshield/**";
    const title = secret
      ? `${r.agent} can rewrite the workflow that reads ${secret.name}`
      : selfEdit
        ? `${r.agent} can rewrite its own permission declarations`
        : `${r.agent} can ${r.permission_verb ?? "reach"} ${r.resource} (${r.sensitivity})`;
    const steps = [
      { kind: "Agent", node: r.agent, sensitive: false },
      { kind: "Tool", node: r.tool, sensitive: false },
      { kind: "Permission", node: `${r.permission} (${r.permission_scope})`, sensitive: false },
      { kind: "File", node: r.resource, sensitive: SENSITIVE.has(r.sensitivity) },
    ];
    if (secret) steps.push({ kind: "Secret", node: secret.name, sensitive: true });
    return {
      id: `AP-${hash(key, 4)}`, key, title, sev: risk.sev, score: risk.score, state,
      steps, links: hops.map((h) => LINK[h.validation] ?? "inf"),
      summary: `${r.agent} → ${secret?.name ?? r.resource}`,
      hops, evidence_ids: evidenceIds, confidence: confidenceOf(state, cited), factors: risk.factors,
      refs: {
        agent_uid: r.agent_uid, tool_uid: r.tool_uid, permission_uid: r.permission_uid, resource_uid: r.resource_uid,
        agent: r.agent, tool: r.tool, permission: r.permission, permission_scope: r.permission_scope, permission_verb: r.permission_verb,
        permission_declared_in: r.permission_declared_in, permission_line: r.permission_line,
        resource: r.resource, sensitivity: r.sensitivity, repository: r.repository,
        workflow_path: secret?.workflow ?? r.workflow_path ?? null, workflow_uid: secret?.workflow_uid ?? null,
        secret: secret?.name ?? null, secret_sensitivity: secret?.sensitivity ?? null,
      },
      owner: r.agent_owner, readsUntrusted: !!r.agent_reads_untrusted,
    };
  });
}

// ── findings ──────────────────────────────────────────────────────────────────
function pathFinding(p, evidence, when) {
  const r = p.refs;
  const cited = p.evidence_ids.map((id) => evidence.get(id)).filter(Boolean).map((e) => uiEvidence(e, when));
  const exposure = p.readsUntrusted ? " A malicious instruction in a pull request or issue the agent reads could use this." : "";
  const summary = r.secret
    ? `${r.agent} can call ${r.tool}, which runs with ${r.permission} scoped to ${r.permission_scope}. That scope includes ${r.resource}, where ${r.workflow_path} reads ${r.secret}. So the agent can change what runs with ${r.secret}.${exposure}`
    : r.resource === ".agentshield/**"
      ? `${r.agent} can call ${r.tool}, which runs with ${r.permission} scoped to ${r.permission_scope}. That scope includes ${r.resource}, the file that declares this agent's own tools and permissions, so the agent could widen its own access.${exposure}`
      : `${r.agent} can call ${r.tool} with ${r.permission} (${r.permission_scope}), which reaches the ${r.sensitivity} resource ${r.resource}.${exposure}`;
  const impact = r.secret
    ? `Unauthorised change to a pipeline that uses ${r.secret}, and use of that secret.`
    : r.resource === ".agentshield/**"
      ? "The agent could grant itself broader tools or scopes without review."
      : `Unauthorised ${r.permission_verb ?? "access"} to ${r.resource}.`;
  return {
    key: `path:${p.key}`,
    id: `F-${hash(`path:${p.key}`, 4)}`,
    title: r.secret ? "Agent tool can reach restricted resource" : r.resource === ".agentshield/**" ? "Agent can modify its own permission declarations" : "Agent tool can reach sensitive resource",
    sev: p.sev, score: p.score, confidence: p.confidence, repo: repoShort(r.repository), agent: r.agent,
    detection: "Graph path", path: p.id, summary, impact, factors: p.factors,
    steps: p.steps.map((s) => [s.kind, s.node, s.sensitive]),
    links: p.hops.map((h) => [h.rel, LINK[h.validation] ?? "inf"]),
    evidence: cited,
    evidence_ids: p.evidence_ids,
    refs: { kind: "path", ...r, path_key: p.key },
    defaultOwner: p.owner ?? null,
  };
}

function packageFinding(v, evidence, when) {
  const risk = scoreAdvisory(v.severity);
  const key = `pkg:${v.package_uid}:${v.advisory}`;
  return {
    key, id: `F-${hash(key, 4)}`,
    title: `Dependency has an applicable advisory (${v.package} ${v.version})`,
    sev: risk.sev, score: risk.score, confidence: "Moderate", repo: repoShort(v.repository), agent: null, detection: "SCA + graph", path: null,
    summary: `${v.package} ${v.version} in ${v.manifest} is inside the affected range of ${v.advisory} (${v.affected_range}). ${v.summary ?? ""}`.trim(),
    impact: v.fixed_in ? `Fixed in ${v.fixed_in}. Reachability of the vulnerable code is not checked yet.` : "No fixed version published yet.",
    factors: risk.factors, steps: null, links: [],
    evidence: (v.evidence_ids ?? []).map((id) => evidence.get(id)).filter(Boolean).map((e) => uiEvidence(e, when)),
    evidence_ids: v.evidence_ids ?? [],
    refs: { kind: "package", package_uid: v.package_uid, package: v.package, version: v.version, spec: v.spec, manifest: v.manifest, line: v.line, advisory: v.advisory, fixed_in: v.fixed_in, affected_range: v.affected_range, repository: v.repository },
  };
}

function workflowFindings(w, evidence, when) {
  const out = [];
  const secrets = (w.secrets ?? []).filter((s) => s?.name);
  const restricted = secrets.some((s) => s.sensitivity === "restricted");
  const untrusted = (w.triggers ?? []).includes("pull_request_target");
  const ev = w.evidence_id && evidence.get(w.evidence_id) ? [uiEvidence(evidence.get(w.evidence_id), when)] : [];
  const writeAll = w.permissions === "write-all" || (w.write_scopes ?? []).includes("*");
  const writesContents = writeAll || (w.write_scopes ?? []).includes("contents");
  const base = { repo: repoShort(w.repository), agent: null, path: null, steps: null, links: [], evidence: ev, evidence_ids: w.evidence_id ? [w.evidence_id] : [] };
  if (writesContents) {
    const risk = scoreWorkflow({ readsRestrictedSecret: restricted, writeAll, untrustedTrigger: untrusted });
    const key = `wf-perm:${w.workflow_uid}`;
    out.push({
      ...base, key, id: `F-${hash(key, 4)}`, title: "Workflow grants excessive write permissions",
      sev: risk.sev, score: risk.score, confidence: "Confirmed", detection: "Static + graph",
      summary: `${w.path} runs with "${w.permissions}". The workflow token can push to the repository${restricted ? ` in a job that also reads ${secrets.map((s) => s.name).join(", ")}` : ""}.`,
      impact: "Any step (or compromised action) in this workflow can change code or other workflows.",
      factors: risk.factors,
      refs: { kind: "workflow_permissions", workflow_uid: w.workflow_uid, workflow_path: w.path, permissions: w.permissions, repository: w.repository },
    });
  }
  if (untrusted && secrets.length) {
    const key = `wf-prt:${w.workflow_uid}`;
    const score = restricted ? 72 : 55;
    out.push({
      ...base, key, id: `F-${hash(key, 4)}`, title: "pull_request_target workflow runs with secrets",
      sev: severityOf(score), score, confidence: "Moderate", detection: "Static",
      summary: `${w.path} runs on pull_request_target, which executes with repository secrets for pull requests from forks.`,
      impact: "If the job checks out or runs pull request code, a fork could read the secrets.",
      factors: [["Privileged trigger", 1], ["Secrets in the job", restricted ? 1 : 0.6], ["PR code checked out", 0]],
      refs: { kind: "workflow_trigger", workflow_uid: w.workflow_uid, workflow_path: w.path, repository: w.repository },
    });
  }
  return out;
}

// ── agents ────────────────────────────────────────────────────────────────────
function buildAgents(caps, paths, workflows) {
  const byAgent = new Map();
  for (const c of caps) {
    const a = byAgent.get(c.agent_uid) ?? { uid: c.agent_uid, name: c.agent, repo: repoShort(c.repository), owner: c.owner, model: c.model, kind: c.agent_kind, untrusted: !!c.reads_untrusted, rows: [], servers: new Set() };
    a.rows.push(c);
    if (c.server) a.servers.add(c.server);
    byAgent.set(c.agent_uid, a);
  }
  const secretFolders = new Set(workflows.filter((w) => (w.secrets ?? []).some((s) => s?.name)).map((w) => `${w.repository}:.github/workflows/**`));
  const names = new Map();
  for (const a of byAgent.values()) names.set(a.name, (names.get(a.name) ?? 0) + 1);

  return [...byAgent.values()].map((a) => {
    const id = names.get(a.name) > 1 ? `${a.name}@${a.repo}` : a.name;
    const myPaths = paths.filter((p) => p.refs.agent_uid === a.uid);
    const score = myPaths.length ? Math.max(...myPaths.map((p) => p.score)) : 12;
    const top = [...myPaths].sort((x, y) => y.score - x.score)[0];
    const grade = (row) => (String(row.scope) === "**" || String(row.scope) === "*" ? "risk" : "ok");
    const resources = new Map();
    for (const r of a.rows) {
      const cur = resources.get(r.resource) ?? { read: "none", write: "none", secret: "none", ext: "none" };
      if (r.resource_kind === "network") cur.ext = grade(r);
      else if (r.verb === "write") cur.write = grade(r);
      else cur.read = grade(r);
      if (r.verb === "write" && secretFolders.has(`${r.repository}:${r.resource}`)) cur.secret = "warn";
      resources.set(r.resource, cur);
    }
    const writes = a.rows.filter((r) => r.verb === "write");
    return {
      id, uid: a.uid, sev: severityOf(score), score, repo: a.repo, owner: a.owner ?? "Unassigned", model: a.model ?? "unknown",
      via: [...a.servers].join(", ") || "direct", paths: myPaths.map((p) => p.id),
      summary: `${a.kind ?? "AI agent"} declared in .agentshield/agents.yml (${a.repo}).`,
      why: top ? top.title : "No path to a sensitive resource",
      tools: uniq(a.rows.map((r) => `${r.tool}\u0000${r.permission} (${r.scope})`)).map((k) => {
        const [tool, perm] = k.split("\u0000");
        return [tool, "Declared in .agentshield/agents.yml", perm];
      }),
      matrix: [...resources].map(([res, g]) => [res, g.read, g.write, g.secret, g.ext]),
      hardening: [
        ["Path allowlist on file tools", !a.rows.some((r) => r.resource_kind !== "network" && String(r.scope) === "**"),
          a.rows.find((r) => String(r.scope) === "**") ? `${a.rows.find((r) => String(r.scope) === "**").tool} can reach any path` : ""],
        ["Agent cannot edit its own config", !writes.some((r) => r.resource === ".agentshield/**"), "write scope includes .agentshield/"],
        ["Agent cannot edit workflows", !writes.some((r) => r.resource === ".github/workflows/**"), "write scope includes .github/workflows/"],
        ["Egress limited to known hosts", !a.rows.some((r) => r.resource_kind === "network" && String(r.scope) === "*"), "network scope is *"],
        ["Owner declared", !!a.owner, "no owner in agents.yml"],
        ["Untrusted input treated as data", !a.untrusted, "reads PR and issue text"],
      ].map(([name, ok, why]) => [name, ok, ok ? "" : why]),
    };
  });
}

// ── graph view ────────────────────────────────────────────────────────────────
function buildGraphView(rows, paths, evidence, workflows) {
  const uidToName = new Map();
  const nameCount = new Map();
  const meta = new Map();
  const note = (row, side) => {
    const label = row[`${side}_label`];
    const sens = row[`${side}_sensitivity`];
    if (label === "Resource" || label === "SecretReference") return `Sensitivity ${sens ?? "internal"}${label === "SecretReference" ? " · reference only, value never stored" : ""}`;
    if (label === "Repository") return row[`${side}_full_name`] ?? "";
    return "";
  };
  for (const r of rows) {
    for (const side of ["from", "to"]) {
      const uid = r[`${side}_uid`];
      if (meta.has(uid)) continue;
      meta.set(uid, { label: r[`${side}_label`], name: r[`${side}_name`], repo: r[`${side}_repo`] ?? r[`${side}_full_name`], sens: r[`${side}_sensitivity`], note: note(r, side) });
      nameCount.set(r[`${side}_name`], (nameCount.get(r[`${side}_name`]) ?? 0) + 1);
    }
  }
  for (const [uid, m] of meta) uidToName.set(uid, nameCount.get(m.name) > 1 ? `${m.name} (${repoShort(m.repo)})` : m.name);

  const onPath = new Map(); // uid -> best sev
  const edgePath = new Map(); // `${from}|${rel}|${to}` -> path id
  for (const p of paths) {
    const r = p.refs;
    for (const uid of [r.agent_uid, r.tool_uid, r.permission_uid, r.resource_uid]) {
      if (SEV_RANK[p.sev] >= SEV_RANK[onPath.get(uid) ?? "low"]) onPath.set(uid, p.sev);
    }
    edgePath.set(`${r.agent_uid}|CAN_INVOKE|${r.tool_uid}`, p.id);
    edgePath.set(`${r.tool_uid}|HAS_PERMISSION|${r.permission_uid}`, p.id);
    edgePath.set(`${r.permission_uid}|CAN_ACCESS|${r.resource_uid}`, p.id);
  }
  const extra = [];
  for (const p of paths.filter((x) => x.refs.workflow_uid)) {
    const wf = workflows.find((w) => w.workflow_uid === p.refs.workflow_uid);
    if (!wf) continue;
    extra.push({ from_uid: p.refs.resource_uid, rel: "CONTAINS", to_uid: wf.workflow_uid, validation: "validated", evidence_ids: wf.evidence_id ? [wf.evidence_id] : [] });
    onPath.set(wf.workflow_uid, p.sev);
    for (const r of rows) if (r.from_uid === wf.workflow_uid && r.rel === "USES_SECRET") { edgePath.set(`${r.from_uid}|USES_SECRET|${r.to_uid}`, p.id); onPath.set(r.to_uid, p.sev); }
    edgePath.set(`${p.refs.resource_uid}|CONTAINS|${wf.workflow_uid}`, p.id);
  }

  const nodes = [...meta].map(([uid, m]) => ({
    id: uidToName.get(uid), uid, type: UI_TYPE[m.label] ?? "File",
    risk: onPath.get(uid) ?? (SENSITIVE.has(m.sens) ? "med" : "low"),
    source: m.label === "Repository" ? "GitHub App / scan" : "Scan · .agentshield and workflow files",
    repo: repoShort(m.repo), note: m.note,
  }));
  const edges = [...rows, ...extra].map((r, i) => {
    const ev = (r.evidence_ids ?? []).map((id) => evidence.get(id)).find(Boolean);
    return {
      id: `e${i}`, from: uidToName.get(r.from_uid), rel: r.rel, to: uidToName.get(r.to_uid),
      state: EDGE_STATE[r.validation] ?? "inferred", evidence: ev?.supports_claim ?? "Derived during scan.",
      path: edgePath.get(`${r.from_uid}|${r.rel}|${r.to_uid}`), evidence_ids: r.evidence_ids ?? [],
    };
  }).filter((e) => e.from && e.to);
  return { nodes, edges };
}

function neighbourhood(top, caps) {
  if (!top) return { nodes: [], edges: [] };
  const r = top.refs;
  const kinds = ["agent", "tool", "perm", top.steps[3].sensitive ? "res hot" : "res", "res hot"];
  const icons = ["bot", "wrench", "lock", "file", "key"];
  const xs = [10, 30, 51, 71, 89];
  const labels = [r.agent, r.tool, `${r.permission}`, r.resource, r.secret].filter(Boolean);
  const nodes = labels.map((label, i) => ({ id: `n${i}`, kind: kinds[i], label, x: xs[i], y: 22, icon: icons[i], detail: top.steps[i] ? `${top.steps[i].kind} on ${top.id}` : "" }));
  const edges = labels.slice(1).map((_, i) => [`n${i}`, `n${i + 1}`, true]);
  const other = caps.filter((c) => c.agent_uid === r.agent_uid && c.resource_uid !== r.resource_uid).slice(0, 2);
  other.forEach((c, j) => {
    const y = 60 + j * 18;
    nodes.push({ id: `t${j}`, kind: "tool", label: c.tool, x: 30, y, icon: "wrench", detail: `${c.permission} (${c.scope})` });
    nodes.push({ id: `r${j}`, kind: "res", label: c.resource, x: 71, y, icon: "file", detail: `Sensitivity ${c.sensitivity}` });
    edges.push(["n0", `t${j}`], [`t${j}`, `r${j}`]);
  });
  return { nodes, edges };
}

/** Runs the templates and returns everything the product API shows for one project. */
export async function deriveProject({ tenantId, projectId, scanLabel }) {
  const scope = { tenant_id: tenantId, project_id: projectId };
  const [sensitive, caps, vulns, workflows, graphRows, evidenceRows] = await Promise.all([
    runTemplate("agent_to_sensitive_resource", { ...scope, agent_uid: null }),
    runTemplate("agent_capabilities", scope),
    runTemplate("vulnerable_packages", scope),
    runTemplate("workflows", scope),
    runTemplate("project_graph", scope),
    runTemplate("project_evidence", scope),
  ]);
  const evidence = new Map(evidenceRows.map((e) => [e.id, e]));
  const when = scanLabel;
  const paths = buildPaths(sensitive, evidence).sort((a, b) => b.score - a.score);
  const findings = [
    ...paths.map((p) => pathFinding(p, evidence, when)),
    ...vulns.map((v) => packageFinding(v, evidence, when)),
    ...workflows.flatMap((w) => workflowFindings(w, evidence, when)),
  ].sort((a, b) => b.score - a.score);
  const agents = buildAgents(caps, paths, workflows);
  const graph = buildGraphView(graphRows, paths, evidence, workflows);
  const repos = uniq(graphRows.filter((r) => r.from_label === "Repository").map((r) => r.from_full_name));
  return {
    findings, paths, agents, graph, workflows, repos,
    evidenceIds: [...evidence.keys()],
    neighbourhood: neighbourhood(paths[0], caps),
    validation: { edges: graph.edges.length, withEvidence: graph.edges.filter((e) => e.evidence_ids.length).length },
  };
}
