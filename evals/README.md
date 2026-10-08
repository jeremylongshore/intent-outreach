# evals/ — the D4 eval gate

A model may run unguarded only after it passes this harness with a real key. The
offline mode is a wiring check, not a quality gate.

| Mode | Command | What it proves | Writes a record? |
|---|---|---|---|
| Offline wiring check | `pnpm exec tsx evals/run.ts --offline` | Seams, gates, guard, scorers and report run end to end for **every pack**. The stub is grounded by construction, and score bands are skipped. | No |
| Keyed gate | `pnpm run evals` (= `tsx evals/run.ts --providers anthropic --repeat 3`) | Real model quality on the golden fixtures, k runs each | Yes, `evals/results/` |
| Keyed gate, residential | `pnpm exec tsx evals/run.ts --providers minimax --model MiniMax-M3 --pack residential-re --judge` | Real model quality on the residential fixtures | Yes |
| Promote | `pnpm run evals:promote --provider anthropic --model claude-sonnet-5-5 [--pack residential-re]` | Keyed gate on that pack, then marks `{provider, model, pack}` `verified: true` in `supported.ts` on a pass | Yes |

## What a pass means

Every fixture must pass **every** one of k runs (`--repeat`, default 3 when keyed).

- **Score fixtures** (`fixtures/score/*.json`) must pass `schemaConformance`, `scoreBand` and
  `angleGrounding`. `scoreBand` checks that `fitScore` falls inside the fixture's
  `expect: {scoreMin, scoreMax}`. `angleGrounding` fails the run if `scoreLead` had to drop a
  fabricated angle, or if a kept angle claims funding when the inputs carry no funding signal.
- **Draft fixtures** (`fixtures/draft/*.json`) must pass `schemaConformance`, `draftContract`,
  `draftStyle` and `groundingHeuristic`. `draftStyle` runs the product `guardDraft` and adds the
  prompt's caps: an email body of at most 90 words, a LinkedIn message of at most 60, and a subject
  of at most 7 words. `groundingHeuristic` flags invented funding, investors, customers, metrics and
  mutual connections, and "I noticed" claims with nothing grounded behind them. A draft the product
  guard rejects counts as a failed run.
- **`--judge`** (optional, costs more) asks the same model to rate each draft from 1 to 5. The mean
  rating must reach `--judge-floor` (default 4). Every judged draft must also have
  `grounded: true` and an empty `hallucinatedFacts` list; a high rating cannot override
  an unsupported claim. A judge error counts as a fail.

## The residential-re suite (`--pack residential-re`)

Fixtures live in `fixtures/residential/*.json`; the loader, gate wiring and scorers are in
`residential.ts`. Each fixture is a property, its owner and ownerships, and expectations. Every run
checks four kinds of result:

- **Gate fixtures** (`kind: "gate"`) must be blocked with an exact reason before any model call.
  They run through the product's own gate chain (`pipeline_core/property-campaign.ts`
  `gateVerdict`: suppression, then the mail address, then the pack's `propertyGate`). The cases are
  a DNC-listed phone on the opt-out list, an opted-out mailing address, no owner contact, a
  phone-only owner, no owner record, an expired listing whose exclusive agreement still runs, a
  pre-foreclosure (lis pendens) signal, an estate owner (probate), outside the service area, and
  undeclared license terms.
- **Score results** (`kind: "model"`) must pass the gate, the schema, `scoreBand` and
  `reasonGrounding`. `scoreBand` checks the band the model named against the fixture's
  `expect.bands` and the score against that band's range (hot 70–100, warm 40–69, cold 0–39, from
  the residential score prompt). `reasonGrounding` fails a reason that `groundAngles` dropped, or
  one that leans on a protected trait.
- **Draft results** must pass `draftRules` and `draftGrounding`, plus `recipient` for entity owners.
  `draftRules` is the product guard with `fairHousingDraftRule`, `distressLanguageDraftRule` and the
  quantity guard over the property facts, plus the prompt caps. `draftGrounding` fails a money
  amount, percentage or proper name that is not on record. `recipient` requires that a greeting
  names the entity or a generic owner, with no honorific. A decline passes only where the fixture
  sets `expectDecline` (the commercial parcel).
- **Pairs** (`pair:<id>`) are two fixtures that differ only in a protected-class signal: the owner's
  name (national origin), or an age attribute and occupancy note that must be stripped. In every
  run, the two scores must agree within 10 points and in the same band, and both drafts must pass
  the fair-housing rule. The age pair must also build byte-identical prompts.
- **`--judge`** uses a residential rubric: about the property and the numbers on record, plain and
  restrained, with one low-pressure ask. Pitchy or urgent letters rate 2, and any reference to the
  owner as a person rates 1. Fixtures set their own `judgeMin`; every judged draft must
  also be grounded with no hallucinated facts, regardless of its numeric rating.

## Approval: `supported.ts`

For `MiniMax-M3.1-Flash-Preview`, native calls now forward an explicitly requested
seam effort through the OpenAI-compatible `reasoning_effort` field: scoring uses
`low` and drafting uses `medium`. Calls without an effort setting, including the
judge, retain the endpoint default. This mapping applies only to that exact model;
MiniMax-M3 and other models retain their existing behavior. The 60-second seam
deadline, token limits, fixtures and qualification thresholds are unchanged.
The shared effort type remains limited to `low`, `medium` and `high`.
See [MiniMax's invocation documentation](https://platform.minimax.io/docs/guides/text-generation).
Qualification records from before this mapping remain evidence for the prior
profile, and a failed record is never upgraded by the change.

`supported.ts` lists approved `{provider, model, pack}` records. A pass on one pack says nothing
about another. Entries written before packs existed are `b2b-sdr`. `pipeline_core/providers.ts`
derives `SUPPORTED_PROVIDERS` from the `b2b-sdr` entries, so a provider is supported only if it has
at least one of them, and an approval on another pack never switches a provider on for B2B. Running a model
that has no `b2b-sdr` entry under a supported provider prints a warning on stderr.

Non-B2B runtime selection requires an exact entry with `verified: true` and a result record
for the selected pack; B2B approval cannot qualify residential scoring or drafting. Both drafter
and separately selected scorer are checked. Property campaigns, monitor drafts and inbound
replies use their resolved pack, including when a production provider is passed into the engine.
`INTENT_OUTREACH_ALLOW_UNGATED=1` remains an explicit local-testing override. Custom injected
providers and `getProviderUnchecked` are trusted test/eval seams; normal callers use
`getProvider({ provider, model, pack })`.

`verified: true` means `resultFile` points at a committed record whose verdict is `pass`.
`tests/eval-gate.test.ts` enforces this. The anthropic and openai entries are legacy claims from
before records existed. They are marked `verified: false` and need a keyed re-run.

The harness itself reaches models through `getProviderUnchecked`, because it is the tool that
qualifies an ungated model. No product code may call it, and a test enforces that.

## Promoting a model (maintainer, needs a key)

```bash
export ANTHROPIC_API_KEY=...            # or via scripts/sops-env
pnpm run evals:promote --provider anthropic --model claude-sonnet-5-5                         # b2b-sdr
pnpm run evals:promote --provider minimax --model MiniMax-M3 --pack residential-re --judge   # residential
# on PASS: commit evals/results/<record>.json + evals/supported.ts
# to switch the default, edit DEFAULT_MODEL in pipeline_core/providers.ts by hand (the script prints the line)
```

Record format: see `results/README.md`.
