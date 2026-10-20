import { parse as parseYaml } from "yaml";

// Parsers for the files a scan reads. Each returns plain data plus the line
// numbers the evidence excerpts point at. Repo content is UNTRUSTED: nothing
// here executes or interprets it beyond structure.

const lineOf = (lines, needle, from = 0) => {
  for (let i = from; i < lines.length; i++) if (lines[i].includes(needle)) return i + 1;
  return null;
};

export class ParseError extends Error {
  constructor(file, message) { super(`${file}: ${message}`); this.file = file; }
}

function yamlOrThrow(file, text) {
  try {
    return parseYaml(text) ?? {};
  } catch (err) {
    throw new ParseError(file, `invalid YAML (${err.message.split("\n")[0]})`);
  }
}

/** .agentshield/agents.yml */
export function parseAgents(file, text) {
  const doc = yamlOrThrow(file, text);
  const lines = text.split(/\r?\n/);
  const servers = new Map();
  for (const s of doc.mcp_servers ?? []) {
    if (!s?.name) continue;
    servers.set(s.name, {
      name: String(s.name),
      transport: s.transport ?? null,
      version: s.version != null ? String(s.version) : null,
      line: lineOf(lines, `name: ${s.name}`),
      tools: (s.tools ?? []).filter((t) => t?.name).map((t) => ({
        name: String(t.name),
        mutating: !!t.mutating,
        line: lineOf(lines, `name: ${t.name}`),
        permissions: (t.permissions ?? []).filter((p) => p?.name).map((p) => {
          const at = lineOf(lines, `name: ${p.name}`);
          return {
            name: String(p.name),
            verb: String(p.verb ?? "read"),
            scope: p.scope ?? "**",
            line: at,
            scopeLine: at ? lineOf(lines, "scope:", at - 1) : null,
          };
        }),
      })),
    });
  }
  const agents = (doc.agents ?? []).filter((a) => a?.name).map((a) => ({
    name: String(a.name),
    kind: a.kind ?? "ai_agent",
    runtime: a.runtime ?? null,
    owner: a.owner ?? null,
    model: a.model ?? null,
    readsUntrustedInput: !!a.reads_untrusted_input,
    mcpServers: (a.mcp_servers ?? []).map(String),
    line: lineOf(lines, `name: ${a.name}`),
  }));
  return { agents, servers, lines };
}

/** .github/workflows/*.yml */
export function parseWorkflow(file, text) {
  const doc = yamlOrThrow(file, text);
  const lines = text.split(/\r?\n/);
  // YAML 1.1 parses a bare `on:` key as boolean true in some emitters.
  const on = doc.on ?? doc[true] ?? {};
  const triggers = typeof on === "string" ? [on] : Array.isArray(on) ? on.map(String) : Object.keys(on);

  const describe = (perms) => {
    if (perms == null) return null;
    if (typeof perms === "string") return perms;
    return Object.entries(perms).map(([k, v]) => `${k}: ${v}`).join(", ");
  };
  const writes = (perms) => {
    if (perms == null) return [];
    if (perms === "write-all") return ["*"];
    if (typeof perms !== "object") return [];
    return Object.entries(perms).filter(([, v]) => v === "write").map(([k]) => k);
  };

  let permissions = doc.permissions ?? null;
  const jobWrites = [];
  for (const job of Object.values(doc.jobs ?? {})) jobWrites.push(...writes(job?.permissions));

  const secrets = [];
  const actions = [];
  lines.forEach((ln, i) => {
    for (const m of ln.matchAll(/secrets\.([A-Za-z0-9_]+)/g)) secrets.push({ name: m[1], line: i + 1 });
    const u = ln.match(/^\s*-?\s*uses:\s*([^\s#]+)/);
    if (u) actions.push({ ref: u[1], line: i + 1, pinned: /@[0-9a-f]{40}$/.test(u[1]) || u[1].startsWith("./") });
  });

  return {
    name: doc.name ? String(doc.name) : file.split("/").pop(),
    triggers,
    permissionsRaw: describe(permissions) ?? "default",
    permissionsLine: lineOf(lines, "permissions:"),
    writeScopes: [...new Set([...writes(permissions), ...jobWrites])],
    secrets,
    actions,
    lines,
  };
}

/** package.json — only exact or caret/tilde versions; ranges we cannot pin are skipped. */
export function parsePackageJson(file, text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (err) {
    throw new ParseError(file, `invalid JSON (${err.message})`);
  }
  const lines = text.split(/\r?\n/);
  const out = [];
  for (const section of ["dependencies", "devDependencies"]) {
    for (const [name, spec] of Object.entries(doc[section] ?? {})) {
      const m = String(spec).match(/^[\^~=]?(\d+\.\d+\.\d+(?:[-+][\w.]+)?)$/);
      if (!m) continue;
      out.push({ name, version: m[1], spec: String(spec), dev: section === "devDependencies", line: lineOf(lines, `"${name}"`) });
    }
  }
  return { packages: out, lines };
}
