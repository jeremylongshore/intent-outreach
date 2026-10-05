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
| `operator-voice.example.json`     | Operator Voice (example)   | Shows the `voice` section: dash ban + a short denied-phrase list enforced by the draft guard. Load by path.   |

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
| `voice`     | `banDashes`, `deniedPhrases`           | `RunCampaignInput.voice` + save_run   | Enforced by the draft guard; violating drafts land in `rejectedDrafts` |
| `voice`     | `notes`                                | `RunCampaignInput.styleOverride`      | Appended after `tone`/`templateNotes`; guidance only, not checked     |
| `structure` | `sections`                             | `renderMarkdown` section order        | Renderer-consumed only when the caller passes the profile             |
| `output`    | `formats`                              | caller-selected `render()` loop       | Schema preference; the skill/MCP route does not loop automatically    |
| `delivery`  | `targets`                              | caller-selected `deliver()` loop      | Schema preference; the skill/MCP route does not deliver automatically |
| `delivery`  | `dir`                                  | `deliver()` opts.dir                  | Used only when a caller explicitly invokes local delivery             |

## Voice rules (`voice`)

An optional section for drafting in your own voice. Every field is optional; a profile without
`voice` behaves exactly as before.

```json
{
  "voice": {
    "banDashes": true,
    "deniedPhrases": ["delve", "game-changer", "seamless"],
    "notes": "Short sentences, plain words, no hype."
  }
}
```

- **`banDashes`**: the draft guard rejects an em dash (U+2014), an en dash (U+2013), their HTML
  entities (`&mdash;`, `&ndash;`, `&#8212;`, `&#8211;`, `&#x2014;`, `&#x2013;`), a hyphen used as a
  dash (`word - word`, `word -- word`) and the ASCII double hyphen (`word--word`). Hyphenated words
  (`follow-up`), a bullet at the start of a line and negative numbers (`-3%`) are allowed.
- **`deniedPhrases`**: case-insensitive, whole-word, exact-phrase matches against subject, body and
  CTA. `"delve"` matches `Delve` and `delve,` but not `delved` or `delves`: list each inflection you
  want banned. Curly apostrophes match straight ones.
- **`notes`**: free-text guidance appended to the draft `styleOverride`, the same way `tone` is.
  Not checked by the guard.

Enforcement is deterministic and runs on both paths: the `runCampaign` draft seam and MCP `save_run`
(agent-written drafts). A violating draft is recorded in `run.rejectedDrafts` with issues such as
`voice: em dash (body)` or `voice: banned phrase "delve" (subject)`, and is never saved as a message.
The model also gets one `Voice rules:` line in its system prompt (the phrase list is capped there at
25; the guard always checks the full list). The CAN-SPAM footer is appended after the guard runs, so
a postal address containing ` - ` or the `-- ` signature delimiter never trips the dash ban.
