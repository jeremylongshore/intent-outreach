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

import { createHash, randomUUID } from "node:crypto";
import { constants, mkdir, open, readFile, rename, stat, truncate, unlink, type FileHandle } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { normalizePhone } from "./compliance/index.js";
import { normalizeMailingAddress, normalizeSuppressionEmail } from "./compliance/suppression.js";
import { ChannelSchema, type CampaignRun, type ContactPoint, type Message } from "./models.js";
import { formatAddress } from "./property-seam.js";
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

/**
 * Read the ledger. Missing file ⇒ []. A corrupt line THROWS (it might be a
 * rejection), with one exception: an unterminated LAST line is a torn write
 * from a crash. That write was never acknowledged, so it is ignored (and the
 * next append truncates it), exactly as the run store treats a torn tail.
 */
export async function readApprovals(path: string = defaultApprovalsPath()): Promise<ApprovalRecord[]> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: ApprovalRecord[] = [];
  const lines = text.split("\n");
  const tornTail = !text.endsWith("\n") ? lines.length - 1 : -1;
  lines.forEach((line, i) => {
    if (!line.trim() || i === tornTail) return;
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

/**
 * A lock file holding a unique token. A stale lock (> 30 s) is stolen by an
 * atomic rename, so two waiters can never both steal it; on release the holder
 * removes the lock only if it still holds ITS token.
 */
async function withLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const lockPath = `${path}.lock`;
  const token = randomUUID();
  const deadline = Date.now() + 10_000;
  let lock: FileHandle | undefined;
  while (!lock) {
    try {
      lock = await open(lockPath, "wx", 0o600);
      await lock.write(token);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      try {
        if (Date.now() - (await stat(lockPath)).mtimeMs > 30_000) {
          const stolen = `${lockPath}.stale.${token}`;
          await rename(lockPath, stolen); // only one waiter's rename can succeed
          await unlink(stolen).catch(() => undefined);
          continue;
        }
      } catch {
        // the lock vanished or another waiter stole it first; retry
      }
      if (Date.now() >= deadline) throw new Error(`approvals: timed out waiting for lock ${lockPath}`);
      await sleep(20);
    }
  }
  try {
    return await fn();
  } finally {
    await lock.close().catch(() => undefined);
    const holder = await readFile(lockPath, "utf8").catch(() => undefined);
    if (holder === token) await unlink(lockPath).catch(() => undefined);
  }
}

/** Drop an unterminated last line (a torn, never-acknowledged write) before appending. */
async function repairTornTail(path: string): Promise<void> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
  if (text.length === 0 || text.endsWith("\n")) return;
  await truncate(path, Buffer.byteLength(text.slice(0, text.lastIndexOf("\n") + 1)));
}

/** Append one decision (torn tail repaired, fsync'd, 0600, under a lock). */
async function append(path: string, record: ApprovalRecord): Promise<void> {
  await withLock(path, async () => {
    await repairTornTail(path);
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
  for (const run of await store.listRuns()) {
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

const lower = (v: string) => v.trim().toLowerCase();

function sameContactPoint(a: Pick<ContactPoint, "kind" | "value">, b: Pick<ContactPoint, "kind" | "value">): boolean {
  if (a.kind !== b.kind) return false;
  try {
    if (a.kind === "phone") return normalizePhone(a.value) === normalizePhone(b.value);
    if (a.kind === "email") return normalizeSuppressionEmail(a.value) === normalizeSuppressionEmail(b.value);
    return normalizeMailingAddress(a.value) === normalizeMailingAddress(b.value);
  } catch {
    return false;
  }
}

/**
 * Is `recipient` the person this stored message was drafted for? An approval
 * covers a text TO a contact; it must not be replayed to someone else.
 *   • company runs: the contactKey is the contact's email (or name@domain); an
 *     email recipient must be that address.
 *   • property runs: the contactKey is the owner's party key; the recipient
 *     must be one of that party's contact points, or their mailing address.
 */
export function recipientMatches(
  run: {
    readonly contactPoints: readonly Pick<ContactPoint, "partyKey" | "kind" | "value">[];
    readonly parties: readonly Pick<CampaignRun["parties"][number], "key" | "mailingAddress">[];
  },
  contactKey: string,
  recipient: { contactPoint?: Pick<ContactPoint, "kind" | "value"> | undefined; contactEmail?: string | undefined },
): boolean {
  const party = run.parties.find((p) => p.key === contactKey);
  if (party) {
    const cp = recipient.contactPoint;
    if (!cp) return false;
    if (run.contactPoints.some((c) => c.partyKey === contactKey && sameContactPoint(c, cp))) return true;
    const mailing = formatAddress(party.mailingAddress);
    return cp.kind === "mail" && mailing !== undefined && sameContactPoint({ kind: "mail", value: mailing }, cp);
  }
  const email = recipient.contactPoint?.kind === "email" ? recipient.contactPoint.value : recipient.contactEmail;
  if (email !== undefined) return lower(email) === lower(contactKey);
  // A non-email channel to a company contact: nothing on record to bind it to.
  return recipient.contactPoint === undefined;
}
