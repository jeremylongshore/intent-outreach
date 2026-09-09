# Report Profile schema and runtime mapping

Profiles are local JSON files validated by `ReportProfileSchema`. Required values are `name`,
`description`, at least one `output.formats` entry, and at least one `delivery.targets` entry.

## Current execution status

| Fields                                                | Status                             | Consumer                                                            |
| ----------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------- |
| `filtering.minScore`                                  | runtime-mapped                     | `applyProfileToCampaignInput` → campaign input                      |
| `outreach.channel`                                    | runtime-mapped                     | `applyProfileToCampaignInput` → campaign input                      |
| `outreach.maxContactsPerLead`                         | runtime-mapped                     | `applyProfileToCampaignInput` → campaign input                      |
| `outreach.tone`, `maxLength`, `templateNotes`         | runtime-mapped                     | Combined into `styleOverride`                                       |
| `structure.sections`                                  | renderer-consumed                  | Markdown renderer section selection/order                           |
| `intake.connectors`, `intake.extraFields`             | schema-only                        | Accepted and preserved; not mapped by `applyProfileToCampaignInput` |
| `filtering.companyFilters`, `filtering.contactTitles` | schema-only                        | Accepted and preserved; not mapped by `applyProfileToCampaignInput` |
| `output.formats`, `delivery.targets`, `delivery.dir`  | schema-only for the skill/MCP path | Accepted and preserved; orchestration is not automatic              |

Do not claim that a schema-only field changes connector execution, filtering, rendering, or delivery.
No profile operation sends a message. Profiles must not contain credentials or contact records.

Allowed `output.formats` values are `markdown`, `csv`, `json`, `html`, `slack`, `email-draft`, and
`pdf`. Allowed `delivery.targets` values are `console`, `file`, `email-draft`, and `slack`; acceptance by
the schema does not mean the current skill/MCP route performs those deliveries.
