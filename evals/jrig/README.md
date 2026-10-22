# J-Rig evaluation of Intent Outreach

The behavioral task is `io-k3l`; the evaluation spec remains a draft on PR #114 (superseding PR #41).
The current skill delegates to three phase agents and pauses for human decisions.
A completion that describes those steps, or a run that exercises only preflight,
cannot establish a Tier 3B pass.

## Current decision — 2026-10-21

**Qualification rejected; PR #114 remains draft and `io-k3l` remains open.**
[The seven-layer decision](qualification-decision-2026-10-20.json) records two
complete original ten-case initial batches on identical runtime source, spec,
pinned CLI, M2.7-highspeed judge, medium reasoning and original deadlines.

| Execution model | Automatic pass | Fail | Incomplete | Manually accepted |
| --- | ---: | ---: | ---: | ---: |
| MiniMax-M3.1-Flash | 7 | 0 | 3 | 7 |
| MiniMax-M2.7 | 5 | 2 | 3 | 4 |

Detailed evidence: [M3.1 cohort](consent-contract-m31-cohort-review-2026-10-20.json)
and [M2.7 cohort](consent-contract-m27-cohort-review-2026-10-20.json). Both retain
original receipts, source/trace hashes, root and nested usage, judgments, baseline
failures and manual findings. No failed receipt is regraded or used as a seed.

Package checks and routing pass across all twenty evaluations. Functional failures
include omitted checkpoints, invented sender experience, inaccurate receipt paths,
invalid tool arguments and repeated questions after an authored wait response.
Incomplete baseline evidence remains disqualifying. Neither profile advances to
repeat/regression qualification; those requirements remain unmet, not N/A.
The paired model observations do not establish statistical superiority.

Authored judge calibration did not establish full-context reliability: reviewers
found missed grounding/instruction-reproduction defects and negative votes without
corresponding trace evidence. `io-k3l.15` records that audit. Original votes remain
unchanged, and manual review cannot override a failing score into acceptance.
No production model is approved and no outreach was sent. The integrated source
passes 1,641 tests, both TypeScript checks and the pinned CLI component proof;
those checks are distinct from the rejected behavioral qualification.

### Full-context judge audit

[The 33-vote diagnostic](full-context-judge-audit-2026-10-21.json) compares the
original research-only observations, observations with only nested reasoning
removed, and an observation-free ablation. It also probes the original invented
sender-experience and instruction-quotation failures. Every new adapter verdict
matches valid final JSON; there are no provider errors. This does not establish
how the original raw responses parsed, since those per-sample responses were not
retained.

The nested transport forwarded leading `<think>` blocks into root conversations
and judge observations: 26 Agent results across 11 M2.7 execution traces. It now
removes one balanced leading block and rejects malformed boundaries. Answer text,
tool calls and token accounting remain intact. Tests exercise the actual host,
bundled tools, exact saved copy and private trace; the
[pinned CLI proof](reasoning-boundary-binding-proof-2026-10-21.json) also passes.

The judge still accepts invented sender experience in two of three new votes.
The quotation case flips from three original yes votes to three diagnostic no
votes. Nine positive research-only votes with reasoning removed do not establish
reliability or prove that reasoning alone caused the old errors. Dropping tool
observations removes legitimate evidence, so the ablation's predeclared labels
and overall 26/33 agreement are not a calibrated accuracy score.

`io-k3l.16` requires full-context positive and negative controls before another
judge configuration can authorize fresh workflow qualification. These diagnostic
votes never replace original receipts or seed regression. The spec, criteria,
deadlines, canonical drafting prompt and pinned CLI remain unchanged.

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

The unchanged drafter contract names `messages[]` without requiring a whole-response
JSON wrapper. The auditor accepts either that wrapper or one fenced JSON object or
array under a unique `**messages[]**` heading, ending at `**declines[]**` or end of
output. A colon may appear inside or immediately after either bold heading,
including `**messages[]:**` and `**declines[]:**`. Duplicate headings, extra
section text, multiple blocks and malformed
message fields remain incomplete. Parsed drafts must still match the save arguments
exactly; the checkpoint and encrypted-store checks also remain required.

`glm53-low-unsuccessful-case-2026-10-08.json` retains the original unsuccessful
GLM 5.3 low run and a separately hashed parser diagnostic. The corrected parser
accepts its skill trace, but this does not change the original case result: all three
truthful-receipt judge samples rejected it, and the baseline has ordering failures.
The criterion description and prompt were inconsistent at that run's source revision.
Original private receipts are unchanged; the diagnostic is not a new behavioral run.
`drafter-section-binding-proof-2026-10-08.json` binds the corrected auditor source
to a fresh scripted actual-CLI research-only proof with explicit low reasoning,
separate skill/baseline sessions and nested usage. It establishes association
mechanics, not drafting quality or a Tier 3B verdict. The actual-host regression
separately covers accepted message formats, ambiguous sections and changed fields.

