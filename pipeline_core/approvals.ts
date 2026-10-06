/**
 * pipeline_core/approvals.ts — the human approval queue.
 *
 * Nothing the engine drafts may be sent until a person approves THAT EXACT
 * message. An approval is a record in an append-only local ledger
 * (`${INTENT_OUTREACH_HOME}/approvals.jsonl`, 0600) binding a decision to:
 *
 *     run id + contact key + sha256(channel, subject, body, cta)
 *
 * so editing a message after approval voids the approval (the digest no longer
 * matches), and a later decision on the same digest supersedes an earlier one
 * (reject after approve ⇒ rejected). The send-time check (`checkSendable`)
 * requires an approval for every channel; `approvalVerdict` is the pure piece
 * it uses, and this module's I/O reads the ledger for the CLI and MCP tools.
 *
 * Fail closed: a corrupt ledger line throws with its line number (a skipped
 * line could be a rejection), and a message that cannot be found in its run
 * cannot be approved.
 */

import { createHash } from "node:crypto";
import { constants, mkdir, open, readFile, unlink, stat, type FileHandle } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { ChannelSchema, type Message } from "./models.js";
import { intentOutreachHome } from "./secrets.js";
import type { RunStore } from "./store.js";

export const ApprovalRecordSchema = z.object({
  runId: z.string().min(1),
  contactKey: z.string().min(1),
  channel: ChannelSchema,
  messageSha256: z.string().regex(/^[0-9a-f]{64}$/),
  decision: z.enum(["approved", "rejected"]),
  /** Who decided: an OS user for the CLI, "mcp:<client>" for the MCP tools. */
  by: z.string().min(1),
  at: z.string().datetime(),
  note: z.string().min(1).optional(),
});
export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;

/** The fields a person reads and approves. */
export interface ApprovableMessage {
  channel: Message["channel"];
  subject?: string | null | undefined;
  body: string;
  cta?: string | null | undefined;
}

/** sha256 over exactly what is approved: channel, subject, body and CTA. */
export function messageDigest(m: ApprovableMessage): string {
  return createHash("sha256")
    .update(JSON.stringify([m.channel, m.subject ?? null, m.body, m.cta ?? null]))
    .digest("hex");
}

export type ApprovalState = "approved" | "rejected" | "missing";

/** Pure: the latest decision for this run + contact + exact message, or "missing". */
export function approvalVerdict(
  records: readonly ApprovalRecord[],
  runId: string,
  contactKey: string,
  message: ApprovableMessage,
): ApprovalState {
  const digest = messageDigest(message);
  let state: ApprovalState = "missing";
  for (const r of records) {
    if (r.runId === runId && r.contactKey === contactKey && r.messageSha256 === digest) state = r.decision;
  }
  return state;
}

export function defaultApprovalsPath(): string {
  return join(intentOutreachHome(), "approvals.jsonl");
}

/** Read the ledger. Missing file ⇒ []. A corrupt line THROWS (it might be a rejection). */
export async function readApprovals(path: string = defaultApprovalsPath()): Promise<ApprovalRecord[]> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: ApprovalRecord[] = [];
  text.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(`approvals: line ${i + 1} of ${path} is not valid JSON; fix or remove it`);
    }
    const r = ApprovalRecordSchema.safeParse(parsed);
    if (!r.success) throw new Error(`approvals: line ${i + 1} of ${path} is invalid; fix or remove it`);
    out.push(r.data);
  });
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const lockPath = `${path}.lock`;
  const deadline = Date.now() + 10_000;
  let lock: FileHandle | undefined;
  while (!lock) {
    try {
      lock = await open(lockPath, "wx", 0o600);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      try {
        if (Date.now() - (await stat(lockPath)).mtimeMs > 30_000) await unlink(lockPath).catch(() => undefined);
      } catch {
        // the lock vanished between open and stat; retry
      }
      if (Date.now() >= deadline) throw new Error(`approvals: timed out waiting for lock ${lockPath}`);
      await sleep(20);
    }
  }
  try {
    return await fn();
  } finally {
    await lock.close().catch(() => undefined);
    await unlink(lockPath).catch(() => undefined);
  }
}

