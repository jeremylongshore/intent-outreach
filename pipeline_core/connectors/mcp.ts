/**
 * pipeline_core/connectors/mcp.ts — wrap a vendor's MCP server as a connector.
 *
 * Several data vendors (DealMachine, BatchData, Regrid, ATTOM) ship MCP
 * servers. Handing their toolbox to the model would let the vendor's tool
 * descriptions steer it ("tool poisoning", OWASP MCP Top 10) and would let the
 * model choose which paid API to call. So the engine never does. Instead a
 * vendor MCP server becomes an ordinary fixed-order connector:
 *
 *   • PINNED TOOL DEFINITIONS. The connector lists the server's tools and
 *     hashes the definitions (name, description, input schema) of the tools it
 *     is allowed to call. If that sha256 differs from the pin, nothing is
 *     called: a changed description or schema needs a reviewed re-pin
 *     (`mcpToolsDigest` computes it).
 *   • A FIXED TOOL LIST. Only the bound tool is ever called. Other tools the
 *     server offers are ignored, never exposed.
 *   • ARGUMENTS BUILT IN CODE from the typed research query, never by a model.
 *   • EVERY RESPONSE SCHEMA-CHECKED (zod) before it is mapped; a mismatch is a
 *     schema failure, never trusted data.
 *   • PROVENANCE. The server name and version, the tool and the sha256 of the
 *     response are recorded with the output, and the response hash goes on
 *     every Fact the mapper creates.
 *
 * The transport is a factory (stdio for a local server binary, streamable
 * HTTP for a hosted one); the key, when the vendor needs one, is read through
 * the secrets layer and registered for redaction.
 */

import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { z } from "zod";
import type { ResearchQuery, ResearchQueryKind } from "../models.js";
import type { RateLimit } from "../rate-limit.js";
import type { Capability } from "../routing.js";
import { stableStringify } from "../routing.js";
import { hasSecret } from "../secrets.js";
import { parseVendor, useSecret } from "./_shared.js";
import type { Connector, ConnectorTier, ResearchInput, ResearchOutput } from "./types.js";

export class McpPinMismatchError extends Error {
  constructor(
    public readonly connector: string,
    public readonly expected: string,
    public readonly actual: string,
  ) {
    super(`${connector}: MCP tool definitions changed (pinned ${expected.slice(0, 12)}, server offers ${actual.slice(0, 12)}); review and re-pin before use`);
    this.name = "McpPinMismatchError";
  }
}

interface ToolDefinition {
  name: string;
  description?: string | undefined;
  inputSchema?: unknown;
}

