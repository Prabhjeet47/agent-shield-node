import express from "express";
import { config } from "./config.js";
import { router as githubRoutes } from "./routes.js";
import { handleWebhook } from "./webhooks.js";
import { v1 } from "./v1/router.js";
import { internal } from "./v1/internal.js";
import { mode as aiMode } from "./ai/client.js";
import * as store from "./domain/store.js";
import { exportAudit, importAudit } from "./domain/audit.js";
import { exportJobs, importJobs } from "./domain/jobs.js";
import { flush, loadPersisted, persistSoon, registerPersisted } from "./domain/persist.js";
import { exportOverlays, exportSources, importOverlays, importSources, scanProject } from "./scan/scanner.js";

const app = express();

// Raw bodies for signature checks: register before express.json().
app.post("/api/github/webhooks", express.text({ type: "*/*", limit: "5mb" }), handleWebhook);
app.use("/api/v1/internal", internal);

app.use(express.json({ limit: "1mb" }));

// Auth is not built yet: every request acts as the dev user. In development a different
// role can be tried with the X-Dev-Role header (e.g. developer) to test permission checks.
app.use((req, res, next) => {
  const role = !config.production && req.get("x-dev-role") ? req.get("x-dev-role") : config.devUser.role;
  req.user = { ...config.devUser, role };
  next();
});

// Any change through the API is persisted (debounced) once the response is sent.
app.use((req, res, next) => {
  if (req.method !== "GET") res.on("finish", persistSoon);
  next();
});

app.get("/api/health", (req, res) => res.json({ ok: true, ai_mode: aiMode(), github: !!config.github, data_mode: config.dataMode }));
app.use("/api/v1", v1);
app.use("/api", githubRoutes);

app.use((req, res) => res.status(404).json({ error: "not_found", message: `No route for ${req.method} ${req.path}.` }));

// Stable error codes, no stack traces or internals in responses (blueprint API contract rules).
app.use((err, req, res, next) => {
  const status = err.status ?? (err.issues ? 422 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: err.code ?? (status === 422 ? "invalid_request" : status === 404 ? "not_found" : "server_error"),
    message: status >= 500 ? "Something went wrong. Check the server logs." : err.message,
  });
});

// ── boot ──────────────────────────────────────────────────────────────────────
if (config.dataMode === "live") {
  registerPersisted("store", store.exportState, store.importState);
  registerPersisted("audit", exportAudit, importAudit);
  registerPersisted("jobs", exportJobs, importJobs);
  registerPersisted("sources", exportSources, importSources);
  registerPersisted("overlays", exportOverlays, importOverlays);
  const restored = await loadPersisted();
  console.log(restored ? "Live mode: restored saved state." : "Live mode: starting with an empty project.");
  // First run (or SCAN_ON_START): scan so the product shows real, graph-derived data.
  if (config.scanOnStart && (!restored || !store.listScans().length)) scanProject({ reason: "startup", actor: "scanner" });
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => flush().finally(() => process.exit(0)));
}

app.listen(config.port, () => console.log(
  `AgentShield API on http://localhost:${config.port} · data ${config.dataMode} · AI ${aiMode()} mode · GitHub ${config.github ? "on" : "off"}`,
));
