# 033-AT-DECR — Social-intent pack: go/no-go, boundary and platform verdicts

**Filed:** 2026-10-06 · **Status:** Proposed. Awaiting owner approval. No code.
**Beads:** epic `io-7vr` (children `.1`–`.7`) · **GitHub:** #84
**Companion plan:** `034-AT-PLAN-social-intent-pack-plan.md`
**Depends on:** the real-estate engine plan (epic `io-2yt`, decision record `031`, reserved):
schema v6 (`io-2yt.2`), Pack v2 (`io-2yt.3`), the provider layer's rate limits and cache (`io-2yt.4`),
and the human approval queue (`io-2yt.8`).

## 1. The question

A public post by @sir4K_zen (2026-10-06) describes an "intent-siphoning" play:

1. Pick about 30 B2B creators whose audience matches the ICP.
2. Watch their public comment sections for technical friction: tool complaints, "how do I" questions,
   failed setups.
3. Rank it and reply with an objective answer that solves the stated problem without pitching. The
   reply borrows the creator's reach, and a helpful answer turns a frustrated reader into inbound.

Should Intent Outreach grow a `social-reply` pack that finds and ranks that friction and drafts the
replies? If so, where is the boundary, and which platforms can we legally read?

## 2. Decision

**Conditional GO, in two gates.**

| Gate | What it decides | Condition to pass |
|---|---|---|
| **G0: manual pilot (no code)** | Does the play convert for us at all? | 30 days on the cadence in `034` §7, with replies found by hand and drafted in Claude Code. Pass = the continue criterion in `034` §7.4. Fail = stop; the build epic is never created. |
| **G1: build** | Build the `social-reply` pack on Pack v2 | G0 passed, **and** Pack v2 (`io-2yt.3`) and the approval queue (`io-2yt.8`) have shipped. Before that, the pack would need a second orchestration path or a hand-rolled approval state, and both are ruled out below. |

Why a manual pilot first: the hard parts of this play are judgment and taste (is this friction, is the
answer actually useful, does a reply from us read as help or as a pitch). None of that is proven by
building connectors. A month of hand-run replies tests the conversion hypothesis for the price of
~30 minutes a day and no engineering. If it does not convert by hand, automating the search will not
fix it.

## 3. The hard boundary (non-negotiable)

1. **The system never writes to any platform.** No post, reply, DM, follow, like, repost, vote or
   reaction. Connectors use read-only credentials and read-only endpoints. A human reads every draft,
   edits it, and posts it from their own account in the platform's own app.
2. **No DMs.** The pack has exactly one channel, `public_reply`. A DM channel is out of scope for v1.
   If it is ever added, it is gated on the person having replied to *us* first (they opened the door),
   recorded by the human, never inferred.
3. **No enrichment of commenters.** A commenter is a public handle and the words they posted. The pack
   must not chain into the enrich connectors (Apollo reveals, email finders, phone lookups) to build a
   dossier on someone who complained in a comment section. `piiPolicy` forbids it and a test proves it.
4. **Separate pack, not a core mode.** `social-reply` sits beside `b2b-sdr`. It does not reuse TCPA
   quiet hours, DNC, or the CAN-SPAM footer: those are email/phone rules and do not apply to a public
   reply. What a public reply *does* need is an FTC-style material-connection disclosure whenever the
   reply mentions our product (16 CFR Part 255, the Endorsement Guides), plus each platform's own
   anti-spam rules.
5. **Suppression is shared.** One opt-out list for the whole engine. A person who tells us to stop on
   any channel is suppressed on all of them, and a creator who asks us to stay out of their comments
   is excluded as a seed. Suppression runs ahead of the pack gate, as it does today
   (`composeGates(suppressionGate, pack)`).

