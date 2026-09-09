# Report Profiles — reference

A **Report Profile** is a declarative local JSON file for campaign preferences. Profiles live under a
project `./profiles/` or `~/.intent-outreach/profiles/`. Starter profiles ship in `profiles/` (clone
one rather than editing a starter). The schema accepts more fields than the current skill/MCP route
automatically executes, so distinguish accepted configuration from wired behavior.

Load a profile with **Read**, then honor its knobs. Each knob maps to a pipeline stage:

| Section     | Knob                                                                     | Maps to                                                        |
| ----------- | ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `intake`    | `connectors[]`, `extraFields[]`                                          | schema-only in the current skill/MCP route                     |
| `filtering` | `minScore`                                                               | mapped to campaign input                                       |
| `filtering` | `companyFilters[]`, `contactTitles[]`                                    | schema-only in the current skill/MCP route                     |
| `outreach`  | `channel`, `tone`, `maxLength`, `maxContactsPerLead`, `templateNotes`    | the draft seam (tone/length/voice)                             |
| `structure` | `sections[]`                                                             | consumed when the markdown renderer is called with the profile |
| `output`    | `formats[]` (`markdown`/`csv`/`json`/`html`/`slack`/`email-draft`/`pdf`) | schema-only in the current skill/MCP route                     |
| `delivery`  | `targets[]` (`console`/`file`/`email-draft`/`slack`), `dir`              | schema-only in the current skill/MCP route                     |

Rules:

- **Declarative-first, NL-second.** A natural-language "describe the report you want" generates or
  patches a profile; the profile _file_ stays the source of truth (reproducible, diffable, auditable).
- `applyProfileToCampaignInput` currently maps only `filtering.minScore`, `outreach.channel`,
  `outreach.maxContactsPerLead`, and the outreach style fields. Do not claim that schema-only fields
  alter connector selection, filtering, output, or delivery.
- Defaults are strong and starters are immutable-by-default — clone, don't mutate the shipped ones.

Starter profiles: `tech-founder-cold-outreach`, `agency-multi-client-digest`, `account-research`,
`linkedin-warm-intro` (see `profiles/000-INDEX.md`).
