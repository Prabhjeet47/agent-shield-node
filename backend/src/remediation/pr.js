import { githubApp } from "../github.js";
import { listProjectRepos } from "../store.js";
import { applyDiff } from "./diff.js";

// Opens the pull request for an APPROVED proposal (blueprint: human gate, no auto-merge).
// Real PR when the repo is connected through the GitHub App; otherwise an explicitly
// labelled simulated PR, so the workflow can still be exercised on sample repos.
// The App needs Contents: read & write and Pull requests: read & write.

const PROJECT = "default";

export async function openPullRequestFor(r, { fileContent }) {
  const repos = await listProjectRepos(PROJECT);
  const connected = repos.find((x) => x.fullName === r.repository);
  if (!githubApp || !connected) {
    const content = fileContent(r.repository, r.file);
    if (content != null) applyDiff(content, r.diff, r.file); // still prove the proposal applies
    return { simulated: true, ref: `${r.repo}#sim-${r.id.toLowerCase()}`, url: null, branch: null };
  }

  const octokit = await githubApp.getInstallationOctokit(connected.installationId);
  const owner = connected.owner;
  const repo = connected.name;
  const base = connected.defaultBranch;
  const { data: branch } = await octokit.request("GET /repos/{owner}/{repo}/branches/{branch}", { owner, repo, branch: base });
  const { data: current } = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", { owner, repo, path: r.file, ref: branch.commit.sha });
  const updated = applyDiff(Buffer.from(current.content, "base64").toString("utf8"), r.diff, r.file);

  const head = `agentshield/${r.id.toLowerCase()}-${r.hash.slice(7, 15)}`;
  try {
    await octokit.request("POST /repos/{owner}/{repo}/git/refs", { owner, repo, ref: `refs/heads/${head}`, sha: branch.commit.sha });
  } catch (err) {
    if (err.status !== 422) throw err; // 422 = branch exists from an earlier attempt: reuse it
  }
  await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
    owner, repo, path: r.file, branch: head, sha: current.sha,
    message: `AgentShield ${r.id}: ${r.title}`,
    content: Buffer.from(updated, "utf8").toString("base64"),
  });
  const body = [
    `**${r.title}**`, "", r.summary ?? "", "",
    `- Fixes: ${r.solves.join(", ")}`, `- Attack path: ${r.path ?? "n/a"}`,
    `- Expected effect: ${r.effect}`, `- Risk of change: ${r.risk}`,
    `- Proposal hash: \`${r.hash}\` (approved by ${r.approvedBy})`, "",
    "Opened by AgentShield after human approval. Not auto-merged.",
  ].join("\n");
  let pr;
  try {
    ({ data: pr } = await octokit.request("POST /repos/{owner}/{repo}/pulls", { owner, repo, head, base, title: `AgentShield: ${r.title}`, body }));
  } catch (err) {
    if (err.status !== 422) throw err;
    const { data: open } = await octokit.request("GET /repos/{owner}/{repo}/pulls", { owner, repo, head: `${owner}:${head}`, state: "open" });
    if (!open.length) throw err;
    pr = open[0];
  }
  return { simulated: false, ref: `${repo}#${pr.number}`, url: pr.html_url, number: pr.number, branch: head };
}
