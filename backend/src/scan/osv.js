// Dependency advisories from OSV (osv.dev) — the same database GitHub's
// advisory feed publishes into. Fail-soft: if OSV is unreachable the scan
// still completes, it just reports no advisories and says so.

const OSV = process.env.OSV_API_URL ?? "https://api.osv.dev/v1";
const cache = new Map(); // `${name}@${version}` -> advisories[]

const SEVERITY = { CRITICAL: "critical", HIGH: "high", MODERATE: "medium", MEDIUM: "medium", LOW: "low" };

async function json(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`OSV ${res.status}`);
  return res.json();
}

const parts = (v) => String(v).split(/[.+-]/).slice(0, 3).map((x) => Number.parseInt(x, 10) || 0);
export function cmpVersion(a, b) {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

// The smallest fixed version above the installed one, preferring the same
// major line (2.6.1 -> 2.6.7, not 3.1.1): that is the upgrade a reviewer can merge.
function pickFix(fixes, installed) {
  const above = fixes.filter((f) => cmpVersion(f, installed) > 0).sort(cmpVersion);
  const sameMajor = above.filter((f) => parts(f)[0] === parts(installed)[0]);
  return sameMajor[0] ?? above[0] ?? null;
}

function summarize(vuln, pkgName, installed) {
  const id = [vuln.id, ...(vuln.aliases ?? [])].find((x) => x.startsWith("GHSA-")) ?? vuln.id;
  const fixes = [];
  let introduced = null;
  for (const a of vuln.affected ?? []) {
    if (a.package?.name !== pkgName) continue;
    for (const r of a.ranges ?? []) {
      let intro = null;
      for (const e of r.events ?? []) {
        if (e.introduced) intro = e.introduced;
        if (e.fixed) {
          fixes.push(e.fixed);
          if (cmpVersion(installed, intro ?? "0") >= 0 && cmpVersion(installed, e.fixed) < 0) introduced = intro ?? "0";
        }
      }
    }
  }
  const fixed = pickFix(fixes, installed);
  return {
    id,
    osv_id: vuln.id,
    summary: (vuln.summary ?? vuln.details ?? "").slice(0, 240),
    severity: SEVERITY[String(vuln.database_specific?.severity ?? "").toUpperCase()] ?? "medium",
    fixed_in: fixed,
    affected_range: fixed ? `>=${introduced ?? "0"} <${fixed}` : `>=${introduced ?? "0"}`,
    url: `https://osv.dev/vulnerability/${vuln.id}`,
  };
}

/** packages: [{name, version}] (npm). Returns { results: Map(key -> advisories[]), error? } */
export async function lookupAdvisories(packages) {
  const todo = packages.filter((p) => !cache.has(`${p.name}@${p.version}`));
  let error = null;
  if (todo.length) {
    try {
      const batch = await json(`${OSV}/querybatch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queries: todo.map((p) => ({ package: { name: p.name, ecosystem: "npm" }, version: p.version })) }),
      });
      await Promise.all(todo.map(async (p, i) => {
        const ids = (batch.results?.[i]?.vulns ?? []).map((v) => v.id).slice(0, 10);
        const details = await Promise.all(ids.map((id) => json(`${OSV}/vulns/${id}`).catch(() => null)));
        cache.set(`${p.name}@${p.version}`, details.filter(Boolean).map((v) => summarize(v, p.name, p.version)));
      }));
    } catch (err) {
      error = `Advisory lookup unavailable (${err.message}); dependency findings may be missing.`;
    }
  }
  const results = new Map();
  for (const p of packages) results.set(`${p.name}@${p.version}`, cache.get(`${p.name}@${p.version}`) ?? []);
  return { results, error };
}
