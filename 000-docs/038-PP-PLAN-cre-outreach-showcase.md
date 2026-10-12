---
date: 2026-10-11
status: scoped
project: intent-outreach
scope: public CRE, flex-industrial and real-estate workflow showcase
source_revision: f25d3a07591ac60e4a6fc40e4b7de532378d7d75
adjacent_source_revision: coastal-realty-ops@1fa3bf42094e1a571221c1f7f90a92c9375c3795
---

# Intent Outreach: property and business research people can understand

## Project decision

Expand the existing BatchData page into an Intent Outreach showcase that explains the work a property team can accomplish: understand an opportunity, identify relevant people or businesses, prepare a grounded message, and review the next action. Keep the working sandbox as one piece of evidence inside that story.

The first audience is a commercial real-estate broker, small investor/operator, or flex-industrial leasing team evaluating a research and outreach workflow. Residential owner review and commercial service-account research demonstrate the same engine's wider applicability. The page must explain its audience, useful output and next step before asking a visitor to understand an API.

This is a project-owned identity. Local [brand guidance](../brand/README.md), [voice](../brand/voice.md) and [positioning](../brand/positioning.md) govern the page. Provider names describe sources and integration status; they are not the product brand, a partnership claim, or a substitute for a customer outcome.

Jeremy explicitly requested a professional team scope and improvements to the page. The review uses technical product, marketing, and experience-design roles, coordinated by the implementation lead. These are AI review roles, not claims of licensed brokerage, retained legal counsel, customer endorsement or a completed new seven-seat council vote. Existing council decisions in [037](037-AT-DECR-delegated-outreach-council.md) remain binding within their scope.

## Evidence basis and current capability

The inventory below is anchored to the source revisions in this document's frontmatter. Source inspection was read-only; it did not make paid provider calls, decrypt credentials, send outreach or establish fresh production access. Existing provider receipts are described separately from code and test coverage. Shared SOPS metadata contains Apollo, Hunter, Exa, MiniMax and BatchData sandbox fields; presence of an encrypted field is not proof of current entitlement, quota or working authentication.

| Area | What exists | What the evidence supports | What a visitor can see |
|---|---|---|---|
| BatchData sandbox | Bounded REST property-search demo; server-side credential; public deployment route | Existing documented search returned three synthetic records and dataset warnings. Authenticated MCP discovery listed 21 tools; the page itself calls only property search | A working sandbox search and readable record inspection, visibly labeled as test data |
| Apollo | Company enrichment by domain, people search, title targeting and capped contact reveal | Implemented connector and tests; encrypted provider field; two historical engine campaign runs are documented, without a fresh credential check in this audit | An illustrative company and decision-maker research brief, with a clear distinction between available integration and a live page action |
| Hunter | Domain search and missing-email finding | Implemented connector and tests; encrypted provider field. The adapter does not call the separate email-verifier endpoint | Contact-source and confidence explanations, without claiming all emails were independently verified |
| BatchData in coastal-realty-ops | Typed search and synchronous skip-trace client, seller handler and tests | Implemented adjacent client carries sandbox status; an opt-in live smoke test exists, which does not itself establish that it ran | An integration building block; mapping into the canonical engine still needs implementation and verification |
| DealMachine | User reports API access; generic pinned-MCP connector seam exists | No shipped vendor binding in the inspected engine registry; no DealMachine field in the inspected shared provider file. Access may exist elsewhere | A named integration candidate, with no connected or verified badge |
| Residential owner workflow | Property research, provenance, fit scoring, underwriting hooks, grounded drafting, approval and send checks | Implemented engine and tests; native residential model qualification exists; source coverage and permissions remain source-specific | An illustrative property-to-owner research and review journey |
| CRE and flex industrial | Reusable B2B and property engine components | No shipped CRE/flex pack. The only built-in packs are `b2b-sdr` and `residential-re` | A clearly labeled workflow example and bounded pilot offer, not a claim of live industrial inventory |
| Inbound response and CRM | Grounded inbound drafting; adjacent ERPNext sink and checked dispatch boundary | Implemented code and fixture tests. Coastal documentation records ERPNext/dashboard live, while sink deployment/live migration parity and production outbound activation remain pending | An illustrative inquiry, draft and review handoff |
| Approval and storage | Exact-message review, opt-outs, channel checks, encrypted run store | Eight corrected historical drafts received unanimous council quality approval. Approval of draft quality is distinct from permission or readiness to send | Evidence beside the draft, review state, and a useful explanation when information is missing |

