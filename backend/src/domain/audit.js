import { createHash, randomBytes } from "node:crypto";
import { RAW } from "../fixtures/audit.js";
import { config } from "../config.js";

// Append-only, SHA-256 hash-chained audit log (blueprint: audit_events; report §15).
// Each event's hash covers its content plus the previous hash, so any edit breaks the chain.
let events = [];

export const exportAudit = () => events;
export function importAudit(saved) {
  events = Array.isArray(saved) ? saved : [];
}

function hashOf(ev, prev) {
  const { hash, prev_hash, ...body } = ev;
  return createHash("sha256").update(prev + JSON.stringify(body)).digest("hex");
}

export function appendAudit({ actor, kind = "user", action, target, result = "success", detail = {}, time }) {
  const prev = events.at(-1)?.hash ?? "0".repeat(64);
  const ev = {
    id: `evt_${Date.now().toString(36)}${randomBytes(3).toString("hex")}`.toUpperCase(),
    time: time ?? new Date().toISOString(),
    actor, kind, action, target, result, detail,
  };
  ev.prev_hash = prev;
  ev.hash = hashOf(ev, prev);
  events.push(ev);
  return ev;
}

export function listAudit() {
  return [...events].reverse(); // newest first
}

export function verifyChain() {
  let prev = "0".repeat(64);
  for (const ev of events) {
    if (ev.prev_hash !== prev || ev.hash !== hashOf(ev, prev)) return { ok: false, broken_at: ev.id };
    prev = ev.hash;
  }
  return { ok: true, length: events.length };
}

// Seed rows are oldest-last in the fixture; append oldest first so the chain runs forward in time.
const year = 2026;
const month = { Oct: 9 };
for (const [time, actor, kind, action, target, result, detail] of config.dataMode === "demo" ? [...RAW].reverse() : []) {
  const [d, m, hm] = time.split(" ");
  const [h, mi, s] = hm.split(":").map(Number);
  appendAudit({ actor, kind, action, target, result, detail, time: new Date(year, month[m], Number(d), h, mi, s).toISOString() });
}
