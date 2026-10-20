---
date: 2026-10-17
status: evidence-prepared-model-qualification-open
bead: io-0pr
source_revision: 1efc0a4f
---

# Gulf Coast trade-business research pilot

Three source-backed business briefs are ready for review. They demonstrate how
Intent Outreach can organize public company evidence and the next research
questions. They are **not qualified tenant leads, a space-demand shortlist or a
model-generated CRE workflow**. No businesses were contacted.

The [structured packet](../research/cre-pilot/2026-10-17-gulf-coast.json) contains
field-level source references, retrieval timestamps, HTTP status and source HTML
hashes. The [validation receipt](../research/cre-pilot/2026-10-17-source-checks.json)
binds the packet hash and records 19 source-token checks.

## Market and selection

This is a purposive sample of three trade/service businesses with a published
address in Daphne, Fairhope or Foley, Alabama, one per town. HVAC, refrigeration
and electrical service provide a concrete starting point for questions about
vehicles, stock and work areas. Those questions are a workflow-design rationale,
not evidence that a particular company needs flex space.

The sample was selected for inspectable company or local chamber sources. It is
not representative market research, an exhaustive prospect search, a size-ranked
list or an assertion of growth. No employee count, revenue, property valuation,
lease expiration or minimum square footage was assumed. A service-area page alone
was insufficient to establish a business location.

## Three reviewable briefs

| Business | Published address and its meaning | Public professional role | Immediate research disposition |
| --- | --- | --- | --- |
| Air Solutions Heating & Cooling | 1410 US Highway 98, Suite N, Daphne, AL 36526. The company labels this an office. | Reaves Nelson is identified as founder on the company About page. | Keep the office association; ask whether any equipment/storage requirement exists before considering space. |
| Ingersoll's Air Conditioning and Heating Inc. | 762 Nichols Ave, Fairhope, AL 36532. Published company contact address. | Unknown in the reviewed About and Services pages. | Identify the appropriate operational role first; do not derive a person from an email handle. |
| Hellmich Electric | 903 W. Laurel Ave., Foley, AL 36535. Address listed by the South Baldwin Chamber. | The chamber lists Gary Hellmich as Owner of the business. Current role is unconfirmed. | Reconfirm the business domain, address and role before treating the listing as a current operating record. |