/** Append one decision (fsync'd, 0600, under a lock). */
async function append(path: string, record: ApprovalRecord): Promise<void> {
  await withLock(path, async () => {
    const fh = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND, 0o600);
    try {
      await fh.chmod(0o600);
      await fh.write(`${JSON.stringify(record)}\n`);
      await fh.sync();
    } finally {
      await fh.close();
    }
  });
}

export interface PendingMessage {
  runId: string;
  contactKey: string;
  channel: Message["channel"];
  subject?: string | undefined;
  body: string;
  cta: string;
  fitScore?: number | undefined;
  createdAt: string;
  /** First 12 hex chars of the digest, to cite when approving. */
  digest: string;
  /** True when the draft cannot be sent as-is (no sender identity footer). */
  needsSenderIdentity: boolean;
}

/** Every drafted message with no decision yet, oldest run first. */
export async function listPending(store: RunStore, path: string = defaultApprovalsPath()): Promise<PendingMessage[]> {
  const records = await readApprovals(path);
  const out: PendingMessage[] = [];
  for (const id of await store.listRunIds()) {
    const run = await store.getRun(id);
    if (!run) continue;
    for (const m of run.messages) {
      if (approvalVerdict(records, run.id, m.contactKey, m) !== "missing") continue;
      out.push({
        runId: run.id,
        contactKey: m.contactKey,
        channel: m.channel,
        ...(m.subject ? { subject: m.subject } : {}),
        body: m.body,
        cta: m.cta,
        ...(m.fitScore !== undefined ? { fitScore: m.fitScore } : {}),
        createdAt: m.createdAt,
        digest: messageDigest(m).slice(0, 12),
        needsSenderIdentity: m.needsSenderIdentity,
      });
    }
  }
  return out;
}

export interface DecideInput {
  store: RunStore;
  runId: string;
  contactKey: string;
  decision: ApprovalRecord["decision"];
  by: string;
  note?: string | undefined;
  /** Required when approving: the digest prefix shown by listPending, so the decision is about the text the person saw. */
  digest?: string | undefined;
  now: () => string;
  path?: string;
}

/**
 * Record a decision on one stored message. Approving needs the digest prefix
 * of the exact text (from listPending); a message that is missing, ambiguous,
 * or flagged `needsSenderIdentity` cannot be approved.
 */
export async function decide(input: DecideInput): Promise<ApprovalRecord> {
  const run = await input.store.getRun(input.runId);
  if (!run) throw new Error(`approvals: no run ${JSON.stringify(input.runId)}`);
  const matches = run.messages.filter((m) => m.contactKey === input.contactKey);
  if (matches.length === 0) throw new Error(`approvals: run ${input.runId} has no message for ${input.contactKey}`);
  if (matches.length > 1) throw new Error(`approvals: run ${input.runId} has ${matches.length} messages for ${input.contactKey}`);
  const m = matches[0]!;
  const digest = messageDigest(m);
  if (input.decision === "approved") {
    const prefix = (input.digest ?? "").trim().toLowerCase();
    if (prefix.length < 8 || !digest.startsWith(prefix)) {
      throw new Error("approvals: approving needs the message digest shown by `approvals pending` (at least 8 characters)");
    }
    if (m.needsSenderIdentity) throw new Error("approvals: this draft has no sender-identity footer and cannot be approved");
  }
  const record = ApprovalRecordSchema.parse({
    runId: run.id,
    contactKey: m.contactKey,
    channel: m.channel,
    messageSha256: digest,
    decision: input.decision,
    by: input.by,
    at: input.now(),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
  });
  await append(input.path ?? defaultApprovalsPath(), record);
  return record;
}