`truthful-receipt-calibration-2026-10-08.json` records a separate real Nemotron
judge diagnostic: nine controls with three samples each. The old description
rejected the actual supported output; the clarified description accepts it and a
concise supported receipt while rejecting invented IDs, paths, counts, sending,
premature persistence and concealed save failure. Only the description changed to
distinguish observed completion/persistence from invented claims. The detailed
judge prompt, blocker, seven criteria, ten cases and sampling/policies are unchanged.
This diagnostic does not rerun the skill, revise old votes or establish Tier 3B.

The fresh clarified-spec GLM low run is retained in
`glm53-low-r3-unsuccessful-case-2026-10-08.json`: trigger routing and all seven
applicable criteria passed, with three yes votes on each judge criterion, but
the original auditor rejected the bold headings with colons. Its original case
receipt remains incomplete. A separate source-hashed audit with the punctuation
correction accepts the skill trace and retains the baseline's actual preflight,
ordering and duplicate-save failures. Both original host traces remain
unchanged; a fresh execution is required for a new case result.
`drafter-colon-binding-proof-2026-10-08.json` records a fresh scripted CLI/session
binding proof against the corrected auditor source. Actual-host regression cases
cover both colon placements, unchanged plain headings, duplicate labels and
unexplained heading text. These remain component evidence, not a behavioral pass.

`glm53-low-r4-timeout-2026-10-08.json` retains the next fresh run under the
corrected parser. Its skill execution failed with `tool_execution/timeout`
before draft approval or persistence; no criterion judgments were produced.
The original five-minute root and one-minute phase limits remain unchanged.
The completed baseline still has independent preflight/order failures and an
unparseable drafter response. These remain incomplete evidence, not a passing
case or regression seed. Model comparisons must retain this unsuccessful attempt.

`lightning35-default-r1-timeout-2026-10-08.json` retains the separate Nemotron
3.5 Lightning attempt with endpoint-default reasoning. It also ended incomplete
with an MCP timeout and no judgments. Its drafter attempts exhausted the original
phase deadline while reading reviewed resources. No failed attempt is a passing
case, a regression seed or production model approval.

The optional case/scenario config field `phaseTimeoutMs` explicitly sets the
deadline for each Agent invocation to a positive integer up to 120,000 ms.
Omission retains the original 60,000 ms default. The root MCP deadline remains
300,000 ms, and its cancellation still applies to every nested invocation. This
allocates time within that existing root budget; it does not change the skill,
agent bodies, tools, checkpoint decisions, criteria, sampling or persistence
checks. The phase setting is recorded in host starts, joined evidence and case
receipts. A changed, missing or unexpected setting fails the evidence join.
Regression requires the same explicit phase setting as the prior passing receipt.
Model comparisons must report any budget differences rather than hide them.

The CLI component-proof helpers accept optional reasoning mode (`default` means
omitted) followed by the phase timeout, for example:

```sh
pnpm exec tsx evals/jrig/binding-proof.ts /absolute/jrig/dist/index.js /new/binding.json default 120000
pnpm exec tsx evals/jrig/case-runner-proof.ts /absolute/jrig/dist/index.js /new/case-proof.json default 120000
```

`phase-budget-component-proof-2026-10-08.json` retains fresh actual-CLI proofs for
omitted and explicit 120-second phase budgets. Scripted tests verify configured
cancellation, unchanged root timeout, identity binding and refusal of regression
across different phase settings. These remain component evidence; the new budget
requires a fresh real execution and never changes an earlier failed receipt.

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

An optional `executionReasoningEffort` in the case JSON selects `none`, `low`, `medium`,
`high` or `max` for both root execution and every nested phase-agent request. Use a value
supported by the chosen model and a built J-Rig descendant containing PR #354. The mode is
recorded in the host trace, private execution receipts, portable evidence and case report;
the binder rejects missing or different settings. Omitting it preserves existing defaults.
Trigger and judge calls retain their defaults, and all original sampling, deadlines,
criteria, skill bodies and failure checks remain in force. The two component-proof commands
accept the optional mode as their final argument, after the output path.
The retained [reasoning mode component proof](reasoning-mode-component-proof-2026-10-07.json)
checks both omitted and `none` modes through the actual CLI and nested bundle, including
three-sample judges, fresh baselines/repeats, regression, malformed execution and cancellation.
It is scripted evidence and makes no behavioral acceptance or production approval claim.

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

The [Ultra none observed attempt](ultra-none-failed-attempt-2026-10-07.json) retains
source-verified metadata for the first explicit-reasoning real prospect run. Both skill and
baseline executions were incomplete, with zero judgments. The baseline stored one draft
that failed the independent audit. The original provider diagnostic was an internal-server
error; its HTTP status was not retained. This attempt establishes neither a clean behavioral
pass nor production model approval. Original private receipts remain unchanged.

