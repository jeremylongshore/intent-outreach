---
date: 2026-10-11
status: evidence-inventory
project: intent-outreach
source_revision: 84cc5958669790b6b85269218499e9dbe7c5113b
coastal_source_revision: 1fa3bf42094e1a571221c1f7f90a92c9375c3795
comehomealabama_source_revision: ab74dfabfeaf66b857178485482f28e4f983aa76
---

# Estate real-estate workflows: reusable assets and buildable services

## Finding and purpose

Intent Outreach can showcase more than a property search or a list of connected vendors. Across the estate there are useful pieces for six kinds of operator: coastal agent, metro agent, buy-box investor, prospector, referral-network connector and CRE/flex team. The useful public story is the artifact each operator receives: an advisory brief, review queue, criteria sheet, printable call sheet, referral handoff or property/business brief.

These are opportunities to scope custom workflows around existing assets. They are not six completed production services. The estate includes implemented code, published content, operational surfaces documented by their owning repositories, fixture-driven screens and historical concepts. The distinction must remain visible when combining them into a new offer.

Local [brand guidance](../brand/README.md), [positioning](../brand/positioning.md) and [voice](../brand/voice.md) govern presentation. [038](038-PP-PLAN-cre-outreach-showcase.md) records the initial four-path page scope and capability boundaries; this inventory expands the possible operator outputs. [039](039-RA-ANLY-real-estate-workflow-market.md) addresses competitive positioning. Neither a competitor feature list nor this inventory proves a new integration has run.

## Method and maturity labels

This was a read-only inspection on 2026-10-11 of the public demo source files and narrowly related repositories. The revisions are recorded above. Code, docs and existing test files were inspected; tests were not rerun as part of this inventory. No provider/model calls, campaign sends, SOPS decryption, deployment or live CRM operation was performed for this audit. Public links identify inspectable artifacts; this document does not assert a fresh availability or end-to-end production test for each destination.

Use these labels consistently:

| Label | What it establishes |
|---|---|
| Published artifact | A public-facing page, diagram or guide exists in the inspected source. It may describe a concept rather than running software. |
| Implemented component | Code performs a named operation, with test evidence identified where available. It does not establish current production activation. |
| Documented operational surface | The owning repository records the surface as live. This audit did not independently exercise its private runtime. |
| Illustrative or proposed workflow | A useful output/process to demonstrate or build. Synthetic examples, design files and plans do not establish delivery. |

Private client records, contacts, commercial strategy and detailed targeting criteria remain outside this public project document. They informed the distinction between requested work and demonstrated assets, not marketing claims or sample prospect data.

## Six operator outputs

| Operator and useful output | Reusable assets observed | Current maturity | Additional work required |
|---|---|---|---|
| Coastal agent: ownership-cost comparison and advisory brief | Pure sell/buy/carry-cost calculator; coastal educational guides; contact form; residential research/drafting engine | Calculator implemented; public content and form source present; complete inquiry-to-reviewed-response integration not established here | Validate user-supplied assumptions, remove stale financial defaults from any public example, present scenario limitations, implement and test the selected inquiry/CRM handoff |
| Metro agent: daily review queue and assigned next action | ERPNext-fed hot-lead/pipeline components; queue ownership and canonical engine adapter; dashboard design assets | Owning repo documents ERPNext/dashboard live; some panels are fixtures; sink deployment and migration parity remain pending | Define the agent's real workflow and data contract; replace any selected fixture panel; verify permissions, ownership, retention and actual CRM reads/writes |
| Buy-box investor: criteria-versus-property sheet and exception list | Property model and provenance; criteria/strategy research; deterministic calculator; source and review gates | Components and planning material exist; no general investor matching product established | Define permitted user-supplied criteria, source each required field, preserve unknowns, implement explicit matching/math and evaluate false positives; avoid asserting purchase intent |
| Prospector: source-tagged printable call sheet or spreadsheet | Scott prep concept; Outreach company/contact research and renderers; source/date and missing-data patterns | Public concept exists; Scott engagement is research/deliverables, not an implemented automation repo | Agree a one-property schema; bind permitted sources; reconcile identities/conflicts; build print/export and optional board handoff; test with a bounded declared input set |
| Referral-network connector: known-relationship map and reviewable introduction handoff | CRM relationship concepts; warm-intro profile; governed knowledge pattern; proposed sphere follow-up | No working referral engine found; sphere handler is a stub; warm-intro profile only adjusts limited drafting behavior | Use explicitly supplied relationships and permissions; record role, geography, relationship source and handoff state; build reviewed introduction preparation and deduplication |
| CRE/flex team: property/business brief with fit questions | Scott flex/NNN prep concept; B2B adapters; sandbox property search; reusable property model and review controls | Existing components; no shipped qualified CRE/flex pack or demonstrated live tenant-demand matching | Verify commercial field coverage; separate owner/occupier/contact identity; obtain actual building requirements; implement matching/unknowns and test one bounded pilot |

