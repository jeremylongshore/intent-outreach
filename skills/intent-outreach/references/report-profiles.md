# Report Profiles — reference

A **Report Profile** is a declarative, local, version-controlled file that customizes what a campaign
produces. The profile owns the **deterministic** choices; the model owns the creative drafting. Profiles
live under a project `./profiles/` or `~/.intent-outreach/profiles/`. Starter profiles ship in
`profiles/` (clone one rather than start blank).

Load a profile with **Read**, then honor its knobs. Each knob maps to a pipeline stage:

| Section | Knob | Maps to |
|---|---|---|
| `intake` | `connectors[]`, `extraFields[]` | which connectors/fields to pull (Research/Enrich) |
| `filtering` | `minScore`, `companyFilters[]`, `contactTitles[]` | deterministic filtering before drafting |
| `outreach` | `channel`, `tone`, `maxLength`, `maxContactsPerLead`, `templateNotes` | the draft seam (tone/length/voice) |
| `structure` | `sections[]` | which report sections render, in order |
| `output` | `formats[]` (`markdown`/`csv`/`json`/`html`/`slack`/`email-draft`/`pdf`) | renderers |
| `delivery` | `targets[]` (`console`/`file`/`email-draft`/`slack`), `dir` | local delivery only — never a hosted destination |

Rules:
- **Declarative-first, NL-second.** A natural-language "describe the report you want" generates or
  patches a profile; the profile *file* stays the source of truth (reproducible, diffable, auditable).
- The profile sets the deterministic rules (filters, min score, formats, delivery); the model never sees
  the rules, only the pre-scored leads it drafts for.
- Defaults are strong and starters are immutable-by-default — clone, don't mutate the shipped ones.

Starter profiles: `tech-founder-cold-outreach`, `agency-multi-client-digest`, `account-research`,
`linkedin-warm-intro` (see `profiles/000-INDEX.md`).