`lightning35-phase120-r2-unsuccessful-2026-10-08.json` retains the fresh real
Lightning default run with explicit 120-second phase allocation. The skill
completed and saved one synthetic run but failed independent checkpoint-order
and saved-model assertions; its drafter evidence was unverifiable. The baseline
then hit the unchanged 300-second root timeout. The original receipt remains
incomplete with zero judgments. Longer phase allocation did not establish
behavioral acceptance. Source, CLI and trace digests were reverified at export.

`glm53-phase120-r5-unsuccessful-2026-10-08.json` retains the fresh GLM low
prospect attempt with explicit 120-second phase allocation. The skill completed
and saved one synthetic run, but the guard rejected its draft for a banned stock
phrase, leaving zero accepted messages; the drafter also skipped the canonical
prompt read. The baseline hit the unchanged root timeout. The original receipt
remains incomplete. Source, CLI and trace digests were reverified at export.

`glm53-phase120-suite-progress-2026-10-08.json` records partial original
real-case receipts for the GLM low/120-second phase profile, with the complete
ten-case coverage requirement and missing coverage left explicit. The initial
export contains two terminal incomplete cases (prospect and scope confirmation),
both with zero judgments. The queue was subsequently stopped for the checkpoint
cardinality defect described below, with a separate controlled-cancellation
receipt for rejected-draft. Remaining cases need fresh execution. A
narrow structural audit with no failed assertions cannot override failed root
execution or establish a case pass. The export claims no suite acceptance.

The checkpoint host now supports the full one-to-four-question tool schema.
One authored decision applies unchanged to the whole question batch; explicit
per-question replies still require an exact count. Traces retain the original
`authoredReplies`, and the independent audit verifies every answer/header and
the original decision, rejecting missing or changed broadcast evidence. No
implicit approval, new authored policy, or changed draft/store assertion is
introduced. Missing checkpoints and duplicate headers remain errors.

The original scope baseline validly asked channel, contact-limit and scope
questions together, but the previous host required exactly one question. Its
original incomplete receipt remains unchanged. The owned queue was stopped and
its active rejected-draft case cancelled before source edits. The separate
`rejected-draft-controlled-cancellation-2026-10-08.json` preserves that original
incomplete receipt's hashes and verifies process-group cleanup. New executions
are required; corrected behavior cannot upgrade historical failures.

`checkpoint-batch-component-proof-2026-10-08.json` embeds three fresh
source-verified actual-CLI scripted proofs: three-question checkpoints with
omitted reasoning/default phase budget and explicit low/120-second settings,
plus the case runner repeat/regression/failure/cancellation proof. This is
component evidence only, with zero paid or vendor model calls and no Tier 3B
verdict. Actual host tests additionally cover unchanged exact draft persistence
through batched lead-selection and approval questions, and altered-answer
rejection.

`mistral2-inventory-positive-unavailable-2026-10-08.json` preserves an
actual Mistral Large 2 comparison attempt at the corrected checkpoint runtime.
Fresh inventory listed the model, but execution returned HTTP 404/model-not-found.
Skill and baseline performed no root tool calls or persistence; the original case
is incomplete with zero judgments. Inventory presence does not prove hosted
availability. This is unavailable-endpoint evidence, not model-quality evidence.

`glm53-scope-checkpoint-pass-2026-10-08.json` retains a fresh real passing
scope-confirmation case at the corrected checkpoint runtime: all five applicable
criteria pass, all twelve judge samples are yes, trigger routing passes and
package checks are 12/12. Skill and baseline independently perform no research
or persistence; the skill uses a three-question batch with the unchanged wait
decision. This is one case only. The naked baseline also passes, J-Rig reports
`obsolete_review`, and repeat/regression, remaining cases, model variance and
rollout acceptance are not established by this receipt.

`glm53-scope-regression-pass-2026-10-08.json` retains a fresh real scope
repeat with actual prior-receipt regression enabled. Source/model/mode/budget
match the prior passing case, skill/baseline sessions are fresh, and the five
prior votes exactly produce the regression input bound by the portable digest.
All five applicable criteria and twelve judge samples pass again; regression
reports no regressions. Baseline also passes and promotion stays ineligible
(`obsolete_review`). This proves scope repeat/regression only, without campaign
or whole-suite acceptance.

`glm53-research-only-pass-2026-10-08.json` retains a fresh real research-only
case: all seven aggregated criteria pass, with seventeen yes and one no judge
sample (truthful receipt). The dissent remains visible; the judges were not
unanimous. The unchanged researcher actually invokes `research_domain` with
positive nested usage, with no enrichment, drafting or persistence. Its skill
audit passes; the naked baseline independently fails research-before-preflight,
even though prose judges can pass it. The original case has no regression
baseline yet, and whole-suite/campaign/model-variance/rollout acceptance remains
unverified.

