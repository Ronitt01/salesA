# HUNTER progress tracker

Last updated: 16 November 2026 (Hunter.io contact discovery and email verification).

Status key: **Done** = built and verified by a test or a browser check. **Partial** = some of it works; the gap is stated. **Not started** = no code yet.

## Where things stand

Phase 0 and Phase 1 are complete. Parts of Phases 2, 3 and 5 were pulled forward because the database was available from day one. Phase 4 has started: the compliance gate and the approval queue work. **Nothing in the product can transmit a message yet**: live sending is off and only a mock delivery adapter exists, so an approved message is recorded as approved, never as sent.

Sprint 2 built the core AI framework (see below). **No AI agent is connected to a workflow or screen yet**, and the live Anthropic and Gemini paths have been tested only against fake HTTP transports, because no API keys are configured.

Verified on 16 November 2026:

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm test` (unit) | 293 passed |
| `npm run test:integration` | 51 passed |
| `npm run test:e2e` | 24 passed |
| `npm run build` | Pass |
| `npm run check:bundle` | Pass, no server secrets in client files |

## Phase 0 — Setup: Done

- Next.js 16.4, TypeScript, Tailwind v4, shadcn/ui, Recharts, Zod.
- Local Supabase stack on ports 55321–55329.
- Git repository, one commit per phase.

## Phase 1 — Product foundation and dashboard: Done

- Design system (dark tokens, validated chart palette), collapsible sidebar, header with search, notifications, system status, demo label, user menu; mobile drawer.
- Overview: 8 KPI cards with comparisons and tooltips, 6 charts, 7 supporting sections, date filters (today / 7 / 30 / 90 / custom), daily/weekly toggle.
- Lead Explorer: 14 columns, 14 filters, sorting, pagination, saved filters, bulk tagging, CSV export, duplicate flag.
- Lead detail: all 19 sections, facts separated from hypotheses, full score explanation.
- Companies, Opportunities (pipeline board, stage changes with won/lost capture, create), Settings (outreach mode, kill switch, limits, industries, service catalogue, channel policies, providers, team, demo reset).
- Read-only screens so no navigation item is empty: Contacts, Campaigns, Conversation Centre, Meetings, Market Intelligence, Automations, Analytics.
- Loading skeletons, empty states and an error boundary on every screen.

## Phase 2 — Backend: Mostly done

| Item | Status |
|---|---|
| Supabase integration, migrations (27 tables), generated types | Done |
| Authentication (email/password, demo sign-in), session refresh in `proxy.ts` | Done |
| Row Level Security with roles (owner, admin, member, viewer) | Done, tested |
| Tenant isolation with composite foreign keys | Done, tested |
| Seed data and demo reset | Done, tested |
| Zod validation on every server action and the export route | Done |
| CRUD: leads and opportunities create/edit; services, industries, workspace edit | Done |
| CRUD: contacts, campaigns, meetings create/edit | Not started |
| Rate limiting on API routes | Not started |
| Structured logging | Partial: actions log JSON on failure only |
| User invitation and workspace switching | Not started (one workspace per user is assumed) |

## Phase 3 — Intelligence: Partial

| Item | Status |
|---|---|
| Deterministic scoring engine and contact reliability score | Done, tested |
| Rescore service writing snapshots | Done, tested |
| Industry attractiveness score (assumptions blended with actuals) | Done, tested |
| Rule-based daily insights and industry recommendations | Done, tested |
| AI framework: provider interface, Anthropic adapter, deterministic mock, runner, guards, prompts, execution log | Done, tested (Sprint 2). Live Anthropic call not yet verified |
| Contact enrichment and email verification (Hunter.io) | Done, tested against a fake. Live calls blocked by the Hunter account restriction (see below) |
| Search, discovery and website research providers | Not started |
| Company discovery workflow (WF-01) | Not started |
| Research and signal detection (WF-02) | Not started |
| Service matching by AI | Not started (demo opportunities are seeded; people can create them) |

## Sprint 2 — Core AI framework: Done

Details in [docs/ai-framework.md](docs/ai-framework.md).

| Item | Status |
|---|---|
| `LlmProvider` interface; environment-based selection (`LLM_PROVIDER`), no silent fallback to the mock | Done, tested |
| Anthropic adapter on the official SDK (`@anthropic-ai/sdk` 1.8.0): structured output, per-prompt effort, server-side refusal fallback | Done, tested against a fake transport. **Not yet run against the live API** |
| Deterministic mock provider with honest, synthetic fixtures | Done, tested |
| Runner: input validation, timeouts, bounded retries, `retry-after`, total deadline, JSON parsing, Zod validation, post-validation guards | Done, tested |
| Security: server-only modules, key redaction, untrusted-content delimiting, injection detection, strict schemas, evidence and promise guards | Done, tested |
| Six versioned prompt files with an append-only version lock | Done, tested |
| `ai_executions` table (append-only, tenant RLS) and structured logger | Done, tested |
| OpenAI adapter | Not started (reserved; selecting it is a configuration error) |
| Any agent wired into a workflow or screen | Not started |

Decisions:

- **One new dependency**, the official Anthropic SDK. The Claude API guidance requires the SDK rather than raw HTTP in a TypeScript project.
- **One new table**, `ai_executions`. Neither `workflow_executions` nor `audit_logs` fits model calls.
- **Default model `claude-opus-5-5`.** Override with `ANTHROPIC_MODEL` if you prefer a cheaper model; that trade-off is yours to make.
- **Server-side refusal fallback is enabled.** If the model declines a request on safety grounds, Anthropic re-runs it on its recommended fallback model. The model that answered is recorded. To turn it off, remove `fallbacks` and the beta in `providers/anthropic.ts`.
- **Injection detection logs but does not block.** Real web pages can contain such phrases. Strict schemas and evidence guards are the containment.

## Gemini provider: Done

Added after Sprint 2. Details in [docs/ai-framework.md](docs/ai-framework.md#providers).

| Item | Status |
|---|---|
| Gemini adapter on `@google/genai` 3.3.0, same `LlmProvider` interface | Done, tested against a fake transport. **Not yet run against the live API** |
| `LLM_PROVIDER=gemini`, `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-3.8-flash`) | Done, tested |
| No fallback: a missing Gemini key or a Gemini outage is a failure, never another provider | Done, tested |
| Provider and served model recorded in `ai_executions` (constraint widened by migration `20261116000200`) | Done, tested |
| `npm run ai:smoke:gemini` | Done (fails cleanly without a key) |

Unchanged: the Anthropic adapter, the mock, prompts, schemas, guards and all business logic. One extra fix: `src/server/env.ts` now accepts `LLM_PROVIDER=gemini`. Without it, choosing Gemini would have broken every page, not just AI calls.

## Hunter.io contact discovery: Done (live path blocked)

Details in [docs/contact-enrichment.md](docs/contact-enrichment.md).

| Item | Status |
|---|---|
| Hunter client: Domain Search, Email Finder, Email Verifier, Account; Zod-validated; timeouts, bounded retries, rate limits, 15 error kinds, credit tracking, redacted logs | Done, 25 unit tests against a fake fetch |
| Deterministic, configurable decision-maker ranking | Done, tested (38 unit tests cover ranking, policy, merge and status mapping) |
| Enrichment policy: no demo data, researched companies only, minimum score, cooldowns, per-run limits | Done, tested |
| Merge rules: no duplicates, manual data and manual verification preserved, confidence-based replacement, field provenance | Done, tested (unit and 15 integration tests) |
| Exact Hunter result kept in `contact_verifications.detail`; only `valid` counts as deliverable | Done, tested |
| Lead page: Enrich contacts, Verify email, confidence, source, last verification; Contacts screen confidence column | Done, 1 browser test |
| `npm run hunter:smoke` (test key) / `npm run hunter:smoke:live` | Test key: 3/3 endpoints pass. **Live: the key authenticates but Hunter returns 429 `restricted_account` for every search and verification.** No credits spent |

Schema: migration `20261117000100_contact_enrichment` adds `contacts.email_confidence` and `contacts.field_provenance`. No new tables. The scoring formula is unchanged; enrichment calls `rescoreCompany`. Nothing is sent and nobody is contacted.

## Phase 4 — Sales execution: Started

Database guards exist and are tested (suppression blocks enrolment, a new suppression stops sequences and cancels unsent messages, booked meetings require a prospect-chosen slot).

- [x] Compliance gate service (`src/server/services/compliance/gate.ts`): 17 checks covering kill switch, channel policy, automation, consent, suppression, address, outreach mode, campaign status, three daily limits, idempotency, supported facts and opt-out. Pure function, 21 unit tests
- [x] Approval queue in the Conversation Centre: approve and reject, gate result stored on the message and shown check by check, every decision audited. 5 browser tests
- [x] Email delivery adapter interface with a mock that never transmits
- [ ] Editing a draft before approval
- [ ] A real email delivery adapter, and the unsubscribe endpoint
- [ ] Message generation with supported-facts check (the gate currently verifies that cited fact ids exist; it does not read the message text)
- [ ] Follow-up sequencer with stop conditions
- [ ] Reply classification and reply drafting, human takeover
- [ ] Calendar adapter, slot suggestions, booking, rescheduling, cancellation
- [ ] Campaign create/edit, enrolment, pause/resume
- [ ] Contact suppression and consent actions in the UI
- [ ] Floating AI copilot

## Phase 5 — Automation and analytics: Partial

| Item | Status |
|---|---|
| Analytics screen (funnel, quality, conversion, revenue, team, data quality, workflows) | Done for date filters |
| Analytics filters by industry, geography, campaign, channel | Not started |
| Market Intelligence screen | Done |
| Automations screen (jobs, execution history, errors) | Read-only |
| Workflow runner, run/retry/pause/resume controls | Not started |
| n8n webhooks with signature validation | Not started |
| Importable n8n workflow templates | Not started |

## Known gaps and decisions

- **The copilot is not built.** No assistant button is shown, because a button that did nothing would break the "no non-functional controls" rule.
- **Localisation readiness is partial.** Enum labels and formatting are centralised (`src/lib/labels.ts`, `src/lib/format.ts`); page copy is still inline English.
- **Service catalogue prices are placeholders** and each row is flagged "review needed" until an admin confirms it.
- **Channel policies for India are operating rules, not legal advice.** They need review before any live sending.
- **The project sits in a OneDrive folder.** No file-locking problems occurred, but if builds fail with `EPERM`, pause OneDrive sync or move the project.
- The first three migrations were edited before the first commit; from now on, schema changes are new migration files.

## Next session: start here

1. Verify the live providers: with `ANTHROPIC_API_KEY` set, run `npm run ai:smoke -- --provider=anthropic`; with `GEMINI_API_KEY` set, run `npm run ai:smoke:gemini`. Once the Hunter account restriction is lifted, run `npm run hunter:smoke:live`. Note the results here.
2. Wire the first agents onto the framework: reply classification (WF-05) with the deterministic opt-out override, then outreach draft generation feeding the approval queue.
3. The follow-up sequencer with stop conditions, calling the same compliance gate with `actor.kind = "automation"`.
4. Suppression and consent actions in the Contacts screen, and the unsubscribe endpoint.
5. Data provider interfaces (search, website fetch) so the researcher and signal detector receive real pages.
