import { mkdir, readFile, writeFile } from "node:fs/promises";

// A tiny JSON-file store so the MVP runs with no database.
// Swap these functions for PostgreSQL queries later; the routes don't need to change.
const DIR = new URL("../data/", import.meta.url);
const FILE = new URL("db.json", DIR);

let db = { installations: {}, projects: {} };
let loaded = false;
let writing = Promise.resolve();

async function load() {
  if (loaded) return;
  try {
    db = JSON.parse(await readFile(FILE, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  loaded = true;
}

function save() {
  writing = writing.then(async () => {
    await mkdir(DIR, { recursive: true });
    await writeFile(FILE, JSON.stringify(db, null, 2));
  });
  return writing;
}

const project = (id) => (db.projects[id] ??= { repositories: [] });

export async function saveInstallation(installation) {
  await load();
  db.installations[installation.id] = installation;
  await save();
}

export async function getInstallation(id) {
  await load();
  return db.installations[id] ?? null;
}

export async function removeInstallation(id) {
  await load();
  delete db.installations[id];
  for (const p of Object.values(db.projects)) {
    p.repositories = p.repositories.filter((r) => r.installationId !== Number(id));
  }
  await save();
}

export async function listProjectRepos(projectId) {
  await load();
  return db.projects[projectId]?.repositories ?? [];
}

// Replaces this installation's repos in the project with the new selection.
export async function setProjectRepos(projectId, installationId, repos) {
  await load();
  const p = project(projectId);
  const others = p.repositories.filter((r) => r.installationId !== installationId);
  const connectedAt = new Date().toISOString();
  p.repositories = [...others, ...repos.map((r) => ({ ...r, connectedAt }))];
  await save();
  return p.repositories;
}

export async function removeProjectRepo(projectId, repoId) {
  await load();
  const p = project(projectId);
  p.repositories = p.repositories.filter((r) => r.id !== Number(repoId));
  await save();
}

export async function removeReposFromInstallation(installationId, repoIds) {
  await load();
  const ids = new Set(repoIds);
  for (const p of Object.values(db.projects)) {
    p.repositories = p.repositories.filter((r) => !(r.installationId === installationId && ids.has(r.id)));
  }
  await save();
}
