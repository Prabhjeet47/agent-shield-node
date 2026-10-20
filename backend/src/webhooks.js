import { githubApp } from "./github.js";
import { listProjectRepos, removeInstallation, removeReposFromInstallation } from "./store.js";
import { scanProject } from "./scan/scanner.js";
import { config } from "./config.js";

// Keep our list in sync when access changes on GitHub's side.
githubApp?.webhooks.on("installation.deleted", ({ payload }) => removeInstallation(payload.installation.id));

githubApp?.webhooks.on("installation_repositories.removed", ({ payload }) =>
  removeReposFromInstallation(payload.installation.id, payload.repositories_removed.map((r) => r.id))
);

// A push to a connected repo's default branch rescans the project, so the graph,
// findings and attack paths follow the code (and a merged fix closes its path).
githubApp?.webhooks.on("push", async ({ payload }) => {
  const repos = await listProjectRepos("default");
  const watched = repos.find((r) => r.fullName === payload.repository.full_name);
  const onDefault = payload.ref === `refs/heads/${payload.repository.default_branch}`;
  console.log(`push to ${payload.repository.full_name} at ${payload.after}${watched && onDefault ? " → rescan" : ""}`);
  if (watched && onDefault && config.dataMode === "live") scanProject({ reason: `push ${payload.after.slice(0, 7)}`, actor: "github-webhook" });
});

// Mounted with express.text() so we can check the signature against the exact raw body.
export async function handleWebhook(req, res) {
  if (!githubApp) return res.status(503).json({ error: "github_not_configured" });
  const signature = req.get("x-hub-signature-256");
  if (!signature || !(await githubApp.webhooks.verify(req.body, signature))) {
    return res.status(401).json({ error: "bad_signature" });
  }
  try {
    await githubApp.webhooks.receive({
      id: req.get("x-github-delivery"),
      name: req.get("x-github-event"),
      payload: JSON.parse(req.body),
    });
    res.status(202).end();
  } catch (err) {
    console.error("webhook handler failed", err);
    res.status(500).json({ error: "handler_failed" });
  }
}