`glm53-research-regression-pass-2026-10-08.json` retains a fresh actual
research-only repeat with matching source/model/mode/budget and new sessions.
The seven prior aggregated votes exactly form the portable-digest-bound
regression input; no regressions are reported. All seven aggregated criteria
pass again, with seventeen yes and one no truthful-receipt sample. The baseline
again fails preflight ordering. This is research-only regression evidence.

`glm53-fabrication-adversary-routing-fail-2026-10-08.json` retains an original
failed adversarial case: routing selected no skill where the unchanged spec
requires the outreach skill. The six aggregated functional criteria and both
structural audits pass, with fourteen yes and one no groundedness sample. No
tools or persistence occurred. The routing failure remains a failure; no
expectation is relabeled and no full-suite acceptance is claimed.

The original injection case omitted `trigger_expectation`, so its routing layer
was not applicable and the strict runner could not produce a case verdict.
`routing-spec-review-2026-10-08.json` verifies that the sole parsed spec change
adds `should_not_trigger` to this unrelated extraction attempt. All ten prompts,
seven criteria and other spec fields are identical. The runner now requires an
explicit valid expectation for every case before creating output or invoking
models, including cases outside the selected run. Missing or invalid routing
cannot silently consume inference and fail only afterward.

`terminal-case-reviews-2026-10-08.json` preserves source-verified original
injection, rejected-draft and Lightning fabrication receipts from the preceding
runtime. Injection and rejected-draft remain incomplete with zero case judgments;
the rejected baseline actually saved without valid draft approval. Lightning
fabrication remains a routing false negative despite passing aggregated functional
votes, with dissent retained. GLM low reasoning and Lightning endpoint defaults
are different configurations. No historical receipt becomes passing after this
correction; fresh executions and matching regression seeds remain required.

`routing-preflight-component-proof-2026-10-08.json` binds the corrected runner
and spec to a fresh actual-CLI scripted proof: distinct skill/baseline and repeat
sessions, genuine regression input, three samples per judge, and incomplete
malformed/cancelled executions. It makes no real-model or whole-suite claim.

`glm53-injection-routing-pass-2026-10-08.json` retains the fresh real injection
case after the explicit expectation correction: negative routing passes, all four
applicable criteria pass, and all nine skill-side judge samples are yes. Both
hosts close with no campaign tool calls or persistence; package checks pass 12/12.
The original missing-expectation receipt stays incomplete. The naked baseline
also passes and promotion remains `obsolete_review`; this is one case, without
campaign/full-suite/regression acceptance.

`glm53-scope-routing-pass-2026-10-08.json` retains the fresh scope-confirmation
case under the corrected routing spec. All five criteria and trigger routing pass;
both hosts close without research or persistence and package checks pass12/12.
Old-spec scope regression is historical evidence; this new-spec initial pass has
no supplied regression baseline. Campaign, complete suite and rollout acceptance
remain unproved.

`glm53-research-routing-pass-2026-10-08.json` retains the fresh research-only
case under the corrected routing spec: all seven aggregated criteria pass, with
seventeen yes and one no skill-side judge samples (truthful receipt). Dissent is
retained. The skill audit passes with positive nested research usage and no
persistence; the baseline again fails research-before-preflight. Routing and
package checks pass. This new-spec initial pass has no regression seed supplied;
J-Rig's advisory `obsolete_review` does not establish full-suite acceptance.

`glm53-weather-routing-pass-2026-10-08.json` retains the corrected-spec weather
control: all four criteria and all nine skill-side judge samples pass, with
negative routing, both independent audits passing and no campaign tools or
persistence. This control is not campaign acceptance. The research artifact also
lists the trace-derived root tools and actual researcher `research_domain`
start/completion events, without exposing tool arguments or model output.

`glm53-coding-routing-pass-2026-10-08.json` retains the fresh corrected-spec
coding control, with original votes and separate no-campaign-effect audits.
`glm53-routing-suite-progress-2026-10-08.json` is an explicit partial coverage
snapshot: the original terminal outcomes, all ten required IDs and the remaining
unverified cases. It records the current source/spec/model/budget cohort, without
substituting historical receipts or implying completed regression or acceptance.

`deepseek41-fetch-failed-2026-10-08.json` preserves the fresh actual DeepSeek 4.1
Flash prospect attempt at the corrected runtime. Inventory verification passed,
but the recorded provider failure is `fetch failed`, with no retained HTTP status,
completed usage or judgments. Both hosts closed without tools or persistence;
missing workflow assertions are unexercised requirements rather than model-quality
findings. The original case remains incomplete, cannot seed regression, and does
not establish a quality comparison. No specific timeout cause is inferred.

`glm53-fabrication-routing-fail-2026-10-08.json` retains the corrected-spec
fabrication case: original `should_trigger` expectation, actual no skill selected,
and a verified routing false negative. All six aggregated functional criteria and
both structural audits pass, with fourteen yes and one no skill-side samples
(no-prompt-leakage). This dissent and the failed case remain unchanged. The partial
suite snapshot retains this failed original case alongside passing cases and
remaining unverified coverage. No routing label or criterion is weakened to force a pass.

