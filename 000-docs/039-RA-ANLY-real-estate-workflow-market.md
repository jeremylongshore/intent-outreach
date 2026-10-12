# 039: Real estate workflow market and custom implementation scope

**Date:** 2026-10-11  
**Research mode:** current primary product, feature and help pages; read-only research.  
**Purpose:** broaden the public offer from a property-data demonstration to workflows built around different real estate businesses.  
**Tracking:** io-5m2. This is a research and scope artifact, not a task-status ledger.

## Finding

The offer should be **real estate workflows built around how you do business**. A small-town agent maintaining relationships, a metro team handling inquiries and an investor screening properties do not need the same output. The first showcase improved the explanation of research, but still treated almost every visitor as a prospector who wanted a brief.

The broader market already offers strong property databases, CRMs, AI research, configurable workflows and implementation services. Intent Outreach should demonstrate how we can assemble a specific customer's sources, records and rules into useful work. We should not claim that customization, source-linked output or connecting APIs is unique.

This finding broadens the marketing scope of [038](038-PP-PLAN-cre-outreach-showcase.md). It retains that document's factual implementation limits. The [project positioning](../brand/positioning.md) and [voice](../brand/voice.md) express the revised direction; the registry remains the evidence for what is implemented today.

## Research scope and interpretation

The matrix below examines ten representative products across property research, agent operations, investing, commercial intelligence and custom data workflows. It includes help documentation and concrete workflow pages, not only homepage slogans. These are vendor-published capabilities, not independently benchmarked accuracy or proof of our account access. No accounts, paid endpoints or credentials were used. Selection is representative, not a market-share ranking.

We excluded unverified customer ROI figures and a prerelease Lofty site from the comparison. Product counts and commercial terms can change. The recommendations below are our inference from the observed product surfaces and our page, not claims that competitors lack unmentioned features.

## Primary-source comparison

