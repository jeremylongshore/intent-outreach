# evals/ — the D4 eval gate

A model may run unguarded only after it passes this harness with a real key. The
offline mode is a wiring check, not a quality gate.

| Mode | Command | What it proves | Writes a record? |
|---|---|---|---|
| Offline wiring check | `npx tsx evals/run.ts --offline` | Seams, guard, scorers and report run end to end. The stub is grounded by construction, and score bands are skipped. | No |
| Keyed gate | `npm run evals` (= `tsx evals/run.ts --providers anthropic --repeat 3`) | Real model quality on the golden fixtures, k runs each | Yes, `evals/results/` |
| Promote | `npm run evals:promote -- --provider anthropic --model claude-sonnet-5-5` | Keyed gate, then marks the pair `verified: true` in `supported.ts` on a pass | Yes |

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
  rating must reach `--judge-floor` (default 4). A judge error counts as a fail.

## Approval: `supported.ts`

`supported.ts` lists approved `{provider, model}` pairs. `pipeline_core/providers.ts` derives
`SUPPORTED_PROVIDERS` from it: a provider is supported only if it has at least one entry. Running a
model that has no entry under a supported provider prints a warning on stderr.

`verified: true` means `resultFile` points at a committed record whose verdict is `pass`.
`tests/eval-gate.test.ts` enforces this. The anthropic and openai entries are legacy claims from
before records existed. They are marked `verified: false` and need a keyed re-run.

The harness itself reaches models through `getProviderUnchecked`, because it is the tool that
qualifies an ungated model. No product code may call it, and a test enforces that.

## Promoting a model (maintainer, needs a key)

```bash
export ANTHROPIC_API_KEY=...            # or via scripts/sops-env
npm run evals:promote -- --provider anthropic --model claude-sonnet-5-5
# on PASS: commit evals/results/<record>.json + evals/supported.ts
# to switch the default, edit DEFAULT_MODEL in pipeline_core/providers.ts by hand (the script prints the line)
```

Record format: see `results/README.md`.