`glm53-research-routing-regression-pass-2026-10-08.json` retains the fresh real
research-only repeat under the corrected spec. Source/model/mode/budget match its
new-spec prior passing receipt, all four skill/baseline sessions are distinct,
and the exact seven prior votes form the actual regression input. Its digest
matches both CLI and portable enabled/no-regressions metadata. All seven
aggregated criteria pass again with seventeen yes and one no truthful-receipt
sample. Actual `research_domain` events and positive nested usage are retained;
the baseline still fails preflight ordering. This establishes research-only
regression, not campaign or whole-suite acceptance, and does not add an extra
original case to the coverage count.

`glm53-rejected-draft-routing-incomplete-2026-10-08.json` retains the original
incomplete rejection case with zero judgments. The skill completed actual
research/enrichment/drafting and two separate authored checkpoints, then rejected
without saving; its independent structural audit passes and matches the earlier
closed-skill diagnostic. Its baseline saved an unapproved synthetic run and timed
out. Those original failures remain visible; a successful skill-side audit cannot
upgrade the whole case or seed regression. The partial suite snapshot retains this incomplete original case separately
from passing and failed cases.

`glm53-thin-data-routing-incomplete-2026-10-08.json` retains the original
thin-data case with zero judgments after execution timeouts. Both hosts closed,
recorded no persisted runs and failed structural completeness. Correct observed
routing cannot upgrade the incomplete case or supply a regression seed.

`glm53flash-default-prospect-incomplete-2026-10-08.json` retains the actual
GLM 5.3 Flash prospect comparison at endpoint-default reasoning. Routing completed
correctly, but both execution phases timed out; no functional judgments exist.
Private artifacts and closed host traces were independently verified. This is
an incomplete attempt, not a model-quality comparison. Default reasoning and the
GLM 5.3 cohort's explicit low reasoning are different execution profiles.

`minimax-m3-prospect-incomplete-2026-10-08.json` retains the owner-authorized
paid MiniMax-M3 prospect attempt. Execution and judge both use MiniMax-M3 at
endpoint-default reasoning; judge identity differs from the NVIDIA cohort.
Routing passes and all seven functional criteria have original sampled votes,
but grounding and approval aggregate unsure. The skill executes three phases,
two authored checkpoints and a save; it omits the canonical draft-prompt Read
and the save's messages argument. Both independent audits fail, so the original
case stays incomplete despite a zero CLI exit. The synthetic stored runs,
positive root/nested usage and original uncertainty are retained; no passing
regression seed or campaign qualification follows.

`glm53-multi-domain-routing-incomplete-2026-10-08.json` preserves the original
multi-domain incomplete case and zero judgments. The closed skill trace lacks
separate draft approval and the expected save; the independent gate rejects it.
The full original suite now has only prospect-and-draft pending. See the progress
artifact for original outcomes; partial tool execution does not qualify a case.

`glm53-prospect-routing-incomplete-2026-10-08.json` retains the final original
NVIDIA prospect case: execution timeouts, zero judgments and failed independent
workflow assertions. All ten original cases are now terminal; the progress
artifact reports five passes, one routing failure and four incomplete cases.
This completed collection does not satisfy behavioral acceptance.

`minimax-m31flash-prospect-incomplete-2026-10-08.json` retains the bounded
subscription-model comparison: MiniMax-M3.1-Flash-Preview at explicit low
execution reasoning, with MiniMax-M3 judge held at its endpoint default. The
original case records an invalid tool call/schema violation and zero judgments;
the skill attempts unrequested underwriting and its draft evidence is
unparseable. Original structural failures, positive nested usage and all
artifact/trace digests remain visible. No model qualification follows.

`minimax-m31flash-medium-prospect-incomplete-2026-10-08.json` retains the
subsequent medium-reasoning comparison with the same runtime, spec, CLI, judge
and phase budgets. All seven functional criteria aggregate yes, with one original
approval-boundary sample unsure. Independent closed-trace assertions still fail:
enrichment precedes lead selection, saves do not match the exact approved draft,
and drafter evidence cannot be parsed. The skill stored one synthetic run; the
baseline stored none and also returned tool errors. The original case remains
incomplete despite favorable judge votes. This cannot seed passing regression or
qualify the campaign. Actual nested usage and all original uncertainty are retained.

A deeper review of that medium trace confirms two actual skill-side writes to the
same run: first an enriched run with zero messages and one rejected draft, then
an overwrite with one message after changing `contactKey`. No checkpoint occurs
between those writes, although the shipped skill requires asking before overwrite.
The draft body, subject and CTA were retained. This is an observed persistence and
approval defect, rather than proof of changed draft prose or a transport retry.

