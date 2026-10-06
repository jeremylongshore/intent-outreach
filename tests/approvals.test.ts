/**
 * tests/approvals.test.ts — Phase 8: the human approval queue.
 *
 *   • The digest binds a decision to the exact channel/subject/body/CTA; an
 *     edit voids it, and a later decision supersedes an earlier one.
 *   • decide(): approving needs the digest prefix of the text the person saw;
 *     a draft without a sender footer cannot be approved; unknown runs and
 *     contacts throw; the ledger is 0600 and a corrupt line fails closed.
 *   • listPending, the MCP tools and the CLI `approvals` command.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { appendFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  approvalVerdict,
  decide,
  listPending,
  messageDigest,
  readApprovals,
  recipientMatches,
  type ApprovalRecord,
} from "../pipeline_core/approvals.js";
import { SCHEMA_VERSION, type CampaignRun } from "../pipeline_core/models.js";
import { JsonlRunStore, MemoryRunStore } from "../pipeline_core/store.js";
import { assertCampaignRun } from "../pipeline_core/validator.js";
import { handleApprove, handleListPending, handleReject } from "../mcp/tools.js";

const T = "2026-10-06T12:00:00.000Z";
const MSG = {
  contactKey: "jane@acme.com",
  channel: "email" as const,
  subject: "Your lot",
  body: "Hi Jane, a quick note about Acme.",
  cta: "Worth a call?",
  model: "stub",
  promptVersion: "outreach.v3.md@abcd1234",
  createdAt: T,
};

function run(id: string, messages: Partial<CampaignRun["messages"][number]>[] = [MSG]) {
  return assertCampaignRun({
    id,
    schemaVersion: SCHEMA_VERSION,
    icp: "x",
    domains: ["acme.com"],
    provider: "anthropic",
    model: "stub",
    status: "complete",
    messages: messages.map((m) => ({ ...MSG, ...m })),
    createdAt: T,
  });
}

const ledger = () => join(mkdtempSync(join(tmpdir(), "io-approvals-")), "approvals.jsonl");
const now = () => T;

describe("digest + verdict", () => {
  it("any change to channel, subject, body or CTA changes the digest", () => {
    const d = messageDigest(MSG);
    expect(messageDigest({ ...MSG })).toBe(d);
    for (const patch of [{ body: `${MSG.body} ` }, { subject: "Your lots" }, { cta: "Call?" }, { channel: "linkedin" as const }]) {
      expect(messageDigest({ ...MSG, ...patch })).not.toBe(d);
    }
  });

  it("missing until decided; the latest decision on the same digest wins; another text is missing", () => {
    const rec = (decision: ApprovalRecord["decision"]): ApprovalRecord => ({
      runId: "r",
      contactKey: MSG.contactKey,
      channel: "email",
      messageSha256: messageDigest(MSG),
      decision,
      by: "t",
      at: T,
    });
    expect(approvalVerdict([], "r", MSG.contactKey, MSG)).toBe("missing");
    expect(approvalVerdict([rec("approved")], "r", MSG.contactKey, MSG)).toBe("approved");
    expect(approvalVerdict([rec("approved"), rec("rejected")], "r", MSG.contactKey, MSG)).toBe("rejected");
    expect(approvalVerdict([rec("approved")], "r", MSG.contactKey, { ...MSG, body: "edited" })).toBe("missing");
    expect(approvalVerdict([rec("approved")], "other-run", MSG.contactKey, MSG)).toBe("missing");
  });
});

describe("decide + listPending", () => {
  it("approve needs the digest of the exact text; the record lands in a 0600 ledger and leaves the queue", async () => {
    const store = new MemoryRunStore();
    await store.saveRun(run("r1"));
    const path = ledger();
    const [p] = await listPending(store, path);
    expect(p).toMatchObject({ runId: "r1", contactKey: MSG.contactKey, digest: messageDigest(MSG).slice(0, 12) });

    const base = { store, runId: "r1", contactKey: MSG.contactKey, by: "t", now, path };
    await expect(decide({ ...base, decision: "approved" })).rejects.toThrow(/digest/);
    await expect(decide({ ...base, decision: "approved", digest: "0000000000" })).rejects.toThrow(/digest/);
    const rec = await decide({ ...base, decision: "approved", digest: p!.digest, note: "looks right" });
    expect(rec).toMatchObject({ decision: "approved", note: "looks right", messageSha256: messageDigest(MSG) });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(await listPending(store, path)).toEqual([]);
  });

  it("a draft without its sender footer can be rejected but never approved", async () => {
    const store = new MemoryRunStore();
    await store.saveRun(run("r2", [{ needsSenderIdentity: true }]));
    const path = ledger();
    const [p] = await listPending(store, path);
    expect(p?.needsSenderIdentity).toBe(true);
    const base = { store, runId: "r2", contactKey: MSG.contactKey, by: "t", now, path };
    await expect(decide({ ...base, decision: "approved", digest: p!.digest })).rejects.toThrow(/sender-identity/);
    await expect(decide({ ...base, decision: "rejected" })).resolves.toMatchObject({ decision: "rejected" });
  });

  it("unknown runs, unknown contacts and ambiguous contacts throw", async () => {
    const store = new MemoryRunStore();
    await store.saveRun(run("r3", [MSG, { body: "a second draft" }]));
    const base = { store, by: "t", now, path: ledger(), decision: "rejected" as const };
    await expect(decide({ ...base, runId: "nope", contactKey: MSG.contactKey })).rejects.toThrow(/no run/);
    await expect(decide({ ...base, runId: "r3", contactKey: "bob@acme.com" })).rejects.toThrow(/no message/);
    await expect(decide({ ...base, runId: "r3", contactKey: MSG.contactKey })).rejects.toThrow(/2 messages/);
  });

  it("a corrupt ledger line fails closed with its line number", async () => {
    const path = ledger();
    writeFileSync(path, "{not json\n");
    await expect(readApprovals(path)).rejects.toThrow(/line 1/);
    writeFileSync(path, `${JSON.stringify({ runId: "r", decision: "approved" })}\n`);
    await expect(readApprovals(path)).rejects.toThrow(/line 1/);
  });
});

describe("MCP approval tools", () => {
  it("list_pending → approve (with digest) → gone; reject records a rejection; errors are tool errors", async () => {
    const store = new MemoryRunStore();
    await store.saveRun(run("m1"));
    await store.saveRun(run("m2"));
    const deps = { store, approvalsPath: ledger(), now };
    const text = (r: { content: { text: string }[] }) => JSON.parse(r.content[0]!.text);

    const listed = text(await handleListPending({}, deps));
    expect(listed.total).toBe(2);
    const approved = await handleApprove({ runId: "m1", contactKey: MSG.contactKey, digest: listed.pending[0].digest }, deps);
    expect(text(approved)).toMatchObject({ decision: "approved", by: "mcp" });
    const rejected = await handleReject({ runId: "m2", contactKey: MSG.contactKey }, deps);
    expect(text(rejected)).toMatchObject({ decision: "rejected" });
    expect(text(await handleListPending({}, deps)).total).toBe(0);

    const noDigest = await handleApprove({ runId: "m1", contactKey: MSG.contactKey }, deps);
    expect(noDigest.isError).toBe(true);
  });
});

describe("CLI: intent-outreach approvals", () => {
  it("pending → approve → pending is empty; approve without --digest is a usage error", { timeout: 60_000 }, async () => {
    const home = mkdtempSync(join(tmpdir(), "io-approvals-cli-"));
    const runs = join(home, "runs.jsonl");
    await new JsonlRunStore(runs).saveRun(run("c1"));
    const cli = (...args: string[]) =>
      spawnSync(resolve("node_modules/.bin/tsx"), [resolve("cli.ts"), "approvals", ...args], {
        env: { ...process.env, INTENT_OUTREACH_HOME: home },
        encoding: "utf8",
      });
    const pending = cli("pending", "--json", "--out", runs);
    expect(pending.status).toBe(0);
    const [p] = JSON.parse(pending.stdout);
    expect(cli("approve", "c1", MSG.contactKey, "--out", runs).status).toBe(2);
    const ok = cli("approve", "c1", MSG.contactKey, "--digest", p.digest, "--out", runs);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain("approved: c1 jane@acme.com");
    expect(JSON.parse(cli("pending", "--json", "--out", runs).stdout)).toEqual([]);
    expect(readFileSync(join(home, "approvals.jsonl"), "utf8").trim().split("\n")).toHaveLength(1);
  });
});

describe("review regressions", () => {
  it("a torn last line (a crash mid-write) is ignored on read and repaired on the next append", async () => {
    const store = new MemoryRunStore();
    await store.saveRun(run("t1"));
    const path = ledger();
    const base = { store, runId: "t1", contactKey: MSG.contactKey, by: "t", now, path };
    await decide({ ...base, decision: "rejected" });
    appendFileSync(path, '{"runId":"t1","contactKey":"jane@acme.co'); // torn, no newline
    expect(await readApprovals(path)).toHaveLength(1);
    await decide({ ...base, decision: "rejected", note: "again" });
    const records = await readApprovals(path);
    expect(records).toHaveLength(2);
    expect(records[1]?.note).toBe("again");
    expect(readFileSync(path, "utf8").endsWith("\n")).toBe(true);
  });

  it("an interior corrupt line still fails closed", async () => {
    const path = ledger();
    writeFileSync(path, "{not json\n{}\n");
    await expect(readApprovals(path)).rejects.toThrow(/line 1/);
  });

  it("listPending reads the store once, not once per run", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "io-approvals-scan-")), "runs.jsonl");
    const store = new JsonlRunStore(path);
    for (let i = 0; i < 5; i++) await store.saveRun(run(`s${i}`));
    const getRun = vi.spyOn(store, "getRun");
    const listRuns = vi.spyOn(store, "listRuns");
    expect(await listPending(store, ledger())).toHaveLength(5);
    expect(getRun).not.toHaveBeenCalled();
    expect(listRuns).toHaveBeenCalledTimes(1);
  });

  it("concurrent decisions all land intact", async () => {
    const store = new MemoryRunStore();
    for (let i = 0; i < 12; i++) await store.saveRun(run(`c${i}`));
    const path = ledger();
    await Promise.all(
      Array.from({ length: 12 }, (_, i) => decide({ store, runId: `c${i}`, contactKey: MSG.contactKey, decision: "rejected", by: "t", now, path })),
    );
    expect(await readApprovals(path)).toHaveLength(12);
  });

  it("recipientMatches binds an approval to the drafted recipient", () => {
    const phone = { partyKey: "o1", kind: "phone" as const, value: "+12515550100" };
    const property = {
      parties: [{ key: "o1", mailingAddress: { line1: "9 Elm St", city: "Nashville", state: "TN", zip: "37201" } }],
      contactPoints: [phone],
    };
    expect(recipientMatches(property, "o1", { contactPoint: { kind: "phone", value: "(251) 555-0100" } })).toBe(true);
    expect(recipientMatches(property, "o1", { contactPoint: { kind: "phone", value: "+12515550199" } })).toBe(false);
    expect(recipientMatches(property, "o1", { contactPoint: { kind: "mail", value: "9 Elm Street, Nashville, Tennessee 37201" } })).toBe(true);
    expect(recipientMatches(property, "o1", {})).toBe(false);
    const company = { parties: [], contactPoints: [] };
    expect(recipientMatches(company, "jane@acme.com", { contactEmail: "Jane@Acme.com" })).toBe(true);
    expect(recipientMatches(company, "jane@acme.com", { contactPoint: { kind: "email", value: "bob@acme.com" } })).toBe(false);
  });
});