/** sha256 over the allowed tools' definitions (name, description, input schema), order-independent. */
export function mcpToolsDigest(tools: readonly ToolDefinition[], allowed: readonly string[]): string {
  const picked = tools
    .filter((t) => allowed.includes(t.name))
    .map((t) => ({ name: t.name, description: t.description ?? "", inputSchema: t.inputSchema ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return createHash("sha256").update(stableStringify(picked)).digest("hex");
}

export interface McpProvenance {
  server: string;
  version: string;
  tool: string;
  responseHash: string;
}

export interface McpResearchBinding<T> {
  /** The one tool this connector calls for research. */
  tool: string;
  queryKinds: readonly ResearchQueryKind[];
  /** Arguments for the tool, built in code from the typed query; undefined = this query does not apply. */
  args(query: ResearchQuery): Record<string, unknown> | undefined;
  /** Checked on every response. */
  response: z.ZodType<T>;
  /** Map a checked response to the property model; put `responseHash` on every Fact. */
  map(data: T, ctx: { source: string; fetchedAt: string; responseHash: string }): ResearchOutput;
}

export interface McpConnectorSpec<T> {
  name: string;
  displayName: string;
  tier: ConnectorTier;
  /** Env var with the vendor key; null when the server needs none. */
  keyEnvVar: string | null;
  note?: string;
  capabilities?: readonly Capability[];
  creditsPerCall?: number;
  cacheTtlMs?: number;
  rateLimit?: RateLimit;
  /** sha256 from mcpToolsDigest over the bound tool(s). */
  pinnedToolsSha256: string;
  /** Build a fresh transport (stdio or streamable HTTP); receives the key when one is configured. */
  transport(secret: string | undefined): Transport | Promise<Transport>;
  research: McpResearchBinding<T>;
}

/** The JSON a tool returned: structured content when present, else the first text block parsed as JSON. */
function payloadOf(result: { structuredContent?: unknown; content?: unknown }): unknown {
  if (result.structuredContent !== undefined) return result.structuredContent;
  const blocks = Array.isArray(result.content) ? (result.content as { type?: string; text?: string }[]) : [];
  const text = blocks.find((b) => b.type === "text" && typeof b.text === "string")?.text;
  if (text === undefined) throw new Error("MCP tool returned no JSON content");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("MCP tool returned text that is not JSON");
  }
}

export function createMcpConnector<T>(spec: McpConnectorSpec<T>): Connector {
  const allowed = [spec.research.tool];
  return {
    name: spec.name,
    displayName: spec.displayName,
    tier: spec.tier,
    keyEnvVar: spec.keyEnvVar,
    phases: ["research"],
    queryKinds: spec.research.queryKinds,
    ...(spec.capabilities ? { capabilities: spec.capabilities } : {}),
    ...(spec.creditsPerCall !== undefined ? { creditsPerCall: spec.creditsPerCall } : {}),
    ...(spec.cacheTtlMs !== undefined ? { cacheTtlMs: spec.cacheTtlMs } : {}),
    ...(spec.rateLimit ? { rateLimit: spec.rateLimit } : {}),
    note: spec.note ?? "Vendor MCP server, called as a fixed connector with pinned tool definitions.",

    isConfigured() {
      return spec.keyEnvVar === null || hasSecret(spec.keyEnvVar);
    },

    async research({ query, signal }: ResearchInput): Promise<ResearchOutput> {
      const empty: ResearchOutput = { leads: [], contacts: [] };
      if (!query || !spec.research.queryKinds.includes(query.kind)) return empty;
      const args = spec.research.args(query);
      if (args === undefined) return empty;

      const secret = spec.keyEnvVar ? useSecret(spec.keyEnvVar) : undefined;
      const client = new Client({ name: "intent-outreach", version: "1" });
      await client.connect(await spec.transport(secret), { signal });
      try {
        const listed = await client.listTools(undefined, { signal });
        const tools = listed.tools as ToolDefinition[];
        if (!tools.some((t) => t.name === spec.research.tool)) {
          throw new Error(`${spec.name}: the MCP server no longer offers ${spec.research.tool}`);
        }
        const digest = mcpToolsDigest(tools, allowed);
        if (digest !== spec.pinnedToolsSha256) throw new McpPinMismatchError(spec.name, spec.pinnedToolsSha256, digest);

        const result = await client.callTool({ name: spec.research.tool, arguments: args }, undefined, { signal });
        if (result.isError) throw new Error(`${spec.name}: ${spec.research.tool} returned an error`);
        const payload = payloadOf(result as { structuredContent?: unknown; content?: unknown });
        const data = parseVendor(spec.research.response, payload);
        const responseHash = createHash("sha256").update(stableStringify(payload)).digest("hex");
        const server = client.getServerVersion();
        const provenance: McpProvenance = {
          server: server?.name ?? "unknown",
          version: server?.version ?? "unknown",
          tool: spec.research.tool,
          responseHash,
        };
        const out = spec.research.map(data, { source: spec.name, fetchedAt: new Date().toISOString(), responseHash });
        // Stamp the MCP provenance on every fact, so it survives into the stored run.
        const via = { server: provenance.server, version: provenance.version, tool: provenance.tool };
        const properties = out.properties?.map((p) => ({
          ...p,
          attributes: Object.fromEntries(
            Object.entries(p.attributes).map(([k, f]) => [k, { ...f, via, responseHash: f.responseHash ?? responseHash }]),
          ),
        }));
        return { ...out, ...(properties ? { properties } : {}), raw: { mcp: provenance } };
      } finally {
        await client.close().catch(() => undefined);
      }
    },
  };
}
