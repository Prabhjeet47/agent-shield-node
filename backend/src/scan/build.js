import { createHash } from "node:crypto";
import { parseAgents, parsePackageJson, parseWorkflow, ParseError } from "./parse.js";
import { scopeMatches, scopeText } from "./glob.js";

// Turns the raw files of one or more repositories into a complete graph
// snapshot ({scenario, nodes, edges}) in the shape graph/ingest.js loads.
//
// Rules this builder holds to (same as the hand-written scenario):
//   • every edge carries assertion_source, validation_status and evidence_ids
//   • evidence stores an excerpt, a content hash and the exact source ref
//   • secrets are stored by NAME only; values never enter the graph
//   • a snapshot is complete — anything not reasserted is pruned on ingest

export const AGENTS_FILE = ".agentshield/agents.yml";
export const isWorkflow = (p) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(p);
export const RELEVANT = (p) => p === AGENTS_FILE || isWorkflow(p) || p === "package.json";

const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const short = (s, n = 10) => sha256(s).slice(0, n);

// Secrets whose names say "this reaches production" are restricted.
const RESTRICTED_SECRET = /(PROD|DEPLOY|RELEASE|PRIVATE|SIGNING|AWS|GCP|AZURE|NPM_TOKEN|PYPI)/i;

/** Resource classes a repo exposes. probe = a representative path used for scope matching. */
function resourceClasses(tree) {
  const classes = [
    { name: ".github/workflows/**", probe: ".github/workflows/__probe__.yml", sensitivity: "confidential",
      why: "CI workflow definitions. Editing one changes what runs with repository secrets." },
    { name: ".agentshield/**", probe: ".agentshield/__probe__.yml", sensitivity: "confidential",
      why: "Agent permission declarations. An agent that can edit these can widen its own access." },
  ];
  const dirs = new Set();
  for (const p of tree) {
    const top = p.split("/")[0];
    if (p.includes("/") && !top.startsWith(".") && top !== "node_modules") dirs.add(top);
    if (/(^|\/)\.env(\.|$)/.test(p)) {
      classes.push({ name: p, probe: p, sensitivity: "confidential", why: "Environment file. Usually holds configuration secrets." });
    }
  }
  for (const d of [...dirs].sort()) {
    classes.push({ name: `${d}/**`, probe: `${d}/__probe__`, sensitivity: "internal", why: "Application files." });
  }
  return classes;
}

function excerpt(lines, from, to, highlight = []) {
  const a = Math.max(1, from);
  const b = Math.min(lines.length, to);
  const code = [];
  for (let i = a; i <= b; i++) code.push([i, lines[i - 1], highlight.includes(i)]);
  return { text: code.map(([, t]) => t).join("\n"), code, from: a, to: b };
}

