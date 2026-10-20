import { config } from "../config.js";
import { appendAudit } from "../domain/audit.js";
import { deriveProject } from "../domain/derive.js";
import { createJob, updateJob } from "../domain/jobs.js";
import { persistSoon } from "../domain/persist.js";
import * as store from "../domain/store.js";
import { dropGraph } from "../graph/client.js";
import { ingestSnapshot } from "../graph/ingest.js";
import { runTemplate } from "../graph/queries/index.js";
import { applySchema } from "../graph/schema.js";
import { applyDiff } from "../remediation/diff.js";
import { listProjectRepos } from "../store.js";
import { githubApp } from "../github.js";
import { buildSnapshot } from "./build.js";
import { lookupAdvisories } from "./osv.js";
import { parsePackageJson } from "./parse.js";
import { readGitHubRepo, readSampleRepo } from "./sources.js";

// Scan orchestration: read repos → build snapshot → ingest into FalkorDB →
// derive findings → merge into the project. One scan at a time per process;
// a request while one runs is queued behind it (coalesced), never dropped.

const PROJECT = "default";
let schemaReady = false;
let current = null; // { job, promise }
let queued = null;
let sources = []; // repos (with file contents) from the last successful scan
// Sample repos have no GitHub to merge into, so an approved + verified fix is
// "merged" into this overlay ({ "sample/<name>:<path>": content }) and the next scan
// reads it, exactly as a real merge + push webhook would change a GitHub repo.
let overlays = {};
export const exportOverlays = () => overlays;
export const importOverlays = (saved) => { overlays = saved ?? {}; };

export const scanSources = () => sources;
export const exportSources = () => sources.map((r) => ({ ...r, files: [...r.files] }));
export const importSources = (saved) => {
  sources = (saved ?? []).map((r) => ({ ...r, files: new Map(r.files) }));
};

export function fileContent(repository, path) {
  return sources.find((r) => r.fullName === repository)?.files.get(path) ?? null;
}

async function collectRepos(job) {
  const repos = [];
  for (const name of config.sampleRepos) {
    try {
      const repo = await readSampleRepo(name);
      for (const [key, content] of Object.entries(overlays)) {
        const [full, ...rest] = key.split(":");
        if (full === repo.fullName) repo.files.set(rest.join(":"), content);
      }
      if (Object.keys(overlays).some((k) => k.startsWith(`${repo.fullName}:`))) repo.headSha = `${repo.headSha.slice(0, 32)}m${Object.keys(overlays).length}`;
      repos.push(repo);
    } catch (err) {
      updateJob(job.id, { step: `Sample repo ${name} skipped: ${err.message}` });
    }
  }
  if (githubApp) {
    for (const r of await listProjectRepos(PROJECT)) {
      try {
        updateJob(job.id, { step: `Reading ${r.fullName}@${r.defaultBranch}` });
        repos.push(await readGitHubRepo({ installationId: r.installationId, owner: r.owner, name: r.name, defaultBranch: r.defaultBranch }));
      } catch (err) {
        updateJob(job.id, { step: `${r.fullName} skipped: ${err.message}` });
      }
    }
  }
  return repos;
}

async function advisoriesFor(repos) {
  const pkgs = [];
  for (const r of repos) {
    const text = r.files.get("package.json");
    if (!text) continue;
    try {
      pkgs.push(...parsePackageJson("package.json", text).packages);
    } catch {
      // reported as a scan issue by the builder
    }
  }
  return lookupAdvisories(pkgs);
}

async function run(job, { reason, actor }) {
  const n = store.listScans().length + 1;
  const label = `Scan #${n}`;
  updateJob(job.id, { status: "running", step: `${label} started (${reason})` });
  if (!schemaReady) {
    await applySchema();
    schemaReady = true;
  }
  const repos = await collectRepos(job);
  if (!repos.length) throw Object.assign(new Error("Nothing to scan: connect a GitHub repository or enable SAMPLE_REPOS."), { code: "nothing_to_scan" });

  updateJob(job.id, { step: `Checking ${repos.length} repo(s) against the advisory database` });
  const { results: advisories, error: osvError } = await advisoriesFor(repos);
  if (osvError) updateJob(job.id, { step: osvError });

  const snapshot = buildSnapshot({ tenantId: config.tenantId, projectId: PROJECT, repos, advisories });
  updateJob(job.id, { step: `Loading ${snapshot.nodes.length} nodes / ${snapshot.edges.length} edges into the graph` });
  const stats = await ingestSnapshot(snapshot);

  const derived = await deriveProject({ tenantId: config.tenantId, projectId: PROJECT, scanLabel: label });
  const scan = {
    id: `scan-${n}`, label, reason, actor, startedAt: job.created_at, finishedAt: new Date().toISOString(),
    snapshot: snapshot.scenario.snapshot_sha, repos: repos.map((r) => ({ fullName: r.fullName, headSha: r.headSha, source: r.source })),
    commits: repos.map((r) => `${r.name}@${r.headSha.slice(0, 7)}`).join(", "),
    stats, issues: snapshot.issues, advisoryError: osvError ?? null,
    counts: { findings: derived.findings.length, paths: derived.paths.length, agents: derived.agents.length },
  };
  sources = repos;
  store.applyScan(derived, scan);
  appendAudit({ actor: actor ?? "scanner", kind: "system", action: "scan.completed", target: scan.commits,
    detail: { scan: scan.id, nodes: stats.nodes, edges: stats.edges, findings: derived.findings.length, pruned: stats.prunedNodes + stats.prunedEdges } });
  persistSoon();
  return updateJob(job.id, {
    status: "succeeded", step: `${label} done: ${derived.findings.length} finding(s), ${derived.paths.length} path(s)`,
    result: { scan_id: scan.id, ...scan.counts, issues: scan.issues.length },
  });
}

