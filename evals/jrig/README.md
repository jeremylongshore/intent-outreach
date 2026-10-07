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
endpoint and a test-only fetch preload. Only two synthetic Hunter responses are
available. Every other fetch is refused; no vendor request is forwarded. The
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