export function buildSnapshot({ tenantId, projectId, repos, advisories = new Map(), collectedAt = new Date().toISOString() }) {
  const nodes = [];
  const edges = [];
  const issues = []; // parse problems, reported on the scan instead of failing it
  const nodeKeys = new Set();
  const meta = { evidence: {}, repos: [], files: {} };

  const node = (label, external_id, name, props = {}) => {
    const key = `${label}:${external_id}`;
    if (nodeKeys.has(key)) return;
    nodeKeys.add(key);
    nodes.push({ label, external_id, name, props });
  };
  const edge = (type, from, to, props) => edges.push({ type, from, to, props });
  const ref = (label, external_id) => ({ label, external_id });

  const evidence = (repo, file, { sourceType, claim, limitations, from = 1, to = 40, highlight = [], trust = "confirmed", key }) => {
    const content = repo.files.get(file) ?? "";
    const lines = content.split(/\r?\n/);
    const ex = excerpt(lines, from, to, highlight);
    const id = `ev-${short(`${repo.fullName}:${file}:${key ?? `${from}-${to}`}:${claim}`)}`;
    const props = {
      source_type: sourceType,
      source_ref: `${repo.fullName}@${repo.headSha.slice(0, 7)}:${file}#L${ex.from}-L${ex.to}`,
      collected_at: collectedAt,
      content_hash: `sha256:${sha256(content)}`,
      collector_version: "agentshield-scanner/1.0.0",
      trust_level: trust,
      excerpt: ex.text.slice(0, 4000),
      excerpt_lines: JSON.stringify(ex.code),
      supports_claim: claim,
      limitations,
      repository: repo.fullName,
      file,
      sanitized: true,
    };
    node("Evidence", id, `${file} excerpt`, props);
    meta.evidence[id] = { id, ...props, code: ex.code };
    return id;
  };

  node("Organization", "org", "Organization", {});
  node("Project", projectId, projectId, {});

  for (const repo of repos) {
    const repoId = repo.fullName;
    const rp = (s) => `${repoId}:${s}`;
    meta.repos.push({ fullName: repo.fullName, name: repo.name, headSha: repo.headSha, source: repo.source, defaultBranch: repo.defaultBranch });
    for (const [p, c] of repo.files) meta.files[`${repoId}:${p}`] = c;

    node("Repository", repoId, repo.name, {
      full_name: repo.fullName, default_branch: repo.defaultBranch, head_sha: repo.headSha,
      visibility: repo.private ? "private" : "public", origin: repo.source,
    });
    edge("CONTAINS_REPOSITORY", ref("Project", projectId), ref("Repository", repoId),
      { assertion_source: "declared", validation_status: "validated" });

    // ── resources ────────────────────────────────────────────────────────
    const classes = resourceClasses(repo.tree);
    for (const c of classes) {
      node("Resource", rp(`path:${c.name}`), c.name, { kind: "file_class", repository: repoId, sensitivity: c.sensitivity, probe: c.probe, why: c.why });
    }
    node("Resource", rp("net:external"), "external-network", { kind: "network", repository: repoId, sensitivity: "internal", why: "Outbound network access." });
    const workflowsResource = rp("path:.github/workflows/**");

    // ── workflows + secrets ─────────────────────────────────────────────
    for (const file of repo.tree.filter(isWorkflow).sort()) {
      let wf;
      try {
        wf = parseWorkflow(file, repo.files.get(file) ?? "");
      } catch (err) {
        issues.push({ repo: repoId, file, message: err instanceof ParseError ? err.message : String(err) });
        continue;
      }
      const wfId = rp(file);
      const hl = [wf.permissionsLine, ...wf.secrets.map((s) => s.line)].filter(Boolean);
      const ev = evidence(repo, file, {
        sourceType: "github_workflow_config",
        claim: `${file} runs with permissions "${wf.permissionsRaw}" on ${wf.triggers.join(", ") || "no triggers"}` +
          (wf.secrets.length ? ` and reads ${[...new Set(wf.secrets.map((s) => s.name))].join(", ")}.` : "."),
        limitations: "Static read of the file at one commit. Does not prove the job executed.",
        from: 1, to: Math.min(wf.lines.length, 60), highlight: hl, key: "workflow",
      });
      node("Workflow", wfId, wf.name, {
        path: file, permissions_raw: wf.permissionsRaw, triggers: wf.triggers, write_scopes: wf.writeScopes,
        actions: wf.actions.map((a) => a.ref), unpinned_actions: wf.actions.filter((a) => !a.pinned).map((a) => a.ref),
        resource_uid: `${tenantId}:Resource:${workflowsResource}`, repository: repoId, evidence_id: ev,
      });
      edge("HAS_WORKFLOW", ref("Repository", repoId), ref("Workflow", wfId),
        { assertion_source: "static", validation_status: "validated", evidence_ids: [ev] });
      for (const name of new Set(wf.secrets.map((s) => s.name))) {
        if (name === "GITHUB_TOKEN") continue;
        const sId = rp(`secret:${name}`);
        node("SecretReference", sId, name, {
          sensitivity: RESTRICTED_SECRET.test(name) ? "restricted" : "confidential", scope: "repository", repository: repoId,
          comment: "Reference only. The graph never stores secret values.",
        });
        edge("USES_SECRET", ref("Workflow", wfId), ref("SecretReference", sId),
          { assertion_source: "static", validation_status: "validated", evidence_ids: [ev] });
      }
    }

    // ── agents, MCP servers, tools, permissions ───────────────────────────
    if (repo.files.has(AGENTS_FILE)) {
      let decl;
      try {
        decl = parseAgents(AGENTS_FILE, repo.files.get(AGENTS_FILE));
      } catch (err) {
        issues.push({ repo: repoId, file: AGENTS_FILE, message: err instanceof ParseError ? err.message : String(err) });
      }
      if (decl) {
        const cfgLines = decl.lines.length;
        const evAgents = evidence(repo, AGENTS_FILE, {
          sourceType: "agent_config",
          claim: `${AGENTS_FILE} declares ${decl.agents.map((a) => a.name).join(", ") || "no agents"} and the tools and permissions they use.`,
          limitations: "Declared configuration. A declared permission is what the agent is allowed to do, not proof it did.",
          from: 1, to: Math.min(cfgLines, 60), key: "agents",
        });
        for (const [sname, s] of decl.servers) {
          node("MCPServer", rp(`mcp:${sname}`), sname, { transport: s.transport, version: s.version, repository: repoId });
          for (const t of s.tools) {
            const tId = rp(`tool:${sname}:${t.name}`);
            node("Tool", tId, t.name, { server: sname, mutating: t.mutating, repository: repoId });
            for (const p of t.permissions) {
              const pId = rp(`perm:${p.name}`);
              const pEv = evidence(repo, AGENTS_FILE, {
                sourceType: "agent_config",
                claim: `${t.name} runs with ${p.name} (${p.verb}) scoped to ${scopeText(p.scope)}.`,
                limitations: "Declared configuration.",
                from: Math.max(1, (p.line ?? 1) - 2), to: Math.min(cfgLines, (p.scopeLine ?? p.line ?? 1) + 1),
                highlight: [p.scopeLine].filter(Boolean), key: `perm:${t.name}:${p.name}`,
              });
              node("Permission", pId, p.name, {
                verb: p.verb, scope: scopeText(p.scope), scope_globs: Array.isArray(p.scope) ? p.scope : [p.scope],
                granted_by: `${sname} config`, repository: repoId, declared_in: AGENTS_FILE, line: p.scopeLine ?? p.line,
              });
              edge("HAS_PERMISSION", ref("Tool", tId), ref("Permission", pId),
                { assertion_source: "declared", validation_status: "validated", evidence_ids: [pEv] });

              // CAN_ACCESS is a deterministic scope evaluation, recorded as its own evidence.
              if (p.verb === "connect") {
                const open = scopeText(p.scope) === "*";
                edge("CAN_ACCESS", ref("Permission", pId), ref("Resource", rp("net:external")), {
                  assertion_source: "declared", validation_status: open ? "needs_evidence" : "validated", evidence_ids: [pEv],
                });
                continue;
              }
              for (const c of classes) {
                if (!scopeMatches(p.scope, c.probe)) continue;
                const sEv = evidence(repo, AGENTS_FILE, {
                  sourceType: "deterministic_check",
                  claim: `The ${p.verb} scope ${scopeText(p.scope)} includes ${c.name}, so ${p.name} reaches that ${c.sensitivity} file class.`,
                  limitations: "Glob evaluation of the declared scope. Assumes the tool enforces its declared scope.",
                  from: p.scopeLine ?? p.line ?? 1, to: p.scopeLine ?? p.line ?? 1, highlight: [p.scopeLine].filter(Boolean),
                  key: `scope:${p.name}:${c.name}`,
                });
                edge("CAN_ACCESS", ref("Permission", pId), ref("Resource", rp(`path:${c.name}`)), {
                  assertion_source: "static", validation_status: "validated", evidence_ids: [pEv, sEv],
                });
              }
            }
          }
        }
        for (const a of decl.agents) {
          const aId = rp(`agent:${a.name}`);
          node("Agent", aId, a.name, {
            kind: a.kind, runtime: a.runtime, owner: a.owner, model: a.model, repository: repoId,
            reads_untrusted_input: a.readsUntrustedInput, declared_in: AGENTS_FILE,
          });
          for (const sname of a.mcpServers) {
            const s = decl.servers.get(sname);
            if (!s) {
              issues.push({ repo: repoId, file: AGENTS_FILE, message: `agent ${a.name} references unknown MCP server ${sname}` });
              continue;
            }
            edge("CONNECTS_TO", ref("Agent", aId), ref("MCPServer", rp(`mcp:${sname}`)),
              { assertion_source: "declared", validation_status: "validated", evidence_ids: [evAgents] });
            for (const t of s.tools) {
              edge("CAN_INVOKE", ref("Agent", aId), ref("Tool", rp(`tool:${sname}:${t.name}`)),
                { assertion_source: "declared", validation_status: "validated", evidence_ids: [evAgents] });
            }
          }
        }
      }
    }

    // ── packages + advisories ────────────────────────────────────────────
    if (repo.files.has("package.json")) {
      let manifest;
      try {
        manifest = parsePackageJson("package.json", repo.files.get("package.json"));
      } catch (err) {
        issues.push({ repo: repoId, file: "package.json", message: err.message });
      }
      for (const pkg of manifest?.packages ?? []) {
        const pkgId = rp(`npm:${pkg.name}@${pkg.version}`);
        const evPkg = evidence(repo, "package.json", {
          sourceType: "package_manifest", claim: `package.json depends on ${pkg.name}@${pkg.spec}.`,
          limitations: "Declared dependency. The lockfile may resolve a different patch version.",
          from: Math.max(1, (pkg.line ?? 1) - 1), to: (pkg.line ?? 1) + 1, highlight: [pkg.line].filter(Boolean), key: `pkg:${pkg.name}`,
        });
        node("Package", pkgId, pkg.name, { ecosystem: "npm", version: pkg.version, spec: pkg.spec, manifest: "package.json", dev: pkg.dev, repository: repoId, line: pkg.line });
        edge("CONTAINS_PACKAGE", ref("Repository", repoId), ref("Package", pkgId),
          { assertion_source: "static", validation_status: "validated", evidence_ids: [evPkg] });
        for (const adv of advisories.get(`${pkg.name}@${pkg.version}`) ?? []) {
          const vId = adv.id;
          const evAdv = evidence(repo, "package.json", {
            sourceType: "scanner_result", trust: "confirmed",
            claim: `${pkg.name}@${pkg.version} is inside the affected range of ${adv.id} (${adv.affected_range}).`,
            limitations: `OSV advisory ${adv.osv_id}. Version-range match; reachability of the vulnerable code is not checked.`,
            from: Math.max(1, (pkg.line ?? 1) - 1), to: (pkg.line ?? 1) + 1, highlight: [pkg.line].filter(Boolean), key: `adv:${adv.id}:${pkg.name}`,
          });
          node("Vulnerability", vId, vId, { severity: adv.severity, affected_range: adv.affected_range, fixed_in: adv.fixed_in, summary: adv.summary, url: adv.url });
          edge("AFFECTED_BY", ref("Package", pkgId), ref("Vulnerability", vId),
            { assertion_source: "static", validation_status: "validated", evidence_ids: [evAdv] });
        }
      }
    }
  }

  const snapshotSha = `scan-${short(JSON.stringify(repos.map((r) => [r.fullName, r.headSha, [...r.files.entries()].map(([p, c]) => [p, sha256(c)])])), 12)}`;
  return {
    scenario: { id: snapshotSha, tenant_id: tenantId, project_id: projectId, snapshot_sha: snapshotSha, source: "scan" },
    nodes,
    edges,
    issues,
    meta,
  };
}