/** Starts (or queues) a project scan. Returns the job immediately. */
export function scanProject({ reason = "manual", actor = null } = {}) {
  if (current) {
    if (!queued) {
      const job = createJob("scans", PROJECT);
      updateJob(job.id, { step: "Queued behind the running scan" });
      queued = { job, reason, actor };
    }
    return queued.job;
  }
  const job = createJob("scans", PROJECT);
  start(job, { reason, actor });
  return job;
}

function start(job, opts) {
  current = { job };
  run(job, opts)
    .catch((err) => {
      console.error("scan failed:", err.message);
      updateJob(job.id, { status: "failed", step: "Scan failed", error: err.code === "nothing_to_scan" ? err.message : `Scan failed: ${err.message}` });
      persistSoon();
    })
    .finally(() => {
      current = null;
      if (queued) {
        const next = queued;
        queued = null;
        start(next.job, next);
      }
    });
}

/** Simulated merge of a verified fix into a sample repo, then a rescan. */
export function mergeIntoSample(r) {
  if (!r.repository?.startsWith("sample/")) return false;
  const key = `${r.repository}:${r.file}`;
  const content = overlays[key] ?? fileContent(r.repository, r.file); // build on earlier merges
  if (content == null) return false;
  overlays[key] = applyDiff(content, r.diff, r.file);
  appendAudit({ actor: "github-app", kind: "integration", action: "pull_request.merged", target: r.pr,
    detail: { remediation: r.id, simulated: true, file: r.file } });
  persistSoon();
  scanProject({ reason: `merged ${r.id} (simulated)`, actor: "github-app" });
  return true;
}

/** Restore the bundled sample repos to their original files and rescan. */
export function resetSamples(actor) {
  overlays = {};
  appendAudit({ actor: actor ?? "system", kind: "user", action: "samples.reset", target: "sample repositories" });
  persistSoon();
  return scanProject({ reason: "sample reset", actor });
}

export const scanStatus = () => ({ running: current?.job.id ?? null, queued: queued?.job.id ?? null });

/**
 * What-if: apply a proposed diff to the last scanned files, rebuild the graph in a
 * throwaway FalkorDB graph, and run the same traversals there. This is the graph
 * recompute the verifier uses: it proves the actual proposed change breaks the path.
 */
export async function whatIf({ repository, file, diff }) {
  const repo = sources.find((r) => r.fullName === repository);
  if (!repo) throw Object.assign(new Error(`${repository} is not in the last scan.`), { status: 404, code: "unknown_repository" });
  const original = repo.files.get(file);
  if (original == null) throw Object.assign(new Error(`${file} was not read in the last scan of ${repository}.`), { status: 404, code: "unknown_file" });

  const changed = applyDiff(original, diff, file);
  const modified = sources.map((r) => (r === repo ? { ...r, files: new Map([...r.files, [file, changed]]), headSha: `${r.headSha}-whatif` } : r));
  const { results: advisories } = await advisoriesFor(modified);
  const snapshot = buildSnapshot({ tenantId: config.tenantId, projectId: PROJECT, repos: modified, advisories });

  const scratch = `agentshield_whatif_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const scope = { tenant_id: config.tenantId, project_id: PROJECT };
  const TEMPLATES = ["agent_to_sensitive_resource", "agent_capabilities", "vulnerable_packages", "workflows"];
  try {
    await ingestSnapshot(snapshot, { graph: scratch });
    const before = {};
    const after = {};
    for (const t of TEMPLATES) {
      const params = t === "agent_to_sensitive_resource" ? { ...scope, agent_uid: null } : scope;
      before[t] = await runTemplate(t, params);
      after[t] = await runTemplate(t, params, { graph: scratch });
    }
    return { repository, file, before, after, issues: snapshot.issues, changed_content: changed };
  } finally {
    await dropGraph(scratch);
  }
}
