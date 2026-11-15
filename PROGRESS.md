# HUNTER progress tracker

Last updated: 15 November 2026 (Phase 1 complete; Phase 4 started).

Status key: **Done** = built and verified by a test or a browser check. **Partial** = some of it works; the gap is stated. **Not started** = no code yet.

## Where things stand

Phase 0 and Phase 1 are complete. Parts of Phases 2, 3 and 5 were pulled forward because the database was available from day one. Phase 4 has started: the compliance gate and the approval queue work. **Nothing in the product can transmit a message yet**: live sending is off and only a mock delivery adapter exists, so an approved message is recorded as approved, never as sent.

Verified on 15 November 2026:

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm test` (unit) | 70 passed |
| `npm run test:integration` | 27 passed |
| `npm run test:e2e` | 23 passed |
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
| LLM provider abstraction (Anthropic, OpenAI, mock) | Not started |
| Search, discovery, website research, enrichment, verification provider interfaces and mocks | Not started |
| Company discovery workflow (WF-01) | Not started |
| Research and signal detection (WF-02) | Not started |
| Service matching by AI | Not started (demo opportunities are seeded; people can create them) |

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

1. The LLM abstraction with a deterministic mock (load the Claude API reference before writing the Anthropic adapter), then message generation and reply classification on top of it.
2. The follow-up sequencer with stop conditions, calling the same compliance gate with `actor.kind = "automation"`.
3. Suppression and consent actions in the Contacts screen, and the unsubscribe endpoint.
4. The floating copilot, using repositories as tools.