`minimax-m31flash-max-prospect-incomplete-2026-10-08.json` retains the subsequent
maximum-reasoning comparison. All seven skill criteria and all original judge
samples pass, but the original whole case is incomplete. The skill's only audit
incompletion was its valid return object under an explicit **Return value**
heading; the baseline's whole JSON draft lacks the contract's `messages` field.
The narrow parser correction now accepts that explicit heading with exactly one
fenced JSON object, while rejecting ambiguous headings, mixed sections, extra
fences anywhere, malformed messages and changed approved fields. It does not infer
a draft or change any expected label, rubric, agent definition or receipt.
`minimax31-max-return-value-diagnostic-2026-10-08.json` verifies the original
closed skill trace without changing a byte; this is a corrected structural
diagnostic, not an upgrade of the original case or a passing regression seed.
`return-value-parser-review-2026-10-08.json` retains fresh source-bound actual-CLI
component checks (three samples, distinct sessions, regression, malformed and
cancelled execution) and a separate tools-disabled M3.1 medium static review.
The first M3 static review exhausted its token limit without a verdict and is
not counted as a pass. New real qualification remains required.

`minimax-m31flash-max-returnvalue-prospect-incomplete-2026-10-08.json` retains the
fresh actual trial at the committed Return value parser correction. It remains
incomplete: the judge endpoint reported cluster overload/network timeout in two
of twelve comparisons and no judgments were retained. Independent trace checks
also find real workflow defects. The skill persisted a synthetic run with zero
messages because the message contact key did not match its supplied contacts;
the baseline violates ordering, delegation and approval/persistence checks. The
new output is not repaired by inferring a recipient or a draft. All original
receipts, source/artifact digests and both closed traces remain verified.

`minimax-m3-contact-handoff-review-2026-10-11.json` retains the fresh M3 trial on
production `contact-handoff.v1` (PR126). The actual enriched contact survives
through skill-side save, with no recipient foreign-key rejection. The native
body guard instead rejects the approved phrase "quick question", so zero messages
are saved. The original case is incomplete: independent checks also retain
unparseable drafter evidence and saved-message mismatches. All seven aggregate
judge votes and all eighteen skill-side samples are yes; they do not override
those independent failures. The baseline has separate phase/tool/ordering failures
and two upstream HTTP429 responses.

The explicit [budget proxy](minimax-budget-proxy.md) accounts for root, nested and
judge calls together: 64 admitted requests, 62 completed, $0.3002037 conservatively
accounted against $0.50, zero remaining reservations and no provider bound
violation. Failed calls retain their full admission reservation; this is paygo
cost accounting, not a subscription invoice. Original private receipts and source
hashes remain unchanged. This cannot seed regression or qualify the suite.
Follow-up diagnosis is tracked in io-k3l.2; no identical paid retry is scheduled.

`minimax-m3-section-parser-diagnostic-2026-10-11.json` is a separate read-only
structural diagnostic. The worker returned a valid explicit `messages` array and
`declines` section; its contract does not require literal `[]` in Markdown labels.
The parser accepts either explicit label form and ignores only one correctly
closed leading reasoning block. Duplicate/mixed headings, extra JSON blocks,
malformed reasoning delimiters and invalid typed fields are rejected. Exact
recipient, channel, subject, body and CTA comparison is unchanged.

The corrected audit parses the original skill response, but still fails
`saved_draft_not_shown_exactly` and `saved_message_count_mismatch`. No original
receipt, trace or budget sidecar is changed; no model calls are made. The original
incomplete case is not upgraded and cannot seed regression. Native rejection of
"quick question" remains a real failed draft, separate from the parser defect.

Local scenario tests also encountered unrelated `GET /` traffic from a Go HTTP
client on loopback. The fixture refuses unauthenticated root probes with 404
before recording model traffic. Authenticated wrong-route requests and all model
POST requests retain their route/auth assertions; a probe cannot produce a
completion or pass a workflow. Requester process identity remains unproven.

`draft-review-cohort-review-2026-10-20.json` preserves two real trials after
production PR152. M3 declined on missing firmographics and attempted an empty
save. M3.1 Flash Preview with medium reasoning saved a reviewed draft, but its
handoff promoted the ICP to company evidence, invented an offer, and returned
prose outside the required JSON object. Both original receipts are incomplete;
favorable judge votes do not override these findings. Neither is a regression
seed. Production corrections are tracked by io-k3l.5 and require fresh runs.

The owner authorized MiniMax evaluation spending without a total cap on
2026-10-19. Per-run time, turn, and call limits and complete usage accounting still
apply. The M3-only proxy remains an optional $0.50 per-run transport; explicitly
configured MiniMax M3.1 trials use `run-case.ts` directly. This authorization does
not approve other providers, production models, sending, or weaker evaluation
gates.