Each public example should show the input, an inspectable output, evidence or assumptions, unresolved questions and the next human decision. It can be useful before it becomes an automated service. A printable sample call sheet, for example, demonstrates the intended deliverable without pretending a Trello board was updated.

## Relevant estate evidence

### Coastal economics and educational content

At the audited coastal revision, `src/calculators/trade_up.py:1–18` describes a pure calculator and its worked-example test; `:127–180` implements the sell, buy and difference calculations. `tests/test_trade_up.py` is the corresponding test source. This is a concrete reusable component for a scenario comparison, not an appraisal or a claim that a real owner should transact.

Public reuse must review its legacy defaults and headline wording. Display assumed prices, costs and rates as inputs, not current market facts. Missing costs cannot silently become known zero values. A scenario result is conditional on its assumptions; do not reproduce an old worked example as a customer outcome.

The ComeHomeAlabama repository has substantive MDX guides in `src/content/journal/`, including land due diligence, coastal ownership costs, insurance and community decisions. `scripts/journal/README.md` documents a producer/lander split, voice and fair-housing checks, build gates and publication verification. These files support the existence of a content-production system, not a measured acquisition or conversion result.

The [public journal](https://comehomealabama.com/journal/) is a useful proof destination. A buildable service pattern is community research → useful guide → inquiry → reviewed response. At `src/pages/contact.astro:42` the form posts to `/api/lead`; `:105–114` captures consent fields. The form code alone does not prove the complete downstream response/CRM workflow.

### Agent workspace and CRM handoff

Current coastal source is more advanced than the old public architecture diagram. Its `README.md:72` records ERPNext and the dashboard as live, with source scheduling and production outbound transport not activated. `:146–150` records the implemented engine sink and pending deployment/live migration parity. `:239–262` describes the checked dispatch boundary and its inert transport tests.

The dashboard mixes sources: `web/dashboard/src/components/panels/HotLeadQueueIsland.tsx:24` calls `/api/leads/hot`; `PipelineIsland.tsx:20` calls `/api/pipeline`. `TodaysTasks.astro:2` and `CommThreads.astro:2` still import fixtures. A screenshot of that workspace must therefore be labeled at the panel or example level rather than broadly described as all-live operations.

The [design audition](https://demos.intentsolutions.io/mandy-design-audition/) is a legitimate public design artifact. Its README explicitly states that the variants share fixtures and have no production wiring. Reuse its information hierarchy, review-queue patterns and visual exploration; do not reuse personal listings/contact details as generic sample data.

### Prospect preparation and printable artifacts

The [Scott Prospect Prep Engine](https://demos.intentsolutions.io/scott-porter-automation/) labels itself a concept for discussion. The useful pattern is narrow: start with already-selected property records, find missing or stale information, reconcile source/date conflicts, create a printable one-pager or spreadsheet, and retain a manual-check queue for unavailable facts.

The associated engagement material explicitly distinguishes research preparation from later deal sourcing. The local engagement folder is not an automation code repository. Accordingly, the public concept does not prove working Trello enrichment, PDF attachment, source replacement or automatic owner resolution. The older page's vendor coverage, prices, market statistics and motivation claims need fresh substantiation before reuse; they are not imported into this scope.

The buildable artifact is valuable on its own: a brief with source/time, confidence, unresolved identity, relevant questions and the operator's notes. Board updates and scheduled refreshes can be separate, testable integrations.

### Source handlers, investor criteria and relationships

The current coastal BatchData handler at `src/handlers/batchleads_daily.py:3–7` says it is unscheduled, pulls and labels data, and leaves scoring/drafting to the canonical engine. `:44–69` implements bounded optional skip tracing. This is an implemented data component, not a full seller pipeline.

Other named handlers are plans expressed as stubs: `sphere_drip.py:12`, `vulcan7_daily.py:11` and `str_xref_weekly.py:13` raise `NotImplementedError`. Their names, legacy diagrams or README ambitions cannot justify claims of functioning anniversary nurture, expired-listing automation or rental-registry portfolio matching.

The estate also contains private investor and relationship-channel research. It supplies useful product patterns: declared criteria, a candidate-versus-criteria explanation, source gaps, recurring review and explicit handoffs. It does not establish a working portfolio of automated strategies. Do not copy private criteria, demographic/distress classifications, inferred financial circumstances or speculative seller motivations into this showcase.

The existing Outreach warm-intro profile is similarly narrow. `profiles/000-INDEX.md:17` explains that style and contact count are mapped while delivery preferences require separate callers. It does not discover a relationship graph or establish permission to introduce people.

## Public reference map

| Reference | Useful lesson | How to label it |
|---|---|---|
| [BatchData property desk](https://demos.intentsolutions.io/batchdata/) | Inspect provider-returned records, warnings and unknowns within an operator workflow | Working sandbox demonstration; not live commercial inventory |
| [ComeHomeAlabama journal](https://comehomealabama.com/journal/) | Turn local research into useful public education and an inquiry path | Published educational content; no conversion claim |
| [Mandy design audition](https://demos.intentsolutions.io/mandy-design-audition/) | Make agent-facing queues and public identity tangible | Static design exploration with fixtures |
| [Scott Prospect Prep Engine](https://demos.intentsolutions.io/scott-porter-automation/) | Show the research package an operator actually wants to hold/use | Historical concept; not delivered automation |
| [SearchCarriers toolkit](https://demos.intentsolutions.io/searchcarriers/) | Package operator jobs with evidence, missing facts, next action and a one-page deliverable | Related toolkit and presentation pattern; not a real-estate connection |
| [Longbox](https://demos.intentsolutions.io/longbox/) | Show recognizable output, sample-data screens and the owner's final review step | Related product demonstration; no transfer of its results to real estate |
| [Auction lot intelligence](https://demos.intentsolutions.io/diagnosticpro-1/) | Separate deterministic numbers, abstention and narrative | Explicit design, not built |
| [Bob's Big Brain](https://demos.intentsolutions.io/bbb/) | Retain cited knowledge and governed relationship context | Related knowledge-system pattern; property/referral integration proposed |

The [older Mandy architecture page](https://demos.intentsolutions.io/mandy-real-estate-skills/) needs special handling. Its local public source still describes Twenty, Slack, Cloud Run, older model choices and automatic SMS timing. That conflicts with current ERPNext/canonical-engine and non-activated-transport evidence. It should be labeled historical or corrected before it is promoted as current delivery proof. Neither its speed claims nor its old provider cost table is evidence for a new offer.

## Scope for a stronger showcase

The next public surface can offer six operator paths with clearly fictional worked outputs. Selecting a path should change the brief, the inputs a visitor would provide and the implementation question, not merely swap provider logos. Preserve the real sandbox as a distinct interactive proof panel. Do not blend its provider records with invented fields from the illustrations.

A useful first demonstration set is a coastal cost worksheet, an agent review queue, an investor criteria sheet, a printable prospect brief, a referral handoff and a CRE/flex fit brief. Each needs an explicit maturity label and should lead to an inquiry describing the visitor's market, inputs, current process, tools and desired output.

A bounded implementation pilot then chooses one artifact and one input path. Its evidence must cover the actual data source, identity mapping, assumptions, cost ceiling, review state and final export/handoff. This inventory does not authorize new provider spend, external messages, publishing private client material or activation of sending transports. Task status and follow-on execution remain in Beads.

## Claim and identity boundaries

Keep recorded property owner, beneficial owner, registered agent, occupant, business contact, referral partner and authorized representative separate. Similar names, a business address or a company role do not resolve those relationships. Known relationships should retain who supplied them and when.

A data field does not establish buying/selling intent; a past cash transaction does not establish a present mandate; company growth does not establish space requirements. Financial scenarios need stated assumptions. API credentials do not establish permitted coverage or a completed integration. Consent, source permission, contact verification and exact-message approval remain separate facts.

The resulting offer is an implementation service grounded in reusable assets: define the operator's output, connect permitted inputs, preserve evidence and unknowns, and test the actual handoff. That is a wider and more useful scope than the current connector list, while remaining faithful to what the estate can demonstrate today.
