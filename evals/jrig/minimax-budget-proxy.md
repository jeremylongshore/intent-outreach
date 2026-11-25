# Bounded MiniMax M3 diagnostic transport

This eval-only proxy limits one process's root, nested-agent and judge calls together to
$0.50 in conservative MiniMax-M3 token charges ($0.30 input/$1.20 output per million).
It is an explicit loopback transport, not a provider substitution or a qualification.
Pricing verified 2026-10-10 from [official paygo pricing](https://platform.minimax.io/docs/guides/pricing-paygo): standard MiniMax-M3 input up to 512k. This request/framing bound remains below that tier; priority service and server-priced tools are rejected. [Token Plan pricing](https://platform.minimax.io/docs/guides/pricing-token-plan) distinguishes subscription quota from Credits billed at equivalent paygo list price. The sidecar tracks paygo-equivalent cost, not a subscription invoice.

No skill, agent, fixture, rubric, sampling, regression, phase120 or root300 limit changes.

Prepare an original `run-case.ts` config selecting provider `minimax`, execution and judge
model `MiniMax-M3`, `https://api.minimax.io/v1`, behavioral evidence and phase120. Use a fresh
output directory. Run from the PR114 worktree:

```sh
python3 /home/jeremy/000-projects/intent-outreach/scripts/with-minimax.py -- \
  node --import tsx evals/jrig/run-minimax-budgeted-case.ts /absolute/fresh.config.json
```

The SOPS launcher decrypts in memory. The budget launcher removes the real key environment
variables before invoking the case runner. Only a random ephemeral bearer reaches root and
nested children; forwarding goes only to the fixed HTTPS MiniMax chat endpoint, with no
redirect or proxy retry. The budget helper accepts only text messages and bounded tool
requests, `max_tokens` 1–16384 and serialized UTF-8 request bodies up to 262144 bytes.

Admission reserves input UTF-8 byte count plus a fixed 4096 and 256 per message/tool framing
allowance, plus the entire requested output cap. Reservation and aggregate comparison are
synchronous before forwarding, so concurrent judge and agent calls cannot independently
spend the same balance. Success settles against validated returned token usage; unknown
failure or cancellation keeps the full reservation. Cached-token discounts are ignored.
Provider usage exceeding its declared input/output bounds freezes further admission and
records the violation; the proxy cannot undo a provider's billing-contract violation.

Disconnect and shutdown abort forwarding. The launcher passes an AbortSignal into the case runner: cancellation before invocation prevents spawning, and cancellation during execution terminates the owned child process group (SIGTERM, then SIGKILL after 3 seconds), including nested children. A budget refusal is a genuine evaluation transport
failure and remains incomplete evidence; it is not a passing or skipped case. The launcher
writes `<outputDir>.budget.json` with hashes, status, usage and charges, the original config
hash and helper source hashes. No prompt, output text, token or credential strings enter that
sidecar. Native case receipts remain private original evidence and retain their existing
source bindings. The budget sidecar must be reviewed together with the original case receipt.

Scripted tests inject a fake upstream and exercise the real loopback listener. They make no
paid calls: `pnpm exec vitest run tests/jrig-minimax-budget.test.ts`.