Proposed new CI invariant (#7, ships with the build): **no write path to any social platform.** The
architecture test rejects any connector under the pack that calls a known write endpoint
(`POST /2/tweets`, `com.atproto.repo.createRecord`, `commentThreads.insert` / `comments.insert`,
GraphQL `addDiscussionComment`, Reddit `/api/comment`) or requests a write OAuth scope.

## 4. Platform verdicts (io-7vr.1)

Access date for every source: **2026-10-06.** "Confirmed" means the cited page was fetched on that
date and said what is quoted. "Unconfirmed" means the claim comes from a search snippet or a
secondary source and was not verified against the primary page.

| Platform | Read access for third-party threads | Terms that bite | Cost / limits | Verdict |
|---|---|---|---|---|
| **Bluesky** | Public AppView (`app.bsky.feed.getPostThread`), no auth for public reads. | Developer Guidelines ban "automated or bulk interactions, including any that would cause a notification to a user like a message, follow, like or reply" and require honoring deletions. Human-posted replies are fine. | Free. Per-IP read limit ~3,000 req / 5 min (**unconfirmed**). | **Viable.** First connector. |
| **GitHub Discussions** | GraphQL API on public repos. | AUP: API collection is not "scraping"; using information "for spamming purposes, including … sending unsolicited emails" is forbidden; "bulk distribution of promotions" and "automated inauthentic activity" are forbidden. | Free; 5,000 GraphQL points/hour. | **Viable with limits.** Seeds are tool repos, not creators. Strong fit for "failed setup" friction. |
| **X** | Pay-per-use API; read a thread via search on `conversation_id` (recent search is a 7-day window). | Since 2026-02-23, *programmatic* replies via `POST /2/tweets` are restricted to authors who mention or quote you (does not apply to replies a human posts in the app, but it shows X treats LLM reply floods as spam). Developer Agreement bars using X content to train or fine-tune a foundation model (we do not). | $0.005 per post read, capped at 3M reads/month on pay-per-use. ~65k reads/month for 30 creators ≈ $325/month (estimate, `034` §3). | **Viable with limits, cost-gated.** Phase 3, only behind a hard spend cap. |
| **YouTube** | Data API v3 `commentThreads.list`, 1 quota unit/call, 10,000 units/day default. | Developer Policies: non-authorized data may be stored "not longer than 30 calendar days"; "must not automate or trigger … comments … without the user's prior specific and express consent"; no spam or deception. | Free within quota. | **Viable with limits, owner call needed.** The API is a Google *data source*, not a Google runtime dependency (no Google SDK; plain `httpJson`), so invariant 2's import check passes, but its spirit ("zero Google dependency") is the owner's to rule on. Deferred to Phase 3. 30-day purge is mandatory. |
| **Reddit** | Data API after manual approval under the Responsible Builder Policy (updated 2025-11-11). | All Data API access now needs explicit approval; the free tier forbids commercial use; commercial use needs written approval and a contract. Prospecting is commercial. Many subreddits also ban self-promotion. | Free tier 100 QPM (non-commercial only); commercial by contract. | **Not viable for automated reads.** Manual paste only (a human copies a thread they read into the tool). |
| **Hacker News** | Algolia HN Search API and the official Firebase API, free, no auth. | HN Guidelines: "Don't post generated text or AI-edited text. HN is for conversation between humans." and "Please don't use HN primarily for promotion." | Free; Algolia ~10,000 req/hour per IP (**unconfirmed**). | **Read for themes only. Never draft HN replies.** HN friction feeds the weekly public posts (`034` §7); the gate blocks any HN reply draft. |
| **LinkedIn** | No API exposes comments on other members' posts; the Posts API covers your own posts and pages you administer. | User Agreement §8.2.2 (no "software, devices, scripts, robots … crawlers, browser plugins"), §8.2.4 (no copying information "obtained from the Services"), §8.2.13 (no "bots or other unauthorized automated methods"). | n/a | **Out**, including manual paste (§8.2.4 makes even copying into a tool doubtful). The operator may still read and reply on LinkedIn by hand, outside the tool. |
| **Threads (Meta)** | API reads replies to *your own* posts only. | n/a | n/a | **Out** (**unconfirmed**; from secondary sources). |

### Sources (accessed 2026-10-06)

- X pricing (confirmed): https://docs.x.com/x-api/getting-started/pricing — "$0.005 per resource" for
  post reads; "capped at 3 million Post reads per monthly billing cycle".
- X programmatic-reply restriction (confirmed via the @XDevelopers post as indexed by search; the
  devcommunity page returned 403): https://x.com/XDevelopers/status/2026084506822730185 ,
  https://piunikaweb.com/2026/02/24/x-api-blocks-automated-spam-replies/
- X developer agreement AI-training clause (unconfirmed against the primary page, which returned 402;
  reported by TechCrunch): https://techcrunch.com/2025/06/05/x-changes-its-terms-to-bar-training-of-ai-models-using-its-content
- X conversation threads by `conversation_id` (unconfirmed, secondary):
  https://docs.x.com/x-api/getting-started/about-x-api
- LinkedIn User Agreement §8.2 (confirmed): https://www.linkedin.com/legal/user-agreement
- LinkedIn Posts API scope (unconfirmed, secondary summary of Microsoft Learn):
  https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
- Reddit Responsible Builder Policy (primary returned 403; the approval and commercial-use terms are
  confirmed only through secondary sources, so treat as **unconfirmed**):
  https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy ,
  https://replydaddy.com/blog/reddit-api-pre-approval-2025-personal-projects-crackdown ,
  https://creatorcrawl.com/blog/reddit-api-pricing-2026/
- YouTube Developer Policies (confirmed): https://developers.google.com/youtube/terms/developer-policies
- YouTube `commentThreads.list` quota (unconfirmed, secondary + API reference):
  https://developers.google.com/youtube/v3/docs/commentThreads/list
- Hacker News Guidelines (confirmed): https://news.ycombinator.com/newsguidelines.html
- HN Algolia API: https://hn.algolia.com/api (rate limit unconfirmed)
- Bluesky Developer Guidelines (confirmed): https://bsky.network/docs/developer-guidelines/
- Bluesky rate limits (unconfirmed; primary page did not render):
  https://bsky.network/docs/advanced-guides/rate-limits ,
  https://github.com/bluesky-social/atproto/discussions/697
- GitHub Acceptable Use Policies (confirmed):
  https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies
- GitHub GraphQL rate limits:
  https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api
- Threads API scope (unconfirmed, secondary):
  https://www.socialmediatoday.com/news/meta-updates-threads-api-with-more-third-party-app-integrations/817502/
- FTC Endorsement Guides, 16 CFR Part 255: https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-255

## 5. Core vs pack (io-7vr.5)

**No new orchestration path is needed, provided Pack v2 and schema v6 land first.** A social run is the
same spine as a campaign run: a typed research query (the creator seed) goes through fixed-order
read-only connectors, each item is scored, gated, drafted, guarded, validated and recorded. The mapping
is a thread ↔ subject and a commenter ↔ `Party` with a `social_handle` `ContactPoint`.

| Stays in the core (shared by every pack) | Lives only in the `social-reply` pack |
|---|---|
| The `runCampaign` loop and its per-item failure isolation | Platform connectors (Bluesky, GitHub Discussions, manual paste; later X, YouTube) |
| Fixed-order connector registry, `httpJson`, `useSecret`, `parseVendor` | Creator seed list and its schema |
| Local store (JSONL; per-kind file, see `034` §4.4) and the `Validated<T>` brand | The friction rubric (bands, weights, freshness curve) |
| The suppression list, extended with a `handle` kind (beside `io-2yt.1`'s phone/address kinds) | The gate rules and draft rules in `034` §5–6 |
| A **touch ledger** (who we drafted to or posted to, when): b2b-sdr needs the same "already contacted" check | Prompts: `social-friction.v1.md`, `social-reply.v1.md` |
| Approval queue (`io-2yt.8`): `pending → approved → posted`, with the human recording the posted URL | Per-platform length caps and retention table |
| `guardDraft` (urls, banned phrases, quantities, voice) and `groundAngles` | The disclosure rule and pitch-language list |
| Eval-gated model calls and `CostMeter` | The eval suite fixtures (`034` §8) |
| Retention purge driven by `Fact.licenseTerms` (core: YouTube today, any licensed source later) | |

What the core must **not** gain: any poster, any write-scoped OAuth flow, any scheduler that acts on a
platform, any automatic "post on approve". Approval in this pack only ever means "a human may now post
this by hand".

## 6. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Replies read as covert marketing and the account gets flagged, or a creator calls it out publicly | High | Hard caps per creator and per day; no product mention without disclosure; the 24-hour usefulness test; a day-30 kill criterion and immediate-stop triggers (`034` §7.4). |
| Platform terms drift (X changed reply rules in Feb 2026; Reddit gated access in Nov 2025) | High | Per-platform verdicts are data in the pack, reviewed every 90 days; a platform flips to "manual only" without a code change. |
| LLM-drafted text where it is banned (HN) or unwelcome | Medium | HN replies are blocked at the gate; the human edits every draft into their own voice. |
| Retention violations (YouTube 30-day rule; Bluesky delete honoring) | Medium | `Fact.licenseTerms` carries `maxRetentionDays`; a purge runs before every run and on `list`; deleted upstream items are dropped on refresh. |
| Building it before the pilot proves it | Medium | Gate G0. The build epic is not created until G0 passes and the owner approves `034`. |
| Commenter profiling / privacy | Medium | No enrichment of commenters; store handle + quote only; suppression honored across channels. |
| Dependency slip on Pack v2 / approval queue | Low | The pilot needs neither; the build waits. |

## 7. Alternatives considered

- **Auto-reply bot.** Rejected: against the stated boundary and the terms of X, YouTube, Bluesky and
  Reddit (all quoted above), and it is exactly the spam those platforms now fight.
- **Bolt a `social` mode onto `b2b-sdr`.** Rejected: b2b-sdr's gate, footer and draft rules are email
  rules. Mixing them invites a CAN-SPAM footer on a tweet, or worse, a public reply that skips the
  disclosure rule.
- **A separate engine or repo.** Rejected: the spine (fixed connectors, gate, guard, validator, store,
  eval gate) is the expensive part and is already built; Pack v2 exists to host exactly this.
- **Buy a social-listening SaaS for discovery.** Possible later as a BYOK connector, but any such
  connector would need the same per-platform terms review, because a vendor that reads LinkedIn or
  Reddit without a licence passes that risk to us. Not evaluated in this research.
