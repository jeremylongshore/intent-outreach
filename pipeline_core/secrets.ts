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
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export class MissingSecretError extends Error {
  constructor(public readonly name: string) {
    super(
      `secret "${name}" not found. Set the ${name} environment variable, or add it to ` +
        `${localSecretsPath()}. Intent Outreach never stores keys in the cloud.`,
    );
    this.name = "MissingSecretError";
  }
}

export function localSecretsPath(): string {
  return (
    process.env.INTENT_OUTREACH_SECRETS_FILE ??
    join(process.env.INTENT_OUTREACH_HOME ?? join(homedir(), ".intent-outreach"), "secrets.json")
  );
}

let fileCache: Record<string, string> | null = null;

function loadLocalFile(): Record<string, string> {
  if (fileCache) return fileCache;
  try {
    const text = readFileSync(localSecretsPath(), "utf8");
    const parsed = JSON.parse(text);
    fileCache =
      parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    fileCache = {};
  }
  return fileCache;
}

/** Reset the local-file cache. Tests only. */
export function _resetSecretCache(): void {
  fileCache = null;
}

/** Resolve a secret, throwing MissingSecretError if absent. */
export function getSecret(name: string): string {
  const fromEnv = process.env[name];
  if (fromEnv && fromEnv.length > 0) return fromEnv;

  const fromFile = loadLocalFile()[name];
  if (fromFile && fromFile.length > 0) return fromFile;

  throw new MissingSecretError(name);
}

/** Non-throwing probe — used by connectors to decide whether to skip themselves. */
export function hasSecret(name: string): boolean {
  if (process.env[name]) return true;
  return Boolean(loadLocalFile()[name]);
}
