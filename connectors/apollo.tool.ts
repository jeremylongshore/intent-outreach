// Apollo.io FunctionTool shim (no network). BYO key required.
export const tool = {
  name: "apollo.person_search",
  description: "Search people by name and company in Apollo. Returns NOT_CONFIGURED without APOLLO_API_KEY.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      full_name: { type: "string", minLength: 3 },
      company: { type: "string", minLength: 2 }
    },
    required: ["full_name","company"]
  },
  output_schema: {
    type: "object",
    additionalProperties: false,
    properties: { ok: { type: "boolean" }, people: { type: "array", items: { type: "object" } }, error: { type: "string" } },
    required: ["ok"]
  },
  async run(_input: {full_name:string; company:string}) {
    if (!process.env.APOLLO_API_KEY) throw new Error("NOT_CONFIGURED");
    throw new Error("NOT_CONFIGURED");
  }
};
export default tool;
