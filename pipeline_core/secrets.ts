/**
 * pipeline_core/secrets.ts — BYO-key secret resolution, local only.
 *
 * Removes the GCP Secret Manager coupling entirely (017-AT-DECR §5). Keys live
 * in the user's own environment or a local file under their home directory. They
 * are read locally and transmitted only to the provider/SaaS API itself — never
 * to any cloud secret store, never logged.
 *
 * Resolution order for getSecret(name):
 *   1. process.env[name]                       (default — what the MCP manifest forwards)
 *   2. a local JSON file (INTENT_OUTREACH_SECRETS_FILE, or ~/.intent-outreach/secrets.json)
 *
 * A value is USABLE only if it is a non-empty, non-whitespace string that is not
 * an unexpanded `${...}` placeholder (what an MCP manifest forwards when the user
 * never set the variable). getSecret and hasSecret share that one predicate, so
 * "configured" and "resolvable" can never disagree.
 */

import { readFileSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { homedir } from "node:os";

export class MissingSecretError extends Error {
  constructor(public readonly name: string) {
    let where: string;
    try {
      where = localSecretsPath();
    } catch {
      where = "the local secrets file";
    }
    super(
      `secret "${name}" not found. Set the ${name} environment variable, or add it to ` +
        `${where}. Intent Outreach never stores keys in the cloud.`,
    );
    this.name = "MissingSecretError";
  }
}

const PLACEHOLDER = /^\$\{.*\}$/;

/**
 * True when a raw env/file value should be treated as NOT SET: non-string, empty,
 * whitespace-only, or a literal unexpanded `${...}` placeholder.
 */
export function isUnsetValue(v: unknown): boolean {
  if (typeof v !== "string") return true;
  const t = v.trim();
  return t.length === 0 || PLACEHOLDER.test(t);
}

/**
 * Resolve a path-valued env var: unset/empty/placeholder → undefined; otherwise
 * it MUST be absolute (a relative path would silently resolve against whatever
 * cwd the MCP host happened to launch us in).
 */
export function envPath(name: string): string | undefined {
  const raw = process.env[name];
  if (isUnsetValue(raw)) return undefined;
  const p = (raw as string).trim();
  if (!isAbsolute(p)) {
    throw new Error(`${name} must be an absolute path (got "${p}")`);
  }
  return p;
}

/** The Intent Outreach home directory (INTENT_OUTREACH_HOME or ~/.intent-outreach). */
export function intentOutreachHome(): string {
  return envPath("INTENT_OUTREACH_HOME") ?? join(homedir(), ".intent-outreach");
}

export function localSecretsPath(): string {
  return envPath("INTENT_OUTREACH_SECRETS_FILE") ?? join(intentOutreachHome(), "secrets.json");
}

let fileCache: Record<string, unknown> | null = null;

function warnIfBroadPermissions(path: string): void {
  try {
    const mode = statSync(path).mode & 0o777;
    if (mode & 0o077) {
      process.stderr.write(
        `intent-outreach: warning: secrets file ${path} is readable by group/other ` +
          `(mode ${mode.toString(8).padStart(3, "0")}); run: chmod 600 ${path}\n`,
      );
    }
  } catch {
    /* stat failure is not worth failing a secret lookup over */
  }
}

function loadLocalFile(): Record<string, unknown> {
  if (fileCache) return fileCache;
  // Resolved OUTSIDE the try: a misconfigured (relative) path must fail loudly,
  // not degrade into "no secrets file".
  const path = localSecretsPath();
  try {
    const text = readFileSync(path, "utf8");
    warnIfBroadPermissions(path);
    const parsed: unknown = JSON.parse(text);
    fileCache =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
  } catch {
    fileCache = {};
  }
  return fileCache;
}

/** Reset the local-file cache. Tests only. */
export function _resetSecretCache(): void {
  fileCache = null;
}

function resolve(name: string): string | undefined {
  const fromEnv = process.env[name];
  if (!isUnsetValue(fromEnv)) return fromEnv as string;
  const fromFile = loadLocalFile()[name];
  if (!isUnsetValue(fromFile)) return fromFile as string;
  return undefined;
}

/** Resolve a secret, throwing MissingSecretError if absent. */
export function getSecret(name: string): string {
  const v = resolve(name);
  if (v === undefined) throw new MissingSecretError(name);
  return v;
}

/** Non-throwing probe — used by connectors to decide whether to skip themselves. */
export function hasSecret(name: string): boolean {
  return resolve(name) !== undefined;
}

/**
 * Every configured variant of a key, in a deterministic order: the bare name
 * first, then labelled variants `NAME__LABEL` (e.g. APOLLO_API_KEY__TEAM,
 * APOLLO_API_KEY__PERSONAL) sorted by label. From the environment and the
 * local secrets file, unset values excluded.
 */
export function secretVariants(name: string): { envName: string; label: string }[] {
  const prefix = `${name}__`;
  const names = new Set<string>();
  for (const k of [...Object.keys(process.env), ...Object.keys(loadLocalFile())]) {
    if ((k === name || (k.startsWith(prefix) && /^[A-Z0-9_]+$/.test(k.slice(prefix.length)))) && resolve(k) !== undefined) names.add(k);
  }
  return [...names]
    .map((envName) => ({ envName, label: envName === name ? "default" : envName.slice(prefix.length).toLowerCase() }))
    .sort((a, b) => (a.envName === name ? -1 : b.envName === name ? 1 : a.label.localeCompare(b.label)));
}