Air Solutions describes HVAC work including commercial service. Its
[About page](https://airsolutionspros.com/about-us/) supports the company and
founder statements; its [Contact page](https://airsolutionspros.com/contact-us/)
supports the advertised office address. A founder role is not evidence of parcel
ownership or authority to lease premises.

Ingersoll's [Services page](https://ingersollac.com/services/) describes commercial
and residential maintenance and publishes the address. Its
[About page](https://ingersollac.com/about-us/) supplies the company name but does
not establish a named management role. The site uses variations of its business
name; legal entity identity was not checked.

The [South Baldwin Chamber listing](https://business.southbaldwinchamber.com/list/Details/hellmich-electric-4615555)
supports Hellmich's electrical-contractor category, address and listed business
role. A chamber member listing is not a government officer register or a title
record. A direct fetch of its listed company website did not succeed in the web
reader (502); that does not establish that the company is inactive.

All five evidence pages were independently fetched on October 17, 2026 and
returned HTTP 200. Content publication/update dates were not established. A
retrieval date is not the date a role, address or other fact became true. Source
pages may change after the recorded observation.

## Relationships and unknowns

Every record keeps these separate:

- **Company → advertised address:** source-asserted office/contact/listing link.
- **Person → company role:** source-asserted business role, or explicitly unknown.
- **Company/person → parcel ownership:** unknown; no parcel or title research run.
- **Company → occupancy/tenure:** unknown; no lease, title or independent occupancy evidence.
- **Company → requirement and decision authority:** unknown; no verified demand,
  budget, timing, dimensions, power, loading, access, yard, zoning or representative authority.

No contact channel was collected into the packet. Public role names remain
professional context only. Email deliverability, consent and suppression were
not checked; sending is not authorized. No campaign store records were written.
No company was labelled a tenant, owner of real estate, relocating or space-fit.

The next useful artifact is a requirements sheet supplied by an authorized
business representative, followed by a property comparison against those actual
requirements. There is no basis for a relocation pitch in the present evidence.

## Existing integration path: what source actually supports

| Component | Implemented behavior at the source revision | Pilot boundary |
| --- | --- | --- |
| [Apollo](../pipeline_core/connectors/apollo.ts) | Organization lookup by domain, people search and up to three people reveals per researched domain; missing-email enrichment. Research can consume reveal credits. | Not called. Domain/role matches need review; vendor contacts do not prove ownership, tenancy, authority or demand. No current entitlement, quota or price assumed. |
| [Hunter](../pipeline_core/connectors/hunter.ts) | Domain search and name/domain email finding. The adapter maps finder results into the field named `verifiedEmail`. | Not called. The implemented adapter does **not** invoke `email-verifier`; that field name is not proof of independent deliverability verification. Unknown-role Ingersoll is not ready for name-keyed enrichment. |
| [B2B records](../pipeline_core/models.ts) | `Lead` and `Contact` record company and person information. | They do not supply a CRE company-to-address/occupancy requirement contract. The pilot's explicit relationship data stays in the review packet, not silently flattened into lead scoring. |
| [Pack registry](../pipeline_core/packs/index.ts) | Built-ins are `b2b-sdr` and `residential-re`. | No shipped CRE/flex pack or live tenant-demand matcher. |

No new connector or production schema was needed to gather this public evidence.
Existing adapter and eval-gate tests were run without keys or network:
`pnpm exec vitest run tests/connectors.test.ts tests/eval-gate.test.ts --reporter=dot`
passed **177 tests in two files**. These checks cover adapter behavior and gate
mechanics, not these companies' provider coverage or model quality.

## MiniMax qualification remains a separate gate

The [approval registry](../evals/supported.ts) records MiniMax-M3 for `b2b-sdr`
and MiniMax-M3.1-Flash-Preview for `residential-re`. The
[October 11 activation observation](../evals/results/2026-10-11-minimax-M3-sops-activation.json)
explicitly says `qualifiedWorkflow: false`. Credentials, availability and an
approval for a different pack cannot qualify this CRE workflow. This pilot made
**zero model calls and zero paid provider calls** and changed no approval records.

`io-0pr` stays open: its acceptance requires both a reviewed real evidence packet
and a qualified model route. The bounded next qualification gate is:

1. Agree the CRE research output contract: per-claim source, relationship type,
   observation time, unknowns and separate requirements supplied by a representative.
2. Implement the exact research seam/pack and freeze its prompt and source identity.
   Use fixtures for these three evidence shapes plus absent/conflicting address,
   unknown/stale role, registered-agent confusion, service-area-only location,
   unsupported ownership/relocation, prompt injection and absent space requirements.
3. Require schema and source grounding, explicit unknown preservation, no inferred
   tenancy/demand or personal contact generation, and correct abstention on missing
   facts. A generic B2B score is not a CRE space-fit measure.
4. Run the real keyed gate for the exact model and pack under a separately bounded
   admission budget, at least three repeats with every fixture passing, and an
   independent source/claim review. Commit failures as well as passes. Only then
   consider a pack-specific promotion; preserve existing gates and receipts.

This is an acceptance design, not a claim that those fixtures or a CRE model route
have already been implemented or passed. It follows the evidence limits and
source policy in [council decision 037](037-AT-DECR-delegated-outreach-council.md).
Baldwin county vendor restrictions remain intact; no county endpoint was used.

## Review and source handling

The mechanical validation checked that each chosen token occurs in the referenced
retrieved page, every unsupported relationship remains null/unknown, and contact
collection/enrichment/send flags remain false. This establishes traceability and
internal consistency, not independent verification of a company's statements.
Only short factual observations and hashes are committed; full third-party page
copies and personal contact details are not included. Reviewers can follow the
source URLs and compare the exact structured claims.

Independent review of this packet is required before calling its evidence phase
reviewed. No changes to the public demo's maturity claims follow merely from this
research. Durable acceptance status remains in Beads.
