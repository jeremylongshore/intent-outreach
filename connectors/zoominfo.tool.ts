// ZoomInfo placeholder tool (no network). Throws until configured.
export const tool = {
  name: "zoominfo.lookup",
  description: "Placeholder ZoomInfo lookup. Returns NOT_CONFIGURED until API key present.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: { query: { type: "string", minLength: 1 } },
    required: ["query"]
  },
  output_schema: {
    type: "object",
    additionalProperties: false,
    properties: { ok: { const: false }, error: { const: "NOT_CONFIGURED" } },
    required: ["ok","error"]
  },
  async run(_input: {query:string}) {
    if (!process.env.ZOOMINFO_API_KEY) throw new Error("NOT_CONFIGURED");
    throw new Error("NOT_CONFIGURED");
  }
};
export default tool;
