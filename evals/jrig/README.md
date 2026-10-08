# J-Rig evaluation of Intent Outreach

The behavioral task is `io-k3l`; the evaluation spec remains a draft on PR #114 (superseding PR #41).
The current skill delegates to three phase agents and pauses for human decisions.
A completion that describes those steps, or a run that exercises only preflight,
cannot establish a Tier 3B pass.

## Offline connection proof

J-Rig PR #344 (`b1a2a28a1666bf6aeac454148857c6b3cbb0b3b0` on its main branch)
adds explicit stdio MCP execution. Build that revision or a reviewed descendant,
then run from this repository:

```sh
pnpm exec tsx evals/jrig/offline-wiring.ts /absolute/path/to/j-rig/packages/cli/dist/index.js /tmp/outreach-jrig-wiring.json
pnpm exec tsc -p evals/jrig/tsconfig.json
```

The output path must not already exist. The command uses the unchanged shipped
`bundle/server.mjs`, J-Rig's actual CLI and MCP loop, a scripted loopback model
endpoint and a test-only fetch preload. Only the two reviewed synthetic domains
have Hunter research/enrichment responses. Every other fetch is refused; no
vendor request is forwarded. The
child environment supplies only synthetic keys, disposable HOME/store/secrets
paths, and disables public-records connectors. It never reads production keys.

The proof requires five successful MCP calls in order, real research/enrichment
normalization, encrypted `save_run` persistence, the exact pending draft and its
digest, a matching J-Rig tool receipt, and a stopped server child. It checks that
the sender-identity flag remains set. No approval or sending tool is exposed.
Temporary stores are removed after verification; the report retains source
hashes, safe event counts and explicit `behavioral_verdict: null` and
`tier3b_passed: false` fields. This is a transport and persistence proof, not an
LLM evaluation. The scripted client supplies synthetic draft approval for this
component test; it does not prove the model honors a human checkpoint.

The fixture preload is confined to this command and its tests. Do not preload it
for real campaigns. The explicit J-Rig config is generated in temporary storage;
it is not installed as an ambient `.mcp.json` configuration.

## Phase-agent host component

`agent-host.ts` loads the unchanged three agent bodies, verifies their declared
permissions against the reviewed mapping, and snapshots the canonical prompt and
two skill references. Each dispatch receives a fresh context containing only its
role instructions and explicit input. Its injected model adapter must supply an
explicit provider/model identity, actual usage, and honor cancellation. No model
or credential is selected by this component.

Nested calls use the actual bundled tool schemas and results. The host validates
all calls in a turn before execution, confines each role to its declared tools,
limits invocations, turns, calls and transcript bytes, and retains correlated
partial evidence on failure. Shared call capacity is reserved before concurrent
invocations. Read is restricted to the reviewed resource snapshot. Events include
agent-definition hashes, model usage, dispatch inputs, tool arguments/results and
final output; retain these only in private fixture evidence storage.

`tests/jrig-agent-host.test.ts` exercises isolated contexts, role/schema refusal,
resource boundaries, cancellation, failure receipts and budgets. Its integration
case runs research and enrichment through the unchanged shipped bundle with the
synthetic transport, verifies actual returned company/email data, checks that no
store was created, and verifies child cleanup. These tests use scripted model
turns and establish host mechanics only. The scenario MCP entrypoint, model transport, authored human checkpoints and
independent case/store assertions are described below. A reviewed Report Profile
must be added explicitly if a later case requires one; the current host refuses
`save_run.profile` and does not read arbitrary profile paths.

## Scenario MCP host and independent assertions

`scenario-host.ts` is an explicit stdio MCP entrypoint. Launch it with Node's
`--import tsx` and an absolute JSON config path. The config contains `caseId`, an
absolute private `evidenceDir`, explicit `provider`, `model` and `baseUrl`, and
`checkpoints` copied from the matching entry in `scenarios.ts`. Supply the model
key only through `JRIG_AGENT_API_KEY`. Use the same execution provider/model as
J-Rig so the agents inherit that model. The host never chooses a provider or key
implicitly and does not approve a provider/model for production.

The host starts the unchanged bundle in a fresh directory on every launch,
including a naked-baseline launch. Only synthetic Hunter credentials reach that
child; the fetch preload rejects unlisted vendor requests. The model adapter
uses the explicit HTTPS endpoint (or loopback for component tests), preserves
correlated tool turns and actual token usage, refuses truncated/malformed
responses, and honors cancellation. It performs no retries or provider fallback.
Nested usage is recorded separately from J-Rig's root-model cost accounting.
The `save_run` description supplies the actual execution provider/model for both
skill and baseline attribution. Enrichment email answers live in the judge-only
fixture reference, so execution must retrieve them through the connector rather
than receiving them in its request prompt.

