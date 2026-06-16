/**
 * mcp/server.ts — the Intent Outreach MCP server.
 *
 * ONE stdio server, many tools (the plan's "one server, not a per-connector
 * mesh"). It is a THIN wrapper over pipeline_core: the tools call the
 * deterministic runResearch/runEnrich, so connector logic lives in exactly one
 * place. BYO keys reach this process via env passthrough declared in .mcp.json;
 * the server reads them locally through pipeline_core/secrets and transmits them
 * only to each provider's API.
 *
 * Tools are phase-level (research_domain, enrich_lead), NOT per-connector — the
 * model never chooses which provider to call (Karpathy: deterministic control
 * flow). list_connectors is read-only introspection.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runEnrich, runResearch } from "../pipeline_core/pipeline.js";
import {
  ContactSchema,
  EnrichmentSchema,
  LeadSchema,
  MessageSchema,
  SCHEMA_VERSION,
  type Contact,
  type Lead,
} from "../pipeline_core/models.js";
import { assertCampaignRun, ValidationError } from "../pipeline_core/validator.js";
import { JsonlRunStore, defaultStorePath } from "../pipeline_core/store.js";
import {
  getConnectors,
  registerBuiltinConnectors,
} from "../pipeline_core/connectors/index.js";

registerBuiltinConnectors();

const server = new McpServer({ name: "intent-outreach", version: "0.1.0" });

function asText(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

server.registerTool(
  "list_connectors",
  {
    title: "List data connectors",
    description:
      "List every registered connector with its tier (free/paid/enterprise/legacy), " +
      "the phases it serves, and whether it is currently configured (has its key).",
    inputSchema: {},
  },
  async () =>
    asText(
      getConnectors().map((c) => ({
        name: c.name,
        displayName: c.displayName,
        tier: c.tier,
        phases: c.phases,
        keyEnvVar: c.keyEnvVar,
        configured: c.isConfigured(),
        note: c.note,
      })),
    ),
);

server.registerTool(
  "research_domain",
  {
    title: "Research a company domain",
    description:
      "Run every CONFIGURED research connector (in deterministic order) against a " +
      "company domain and return aggregated, de-duplicated leads + contacts. " +
      "Connectors without a key are skipped silently.",
    inputSchema: {
      domain: z.string().describe("Company domain, e.g. acme.com"),
      icp: z.string().describe("Ideal customer profile / target persona keywords"),
    },
  },
  async ({ domain, icp }) => asText(await runResearch(domain, icp)),
);

server.registerTool(
  "enrich_lead",
  {
    title: "Enrich a lead and its contacts",
    description:
      "Run every CONFIGURED enrich connector (in deterministic order) against a lead " +
      "and its contacts; returns enrichments (funding, verified emails, phones, web context).",
    inputSchema: {
      domain: z.string(),
      companyName: z.string().optional(),
      contacts: z
        .array(
          z.object({
            name: z.string(),
            email: z.string().optional(),
            title: z.string().optional(),
            linkedin: z.string().optional(),
          }),
        )
        .default([]),
    },
  },
  async ({ domain, companyName, contacts }) => {
    const lead: Lead = { domain, companyName: companyName ?? domain, source: "manual" };
    const normalized: Contact[] = contacts.map((c) => ({
      name: c.name,
      leadDomain: domain,
      email: c.email,
      title: c.title,
      linkedin: c.linkedin,
      source: "manual",
    }));
    return asText(await runEnrich(lead, normalized));
  },
);

server.registerTool(
  "save_run",
  {
    title: "Save a validated campaign run",
    description:
      "Validate an assembled campaign run and append it to the LOCAL run store " +
      "(JSONL under the user's home, never the cloud). This is the gate: the run " +
      "is checked against the schema before it is persisted — un-validated model " +
      "output is rejected here, not stored. Returns the saved run id + path, or a " +
      "validation error describing what to fix.",
    inputSchema: {
      id: z.string(),
      icp: z.string(),
      domains: z.array(z.string()),
      provider: z.string(),
      model: z.string(),
      leads: z.array(LeadSchema).default([]),
      contacts: z.array(ContactSchema).default([]),
      enrichments: z.array(EnrichmentSchema).default([]),
      messages: z.array(MessageSchema).default([]),
      skippedConnectors: z.array(z.string()).default([]),
    },
  },
  async (args) => {
    const nowIso = new Date().toISOString();
    const status = args.messages.length
      ? "complete"
      : args.contacts.length
        ? "enriched"
        : "researched";
    try {
      const run = assertCampaignRun({
        ...args,
        schemaVersion: SCHEMA_VERSION,
        status,
        createdAt: nowIso,
        finishedAt: nowIso,
      });
      const store = new JsonlRunStore();
      await store.saveRun(run);
      return asText({ saved: run.id, status, path: defaultStorePath(), messages: run.messages.length });
    } catch (err) {
      if (err instanceof ValidationError) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `validation failed (run NOT saved): ${err.message}` }],
        };
      }
      throw err;
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio server: logs MUST go to stderr (stdout is the JSON-RPC channel).
  process.stderr.write("intent-outreach MCP server ready on stdio\n");
}

main().catch((err) => {
  process.stderr.write(`intent-outreach MCP server failed: ${String(err)}\n`);
  process.exit(1);
});
