// Crunchbase FunctionTool shim (no network). BYO key required.
export const tool = {
  name: "crunchbase.company_info",
  description: "Fetch company info from Crunchbase by permalink or name. Returns NOT_CONFIGURED without CRUNCHBASE_API_KEY.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: { query: { type: "string", minLength: 2 } },
    required: ["query"]
  },
  output_schema: {
    type: "object",
    additionalProperties: false,
    properties: { ok: { type: "boolean" }, company: { type: "object" }, error: { type: "string" } },
    required: ["ok"]
  },
  async run(_input: {query:string}) {
    if (!process.env.CRUNCHBASE_API_KEY) throw new Error("NOT_CONFIGURED");
    throw new Error("NOT_CONFIGURED");
  }
};
export default tool;