The root receives the skill's own declared tools plus `Agent`, `AskUserQuestion`
and scoped `Read`; research and enrichment tools belong only to their phase
agents. Authored answers are finite, separate checkpoint replies. Include all
reviewed draft text in the question. An unknown or mismatched checkpoint is an
error, never an implicit approval. Every reply remains a synthetic evaluation
decision. The host records model and tool events privately in `host-events.jsonl`
and verifies bundled-child shutdown. It retains the private fixture store for
independent inspection; the case runner owns eventual fixture disposal. The start
event also records J-Rig's `JRIG_EXECUTION_SESSION_ID`. Direct component launches
may omit it, but a correlated evaluation requires a UUID from the J-Rig runtime.

`audit-scenario.ts` independently checks real dispatch/tool receipts, preflight,
research domains, retained-lead enrichment, canonical prompt reads, separate
checkpoints, exact approved draft text, and actual encrypted records. It also
checks that no send approval or suppression was written. Premature persistence is
allowed to reach the real bundled validator/store so the auditor can detect it;
the host does not hide a bad model decision by enforcing the workflow itself.
Missing or errored evidence cannot pass. The auditor reports structural evidence
only, always `behavioralVerdict: null` and `tier3bPassed: false`.

The stdio integration test uses a scripted loopback model to exercise all three
phase agents, actual connector normalization, reviewed drafting resources,
checkpoint replies and encrypted save. A second launch verifies store isolation;
a separate negative case proves that the independent auditor rejects actual
unapproved persistence. These are component checks. Still required are the
actual non-Anthropic model runs and all behavioral layers.

## Receipt-to-host association

`bind-evidence.ts` checks a fresh single-case J-Rig database against private
skill/baseline receipts and the exact MCP config digest. It joins each
`tool-session.json` identity to exactly one host trace, verifies case/model,
ordered root calls and completed-result sizes, then runs the independent store
audit. Missing, duplicate, altered, mismatched or unassociated evidence is refused.
A correlated failed execution remains failed. Nested token usage is retained
separately; J-Rig's root cost meter does not include it. These checks establish
correlation and structural evidence, not authentication or a model-quality verdict.

Use a built J-Rig revision containing the session-identity change tracked by
`bd_000-projects-h08j.11` / J-Rig issue #345:

```sh
pnpm exec tsx evals/jrig/binding-proof.ts /absolute/path/to/j-rig/packages/cli/dist/index.js /tmp/outreach-binding-proof.json
```

This component proof runs actual skill and naked-baseline MCP sessions through
J-Rig, the scenario host, and nested research in the unchanged bundle. Scripted
loopback model responses select tools; no real model is graded. It verifies
separate session IDs, authored checkpoints, no saved records, reported nested
usage, exact receipt association and child cleanup before removing its fixtures.
The output retains source hashes and explicitly marks behavioral acceptance false.
The tiny deterministic spec in this proof is only a component test; a behavioral
runner must retain the draft spec's reviewed criteria and case policies.

## Single-case runner

`run-case.ts` selects one case from the repository's actual YAML spec using the
YAML parser in the explicitly selected J-Rig installation. It retains every
criterion, case field, policy and draft/review tag, replacing only the case list
and execution model. It refuses missing scenario coverage or weakened sampling.

Supply a JSON config containing normalized absolute `jrigCli` and fresh
`outputDir` paths, the built CLI's `jrigSha256`, reviewed `caseId`, explicit
`provider`, `model`, `judgeModel`, `baseUrl`, and `evidenceKind` (`component-test`
or `behavioral-evaluation`). The execution and judge models use the same selected
OpenAI-compatible provider/endpoint and credential. Nested agents inherit the
execution model. The only key input is the environment variable
`JRIG_EVAL_API_KEY`; the config rejects an embedded key. The command makes model
requests, so use the authorized provider/account for the evaluation.

```sh
pnpm exec tsx evals/jrig/run-case.ts /absolute/case-config.json
```

Each invocation uses three judge samples, trigger evaluation, and a fresh naked
baseline with identical host capabilities. `priorReceipt` may point to a prior
passing case receipt with the same source spec, case and evidence kind; its
recorded votes become the actual regression baseline and its bytes are hashed.
Without it, regression remains unrun. A component receipt cannot seed a real
behavioral run. No fallback model, provider, credential or implicit rerun is used.

