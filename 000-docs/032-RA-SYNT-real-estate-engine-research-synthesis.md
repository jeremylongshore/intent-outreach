# 032-RA-SYNT — Real estate lead engine: research synthesis

**Type:** Research synthesis
**Date:** 2026-10-06
**Author:** Jeremy Longshore (intentsolutions.io)
**Feeds:** `031-AT-DECR-real-estate-engine-one-engine-many-packs.md` and the approved plan
(`~/.claude/plans/linear-stargazing-adleman.md`); epic [#83](https://github.com/jeremylongshore/intent-outreach/issues/83)

---

## 0. Scope and how to read this

Five research reports were run on 2026-10-06 before the real estate plan was approved:

1. Competitor and market landscape
2. Data APIs and the provider layer
3. Compliance and legal risk
4. AI-native future-proofing
5. Internal plan gap review (an architecture review of intent-outreach, coastal-realty-ops and comehomealabama)

This document keeps each report's key findings and sources. It adds nothing that is not in the reports or the
plan. Where a report flagged a claim as unverified, or gave it only from a vendor or blog page, this document
marks it **unverified**. Where reports disagree, §6 records how the plan resolved it.

**None of this is legal advice.** The compliance report says so itself and recommends written counsel review
before SMS or calling launches.

All five reports reached the same overall verdict: "one engine, many packs, thin client repos" is the right
direction, but the engine's core assumes B2B email and needs structural changes first.

---

## 1. Competitor and market landscape

### Key findings

- **Four tiers in 2026:** legacy desktop workbenches (PropStream, LoopNet, Reonomy); mobile-first lead-gen with
  bundled skip tracing (DealMachine, BatchLeads); AI ISA agents (Structurely, BoldTrail Concierge AI, LuMay);
  predictive layers (Likely.AI, SmartZip). Single-purpose tools dominate; integrated stacks are rare and
  expensive.
- **Pricing as reported:** DealMachine Pro $99–149/mo (skip trace included, 67–75% hit); PropStream $99–278/mo
  with add-ons ($0.10–0.12 per skip-trace hit); BatchLeads ~$99/mo (67–70% hit); Structurely $179–300/mo;
  SmartZip $500+/mo (72% sell-intent accuracy); Reonomy $400–4,800/yr; LandGlide $10/mo or $100/yr.
- **Gaps for small operators:**
  1. Skip-trace accuracy has stalled at 67–70%; no vendor offers a hit-rate SLA or charges on success.
  2. Compliance liability is material: TCPA exposure of $500–$1,500 per call with no aggregate cap, and the
     entity on whose behalf calls are made is liable, not the vendor.
  3. Follow-up decay: contact within 5 minutes converts 21× more than after 30 minutes; 78% of buyers work with
     the first agent who responds; 80% of sales need 5+ contacts, yet 44% of agents give up after one.
  4. Cold outbound converts under 2%; warm intent-based paths 15–30%. Signal stacking needs manual list-building
     or three platforms.
  5. Tool sprawl: five credential sets and no unified audit trail.
  6. Data accuracy: agents report 80% of skip-traced contacts are renters rather than owners.
- **"Best in class" for a solo/family operator:** under $200/mo all-in; mobile-first; speed-to-lead built in;
  compliance by default (DNC scrubbing every 31 days, TCPA disclosure, quiet hours); MCP-ready; no data lock-in
  (local, SQLite preferred, clean exports).
- **Traps:** AI voice calling without indemnification; claiming hit rates without proof; data lock-in; intent
  scoring without validation (72% accuracy still means a 28% false-positive rate); auto-sent drips (make the
  operator the decision point); mixing residential and commercial compliance.
- **Recommendation:** start with coastal Alabama residential only, then port the pattern to commercial and land.

### Notes on confidence

Most market figures (pricing, hit rates, conversion multiples) come from vendor blogs and roundup pages, not
primary studies. Treat the specific percentages as indicative.

### Sources

- https://resimpli.com/blog/batchleads-vs-propstream/
- https://www.realestateskills.com/blog/dealmachine-review
- https://forage.ai/blog/commercial-real-estate-data-tools/
- https://www.cloudtalk.io/blog/best-ai-voice-agents-for-real-estate/
- https://batchdata.io/blog/how-mcp-servers-enhance-claude-for-real-estate (also cited as `…-in-2026/`)
- https://www.retellai.com/blog/tcpa-compliance-playbook-voice-ai-outbound
- https://www.henson-legal.com/ai-voice-compliance
- https://goliathdata.com/real-estate-lead-generation-the-complete-2026-guide-for-agents-and-investors
- https://www.pinova.in/blog/real-estate-lead-response-time-data
- https://www.propstream.com/real-estate-agent-blog/how-you-can-use-real-estate-data-to-warm-up-your-pipeline-of-cold-leads-in-2026/
- https://www.artisan.co/blog/signal-based-selling-the-complete-guide-to-intent-signals
- https://reply.io/blog/intent-signals/
- https://vocalxlabs.com/blog/how-to-find-motivated-sellers-in-2026/
- https://www.dealmachine.com/blog/has-skip-tracing-gotten-more-or-less-accurate
- https://searchpartyrecruiting.com/real-estate-lead-conversion-rate-2026/

---

## 2. Data APIs and the provider layer

### Key findings

- **Provider matrix (as reported):**

  | Data class | Providers | Pricing as reported |
  |---|---|---|
  | Property/parcel | ATTOM (200 req/min, 160M parcels); Regrid (150M parcels, 10 concurrent / 200 req/min); BatchData (155M parcels) | ATTOM quote-based ~$500–2k/mo; Regrid per-record + seats; BatchData $0.01–0.03/record |
  | Ownership/entity | ATTOM; OpenCorporates (200M companies) | OpenCorporates free tier (~1,000 req/day) or $999+/mo |
  | Skip trace | REISkip; BatchData (76% match) | REISkip $0.10–0.15/matched record |
  | Equity, pre-foreclosure | ATTOM | Quote; pre-foreclosure feed ~$1,000+/mo typical |
  | Tax delinquency | County assessor (free) + ATTOM | Free / quote |
  | MLS / expireds / FSBO | Landvoice, REDX, Vulcan7; RESO Web API via a broker | $40–399/mo; broker-gated |
  | Flood | FEMA NFHL | Free |
  | Commercial | Reonomy ($400–575/user/mo), CompStak | Quote / freemium |
  | Comps | RentCast, Crexi Intelligence | Free tier to $500+/mo; quote |

- **Free county data for the target market:** Baldwin County Public GIS Hub (ArcGIS REST); Mobile County needs
  direct assessor contact; Florida Statewide Parcels portal plus Escambia (GoMaps) and Okaloosa (updated
  Mondays, FTP) county data; FEMA NFHL WMS. All four counties expose WFS/WMS REST endpoints.
- **Design guidance:**
  - **Capability routing with fallback (waterfall):** call providers in order, stop at the first match, cache
    by parcel ID + data class. The report cites match rates rising from 55–70% single-vendor to 85%+ waterfall.
  - **Multiple keys per provider** (team vs personal), per-key quota counters, alert at 80%, fall back at 100%.
  - **Cost ledger** per run and per lead, append-only, rolled up into `CostMeter`.
  - **Provenance on every record:** source, fetch time, license terms (`no_resale`, `commercial_use_ok`,
    `outreach_restricted`), cost and confidence. Outreach must reject data marked `outreach_restricted`.
- **ToS:** ATTOM and Estated prohibit resale/redistribution; Reonomy is partner-gated; MLS requires a broker
  relationship.
- **Starter cost (report's estimate):** a residential MVP of ATTOM (~$500/mo) + REISkip pay-per-match + free
  GIS + FEMA + OpenCorporates free tier, about $570–600/mo. The plan instead starts with free-tier data and adds
  a DealMachine seat ($99/mo, owner decision) after the free-tier pack proves the pipeline.

### Notes on confidence

ATTOM and several other prices are quote-based and given as estimates. The report states only DealMachine has
an MCP server; report 4 says ATTOM, BatchData and Regrid ship one too (see §6.2).

### Sources

- https://blog.iq.dwellsy.com/attom-data-overview-2026-property-ownership-and-market-data-explained/
- https://batchdata.io/blog/property-search-api-pricing-vendors-compared
- https://dealrun.ai/blog/skip-tracing-services-compared
- https://www.reonomy.com/resources/commercial-real-estate-database/
- https://api.docs.dealmachine.com/ai-assistants/mcp-server
- https://al-baldwincounty.hub.arcgis.com/
- https://www.floridagio.gov/datasets/FGIO::florida-statewide-parcels/about
- https://hazards.fema.gov/femaportal/wps/portal/NFHLWMS
- https://www.rentcast.io/api
- https://blog.opencorporates.com/2025/02/13/getting-started-with-the-opencorporates-api/
- https://estated.com/developers/docs/v4/property/overview
- https://pipeline.zoominfo.com/operations/waterfall-enrichment-tools
- https://batchdata.io/blog/tcpa-compliance-for-automated-outreach
- https://blog.scrappey.com/blog/top-10-api-for-real-estate-2026-guide

---

## 3. Compliance and legal risk

### Key findings

- **Code-enforceable safeguards:** TCPA quiet hours (the report's window is wrong; see §6); DNC scrubbing
  against the national registry plus an internal opt-out list; a service-area gate; carrier pre-screens before
  any SMS automation; the CAN-SPAM footer (physical address + unsubscribe); SPF/DKIM/DMARC and one-click
  unsubscribe for bulk email (5,000+/day); a skip-trace audit log (source API, permissible purpose, timestamp,
  user).
- **Human-process safeguards:**
  - a consent ledger (date, method, scope; revocation honored);
  - fair housing: no algorithmic filtering by protected class and no protected-class proxies;
  - probate, divorce and foreclosure targets gated to manual review;
  - an audit of each skip-trace connector's ToS (many prohibit prospecting; DPPA permissible purpose does not
    override ToS);
  - license number and broker affiliation on every outreach (Alabama Real Estate Commission; Florida FREC
    similar).
- **Gaps found in the current design:** no consent audit trail; DNC staleness; no fair-housing audit; scoring
  that could pull in credit/financial variables (FCRA permissible purpose) — exclude them; draft-only hides
  autodialer creep once a "send SMS" button exists; no probate/foreclosure gate; no license number in footers.
- **Before automated SMS or AI calling:** A2P 10DLC registration (real estate campaign type, agent + broker
  brand identity, low starting throughput); SMS-specific written consent; a STOP handler; a carrier
  do-not-originate check; TCPA recordkeeping (contact time and medium, consent, DNC check time, revocation,
  user ID).
- **Top risks (likelihood × impact):** 1. TCPA autodialer liability after SMS launch (high); 2. Fair Housing
  algorithmic discrimination; 3. GLBA Safeguards breach of skip-trace data; 4. probate/foreclosure UDAP action
  by a state AG; 5. DPPA misuse; 6. CAN-SPAM footer/unsubscribe (medium–high); 7. FCRA permissible purpose; 8.
  state mini-TCPAs (Florida FTSA up to $2,000/violation); 9. email authentication failure (high); 10. an
  unauditable consent ledger collapsing the TCPA defense.

### Notes on confidence

- The report labels itself research-level guidance, not legal advice, and recommends written review by
  telecom/FTC counsel (Alabama- or Florida-licensed) before SMS or calling launches.
- It says the HUD guidance document "requires counsel review". Its claim that HUD 2024 AI guidance is current
  is wrong (see §6).
- It notes that TCPA rules are in flux (the Eleventh Circuit's 2025 consent-rule vacatur and the revocation
  rule) and need current attorney analysis.
- **Unverified:** the Alabama statute it cites for unsolicited calls to debtors (Ala. Code § 34-27-1.01), the
  "same-day revocation (April 2025)" claim (report 4 says the revoke-all rule is delayed to January 31, 2027;
  see §6.2), and its FCC AI-voice citation, which points to Wikipedia rather than the FCC.

### Sources (as cited)

- TCPA: 47 U.S.C. § 227; *Facebook v. Duguid*, 141 S.Ct. 1163 (2021); FCC 2024 AI voice ruling, cited via
  https://en.wikipedia.org/wiki/Telephone_Consumer_Protection_Act
- DNC safe harbor: 16 CFR § 310.4(b)(1)(iii)
- CAN-SPAM: 15 U.S.C. § 7704; bulk sender rules: https://support.google.com/mail/answer/81126
- GLBA Safeguards: 15 U.S.C. § 6801 et seq.; 16 CFR Part 314
- DPPA: 18 U.S.C. § 2721 et seq.; *Kehoe v. Fidelity Federal Bank*, 135 F.3d 615 (11th Cir. 1998)
- FCRA: 15 U.S.C. § 1681
- Caller ID: 47 CFR § 64.1200
- A2P 10DLC: https://www.ctia.org/work-areas/a2p-10dlc

---

## 4. AI-native future-proofing

### Key findings

- **Vendor MCP servers exist** for DealMachine (`mcp.dealmachine.com`, OAuth 2.1 or API key), Apollo (13 tools),
  ATTOM, BatchData and Regrid (token required). Follow Up Boss has community servers only, one with 159 tools.
  ERPNext/Frappe was not researched.
- **Use them only as fixed-order connectors** the engine calls itself: a `McpConnector` with a fixed tool list,
  pinned and hashed tool definitions, a schema check on every response, and the server, version, tool and
  response hash recorded. Tool poisoning is item 3 on the OWASP MCP Top 10; over 30 MCP CVEs were filed in
  January–February 2026; a malicious `postmark-mcp` package reached about 300 organisations.
- **MLS data:** the RESO Web API is the only legitimate route. Most MLS contracts forbid AI training,
  redistribution and permanent retention, so MLS data must stay on the license holder's machine and key.
- **Agent patterns:** keep the fixed pipeline. Add an approval queue, event monitors (new listings, price drops,
  expired listings, liens), and an instant-response loop for web-form leads. Contact within 5 minutes is 21×
  more likely to qualify a lead than at 30 minutes (MIT/InsideSales).
- **Voice and SMS bots:** in February 2024 the FCC ruled that AI-generated voices are "artificial" under the
  TCPA, so marketing calls need prior express written consent. The one-to-one consent rule was struck down by
  the Eleventh Circuit and removed in 2025. The revoke-all opt-out rule is delayed to January 31, 2027 and was
  amended on September 9, 2026. California AB 2905 requires AI disclosure at the start of automated calls;
  Utah requires disclosure when asked. Bots help with consented inbound leads; cold outbound AI voice to
  skip-traced distressed owners creates liability.
- **Imagery:** Google Street View's terms forbid image analysis (and the engine forbids Google dependencies).
  Mapillary (CC BY-SA) and licensed listing photos are alternatives. Models classify building type and material
  at about 97–99%, but condition is weaker; use a condition score as a ranking signal only.
- **Evals:** HUD withdrew its 2024 AI guidance in September 2025, but the Fair Housing Act still applies.
  Researchers have documented LLMs steering home-seekers by race. Build paired tests (same lead, only a
  protected-class signal changed; score and draft must not change). Every number in a draft must trace to a
  connector fact. Check comps against recorded sale prices.
- **Cost:** Anthropic batch is 50% off and cached input 90% off; together about 5% of normal price. Run monitors
  and nightly scoring as batches.
- **Future-proofing:** name capabilities (`score`, `draft`, `classifyImage`, `extract`), not models; approve a
  model per capability through the eval gate; source and timestamp every fact; structured output everywhere;
  map vendor fields into the engine's own records.
- **Top 10 capabilities:** MCP-as-connectors; source on every fact; fair-housing paired evals; batch scoring and
  caching; human approval queue; per-capability model gate; event monitors; instant inbound loop; consent
  ledger and AI disclosure; photo condition signal.
- **Anti-patterns:** handing the model a whole vendor toolset; MLS data to a hosted model; cold outbound AI
  voice without written consent; reading Street View or scraping Zillow; a photo or neighbourhood score as the
  deciding factor (or as a proxy for race); vendor field names in `pipeline_core`; trusting a model before it
  passes the gate; agent frameworks over a capability layer.
- **12-month roadmap:** months 0–4 grounded and auditable; 4–8 always-on with a person in charge (inbound
  reply under 60 seconds); 8–12 multimodal and multichannel, re-checking the revoke-all rule before January 2027.
- **Durable bets:** MCP for data sources, schema-checked structured output, a per-capability eval gate,
  provenance, batch and caching, human approval of outbound, consent infrastructure, RESO. **Fads:** fully
  autonomous outbound agents, giant tool catalogues, cold AI voice, model-specific prompt tweaks, CRM-locked AI
  features, photo-only distress detection, unofficial Zillow APIs.

### Notes on confidence

The report says some claims come from vendor and blog pages rather than primary sources. Marked **unverified**:

- Apollo MCP being paid-only. It launched in beta for paid plans, but Apollo's product page now says any plan
  qualifies; the report calls "paid only" unconfirmed.
- The ~917-minute average agent response time (from a vendor stats page, not a study).
- ISA vendor figures: Structurely 13M+ conversations, from $499/month plus $2,000 setup; Ylopo AI Voice live
  since August 2025 (from a vendor roundup page).
- The image classification cost of about $0.001–0.01 per image (the report's own estimate).

### Sources

- DealMachine MCP: https://dealmachine.com/guides/mcp-server
- Apollo MCP: https://docs.apollo.io/docs/apollo-mcp · https://www.apollo.io/product/mcp ·
  https://builtin.com/articles/apollo-launches-claude-connector-20260225
- ATTOM: https://www.attomdata.com/data/
- BatchData MCP: https://mcpservers.org/servers/batchdataco/batchdata-mcp-server
- Regrid MCP: https://support.regrid.com/docs/mcp-server
- Follow Up Boss MCP: https://github.com/mindwear-capitian/followupboss-mcp-server
- MLS/RESO terms: https://scrapegraphai.com/blog/mls-api
- MCP security: https://www.practical-devsecops.com/owasp-mcp-top-10/ · https://pipelab.org/blog/state-of-mcp-security-2026/
- Speed to lead: https://www.sierrainteractive.com/insights/blog/speed-to-lead-real-estate/ ·
  https://agentzap.ai/blog/real-estate-lead-statistics
- ISA vendors: https://resources.rework.com/tools/ai-agents/best-ai-agents-for-real-estate-2026
- FCC and TCPA: https://www.fcc.gov/document/fcc-confirms-tcpa-applies-ai-technologies-generate-human-voices ·
  https://www.kelleydrye.com/viewpoints/blogs/ad-law-access/eleventh-circuit-vacates-tcpa-11-consent-rule ·
  https://www.burr.com/telephone-consumer-protection-act/the-fcc-delays-effective-date-of-tcpa-revoke-all-rule-until-january-31-2027 ·
  https://www.hunton.com/privacy-and-cybersecurity-law-blog/fcc-adopts-clarifying-changes-to-tcpa-revoke-all-rule-effective-30-days-after-publication
- State AI disclosure: https://www.topcalls.ai/blog/ai-disclosure-laws
- Street View terms and Mapillary: https://developers.google.com/maps/documentation/tile/policies ·
  https://www.sciencedirect.com/science/article/pii/S1353829224000728
- Building condition from imagery: https://arxiv.org/pdf/2205.14460
- Fair housing: https://naahq.org/news/hud-withdraws-fair-housing-related-guidance-documents ·
  https://dl.acm.org/doi/fullHtml/10.1145/3689904.3694709 · https://arxiv.org/html/2606.06694v1
- Batch and caching pricing: https://platform.claude.com/docs/en/build-with-claude/batch-processing ·
  https://www.finout.io/blog/anthropic-api-pricing

---

## 5. Internal plan gap review

An architecture review of the engine and the two client repos, citing file and line evidence. **Impact: high.**
The direction is sound and the invariants are the right base, but the data model, compliance gate, suppression
list and connector layer all assume B2B email.

### Ranked gaps

| # | Severity | Gap | Change | Effort |
|---|---|---|---|---|
| 1 | Critical | Gate ignores channel; runs at draft time; quiet hours default `America/Chicago` | Per-channel verdict; exported `assertSendable`; recipient time zone, most restrictive if unknown | M |
| 2 | Critical | Data model only knows companies with domains | Schema v6: Property, Party, Ownership, EntityLink, ContactPoint; keep Lead | L |
| 3 | Critical | Suppression cannot hold a phone | Add E.164 phone and mailing-address entries | S |
| 4 | High | Pack interface too thin (019's promised fields never shipped) | buyBox, dataSources, rubric, underwriting, channels, draftRules, piiPolicy, evalSuite | M |
| 5 | High | Coastal plan 026 adds a Frappe scoring/drafting path | All scoring and drafting through the engine; Frappe only ingests validated runs | S |
| 6 | High | Plan 020 puts an ERPNext upsert in an engine connector | Connector reads only; sink lives in coastal | S |
| 7 | High | No routing, fallback, cost caps, cache or rate limits; one key per connector | Capability tags, declared routing policy, credit budget, cache, token bucket, multi-key | M–L |
| 8 | High | Research input is a domain string | Pack-defined typed query | M |
| 9 | High | PII policy discards residential phones and addresses; plaintext JSONL | Per-pack PII policy; encrypted store with retention | M |
| 10 | High | Inbound leads not modeled; the form targets a function GitHub Pages cannot run, writing to retired Twenty | Form → VPS `forms-api` → ERPNext Lead + ConsentRecord → `runInbound` | M |
| 11 | Med–High | Duplicates across runs; CRM boundary undefined | ERPNext = system of record; one-way upsert out, one-way suppression pull in; SQLite store | M |
| 12 | Medium | Zip geofence hardcoded in the generic engine | Pack/profile supplies it | S |
| 13 | Medium | Channel enum is `email\|linkedin` only | Add `sms`, `mail`, `call_script`; listing-status input for NAR 16-3 | S–M |
| 14 | Medium | No fair-housing check on drafts | Port comehomealabama's `lint-fair-housing.py`; forbid age/familial status; adversarial evals | S–M |
| 15 | Medium | Evals are B2B-only | Per-pack fixtures and score bands; approval keyed by (provider, pack) | M |
| 16 | Medium | Quantity guard (#78) would reject deal-math numbers | Pass deal-math results as computed facts with provenance | S |
| 17 | Medium | Duplicate Python in coastal; `dnc_status` defaults to `"clean"` (fail-open) | Retire per 019's "Do NOT port"; keep `trade_up.py` until golden tests pass | S–M |
| 18 | Medium | Docs contradict each other (Cloud Run, Twenty, GCP pins, Cloudflare plan) | Fix the drift | S |
| 19 | Low–Med | Monorepo split (019 Stage B) never happened | pnpm workspace before packs and deal math | M |
| 20 | Medium | Vendor MCP servers would let an agent pull paid records outside the engine; `intake.connectors` unread | MCP-client adapter; wire `intake.connectors`; `list_runs`, `suppress`, `underwrite` tools | M |

### Target architecture and build order

comehomealabama (static) → VPS `forms-api` → coastal ERPNext (system of record, sink, dispatcher calling
`assertSendable`, dashboard with types generated from the engine's zod schemas) ↔ the engine (capability-routed
read-only connectors, `runCampaign`/`runInbound`, schema v6, gates, encrypted SQLite run store, MCP + CLI).
Packages: `engine`, `packs/{b2b-sdr, residential-re, commercial-re, land, mhp}`, `deal-math` (pure TypeScript,
integer cents, basis points, explicit assumptions, golden tests from `trade_up.py`).

The review's build order (docs and boundaries → small compliance fixes → workspace → schema v6 → Pack v2 →
routing → deal math → residential pack → coastal sink and inbound → vendor MCP) is the order the plan adopted.
Items 1, 2 and 7 are called out as the expensive ones to change later.

The workspace step was later amended: `031` §2.1 keeps the engine at the repo root, uses npm workspaces, and
puts only standalone libraries (first `packages/deal-math`) under `packages/*`.

### Notes on confidence

This report reviewed code and docs directly; its evidence is file and line references, not web sources. Line
numbers are as of 2026-10-06. It routes the inbound alert to Slack; the plan routes it to Buzz `mandy-leads`.

### Sources

Internal: intent-outreach (`models.ts`, `packs/types.ts`, `pipeline.ts`, `compliance/index.ts`,
`compliance/suppression.ts`, `connectors/registry.ts`, `connectors/types.ts`, `connectors/_shared.ts`,
`cost.ts`, `http.ts`, `draft-guard.ts`, `profiles.ts`, docs `019`, `020`, `022`); coastal-realty-ops
(`CLAUDE.md`, `requirements.txt`, `lead.py`, `src/orchestrator/compliance.py`, `trade_up.py`,
`web/shared/types/consent.ts`, docs 018, 025, 026, 033); comehomealabama (`contact.astro`, `CLAUDE.md`,
`README.md`, `scripts/journal/lint-fair-housing.py`).

---

## 6. Contradictions resolved

### 6.1 Resolved by the plan

| Claim in the research | What the plan uses |
|---|---|
| Block calls 8pm–8am (report 3) | TCPA allows **8am–9pm recipient-local**; unknown time zone → most restrictive window |
| HUD 2024 AI guidance is current (report 3) | **Withdrawn September 2025** (report 4); the Fair Housing Act still applies, so paired evals stay |
| "No synthetic voice" (report 3) | The FCC (2024) treats AI voice as artificial voice, requiring **prior express written consent**; the plan **never ships AI calling** |
| Apollo MCP is paid-only (report 4) | **Unconfirmed** (Apollo's page now says any plan); irrelevant to this plan |

### 6.2 Other discrepancies between reports, left open

These are not resolved by the plan. None changes a decision in `031`; each should be checked when the phase
that depends on it starts.

- **Which vendors ship MCP servers.** Report 2 says only DealMachine has one; report 4 cites servers for
  ATTOM, BatchData and Regrid as well. The plan's MCP adapter names all four. Confirm per vendor in Phase 4.
- **Opt-out revocation timing.** Report 3 says revocation must be honored same-day (an "April 2025" trend);
  report 4 says the revoke-all rule is delayed to January 31, 2027 and was amended September 9, 2026. Counsel
  review (owner decision 4) covers this before any SMS.
- **Skip-trace and waterfall match rates.** Report 1: 67–75% single-vendor hit rates. Report 2: BatchData 76%;
  55–70% single-vendor rising to 85%+ with a waterfall. The plan cites roughly 60% → 85%. All are vendor
  figures; measure actual rates in the residential live run.
