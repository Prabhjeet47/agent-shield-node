import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { githubApp } from "../github.js";
import { RELEVANT } from "./build.js";

// Where a scan reads repository files from. Both sources return the same shape:
//   { fullName, name, defaultBranch, headSha, private, source, tree: [paths], files: Map(path -> text) }

const here = path.dirname(fileURLToPath(import.meta.url));
export const SAMPLE_REPOS_DIR = path.resolve(here, "../../fixtures/repos");
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TREE = 20_000;

async function walk(dir, root = dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, root, out);
    else out.push(path.relative(root, full).split(path.sep).join("/"));
  }
  return out;
}

/** A bundled sample repository (fixtures/repos/<name>) — lets the product run end to end with no GitHub. */
export async function readSampleRepo(name) {
  const root = path.join(SAMPLE_REPOS_DIR, name);
  const tree = (await walk(root)).sort();
  const files = new Map();
  for (const p of tree.filter(RELEVANT)) files.set(p, await readFile(path.join(root, p), "utf8"));
  const headSha = createHash("sha1").update(JSON.stringify([...files])).digest("hex");
  return { fullName: `sample/${name}`, name, defaultBranch: "main", headSha, private: true, source: "sample", tree, files };
}

export async function listSampleRepos() {
  try {
    return (await readdir(SAMPLE_REPOS_DIR, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
}

/** A connected GitHub repository, read through the App installation at the default branch head. */
export async function readGitHubRepo({ installationId, owner, name, defaultBranch }) {
  if (!githubApp) throw new Error("GitHub App is not configured");
  const octokit = await githubApp.getInstallationOctokit(installationId);
  const { data: branch } = await octokit.request("GET /repos/{owner}/{repo}/branches/{branch}", { owner, repo: name, branch: defaultBranch });
  const headSha = branch.commit.sha;
  const { data: treeData } = await octokit.request("GET /repos/{owner}/{repo}/git/trees/{tree_sha}", {
    owner, repo: name, tree_sha: headSha, recursive: "1",
  });
  const tree = treeData.tree.filter((t) => t.type === "blob").map((t) => t.path).slice(0, MAX_TREE);
  const sizes = new Map(treeData.tree.map((t) => [t.path, t.size ?? 0]));
  const files = new Map();
  for (const p of tree.filter(RELEVANT)) {
    if ((sizes.get(p) ?? 0) > MAX_FILE_BYTES) continue;
    const { data } = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", { owner, repo: name, path: p, ref: headSha });
    files.set(p, Buffer.from(data.content, "base64").toString("utf8"));
  }
  return { fullName: `${owner}/${name}`, name, defaultBranch, headSha, private: true, source: "github", tree, files, installationId };
}
