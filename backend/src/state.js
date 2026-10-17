import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";

// The state value travels to GitHub and back. Signing it proves the callback
// started from our own "Connect GitHub" button and tells us which project it belongs to.
const TTL_MS = 10 * 60 * 1000;

const sign = (body) => createHmac("sha256", config.stateSecret).update(body).digest("base64url");

export function createState(projectId) {
  const body = Buffer.from(
    JSON.stringify({ projectId, nonce: randomBytes(8).toString("hex"), exp: Date.now() + TTL_MS })
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyState(state) {
  if (typeof state !== "string") return null;
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const given = Buffer.from(sig);
  const expected = Buffer.from(sign(body));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  return data.exp > Date.now() ? data : null;
}
