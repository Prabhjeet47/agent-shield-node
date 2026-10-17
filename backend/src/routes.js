import { Router } from "express";
import { config } from "./config.js";
import { createState, verifyState } from "./state.js";
import { fetchInstallation, installUrl, listInstallationRepos } from "./github.js";
import {
  getInstallation, listProjectRepos, removeProjectRepo, saveInstallation, setProjectRepos,
} from "./store.js";

export const router = Router();

// Every GitHub route needs the App to be configured.
router.use("/github", (req, res, next) => {
  if (config.github) return next();
  res.status(503).json({ error: "github_not_configured", message: "The GitHub App isn't set up on this server yet. Add the GITHUB_APP_* values to backend/.env." });
});

const PROJECT_ID = /^[\w-]{1,64}$/;
const projectIdFrom = (value) => (PROJECT_ID.test(value ?? "") ? value : null);

function backToFrontend(res, params) {
  const url = new URL("/repositories", config.frontendUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  res.redirect(url.href);
}

async function installationForProject(installationId, projectId) {
  const installation = await getInstallation(installationId);
  return installation && installation.projectId === projectId ? installation : null;
}

// 1. Frontend asks where to send the user.
router.get("/github/install-url", (req, res) => {
  const projectId = projectIdFrom(req.query.projectId);
  if (!projectId) return res.status(400).json({ error: "bad_project", message: "Unknown project." });
  res.json({ url: installUrl(createState(projectId)) });
});

// 2. GitHub sends the user here after they pick repos (set this as the App's "Setup URL").
router.get("/github/callback", async (req, res) => {
  const { installation_id, setup_action, state } = req.query;
  const verified = verifyState(state);
  if (!verified) return backToFrontend(res, { github_error: "expired" });
  if (setup_action === "request") return backToFrontend(res, { github_pending: "1" });

  const id = Number(installation_id);
  if (!Number.isInteger(id)) return backToFrontend(res, { github_error: "missing_installation" });

  const installation = await fetchInstallation(id);
  await saveInstallation({
    id,
    projectId: verified.projectId,
    account: installation.account.login,
    accountType: installation.account.type,
    repositorySelection: installation.repository_selection,
    savedAt: new Date().toISOString(),
  });
  backToFrontend(res, { installation_id: String(id) });
});

// 3. Frontend lists the repos the user granted, so they can choose which to watch.
router.get("/github/installations/:installationId/repos", async (req, res) => {
  const projectId = projectIdFrom(req.query.projectId);
  const installation = await installationForProject(Number(req.params.installationId), projectId);
  if (!installation) {
    return res.status(404).json({ error: "installation_not_found", message: "Connect GitHub again to continue." });
  }
  const [available, connected] = await Promise.all([
    listInstallationRepos(installation.id),
    listProjectRepos(projectId),
  ]);
  const connectedIds = new Set(connected.map((r) => r.id));
  res.json({
    account: installation.account,
    repositories: available.map((r) => ({ ...r, connected: connectedIds.has(r.id) })),
  });
});

// 4. Save the chosen repos to the project.
router.post("/projects/:projectId/repositories", async (req, res) => {
  const projectId = projectIdFrom(req.params.projectId);
  const { installationId, repositoryIds } = req.body ?? {};
  if (!projectId || !Array.isArray(repositoryIds)) {
    return res.status(400).json({ error: "bad_request", message: "Send installationId and repositoryIds." });
  }
  const installation = await installationForProject(Number(installationId), projectId);
  if (!installation) {
    return res.status(404).json({ error: "installation_not_found", message: "Connect GitHub again to continue." });
  }
  // Only accept repos GitHub says this installation can see.
  const wanted = new Set(repositoryIds.map(Number));
  const available = await listInstallationRepos(installation.id);
  const chosen = available.filter((r) => wanted.has(r.id));
  const repositories = await setProjectRepos(projectId, installation.id, chosen);
  res.status(201).json({ repositories });
});

router.get("/projects/:projectId/repositories", async (req, res) => {
  const projectId = projectIdFrom(req.params.projectId);
  if (!projectId) return res.status(400).json({ error: "bad_project", message: "Unknown project." });
  res.json({ repositories: await listProjectRepos(projectId) });
});

router.delete("/projects/:projectId/repositories/:repoId", async (req, res) => {
  const projectId = projectIdFrom(req.params.projectId);
  if (!projectId) return res.status(400).json({ error: "bad_project", message: "Unknown project." });
  await removeProjectRepo(projectId, req.params.repoId);
  res.status(204).end();
});
