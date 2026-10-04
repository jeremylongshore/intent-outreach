/**
 * mcp/server.ts — the Intent Outreach MCP server (stdio entrypoint).
 *
 * ONE stdio server, many tools (the plan's "one server, not a per-connector
 * mesh"). It is a THIN wrapper over pipeline_core: the handlers in ./tools.ts
 * call the deterministic runResearch/runEnrich and the shared compliance path,
 * so connector and gate logic live in exactly one place. BYO keys reach this
 * process via env passthrough declared in .mcp.json; the server reads them
 * locally through pipeline_core/secrets and transmits them only to each
 * provider's API.
 *
 * Tools are phase-level (research_domain, enrich_lead), NOT per-connector — the
 * model never chooses which provider to call (Karpathy: deterministic control
 * flow). list_connectors is read-only introspection.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerBuiltinConnectors } from "../pipeline_core/connectors/index.js";
import {
  EnrichLeadInput,
  handleEnrichLead,
  handleListConnectors,
  handleResearchDomain,
  handleSaveRun,
  ResearchDomainInput,
  SaveRunInput,
} from "./tools.js";

registerBuiltinConnectors();

const server = new McpServer({ name: "intent-outreach", version: "0.2.0" });

server.registerTool(
  "list_connectors",
  {
    title: "List data connectors",
    description:
      "List every registered connector with its tier (free/paid/enterprise/legacy), " +
      "the phases it serves, and whether it is currently configured (has its key).",
    inputSchema: {},
  },
  async () => handleListConnectors(),
);

server.registerTool(
  "research_domain",
  {
    title: "Research a company domain",
    description:
      "Run every CONFIGURED research connector (in deterministic order) against a " +
      "company domain and return aggregated, de-duplicated leads + contacts. " +
      "Connectors without a key are skipped. Raw vendor payloads are omitted unless debug: true.",
    inputSchema: ResearchDomainInput,
  },
  async (args) => handleResearchDomain(args),
);

server.registerTool(
  "enrich_lead",
  {
    title: "Enrich a lead and its contacts",
    description:
      "Run every CONFIGURED enrich connector (in deterministic order) against a lead " +
      "and its contacts; returns enrichments (funding, verified emails, phones, web context). " +
      "Raw vendor payloads are omitted unless debug: true.",
    inputSchema: EnrichLeadInput,
  },
  async (args) => handleEnrichLead(args),
);

server.registerTool(
  "save_run",
  {
    title: "Save a validated campaign run",
    description:
      "Gate and append an assembled campaign run to the LOCAL run store (JSONL under the " +
      "user's home, never the cloud). The same compliance as a CLI run applies: suppressed " +
      "or pack-blocked contacts move to blockedContacts (never saved as messages), each draft " +
      "must pass the send-safety guard (failures go to rejectedDrafts), and email drafts get " +
      "the CAN-SPAM footer from the profile's sender identity (or are flagged " +
      "needsSenderIdentity). The whole record is schema-validated before it is persisted. " +
      "Returns the saved run id + path, or an error describing what to fix.",
    inputSchema: SaveRunInput,
  },
  async (args) => handleSaveRun(args),
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
