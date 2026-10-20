// Applies a proposal diff ([op, line] tuples, op one of " ", "-", "+") to a file.
// The context and removed lines must appear contiguously in the current file;
// if they don't, the file changed since the proposal was made and we refuse
// rather than guess — the reviewer approved a specific change, not a fuzzy one.

export class DiffError extends Error {
  constructor(message) { super(message); this.status = 409; this.code = "proposal_stale"; }
}

export function applyDiff(content, diff, file = "file") {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/);
  const before = diff.filter(([op]) => op !== "+").map(([, t]) => t);
  const after = diff.filter(([op]) => op !== "-").map(([, t]) => t);
  if (!before.length) throw new DiffError(`The proposal for ${file} has no anchor lines.`);

  const same = (a, b) => a.trimEnd() === b.trimEnd();
  let at = -1;
  for (let i = 0; i + before.length <= lines.length; i++) {
    if (before.every((t, j) => same(lines[i + j], t))) {
      if (at !== -1) throw new DiffError(`The proposal for ${file} matches more than one place; refusing to guess.`);
      at = i;
    }
  }
  if (at === -1) throw new DiffError(`The proposal no longer applies to ${file}: the file changed since it was drafted.`);
  return [...lines.slice(0, at), ...after, ...lines.slice(at + before.length)].join(eol);
}