The private output directory retains config/spec snapshots, CLI output and errors,
the J-Rig database/bundle, both host traces and stores, and `receipt.json`. Source
hashes must remain stable during execution. Each expected judgment must be present
with its actual sample votes, and the bundle must reference the matched private
receipts. Partial failure evidence remains available, while infrastructure errors,
missing associations and cancellation stay `incomplete` (exit 2). A failed case
exits 1; a passed case exits 0. Interrupting the runner or reaching its 30-minute
deadline stops its owned process group, including nested children.

`caseResult` reports the selected case's skill-side structural assertions and
applicable judgments. J-Rig's separate promotion, regression, baseline and package
results remain in `jrigResult`; a case can pass those assertions while J-Rig still
reports advisory promotion evidence. The runner always leaves `tier3bPassed`
false: repeated runs, the other cases/models, seven-layer evidence and review are
still required. Nested-agent usage in each binding is additional to J-Rig's meter.

`case-runner-proof.ts` exercises the actual runner and J-Rig CLI against scripted
loopback responses. It checks distinct execution/judge identities, 36 recorded
judge calls across the initial and regression runs, fresh skill/baseline sessions,
retained failed receipts and a real cancellation that leaves no owned process
group. Its checked-in receipt is component evidence only.

`failed-attempt-summary-2026-10-07.json` exports selected metadata from four
unsuccessful observed model attempts, including original receipt, configuration,
CLI and source digests, failure classes and independent audits. Source digests
describe each historical attempt. The separate corrected auditor diagnostic for
Nemotron r3 remains distinct from its original incomplete case receipt. The
summary contains no prompts, model outputs, raw tool data or local paths, and
claims no suite acceptance or production approval.

## Behavioral acceptance contract

`skills/intent-outreach/eval-spec.yaml` follows the current skill and preserves
research-only, unrelated, thin-data and adversarial coverage. It adds separate
scope, rejection and multi-domain cases. The `configured-non-anthropic-model`
value is a deliberate placeholder, not a callable model. Select approved,
explicit execution and judge identities when constructing a real run. Keep
`needs-review` until the scenario host and acceptance evidence have been reviewed;
`--require-reviewed` must refuse this draft in a promotion pipeline.

The MCP loop now supports the bundled server. Faithful evaluation also needs
host capabilities that J-Rig's MCP-only runtime does not currently provide:

| Capability | Required evidence |
| --- | --- |
| `Agent` | Actual invocations of the three unchanged agent definitions, each with its own allowed tools and input context; observed research → retained-lead enrichment → drafting order. |
| `AskUserQuestion` | Case-authored checkpoint responses, separately recording scope, retained leads and exact-draft decisions. No simulated response is a real-world approval. |
| `Read` | Reads restricted to the reviewed profile and prompt/skill resources; no secrets or arbitrary filesystem access. |
| Bundled MCP | Actual tool events and independently inspected encrypted stores; no persistence before approval, none after rejection, no approved send decision without the exact digest. |
| Fixture isolation | Fresh external store and vendor state for every skill and naked-baseline case, not merely a fresh server process. |

Judge prompts see final text and cannot prove delegation, tool order or storage
side effects. Those require independent host/store assertions. Missing evidence
is incomplete evaluation, not a pass. The two adversarial cases explicitly
expect `tool-events.json` so J-Rig's current functional-case filter includes them;
that artifact's existence alone proves neither tool use nor refusal correctness.

A full result must distinguish package checks, trigger routing, functional
behavior, regression, naked-model baseline, model variance and rollout policy.
Run the enabled regression and baseline paths and preserve actual model/provider
identities, per-case receipts and repeated-run results. Do not treat seven labels
in a report, or an all-N/A judge result, as seven layers of evidence. In particular,
research/tool failures must retain error/no-verdict status, and the full campaign
case must produce a real validated saved draft rather than a described plan.

The spec must not merge until that behavioral acceptance passes. The offline
connection proof does not relax this condition or approve any model for production.


The case runner requires J-Rig trigger evidence from merged PR #348 or later.
It verifies the private trigger receipt against its SQLite digest and execution run,
recomputes the selected case's outcome and metrics, and compares both JSON and bundle
summaries. Missing, skipped, incomplete or changed routing evidence cannot produce a
passing case. An observed incorrect route produces a failed case. Earlier receipts
remain historical evidence of their original CLI and do not gain this verification.

The single-case runner now explicitly opts in to J-Rig `judgeObservations` (merged
PR350). Only synthetic fixture tool data is forwarded to the selected judge as
untrusted observations. The evidence join verifies the private context schema,
exact session, tool order/status, serialized bound and SHA/size references in the
private execution receipt and portable bundle. A missing, changed or cross-session
context cannot produce a passing case. Failed executions keep partial observations
without claiming they were judged. Host/store assertions still verify actual effects.
Historical receipts retain their original CLI, source hashes and counts-only context;
they do not retroactively gain this observation verification.