| Product and evidence reviewed | What the vendor presents beyond a lead list | Buyer expectation it creates | Implication for Intent Outreach |
| --- | --- | --- | --- |
| **PropStream:** [investment features FAQ](https://www.propstream.com/faqs), [Lead Automator](https://www.propstream.com/lead-automator), [comparables](https://www.propstream.com/comps-for-real-estate) | Search criteria the user can inspect and refine; property summaries; comps and investment calculators; lists that change as source data changes. | An investor can move from search to comparison and maintained criteria-based work. | An investor example needs explicit criteria, inclusion/exclusion reasons and assumptions. Another static property record is weak differentiation. |
| **DealMachine:** [feature catalog](https://www.dealmachine.com/features), [field scouting](https://www.dealmachine.com/driving-for-dollars), [mail workflow documentation](https://help.next.dealmachine.com/en/articles/16416520-how-to-send-mail) | Search, enrichment, comps, lists, API/CLI/MCP access and agents; mobile notes and tracked scouting; sequenced direct mail with a review and cost preview. | Work continues from a property found in the field through research and a planned next action. | Show how customer observations join provider records and reach an operating queue. DealMachine is a broad toolkit and potential building block, not merely a skip-trace substitute. |
| **Follow Up Boss:** [Smart Lists](https://www.followupboss.com/features/smart-list), [referral and repeat-business workflow](https://help.followupboss.com/hc/en-us/articles/13524987119639-60-Days-to-More-Referrals-Repeat-Business), [relationship model](https://help.followupboss.com/hc/en-us/articles/1500008593181-Contact-Relationships-Overview) | Filtered daily work lists, communication history, past-client/referrer grouping and custom fields. Its documentation distinguishes household relationships from referral/vendor tracking. | The next person to contact and the reason are visible; established relationships matter alongside new leads. | Include a local-agent and connector path. Model the relationship's meaning rather than placing every connection into an undifferentiated contact graph. |
| **Lofty:** [geographic farming](https://help.lofty.com/hc/en-us/articles/10099421190427-Geographic-Farming), [automatic property alerts](https://help.lofty.com/hc/en-us/articles/115002891271-Setting-Up-and-Using-Auto-Property-Alerts), [lead organization](https://help.lofty.com/hc/en-us/articles/360055290571-Lead-Organization-with-Filters) | Local marketing planning, inquiry/behavior-based property alerts, adjustable cadence and organized nurture. Its help pages describe required fields and cases where an alert will not send. | A local or metro agent sees how activity becomes relevant follow-up, with configuration tied to actual client needs. | Make geography, relationship stage, preferences and frequency visible inputs. A local use case should not be an industrial acquisition card with its title changed. |
| **Reonomy:** [commercial platform](https://www.reonomy.com/), [data/API solutions](https://www.reonomy.com/solutions/data-solutions/) | Connected property, ownership, transaction, company and occupant intelligence; enterprise API and scheduled data feeds. | Property ownership and business occupancy are linked research problems with substantial underlying data requirements. | Present asset, entity, person and occupant separately. Source licensing, entity matching and coverage are work to qualify, not benefits automatically inherited by holding another provider's key. |
| **Crexi:** [opportunity research](https://www.crexi.com/built-for-you/uncover-opportunities), [AI and workflow suite](https://www.crexi.com/ai) | Research and enrichment feed source-linked market material, deal documents, listing creation and CRM handoffs. Its enterprise offer includes customization. | Research ends in a usable client or deal artifact, not only a screen full of facts. | Include comparison packets, client material and review destinations as custom output possibilities. Source citations and customization alone are not exclusive advantages. |
| **Clay:** [CRM enrichment](https://www.clay.com/use-cases/crm-enrichment), [custom signals](https://www.clay.com/signals), [implementation partners](https://www.clay.com/en/experts) | Custom enrichment logic, provider waterfalls, scheduled or event-triggered research, CRM updates and specialist implementation services. | A workflow is something that can be assembled around first-party records, external sources and company-specific logic. | Sell implementation and operation around a defined job. A list of API logos is insufficient; show the rules, output and handoff the customer is paying to have built. |
| **Dealpath:** [pipeline management](https://www.dealpath.com/deal-pipeline-management/) | Document ingestion, configurable deal stages, tasks, approvals and committee material connect research to execution. | Investment teams need a decision trail and ownership of work after a candidate is found. | A custom acquisition workflow can end in a decision packet or pipeline task. Do not constrain the future offer to enrichment and email drafting. |
| **Rechat:** [Lucy product guide](https://help.rechat.com/guides/lucy-your-ai-assistant) | Property research, CMAs, marketing pieces, CRM notes, reminders, listing sites and summaries of client conversations. | An agent expects support for daily client work and presentation, not only cold prospecting. | Demonstrate local-agent outputs such as a client note, meeting preparation or draft market update. These require their own sources and workflow scope. |
| **REsimpli:** [feature catalog](https://resimpli.com/features/) | Property/list work, buyer management, contact roles, configurable pipelines, conditional actions, reporting and open API access. | Investors need to organize buyers, properties and the next action across a business process. | Include buyer criteria and relationship handoffs in custom discovery. Building around a customer's existing operations can be more useful than proposing a new full platform. |

The overlapping feature sets also identify possible components, integrations or alternatives. We do not need to replace a customer's useful CRM or recreate a provider's database to deliver value. Any commercial use of those sources requires appropriate access; the matrix does not assert a relationship with those vendors.

## Where the first showcase underperformed

The reviewed version at `/batchdata/` had four selectable fictional research briefs, a provider-status explanation, the bounded BatchData sandbox and an inquiry brief. Those were useful building blocks, but they left several gaps:

| Gap observed | Why it matters | Revised design requirement |
| --- | --- | --- |
| CRE and flex examples dominated the opening. | A local agent or referral-focused operator could reasonably conclude the service was for another business. | Six recognizable starting points, with the visitor's own workflow always available. |
| Every scenario produced a similar dossier and draft opener. | The page narrowed the offer to research and outbound preparation even when the customer's job was organization, comparison or an introduction. | Different output shapes: daily desk, queue, comparison, packet, relationship handoff and research map. |
| Choosing a card changed descriptive copy. | It did not demonstrate the user's requested custom approach. | Let the visitor vary objective, market, inputs and deliverable; show those choices reflected in a preview and inquiry brief. |
| Provider access and implementation status carried much of the explanation. | Visitors had to translate APIs into business value themselves. | Explain the job and output first; keep source roles and current proof visible nearby. |
| Customer-owned records were mostly a scoping afterthought. | Existing contacts, conversations and criteria are essential for relationship businesses. | Show their own records as a first-class input, alongside established data sources. |
| The main payoff was another conversation. | It did not explain the concrete implementation someone could purchase. | Describe workflow design, a bounded build and optional ongoing operation, with deliverables for each. |

Accuracy labels should stay. The remedy is a richer useful demonstration with concise labels, not an unsupported claim that the full imagined workflow is live.

## Audience, job and output map

These are proposed custom implementations, not assertions that six products already operate.

| Persona | Example job and inputs | Output worth demonstrating | Custom implementation that could be sold |
| --- | --- | --- | --- |
| **Small-town/coastal agent** | Combine known clients, new inquiries, notes and permitted local information to organize the week. | A daily relationship desk: person, context, promised action and relevant property question. | Import/cleanup, local source selection, task rules, branded client-note drafts and the agent's preferred handoff. |
| **Metro agent/team** | Bring multiple inquiry sources into a consistent process across neighborhoods and agents. | Intake board with duplicate candidates, assignment recommendation, missing context and next action. | Source adapters, identity rules, territory routing, review controls and a tested CRM destination. |
| **Investor/buy box** | Compare sourced or supplied properties with explicit strategy and assumptions. | Property comparison with fit/reject reasons, assumptions and diligence questions. | Buy-box configuration, authorized property enrichment, deterministic scenario calculations and an investment review packet. |
| **Prospector** | Turn a chosen market/profile or existing company list into a usable research queue. | Account/contact candidates with source, relevance and the next research or review action. | Data routing, matching rules, contact-role research, exclusions, bounded refreshes and draft preparation. |
| **Relationship/referral connector** | Organize who needs what, who can help and what was agreed among known contacts. | Introduction board with relationship provenance, match rationale, sharing permission and handoff owner. | Contact normalization, needs taxonomy, transparent match suggestions and introduction/follow-up records. |
| **CRE/flex operator** | Relate property, owner, business activity and confirmed space criteria to an acquisition or leasing question. | Asset/occupier research map, fit comparison or acquisition packet. | Source and coverage qualification, entity relationships, commercial rules, review interface and destination integration. |

A single customer may combine these. An agent with investor clients may need a relationship desk and a buy-box comparison. A regional broker may need both company prospecting and an owner research map. The offer should accommodate the combination rather than force a single persona category.

## Position and commercial shape

Recommended simple message: **Your market. Your relationships. Your way of working.** Follow it immediately with the concrete service: **We build custom real estate workflows around the work you need done.**

The differentiating proposition is the specific implementation we can demonstrate and agree to deliver: the customer's sources, records, rules, output and operating handoff. It is not a claim to be the only custom provider, the largest database or an already complete platform.

Possible paid deliverables are a workflow design and data-fit assessment; a bounded implementation with tests and documentation; and separately agreed operation or maintenance. A branded packet, lightweight dashboard, CRM handoff, comparison tool or daily queue can be the output. Do not promise fixed prices, savings, revenue or support terms without a scoped proposal. Provider subscriptions and usage are separate cost inputs, not hidden inside a vague automation promise.

## Concrete first pilot scope

Use one real customer's selected job, one initial input set, one output and one destination. The six public paths support discovery; they do not require building six production systems at once.

For a **local-agent relationship desk**, a bounded pilot could take an authorized export of up to 25 contacts plus customer-provided notes. It would normalize records, mark ambiguous duplicates, organize explicit promises and dates, and prepare a review queue and draft notes. Begin with a downloadable output or local review screen. A selected CRM write path becomes part of the pilot only when its field mapping and behavior are tested. This is a recommendation, not a report that the desk already runs.

For an **investor or CRE pilot**, use an equivalently bounded supplied property list and explicit criteria. Test data access and field quality before selecting the provider route. Missing ownership or business relationships remain unresolved; financial scenarios identify their assumptions. The initial success criterion is a trustworthy comparison and handoff, not a closing.

Acceptance evidence should show:

- The supplied records and sources correspond to the output; invented facts are absent.
- Rules affect inclusion, prioritization and the next action predictably.
- Duplicate or ambiguous relationships stay visible for review.
- The destination receives the intended record without unintended duplicate writes.
- Failed or unavailable data is identifiable, with observed usage and cost recorded.
- The operator can explain and use the result, supported by an operating handoff.

Message delivery remains separate from the engine's drafting and recording behavior. Existing model qualification, source licensing and live-integration gaps remain implementation facts; the custom offer does not erase them.

## Public experience and measurement

The next showcase should let a visitor choose a starting point, adjust a few meaningful choices and inspect the resulting illustrative output and scope brief. That interaction can run locally without exposing contact data or implying live searches. Keep the BatchData sandbox as an independently labeled proof module.

The inquiry should carry the chosen job, market, inputs, desired output and existing tools. The commercial question becomes clear: can we build this workflow for this business? Measure completed configurations, useful briefs and qualified requests, then use those conversations to choose the next real pilot. A pageview, a sample click or a successful sandbox request is not evidence of revenue or product-market fit.
