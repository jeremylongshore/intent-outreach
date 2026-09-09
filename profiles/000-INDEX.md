# Profiles — Starter Index

Report Profiles are declarative JSON files that record campaign and reporting preferences. The
profile file is the source of truth; clone and edit one to create your own. The schema accepts fields
that are not automatically wired by the current skill/MCP route, so use the execution-status table
below rather than assuming every field changes a run.

Each profile validates against `pipeline_core/profiles.ts::ReportProfileSchema`.

## Starter Profiles

| File                              | Name                       | Purpose                                                                                                       |
| --------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `tech-founder-cold-outreach.json` | Tech Founder Cold Outreach | Cold email to technical founders. High min-score (75), 1 contact/lead, short punchy founder voice.            |
| `agency-multi-client-digest.json` | Agency Multi-Client Digest | Email style and 3 contacts/lead are mapped; output/delivery fields require separate callers.                  |
| `account-research.json`           | Account Research           | Markdown section selection is renderer-consumed; connector/output preferences are not automatically executed. |
| `linkedin-warm-intro.json`        | LinkedIn Warm Intro        | LinkedIn style and 1 contact/lead are mapped; Slack/file preferences require separate callers.                |

## Creating Your Own Profile

1. Copy the nearest starter profile: `cp profiles/tech-founder-cold-outreach.json profiles/my-profile.json`
2. Edit the JSON fields you want to change. Every field is optional except `name`, `description`, `output.formats`, and `delivery.targets`.
3. Validate it loads cleanly:
   ```ts
   import { loadProfile } from "./pipeline_core/profiles.js";
   const profile = loadProfile("./profiles/my-profile.json");
   ```
4. Pass it to `applyProfileToCampaignInput` to obtain the mapped `RunCampaignInput` overrides. Invoke
   `render()` and `deliver()` separately if the caller chooses to execute output or delivery preferences.

## Profile Knob Reference

| Section     | Key                                    | Maps to                               | Notes                                                                 |
| ----------- | -------------------------------------- | ------------------------------------- | --------------------------------------------------------------------- |
| `filtering` | `minScore`                             | `RunCampaignInput.minScore`           | Runtime-mapped; 0–100; leads below this skip drafting                 |
| `filtering` | `companyFilters`, `contactTitles`      | schema only                           | Preserved but not mapped by `applyProfileToCampaignInput`             |
| `intake`    | `connectors`, `extraFields`            | schema only                           | Preserved but not mapped by `applyProfileToCampaignInput`             |
| `outreach`  | `channel`                              | `RunCampaignInput.channel`            | `"email"` or `"linkedin"`                                             |
| `outreach`  | `maxContactsPerLead`                   | `RunCampaignInput.maxContactsPerLead` | Integer ≥ 1                                                           |
| `outreach`  | `tone` + `maxLength` + `templateNotes` | `RunCampaignInput.styleOverride`      | Synthesised into a single verbatim string                             |
| `structure` | `sections`                             | `renderMarkdown` section order        | Renderer-consumed only when the caller passes the profile             |
| `output`    | `formats`                              | caller-selected `render()` loop       | Schema preference; the skill/MCP route does not loop automatically    |
| `delivery`  | `targets`                              | caller-selected `deliver()` loop      | Schema preference; the skill/MCP route does not deliver automatically |
| `delivery`  | `dir`                                  | `deliver()` opts.dir                  | Used only when a caller explicitly invokes local delivery             |
