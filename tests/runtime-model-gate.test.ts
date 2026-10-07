import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../cli.js";
import * as approvals from "../evals/supported.js";
import { EMPTY_SUPPRESSION_LIST } from "../pipeline_core/compliance/suppression.js";
import { runInbound } from "../pipeline_core/inbound.js";
import { runCampaign } from "../pipeline_core/pipeline.js";
import { runPropertyCampaign } from "../pipeline_core/property-campaign.js";
import { getProvider, getProviderUnchecked } from "../pipeline_core/providers.js";

const residential = "residential-re";
const model = "claude-sonnet-4-6";
const approved: approvals.ApprovedModel = {
  provider: "anthropic", model, pack: residential, verified: true,
  resultFile: "evals/results/test-only.json", evidence: "test-only registry fixture",
};
const inquiry = {
  email: "owner@example.com", message: "Could you estimate the value of my property?",
  source: "test", receivedAt: "2026-10-06T12:00:00Z",
};
const propertyInput = {
  id: "pack-gate", icp: "Residential listing agent", queries: [{ kind: "area" as const, geography: { zips: ["32507"] }, filters: {} }],
  suppressions: EMPTY_SUPPRESSION_LIST,
};
const stdin = Object.getOwnPropertyDescriptor(process, "stdin")!;

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-only");
  vi.stubEnv("XAI_API_KEY", "test-only");
  vi.stubEnv("INTENT_OUTREACH_MODEL", model);
  vi.stubEnv("INTENT_OUTREACH_ALLOW_UNGATED", "");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  Object.defineProperty(process, "stdin", stdin);
});

describe("runtime model approval scope", () => {
  it("a legacy B2B entry does not approve residential work, even with a configured key", async () => {
    await expect(getProvider({ provider: "anthropic", model, pack: residential })).rejects.toThrow(/eval gate for pack "residential-re"/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { ...approved, verified: false },
    { ...approved, resultFile: null },
  ])("rejects incomplete approval evidence: %j", async (entry) => {
    vi.spyOn(approvals, "approvedEntry").mockReturnValue(entry);
    await expect(getProvider({ provider: "anthropic", model, pack: residential })).rejects.toThrow(/eval gate/);
  });

  it("accepts the exact approved model and pack, independent of B2B provider support", async () => {
    const lookup = vi.spyOn(approvals, "approvedEntry").mockImplementation((provider, id, _entries, pack) =>
      provider === "xai" && id === "grok-residential-test" && pack === residential
        ? { ...approved, provider, model: id } : undefined);
    const provider = await getProvider({ provider: "xai", model: "grok-residential-test", pack: residential });
    expect(provider.name).toBe("xai");
    expect(lookup).toHaveBeenCalledWith("xai", "grok-residential-test", undefined, residential);
    await expect(getProvider({ provider: "xai", model: "grok-other", pack: residential })).rejects.toThrow(/eval gate/);
    await expect(getProvider({ provider: "xai", model: "grok-residential-test", pack: "other-pack" })).rejects.toThrow(/other-pack/);
    await expect(getProvider({ provider: "xai", model: "grok-residential-test" })).rejects.toThrow(/eval gate/);
  });

  it("keeps the explicit local override and eval harness available", async () => {
    vi.stubEnv("INTENT_OUTREACH_ALLOW_UNGATED", "1");
    const provider = await getProvider({ provider: "anthropic", model, pack: residential });
    expect(() => provider.assertPackApproved?.(residential)).not.toThrow();
    vi.stubEnv("INTENT_OUTREACH_ALLOW_UNGATED", "");
    expect(() => provider.assertPackApproved?.(residential)).toThrow(/eval gate/);
    const unchecked = await getProviderUnchecked({ provider: "anthropic", model, pack: residential });
    expect(unchecked.assertPackApproved).toBeUndefined();
  });
});

describe("campaign boundaries", () => {
  it("the default property provider enforces the resolved pack before research", async () => {
    await expect(runPropertyCampaign(propertyInput)).rejects.toThrow(/eval gate for pack "residential-re"/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("a B2B-created production provider cannot bypass the property pack gate by injection", async () => {
    const provider = await getProvider({ provider: "anthropic", model });
    await expect(runPropertyCampaign({ ...propertyInput, provider })).rejects.toThrow(/residential-re/);
    await expect(runPropertyCampaign({ ...propertyInput, provider: { ...provider, assertPackApproved: undefined }, scoreProvider: provider }))
      .rejects.toThrow(/residential-re/);
  });

  it("runCampaign also rechecks the chosen pack for a production provider", async () => {
    const provider = await getProvider({ provider: "anthropic", model });
    await expect(runCampaign({ id: "company-pack-gate", icp: "x", domains: ["example.com"], pack: residential,
      provider, suppressions: EMPTY_SUPPRESSION_LIST })).rejects.toThrow(/residential-re/);
  });

  it("inbound default and injected production providers both enforce residential approval", async () => {
    const input = { id: "inbound-gate", offer: "Listing agent", inquiry, suppressions: EMPTY_SUPPRESSION_LIST };
    await expect(runInbound(input)).rejects.toThrow(/residential-re/);
    const provider = await getProvider({ provider: "anthropic", model });
    await expect(runInbound({ ...input, provider })).rejects.toThrow(/residential-re/);
  });
});

describe("CLI model selection", () => {
  it.each([
    { flags: ["--provider", "anthropic", "--model", model] },
    { flags: ["--score-provider", "anthropic", "--score-model", model] },
    { flags: ["--score-model", model] },
    { flags: [] },
  ])("property-run applies the default pack to each selection: %j", async ({ flags }) => {
    await expect(main(["property-run", "--icp", "Listing agent", "--zips", "32507", ...flags]))
      .rejects.toThrow(/residential-re/);
  });

  it("property-run forwards an explicit pack to the score provider", async () => {
    await expect(main(["property-run", "--icp", "x", "--zips", "32507", "--pack", "custom-pack", "--score-model", model]))
      .rejects.toThrow(/eval gate for pack "custom-pack"/);
  });

  it.each([residential, "custom-pack"])("inbound forwards %s when selecting an explicit model", async (pack) => {
    Object.defineProperty(process, "stdin", { value: Readable.from([Buffer.from(JSON.stringify({ inquiry }))]), configurable: true });
    await expect(main(["inbound", "--offer", "Listing agent", "--provider", "anthropic", "--model", model, "--pack", pack]))
      .rejects.toThrow(`eval gate for pack "${pack}"`);
  });
});
