import { existsSync, readFileSync } from "node:fs";

// Load backend/.env when it exists. (Node's --env-file-if-exists flag crashes under --watch
// when the file is missing, so the server loads it itself.)
const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
  return value;
}

// The GitHub App is optional in development: without it the product API still runs,
// and the Connect GitHub routes answer 503 with a clear message.
function githubConfig() {
  if (!process.env.GITHUB_APP_ID) return null;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY
    ? process.env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n")
    : readFileSync(required("GITHUB_APP_PRIVATE_KEY_PATH"), "utf8");
  return {
    appId: process.env.GITHUB_APP_ID,
    appSlug: required("GITHUB_APP_SLUG"),
    privateKey,
    webhookSecret: required("GITHUB_WEBHOOK_SECRET"),
  };
}

const port = Number(process.env.PORT ?? 4000);

export const config = {
  port,
  production: process.env.NODE_ENV === "production",
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:5173",
  publicApiUrl: process.env.PUBLIC_API_URL ?? `http://localhost:${port}`,
  stateSecret: process.env.STATE_SECRET ?? (process.env.NODE_ENV === "production" ? required("STATE_SECRET") : "dev-only-state-secret"),
  github: githubConfig(),
  // AI services (owned by the AI team). Leave AI_SERVICE_URL empty to use replay mode.
  ai: {
    url: process.env.AI_SERVICE_URL?.replace(/\/$/, "") || null,
    secret: process.env.AI_SHARED_SECRET || null,
  },
  devUser: { name: process.env.DEV_USER_NAME ?? "S. Shruti", role: process.env.DEV_USER_ROLE ?? "admin" },
};

if (config.ai.url && !config.ai.secret) throw new Error("AI_SERVICE_URL is set, so AI_SHARED_SECRET is required to sign requests and callbacks.");