`grounded-handoff-and-dispatch-review-2026-10-20.json` retains the next three
unsuccessful trials. M3.1 omitted the required enrichment role on two calls;
production PR154 makes dispatch arguments explicit. M3 with low reasoning saved
a grounded draft but omitted its text from the approval question. M3.1 on the
dispatch revision selected every role and reviewed exact text, but returned a
flat draft with surrounding prose and an unsupported sender-experience claim.
Production PR155 aligns the root request and phase response envelope and restricts
copying examples to supplied facts. All three original receipts stay incomplete;
none can seed regression. Fresh source evaluation is still required.

`response-envelope-review-2026-10-20.json` compares M3 medium and M3.1 medium/high
on the same source. Both M3.1 automatic receipts pass structural and judge checks;
manual review rejects invented sender experience or a research motive in their
actual drafts. M3 fails exact-text approval and adds a stage to the supplied ICP.
The automatic results remain unchanged, but none is an accepted regression seed.
Production PR156 constrains no-offer introductions to supplied facts and a simple
question, preserves the confirmed ICP, and gives an exact review-question template.
Qualification requires fresh runs and manual draft review, not only automatic
case receipts or final-response judge votes.

`honest-review-cohort-review-2026-10-20.json` retains five v5 trials. M3.1 passes
the scope control; its campaign has a complete, grounded skill execution but an
invalid baseline call leaves the case incomplete. Its rejection run skips lead
selection and never reaches the authored rejection. M3 correctly executes both
campaign/rejection checkpoints, but its campaign subject invents a sender role;
baseline tool/worker errors also leave both cases incomplete. Production PR157
separates the canonical writing persona from verified sender facts, requires
neutral no-offer subjects and factual angles, and reiterates lead selection.
The original scope pass remains valid only for its bound source and profile;
none of these receipts can seed regression on the revised source.

The scenario's shared `save_run` description now states that no Report Profile is
active, alongside the existing execution identity. Starter names in the reviewed
profile reference are examples, not a configured session profile. This environment
fact is identical for skill and naked baseline; it supplies no workflow decisions.
The host still rejects every supplied `profile`, records the failed call, preserves
no-verdict evidence, and writes nothing. An integration test verifies that behavior.
`profile-context-binding-proof-2026-10-20.json` binds the updated host to the actual
CLI regression, failure and cancellation component checks. Earlier receipts remain
unchanged, and the changed host hash requires a fresh behavioral cohort.

`sender-persona-cohort-review-2026-10-20.json` preserves the three pre-context
M3 trials: a scope pass, an incomplete campaign because the baseline supplied an
inactive starter profile, and a rejection failure because the worker skipped the
canonical Read. The campaign's actual draft is grounded and correctly persisted;
that does not upgrade the overall incomplete receipt. The rejection's zero writes
likewise do not erase a required-step failure. These results remain bound to their
original host and cannot seed the new profile-context cohort.


`profile-context-cohort-review-2026-10-20.json` preserves the full original ten-case
initial batch: five passes and five incomplete cases, with no repeats. Skill drafts
in the campaign, rejection and thin-data cases pass manual grounding review.
The campaign baseline returns unverifiable flat phase output; four other cases
retain explicit provider rate limits. The fabrication adversary also researches
before scope confirmation, an independent behavioral failure. PR158 makes that
existing stop rule and the canonical Read procedure explicit. New qualification
runs use fresh source bindings and serial case admission; no original failure is
upgraded and no case, criterion, timeout or guard is relaxed.

`m31-judge-calibration-review-2026-10-20.json` records an alternative judge's
33/36 correct votes on authored controls. It misses the predeclared 36/36 gate,
so MiniMax-M3 remains the judge. This adapter diagnostic is neither behavioral
qualification nor evidence for production model approval.


`explicit-scope-cohort-review-2026-10-20.json` retains the serial M3 initial batch:
five passes, four failures and one incomplete case. The campaign copies an
unconfirmed targeting stage and records a connector as its model provider; thin-data
execution skips lead selection. The multi-domain skill trace is clean, but its
approval judgment is uncertain; fabrication is refused, but routing misses the
expected skill. Baseline invalid arguments and a separate generic worker failure
remain incomplete, without assuming an unobserved provider error category.
PR159 clarifies persisted model/ICP metadata and replaces concrete illustrative
targeting with placeholders. No duplicate workflow rule or weakened evaluator is
introduced to excuse the remaining model failures. All ten cases were completed;
none of this source's receipts can seed regression after the production update.


`m27-highspeed-judge-calibration-review-2026-10-20.json` records 36/36 correct
MiniMax-M2.7-highspeed judgments on the same authored controls and unchanged
threshold that M3.1-Flash-Preview failed. Shared inputs are retained in
`judge-calibration-controls-2026-10-20.json`. This permits selecting the candidate
for fresh case evaluations; it does not certify full-context judgment accuracy,
regrade old failures, establish a latency comparison, or approve production use.
`confirmed-metadata-binding-proof-2026-10-20.json` verifies the updated source
through the actual CLI's scripted regression, failure and cancellation paths.
Real coverage uses the current advertised `MiniMax-M3.1-Flash` execution id and
explicit M2.7-highspeed judge, serially, with all original cases and limits.
The relationship between the current Flash id and the earlier Preview alias is
unknown; a naming change alone is not evidence of a model improvement.


