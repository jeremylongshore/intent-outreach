# evals/results/: keyed eval records

Each keyed run of `evals/run.ts` writes one JSON record per provider:

```
evals/results/<YYYY-MM-DD>-<provider>-<model>-<promptRef>.json
e.g. 2026-10-04-anthropic-claude-sonnet-5-5-outreach.v2@1a2b3c4d.json
```

`promptRef` is `pipeline_core/prompts.ts` `promptRef(DEFAULT_DRAFT_PROMPT)`, which is
`<prompt file>@<first 8 hex of its sha256>`. The score-seam prompt refs are recorded inside the file.
A same-day re-run of the same model and prompt overwrites the earlier record. Offline (`--offline`)
runs never write here.

## Shape (`recordVersion: 2`)

Version 2 added `pack` and the `gate` and `pair` seams. A version 1 record has no `pack` and is a
`b2b-sdr` record.

| Field | Meaning |
|---|---|
| `recordVersion` | Format version (1). |
| `createdAt` | ISO timestamp of the run. |
| `provider`, `model` | Exact pair evaluated. |
| `pack` | The pack whose fixtures ran (`b2b-sdr`, `residential-re`). |
| `promptRef` | Draft prompt ref (also in the file name). |
| `promptRefs` | `{ score: [...], draft }`: every prompt file and its hash. |
| `repeat` | Runs per fixture (k). |
| `fixtures[]` | `seam` is `score`, `draft`, `gate` (residential, no model call) or `pair` (residential protected-class pair). `{ fixture, seam, pass, passes, runs, passRate, costUsd, outcomes[] }`. `pass` is true only if all k runs passed. Each outcome holds `{ pass, costUsd, failures: {scorer: findings[]}, output?, error? }`. `output` is the seam output: the score with `droppedAngles`, or the draft. |
| `judge` | `null`, or `{ floor, meanRating, ratings[], errors[], pass, costUsd }` when the run used `--judge`. |
| `cost` | `{ totalUsd, inputTokens, outputTokens }` from real SDK usage. |
| `summary` | `{ fixtures, fixturesPassed, passRate, runPassRate, verdict: "pass" \| "fail" }`. |

A record whose `summary.verdict` is `"pass"` can back a `verified: true` entry in
`evals/supported.ts`. Commit the record and the `supported.ts` change in the same commit.
