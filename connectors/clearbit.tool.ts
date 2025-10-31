// Clearbit FunctionTool shim (no network). BYO key required.
export const tool = {
  name: "clearbit.enrich_domain",
  description: "Enrich a company by domain using Clearbit. Returns NOT_CONFIGURED without CLEARBIT_API_KEY.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: { domain: { type: "string", format: "hostname" } },
    required: ["domain"]
  },
  output_schema: {
    type: "object",
    additionalProperties: false,
    properties: { ok: { type: "boolean" }, data: { type: "object" }, error: { type: "string" } },
    required: ["ok"]
  },
  async run(_input: {domain:string}) {
    if (!process.env.CLEARBIT_API_KEY) throw new Error("NOT_CONFIGURED");
    throw new Error("NOT_CONFIGURED");
  }
};
export default tool;