Evidence locations, with line references at the audited revisions:

- [Demo README](../demos/batchdata-sandbox/README.md):23,32,44–46 distinguishes endpoint scope, observed sandbox output and public limits.
- [Apollo connector](../pipeline_core/connectors/apollo.ts):192,208,227 and [Hunter connector](../pipeline_core/connectors/hunter.ts):75,100–129 show the actual called routes.
- [Connector registry](../pipeline_core/connectors/index.ts):31–47 and [MCP connector seam](../pipeline_core/connectors/mcp.ts):4–26 separate shipped integrations from extension mechanisms.
- [Pack registry](../pipeline_core/packs/index.ts):25 lists the two shipped packs. [Property campaign](../pipeline_core/property-campaign.ts):7–25 and [inbound drafting](../pipeline_core/inbound.ts):5–18 describe existing workflow boundaries.
- [Council record](037-AT-DECR-delegated-outreach-council.md):57–69 records historical campaign quality review; :84–100 records source and DNC decisions.
- [Coastal BatchData client](https://github.com/jeremylongshore/coastal-realty-ops/blob/1fa3bf42094e1a571221c1f7f90a92c9375c3795/src/integrations/batchleads.py#L1) documents its search/skip-trace and sandbox boundary. [Its smoke test](https://github.com/jeremylongshore/coastal-realty-ops/blob/1fa3bf42094e1a571221c1f7f90a92c9375c3795/tests/test_batchleads.py#L350) is opt-in.
- [Coastal readiness](https://github.com/jeremylongshore/coastal-realty-ops/blob/1fa3bf42094e1a571221c1f7f90a92c9375c3795/README.md#L144) distinguishes the implemented ERPNext adapter from pending deployment; the checked-dispatch section at line239 explicitly states that live transport is not activated.

The older appaudit is background, not the authority for today's gap list: encrypted storage, the ERPNext sink, checked dispatch and native residential qualification have progressed since portions of that audit were written.

## Four visitor journeys

### 1. Understand a property opportunity

The visitor opens the sandbox, submits a location, and examines the provider's returned records. A readable brief groups the property, owner, valuation and source information actually returned. Missing fields remain unknown. The page explains that sandbox records can be unrelated to the requested location, and that a provider valuation is not a completed underwriting conclusion.

Useful outcome: the visitor understands the information a research brief can organize and what must still be checked. This is the working interactive demo today. API details remain available in a secondary disclosure rather than carrying the main explanation.

### 2. Research a potential flex-industrial tenant

An illustrative business brief connects a supplied company domain to company facts, appropriate decision-maker roles and a source-backed outreach draft. Apollo and Hunter are implemented research components. Building requirements such as area, power, loading, clear height, access and desired timing are shown as supplied facts or unanswered questions.

Useful outcome: a leasing team sees how research can prepare a relevant conversation. The example does not infer a company's moving plans, lease expiry, tenant status or space requirements from industry labels. A complete CRE matching pack and production property feed are proposed work.

### 3. Prepare owner outreach for review

An illustrative property brief leads to an owner-of-record identity, an explanation of why the property fits the stated criteria, and a respectful draft with its evidence alongside it. Show the reviewer decision and a case that pauses because an owner/contact/source fact is missing.

Useful outcome: a broker or investor can assess a research package before approving an action. A recorded owner is not automatically the beneficial owner or authorized decision maker. A registered agent is not substituted for either. DealMachine appears as a potential additional source until a binding and account access are verified.

### 4. Research commercial service accounts

An illustrative account brief starts from a supplied company list and shows business activity, relevant roles, sourced contact candidates and a draft for review. Existing B2B research and enrichment are the foundation. A company decision maker is not represented as the person authorized to act for a particular property owner without separate evidence.

Useful outcome: a commercial service sales team sees the research package needed to prepare a relevant approach. The page does not imply that a displayed contact has been reached or that a response or contract resulted.

Inbound inquiries remain an adjacent extension within residential review: a synthetic inquiry can illustrate a grounded reply and proposed review/CRM handoff. Code for those components exists; a controlled live forms-to-engine-to-ERPNext-to-alert integration still needs its own evidence. Do not promise an unmeasured response time. SMS/DNC and consent remain independent gates, not facts inferred from a phone number.

## Delivery scope and acceptance

### Phase 1: improve the existing public page

The existing `/batchdata/` URL remains the entry point so current links continue to work. Present Intent Outreach, a plain-language outcome, the intended audience, four workflow examples, the working sandbox, an honest connection/status explanation and one clear inquiry path. Keep technical depth available for visitors who want it. Local brand direction is “Turn property research into a next step your team can review.” Exploration uses “Explore the workflows”; the inquiry action is “Plan my outreach workflow,” pointing to the existing [Intent Solutions outcome inquiry](https://intentsolutions.io/contact/?door=outcome).

Acceptance is assessed on the delivered page:

- The first screen explains who it serves, what useful output it produces, and the next action. It does not require the visitor to know BatchData or MCP.
- Working sandbox actions, illustrative examples, implemented adapters and proposed integrations are distinguishable in adjacent copy. Provider badges cannot imply that an action ran.
- Each journey has a concrete input, useful output and review step; the flex example names building requirements and shows unknowns without invented tenant intent.
- Real sandbox results retain synthetic-data and dataset-warning context. Empty, error, quota-exhausted and unconfigured states remain usable and honest.
- The primary inquiry route works. Any link to email opens a draft for the visitor; the demo itself does not transmit a campaign or claim a lead was submitted when no endpoint accepted it.
- Desktop and narrow mobile layouts, keyboard access, visible focus, field labels and status announcements are checked. No secret is sent to the browser. Existing server admission, origin and response boundaries remain intact.
- Title, description, heading hierarchy and sharing text explain the property/business use case. The demos index provides a contextual entry, not just a vendor name.

Phase 1 does not require new paid discovery, new production credentials, model calls, CRM writes or messaging activation. It can demonstrate intended workflow using explicitly synthetic examples while retaining the actual sandbox integration.

### Phase 2: one bounded flex/company pilot

Start with a single supplied flex-industrial property brief and a small, declared set of business domains. The useful deliverable is a reviewable company research package, not a claim that the companies are seeking space. Pilot scope must identify the authorized source of each building fact, the business selection rationale, relevant role criteria and what will count as missing evidence.

The preferred first execution reuses permitted, already-held data and offline fixtures. Any new provider or model use requires a recorded aggregate request/spend ceiling under the existing delegated team process; this document grants no fresh budget and does not reset the historical campaign limits in037. DealMachine access discovery can proceed through existing secret metadata and account documentation; never publish credential values or equate the user's reported account access with a completed integration.

Pilot acceptance requires:

- A canonical, validated handoff from property/business evidence to contacts and draft recipients, with no inferred email foreign keys.
- Field-level source and time context, identity separation, and explicit unknown building/tenant facts. No synthetic record can be exported as a production prospect.
- A small declared input set, recorded provider receipts where calls are authorized, no silent paid fallback, and no unbounded reveal/skip-trace behavior.
- One independently reviewed output package per selected example, plus negative cases for missing contact identity, ungrounded requirements, suppression and unavailable provider access.
- An exact-copy review outcome before an example is treated as approved. No message transmission is part of this pilot.
- A decision based on the package's usefulness, unresolved data gaps and measured cost: retain the B2B-led approach, build a dedicated CRE pack, or stop the proposed matching feature.

A broader CRE pack, DealMachine binding, real inventory search, CRM activation and sending transport are separate outcomes with their own evidence and acceptance. They are not dependencies for improving the page now.

The scoped follow-ons are Beads `io-0pr` for the bounded flex/company pilot and `io-a3f` for DealMachine contract qualification. Their current state, dependencies and execution records live in Beads; this document defines the intended outcomes only.

## Model qualification and historical evidence

Model qualifications are per model, pack and tested workflow. [The native registry](../evals/supported.ts):67–80 records two distinct approvals:

| Model and scope | Evidence |
|---|---|
| MiniMax-M3, `b2b-sdr` | Keyed pack evaluation: repeat3, 10/10 fixtures per run. [Recorded result](../evals/results/2026-10-05-minimax-MiniMax-M3-outreach.v3@eb798ecb-4.json) |
| MiniMax-M3.1-Flash-Preview, `residential-re` | Native pack evaluation: 87/87 outcomes and 21/21 grounded judge assessments; evidence source `a5e8788eb94cbea48f5f1112d4a2f0a94ca6503f`. [Recorded result](../evals/results/2026-10-08-minimax-MiniMax-M3.1-Flash-Preview-residential-draft.v1@a183ee83-3.json) |

The separate MiniMax-M3 J-Rig `prospect-and-draft` workflow remains incomplete. Its [review at evaluation revision f9ddf42a5cf870c2dae637e22bbc3fda17b03927](https://github.com/jeremylongshore/intent-outreach/blob/f9ddf42a5cf870c2dae637e22bbc3fda17b03927/evals/jrig/minimax-m3-contact-handoff-review-2026-10-11.json) records `caseResult: incomplete` and `tier3bPassed: false`, against production merge `967f59a73df113ef90f6f94fb5086df907307583`. Native pack approvals do not convert that full-workflow result into a pass, or qualify an unbuilt CRE pack.

Public copy may say grounded drafting and review controls exist. It must not claim universally reliable autonomous outreach, complete production qualification, or an end-to-end live workflow on the strength of these narrower results.

## Identity, data and operational boundaries

The product shown is Intent Outreach. Company correspondence uses **intentsolutions.io LLC**. When a mailing address is needed, use **26050 Equity Drive, Ste E - 1062, Daphne, AL 36526**; it does not establish a physical office or brokerage identity. Do not copy a personal address into the page or a sample footer.

Keep property owner, beneficial owner, registered agent, business employee, actual tenant and inquiry sender as separate identities. A match requires evidence. Do not attach a business contact to a parcel merely because a name or address resembles another record.

Use synthetic people, companies and contact points for public workflow illustrations unless a specific artifact has been cleared for public use. Existing private campaign data and provider payloads are not automatically marketing assets. API access, dataset entitlement, data-use permission, contact verification, consent and exact-message approval are different facts.

Avoid claims of live industrial inventory, known tenant demand, guaranteed deal flow, independently verified emails, connected DealMachine access, deployed end-to-end CRM automation or automatic sending. Describe unknown values directly instead of implying all providers can supply every field. Do not turn DNC data into consent, or provider flags into personal financial/distress claims in outreach copy.

The public sandbox's shared admission limit, restart-safe counter, fixed upstream destination and server-side credentials remain operational constraints. Errors and permissions are part of the demo's evidence. A UI refresh must not enable additional upstream endpoints or remove those limits incidentally.

## Measurement and distribution

Judge the first release by visitor comprehension and useful progression. Measure page visits, workflow selection, sandbox starts, successful sandbox responses, record inspection and inquiry-link clicks where an existing approved analytics path supports them. Event payloads contain event names and non-sensitive workflow labels only: no entered addresses, property records, names, contact details, request bodies or keys. A click is not a submitted inquiry, qualified lead or booked meeting.

Use a short observed comprehension review: a new visitor should be able to describe the intended audience, distinguish the working sandbox from illustrated workflows, and find the next step without an explanation from the builder. Record the actual observations; do not publish a success percentage before measurement.

For initial distribution, give the demos index a descriptive card and make this page linkable from relevant existing project/property content. Prepare a shareable preview and concise explanation that partners or an authorized operator can use. Search metadata should describe CRE/flex research and reviewed outreach without promising current listings or data coverage. Link placement on other sites and any future posts remain explicit publishing work; this scope does not send email, launch a campaign or post to external accounts.

After a defined observation window, review aggregate visits, journey interest, sandbox completion and attributable inquiries together with qualitative feedback. Report unknown attribution and small samples. Choose the next pilot from demonstrated visitor interest and the team's evidence assessment, rather than expanding every provider connection at once.

## Professional review disposition

Technical product recommends shipping the explanation and labeled examples now, preserving the sandbox boundaries, and using a B2B-led flex/company pilot to test usefulness before claiming a dedicated CRE system. Marketing recommends project-owned positioning, four audience-specific paths, and the existing outcome inquiry route. This scope adopts those choices and the local brand files. The implementation lead records experience validation, delivered-page checks and any remaining scope in Beads; this document is the project scope and acceptance contract, not a second task tracker.
