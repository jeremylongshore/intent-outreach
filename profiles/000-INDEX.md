# Profiles — Starter Index

Report Profiles are declarative JSON files that customize what each customer receives
from an Intent Outreach run. The profile FILE is the source of truth; clone and edit
one to create your own.

Each profile validates against `pipeline_core/profiles.ts::ReportProfileSchema`.

## Starter Profiles

| File | Name | Purpose |
| --- | --- | --- |
| `tech-founder-cold-outreach.json` | Tech Founder Cold Outreach | Cold email to technical founders. High min-score (75), 1 contact/lead, short punchy founder voice. |
| `agency-multi-client-digest.json` | Agency Multi-Client Digest | Multi-client markdown + CSV digest. Up to 3 contacts/lead, placeholder slots for agency review before sending. |
| `account-research.json` | Account Research | Research-only depth run, no outreach drafting. All enrichment connectors, structured markdown + JSON + CSV output, no messages section. |
| `linkedin-warm-intro.json` | LinkedIn Warm Intro | Short LinkedIn connection request. Warm tone, under 300 chars, 1 contact/lead, Slack preview output. |

## Creating Your Own Profile

1. Copy the nearest starter profile: `cp profiles/tech-founder-cold-outreach.json profiles/my-profile.json`
2. Edit the JSON fields you want to change. Every field is optional except `name`, `description`, `output.formats`, and `delivery.targets`.
3. Validate it loads cleanly:
   ```ts
   import { loadProfile } from "./pipeline_core/profiles.js";
   const profile = loadProfile("./profiles/my-profile.json");
   ```
4. Pass it to `applyProfileToCampaignInput` to get the `RunCampaignInput` overrides, then spread into your `runCampaign()` call.

## Profile Knob Reference

| Section | Key | Maps to | Notes |
| --- | --- | --- | --- |
| `filtering` | `minScore` | `RunCampaignInput.minScore` | 0–100; leads below this skip drafting |
| `outreach` | `channel` | `RunCampaignInput.channel` | `"email"` or `"linkedin"` |
| `outreach` | `maxContactsPerLead` | `RunCampaignInput.maxContactsPerLead` | Integer ≥ 1 |
| `outreach` | `tone` + `maxLength` + `templateNotes` | `RunCampaignInput.styleOverride` | Synthesised into a single verbatim string |
| `structure` | `sections` | `renderMarkdown` section order | Any of: `summary`, `leads`, `contacts`, `messages`, `cost` |
| `output` | `formats` | `render()` format loop | One or more of: `markdown`, `csv`, `json`, `html`, `slack`, `email-draft`, `pdf` |
| `delivery` | `targets` | `deliver()` target loop | One or more of: `console`, `file`, `email-draft`, `slack` |
| `delivery` | `dir` | `deliver()` opts.dir | Local directory path; defaults to `process.cwd()` |
