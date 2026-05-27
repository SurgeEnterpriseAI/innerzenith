// Reads .env.local at request time and PREFERS its values over process.env.
// This protects against stale OS-level env vars (User/Machine scope on Windows)
// that get baked into a parent process and shadow what's in .env.local.
//
// The whole point of .env.local is "the source of truth for local dev" —
// when it disagrees with the OS, .env.local wins.

import fs from "node:fs";
import path from "node:path";

let cache: { mtime: number; values: Record<string, string> } | null = null;

function loadEnvLocal(): Record<string, string> {
  const file = path.join(process.cwd(), ".env.local");
  try {
    const stat = fs.statSync(file);
    if (cache && cache.mtime === stat.mtimeMs) return cache.values;
    const text = fs.readFileSync(file, "utf8");
    const out: Record<string, string> = {};
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx < 0) continue;
      const k = line.slice(0, idx).trim();
      let v = line.slice(idx + 1).trim();
      // strip optional quotes
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      out[k] = v;
    }
    cache = { mtime: stat.mtimeMs, values: out };
    return out;
  } catch {
    return {};
  }
}

/**
 * Read env var with .env.local taking precedence over process.env.
 * Empty-string values in .env.local fall through to process.env.
 */
export function readEnv(name: string): string | undefined {
  const local = loadEnvLocal()[name];
  if (local && local.length > 0) return local;
  const sys = process.env[name];
  if (sys && sys.length > 0) return sys;
  return undefined;
}
