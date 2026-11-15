# Agent and intelligence design

This document separates what is **built** from what is **planned**. See `PROGRESS.md` for the live status.

## Principle

Models gather and phrase; deterministic code decides. A model may propose research, a hypothesis or a draft. It may never set a score, qualify a lead, grant itself permission to send, or state a fact without evidence.

## Built

### Lead scoring engine

`src/server/services/scoring/engine.ts`. Pure function, version `1.0.0`. Same input, same output; the clock is passed in.

| Factor | Max | Inputs |
|---|---|---|
| ICP fit | 30 | Target country (8), employee range inside 10–200 (14), industry in the active catalogue (4), website identified (4) |
| Evidence of relevant problems | 25 | Observed facts with evidence, 3 each up to 4 (12); live signals, 3 each up to 3 (9); an evidenced problem mapped to an active service (4) |
| Decision-maker accessibility | 15 | Contact seniority (8/5/2), email verification (5/2/0), a second route to the company (2) |
| Commercial potential | 15 | Team size as a budget proxy (up to 7), number of locations (up to 3), estimated engagement value (up to 5) |
| Timing and recent signal | 10 | Freshness of the newest live signal (6/4/2), a verified signal (2), multiple signals (2) |
| Delivery fit | 5 | Need maps to a service we deliver (3), same country (2) |

Priority: **A** 80–100, **B** 65–79, **C** below 65.

**Qualification gate.** A score alone never qualifies a lead. All of these must hold:

- Score of 65 or more
- At least 2 observed facts with evidence
- At least 1 live buying signal (not expired, not rejected)
- Employee range known and not 1–9 or 500+
- A contact exists, is not suppressed or do-not-contact, has an email that is not invalid or unverified, and has reliability of 60 or more

Every failed rule is stored as a plain-language reason and shown on the lead.

### Contact reliability score (0–100)

Source of the contact (up to 25), verification result (up to 35), email domain matches company domain (up to 15), role relevance (up to 15), recency of verification (up to 10). A suppressed or do-not-contact person scores 0.

### Rescoring

`rescoreCompany()` loads current evidence from the database, runs the engine, writes a `lead_score_snapshots` row with the exact inputs and per-factor explanation, and updates the company. It is the only code that writes a score. It runs when a lead is created or edited and on demand.

Stage effects are deliberately narrow: a newly qualified pre-outreach lead becomes "qualified"; a lead at "qualified" that no longer qualifies returns to "verified". Later stages are never moved by a rescore.

### Industry attractiveness score

`src/server/services/market/industry-score.ts`. Blends an assumption score (six 0–10 ratings from `industry_experiments`) with an actual score from results. The weight on actuals is `(contacted + 5 × won) / 25`, capped at 1. In the actual score, 55 of 100 points come from deal size, gross margin and return on acquisition cost, so reply counts alone cannot rank an industry highly.

### Daily insights and recommendations

`src/server/services/analytics/insights.ts`. Fixed rules over computed metrics. Every sentence carries the figures it came from. Rates are not compared below 5 contacted companies. **No model writes these**, and the interface says so.

## Planned

### Provider-independent LLM layer

Interface with three adapters: Anthropic, OpenAI and a deterministic mock. Structured output validated with Zod; a response that fails validation is retried, then rejected. The Anthropic adapter must be written against the current API reference, not from memory.

### Agents

Each is a narrow function with typed input and output, not one large prompt.

| Agent | Input | Output | Guard |
|---|---|---|---|
| Research | Fetched pages from permitted public sources | Observed facts with URL and quote; signals | A fact without a URL is discarded. Page text is passed as quoted data and cannot change instructions. |
| Service matching | Facts, service catalogue | Hypothesis, recommended service, validation questions, outreach angle | May cite only stored facts. No savings, ROI or dates. |
| Outreach drafting | Facts, opportunity, contact | Subject and body, plus the fact ids relied on | A second pass checks every claim against the cited facts; unsupported claims block the draft. |
| Reply classification | Message, thread | One of 10 intents with confidence | Low confidence becomes "human review required". Unsubscribe and complaint are also detected by fixed rules. |
| Reply drafting | Thread, approved company information | Draft reply | Cannot invent pricing, discounts or delivery dates; must not claim to be human. |
| Copilot | User question | Tool calls against repositories | Tools run with the user's own permissions. Consequential actions need explicit confirmation. Cannot bypass the compliance gate. |

### Prompt-injection stance

Retrieved web content and inbound email are untrusted. They are passed to models as delimited data, never concatenated into instructions, and no tool that can send or change data is available to an agent that reads untrusted text in the same call.
