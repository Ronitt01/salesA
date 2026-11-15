# Testing

## Suites

| Suite | Command | Needs | What it covers |
|---|---|---|---|
| Unit | `npm test` | Nothing | Scoring engine, contact reliability, compliance gate, industry score, insights, date ranges and timezones, formatting, URL parameters, demo dataset generator, AI framework (provider selection, mock, Anthropic and Gemini adapters against fake transports, retries, rate limits, invalid JSON, schema and guard failures, prompt injection, secret redaction, prompt version lock), Hunter client against a fake fetch (parameters, parsing, credits, retries, rate limits, every error status, verifier polling, timeouts, log redaction), enrichment ranking, policy, merge rules and status mapping |
| Integration | `npm run test:integration` | Local Supabase running | RLS tenant isolation, roles, deduplication, suppression and do-not-contact guards, meeting and evidence constraints, rescoring, demo seed and reset, AI execution log (tenant isolation, append-only, constraints), contact enrichment with a scripted Hunter fake (provenance, no duplicates, manual data preserved, failures leave contacts unchanged, guards before paid calls, tenant isolation) |
| Browser | `npm run test:e2e` | Local Supabase + `npm run db:seed` | Sign-in, every navigation item, dashboard, filters, lead create/edit, saved filters, bulk tags, export, approval queue and compliance gate, enrichment controls on demo data, phone layout |
| Static | `npm run typecheck`, `npm run lint` | Nothing | Types and lint rules |
| Build | `npm run build && npm run check:bundle` | `.env.local` | Production build; no server secret in browser files |

None of the suites needs AI credentials: the AI tests use the mock provider, scripted providers and fake HTTP transports for the Anthropic and Gemini adapters. A live call is checked separately with `npm run ai:smoke`. Likewise no suite calls Hunter.io: `npm run hunter:smoke` checks the endpoints with Hunter's free test key, and `npm run hunter:smoke:live` with the real key.

Integration tests refuse to run unless `NEXT_PUBLIC_SUPABASE_URL` points at localhost. They create their own workspaces and users and delete them afterwards. Browser tests remove the companies and saved filters they create (names start with "E2E Test").

## Last full run: 16 November 2026

| Suite | Result |
|---|---|
| Type check | Pass |
| Lint | Pass |
| Unit | 293 passed, 0 failed |
| Integration | 51 passed, 0 failed |
| Browser | 24 passed, 0 failed |
| Build | Pass |
| Bundle secret scan | Pass |

## Acceptance checklist

Status against the 20 acceptance criteria. "Verified" names the test or check that proves it.

| # | Criterion | Status | Verified by |
|---|---|---|---|
| 1 | Application starts locally | Met | Browser suite runs against `npm run dev`; `npm run build` passes |
| 2 | Dashboard renders correctly | Met | e2e "renders eight KPI cards, six charts…" |
| 3 | Sidebar navigation works | Met | e2e "every sidebar item opens a working page" |
| 4 | Charts render from database or labelled demo data | Met | e2e checks drawn chart marks; metrics come from SQL functions; demo label asserted |
| 5 | Lead records can be created and edited | Met | e2e "a lead can be created, is scored, rejects a duplicate, and can be edited" |
| 6 | Company research records can be stored | Met | integration "stores research, rescores…"; evidence constraint test |
| 7 | Evidence is visible on lead detail pages | Met | e2e "lead detail separates observed facts from AI hypotheses…" |
| 8 | Lead scoring is deterministic and tested | Met | unit `scoring.test.ts`; integration rescore twice gives the same total |
| 9 | Duplicate prevention works | Met | integration "duplicate prevention" (5 tests); e2e duplicate domain refused |
| 10 | Permission gates block disallowed outreach | Met | unit `compliance-gate.test.ts` (21 tests: kill switch, missing policy, human-only channels, consent, suppression, modes, limits, idempotency); e2e kill switch and paused campaign block approval; integration tests for the database guards |
| 11 | Unsubscribed contacts cannot re-enter campaigns | Met | integration "blocks an unsubscribed contact…", "blocks even the service role…" |
| 12 | Message generation returns structured output | **Not met** | Message generation is not built |
| 13 | Conversation classification works on sample cases | **Not met** | Classifier is not built; seeded replies carry stored intents only |
| 14 | Meeting slots respect timezones | **Partly met** | Timezone maths is unit-tested and meetings display in workspace and prospect timezones. Slot suggestion is not built |
| 15 | n8n webhook errors are handled | **Not met** | Webhooks are not built |
| 16 | RLS prevents cross-tenant data access | Met | integration "row level security: tenant isolation" (9 tests) |
| 17 | API keys are not exposed to the frontend | Met | `npm run check:bundle` |
| 18 | There are no broken navigation controls | Met | e2e navigation, search, sidebar collapse, phone drawer |
| 19 | Empty and loading states work | Met | e2e empty-state test; skeletons render as the static shell in `npm run build` |
| 20 | TypeScript, linting and tests pass | Met | See "Last full run" |

**15 met, 1 partly met, 4 not met.** The unmet items belong to the remaining parts of Phase 4 (message generation, reply classification, slot suggestion) and Phase 5 (n8n).

## Adding tests

- Pure logic goes in `tests/unit/`. Pass the clock in; never call `Date.now()` inside logic under test.
- Anything that depends on a constraint, trigger or policy goes in `tests/integration/` and asserts the Postgres error code.
- A new screen gets a line in the `ROUTES` list in `tests/e2e/app.spec.ts` and, if it has controls, its own test.