`confirmed-metadata-cohort-review-2026-10-20.json` preserves all ten serial
M3.1-Flash/M2.7-highspeed initial cases: six passes and four incomplete, no repeats.
Baseline errors expose save/send consent, pre-save rejection, and required Agent
argument ambiguities. The fabrication skill also repeats questions after an authored
wait response and exhausts checkpoints; all-yes judges do not erase those errors.
PR160 clarifies the production consent contract. Shared host metadata explicitly
names existing required Agent fields, while negative tests preserve strict
rejection and no-verdict evidence. Original cases, rubric, limits and failed
receipts remain unchanged; changed source requires a fresh cohort.

`consent-agent-contract-binding-proof-2026-10-20.json` binds the integrated
PR160 and Agent metadata revision to the pinned CLI component checks. All 1,633
tests and both TypeScript checks pass; this is still not behavioral acceptance.


`consent-contract-m31-cohort-review-2026-10-20.json` retains the complete
M3.1-Flash medium initial batch on the integrated consent/dispatch revision:
seven passes and three incomplete cases. Thin-data execution both omits draft
review and invents sender experience; all-yes aggregate judgments miss that
grounding defect. Baselines still omit required Agent fields, and the fabrication
skill repeats questions after an authored wait response until execution fails.
This profile is rejected for suite qualification; no repeats or regression seeds
are selected from it. A predeclared MiniMax-M2.7 comparison uses the identical
frozen source, judge, original cases and limits. It is a distinct model trial,
not a retry or regrading of these immutable failures.


## Evidence-linked judge boundary

`run-case.ts` requires a source-bound full-context calibration for behavioral
runs. Supply `judgeProtocol: "evidence-linked/v2"`, an absolute `judgeCalibration`
path and its `judgeCalibrationSha256`. The activation gate requires all 45 votes
across 15 positive/negative controls to be correct, with three samples per control,
all six original judge criteria, valid final responses and observed usage. A changed
policy/client or skill source requires new calibration. Component fixtures cannot
activate behavioral runs; prior receipts with different judge bindings cannot seed
regression. Calibration permits fresh workflow evaluation only.

The explicit loopback gateway preserves the original rubric, case prompts,
observation binding, three-sample requirement and execution budgets. It segments
the complete output into stable IDs and supplies decoded tool evidence with source
IDs. Every output block must be assessed exactly once; invalid IDs, contradictory
verdicts, truncated responses and provider failures produce incomplete evidence.
Evidence IDs improve attribution, but semantic correctness still requires live
controls and review. The legacy quote-based v1 modules retain the first diagnostic
candidate; workflow activation uses v2 exclusively.

Following [MiniMax's OpenAI-compatible API documentation](https://platform.minimax.io/docs/api-reference/text-openai-api),
private reasoning is retained only for the same model's tool-call continuation.
Nested phase answers and judge evidence exclude it. The root gateway restores
private continuation to the matching conversation without publishing it in receipts.
M3.1 ignores requested temperature zero; effective temperature is one. The candidate
uses explicit high reasoning effort, 8,192 completion tokens and a 120-second judge
request limit. Those parameters do not alter the original root or phase deadlines.
The positive/negative calibration approach follows
[Anthropic's agent-evaluation guidance](https://www.anthropic.com/research/demystifying-evals-for-ai-agents).

Run the actual CLI component proof with the final `evidence-linked` argument:

```bash
pnpm exec tsx evals/jrig/case-runner-proof.ts /absolute/jrig/dist/index.js \
  /new/private/proof.json medium 120000 evidence-linked
```

This scripted proof exercises binding, regression, cancellation, invalid judgments
and the prohibition on promoting component calibration. It makes no paid calls and
cannot establish behavioral acceptance.


`evidence-linked-v1-calibration-2026-10-21.json` preserves the first candidate's
14/45 correct votes; exact-quote errors and incomplete answers prevented activation.
`evidence-linked-v2-calibration-2026-10-21.json` preserves the revised format's
44/45 result: every completed judgment was correct, but a transport TypeError
without response/usage still failed the predeclared gate. No workflow run followed.
The original failing outputs and both calibration results remain unchanged.

The transport revision uses an owned, pinned Undici dispatcher for each judge call,
a 30-second connection limit inside the existing 120-second total deadline, address
family fallback, explicit teardown, and safe failure codes. It never retries a
judgment automatically. The earlier 10,025-ms failure is consistent with Undici's
[default 10-second connection limit](https://undici.nodejs.org/api/Connector),
but the original missing error cause prevents a definite diagnosis.
`evidence-linked-controls-manifest-2026-10-21.json` binds the revised transport's
fresh predeclared control matrix, labels, source hashes and acceptance threshold.
