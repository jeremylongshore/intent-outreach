# Canonical engine contracts

`engine.d.ts` and `engine.schema.json` are generated from the engine's Zod output schemas:
all entries in `pipeline_core/models.ts`'s `SCHEMAS`, plus address, channel, DNC status,
license terms and consent records. `manifest.json` records the schema version and SHA-256
of each artifact. Consumers pin an engine commit and verify these hashes before copying.

```sh
pnpm run contracts:generate
pnpm run contracts:check
pnpm run typecheck
pnpm exec vitest run tests/contracts.test.ts
```

The generator uses Zod's JSON Schema export and the pinned `json-schema-to-typescript`
dev dependency. The declarations are standalone: consumers do not need Zod or the engine's
provider SDKs. No timestamp or checkout path enters the output. Normal unit tests compare
all committed bytes with regeneration, and compile-time checks prove assignability in both
directions between every generated contract and its canonical Zod inferred output type.

These are **output types**, after the canonical engine has applied defaults and validation.
They do not make untrusted JSON safe. TypeScript and structural JSON Schema cannot express
all Zod refinements, normalized keys, relationship checks, licensing, retention, approvals
or send eligibility. Keep using `validate-run`, `validate-crm-context` and `check-send` at
those boundaries. Regeneration never changes those runtime gates.

A CRM dashboard view is not the engine's B2B `Lead`. Compose generated property/party/contact,
message and consent types with explicit business presentation fields. Do not copy the wire
contracts into another hand-maintained schema or infer consent from a display field.
