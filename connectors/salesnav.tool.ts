// Sales Navigator placeholder tool (no network). Throws until configured.
export const tool = {
  name: "salesnav.search",
  description: "Placeholder LinkedIn Sales Navigator search. Returns NOT_CONFIGURED until cookie/token present.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: { q: { type: "string", minLength: 1 } },
    required: ["q"]
  },
  output_schema: {
    type: "object",
    additionalProperties: false,
    properties: { ok: { const: false }, error: { const: "NOT_CONFIGURED" } },
    required: ["ok","error"]
  },
  async run(_input: {q:string}) {
    if (!process.env.SALESNAV_TOKEN && !process.env.SALESNAV_COOKIE) throw new Error("NOT_CONFIGURED");
    throw new Error("NOT_CONFIGURED");
  }
};
export default tool;
