/**
 * mcp/server.ts — the Intent Outreach MCP server (stdio entrypoint).
 *
 * ONE stdio server, many tools (the plan's "one server, not a per-connector
 * mesh"). It is a THIN wrapper over pipeline_core: the handlers in ./tools.ts
 * call the deterministic runResearch/runEnrich and the shared compliance path,
 * so connector and gate logic live in exactly one place. BYO keys reach this
 * process through the inherited environment (stdio servers inherit the parent
 * env; .mcp.json declares no env block) or the local secrets file; the server
 * reads them through pipeline_core/secrets and transmits them only to each
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
  DecideInput,
  EnrichLeadInput,
  handleApprove,
  handleEnrichLead,
  handleListPending,
  handleReject,
  ListPendingInput,
  handleListConnectors,
  handleResearchDomain,
  handleSaveRun,
  ResearchDomainInput,
  SaveRunInput,
} from "./tools.js";

registerBuiltinConnectors();

// Injected by the bundle step from package.json (esbuild --define), so the
// server version can never drift from the package. Unbundled dev runs report "dev".
declare const __INTENT_OUTREACH_VERSION__: string | undefined;
const VERSION = typeof __INTENT_OUTREACH_VERSION__ === "string" ? __INTENT_OUTREACH_VERSION__ : "dev";

const server = new McpServer({ name: "intent-outreach", version: VERSION });

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

server.registerTool(
  "list_pending",
  {
    title: "List drafts waiting for approval",
    description:
      "List drafted messages in the LOCAL run store that no person has approved or rejected yet, with " +
      "the full text and a digest. Nothing may be sent until a person approves the exact text. Show the " +
      "drafts to the user; never approve on your own judgment.",
    inputSchema: ListPendingInput,
  },
  async (args) => handleListPending(args),
);

server.registerTool(
  "approve",
  {
    title: "Record a person's approval of one draft",
    description:
      "Record that the USER approved one exact draft (runId + contactKey + the digest list_pending showed). " +
      "Call this only after the user has read that draft and explicitly said to approve it. Editing a draft " +
      "afterwards voids the approval. Approving does not send anything.",
    inputSchema: DecideInput,
  },
  async (args) => handleApprove(args),
);

server.registerTool(
  "reject",
  {
    title: "Record a rejection of one draft",
    description: "Record that the user rejected one draft (runId + contactKey). A rejected draft can never pass the send-time check.",
    inputSchema: DecideInput,
  },
  async (args) => handleReject(args),
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
