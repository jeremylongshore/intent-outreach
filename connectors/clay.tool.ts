// Clay FunctionTool shim (no network). Enforces BYO key policy.
export interface FunctionTool {
  name: string;
  description: string;
  input_schema: any;
  output_schema: any;
  run: (input: any, ctx?: {workspaceId?: string}) => Promise<any>;
}
export const tool: FunctionTool = {
  name: "clay.company_lookup",
  description: "Lookup company profile in Clay by domain. Returns NOT_CONFIGURED without CLAY_API_KEY.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: { domain: { type: "string", format: "hostname" } },
    required: ["domain"]
  },
  output_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      ok: { type: "boolean" },
      company: {
        type: "object",
        additionalProperties: false,
        properties: {
          domain: { type: "string" },
          name: { type: "string" },
          employees: { type: "integer" },
          location: { type: "string" }
        },
        required: ["domain","name"]
      },
      error: { type: "string" }
    },
    required: ["ok"]
  },
  async run(input: {domain:string}) {
    if (!process.env.CLAY_API_KEY) throw new Error("NOT_CONFIGURED");
    throw new Error("NOT_CONFIGURED");
  }
};
export default tool;
