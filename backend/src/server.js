import express from "express";
import { config } from "./config.js";
import { router as githubRoutes } from "./routes.js";
import { handleWebhook } from "./webhooks.js";
import { v1 } from "./v1/router.js";
import { internal } from "./v1/internal.js";
import { mode as aiMode } from "./ai/client.js";

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

app.get("/api/health", (req, res) => res.json({ ok: true, ai_mode: aiMode(), github: !!config.github }));
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

app.listen(config.port, () => console.log(`AgentShield API on http://localhost:${config.port} · AI ${aiMode()} mode · GitHub ${config.github ? "on" : "off"}`));
