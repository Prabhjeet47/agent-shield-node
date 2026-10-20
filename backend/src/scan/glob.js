// Repo-relative glob matching for permission scopes. Deliberately small and
// deterministic: `**` crosses directories (and matches dotfiles, because a
// "**" scope really does include .github/), `*` stays inside one segment.

const cache = new Map();

export function globToRegExp(glob) {
  if (cache.has(glob)) return cache.get(glob);
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        out += ".*";
        i++;
        if (glob[i + 1] === "/") i++; // "**/" also matches zero directories
      } else {
        out += "[^/]*";
      }
    } else if (c === "?") {
      out += "[^/]";
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  const re = new RegExp(`^${out}$`);
  cache.set(glob, re);
  return re;
}

/** A scope is one glob or a list of globs; a path is reachable if any matches. */
export function scopeMatches(scope, path) {
  const globs = Array.isArray(scope) ? scope : [scope];
  return globs.some((g) => typeof g === "string" && globToRegExp(g).test(path));
}

export const scopeText = (scope) => (Array.isArray(scope) ? scope.join(", ") : String(scope));
