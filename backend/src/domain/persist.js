import { mkdir, readFile, rename, writeFile } from "node:fs/promises";

// Durable state for live mode: one JSON document, written atomically (tmp + rename)
// and debounced, so a restart keeps findings, fixes, jobs, audit and scan sources.
// Modules register what they own; this file imports none of them (no cycles).
// Swap for PostgreSQL later without touching callers: they only call persistSoon().

const DIR = new URL("../../data/", import.meta.url);
const FILE = new URL("state-live.json", DIR);
const TMP = new URL("state-live.json.tmp", DIR);
const VERSION = 1;

const providers = new Map(); // name -> { save: () => data, load: (data) => void }
let enabled = false;
let timer = null;
let writing = Promise.resolve();

export function registerPersisted(name, save, load) {
  providers.set(name, { save, load });
}

export async function loadPersisted() {
  enabled = true;
  let doc;
  try {
    doc = JSON.parse(await readFile(FILE, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return false;
    console.error(`Could not read ${FILE.pathname} (${err.message}); starting empty.`);
    return false;
  }
  if (doc.version !== VERSION) return false;
  for (const [name, { load }] of providers) if (doc[name] !== undefined) load(doc[name]);
  return true;
}

export function persistSoon() {
  if (!enabled) return;
  clearTimeout(timer);
  timer = setTimeout(flush, 250);
}

export function flush() {
  if (!enabled) return writing;
  clearTimeout(timer);
  writing = writing.then(async () => {
    const doc = { version: VERSION, saved_at: new Date().toISOString() };
    for (const [name, { save }] of providers) doc[name] = save();
    await mkdir(DIR, { recursive: true });
    await writeFile(TMP, JSON.stringify(doc));
    await rename(TMP, FILE);
  }).catch((err) => console.error("persist failed:", err.message));
  return writing;
}
