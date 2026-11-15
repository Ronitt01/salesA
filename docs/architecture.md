# Architecture

## Shape of the system

```
Browser
  │  HTTPS, session cookie
  ▼
Next.js 16 (App Router)
  ├─ src/proxy.ts              refreshes the session, redirects signed-out users
  ├─ app/(app)/*               Server Components: one async component per page
  ├─ server/actions/*          mutations ("use server"), validated and audited
  ├─ app/api/export/leads      CSV export route
  │
  ├─ server/auth/context.ts    who is asking, which workspace, which role
  ├─ server/repositories/*     every database read
  ├─ server/services/*         pure business logic (scoring, compliance gate, insights)
  ├─ server/ai/*               AI runner, providers, prompts, guards (server-only)
  └─ server/db/*               Supabase clients and generated types
        │
        ▼
Supabase: Postgres + Auth
  ├─ Row Level Security on all 28 tables
  ├─ SQL functions for every dashboard metric
  └─ Triggers that enforce suppression and do-not-contact

Model providers: Anthropic Claude (official SDK) or the deterministic mock, selected by environment.
Planned, not built: n8n (scheduling), data providers (search, enrichment, email, calendar).
```

HUNTER is one deployable application. There are no microservices. n8n, when connected, only schedules and orchestrates; the logic and the safety gates stay in HUNTER.

## Request flow

**Reading a page**

1. `proxy.ts` refreshes the Supabase session cookie. Signed-out requests get an HTTP redirect to `/login`.
2. `(app)/layout.tsx` renders a static skeleton, then resolves `getSessionContext()` inside a Suspense boundary and renders the shell.
3. The page component awaits `searchParams` and the session, calls a repository, and renders.
4. The repository queries through the user's RLS-bound client, always filtering by `tenant_id` as well.

**Changing something**

1. A client component calls a server action.
2. The action calls `requireWriter()` or `requireAdmin()`, which re-verifies the session and role.
3. Input is parsed with Zod. Invalid input returns `{ ok: false, error }`.
4. The write goes through the RLS-bound client. Unique-constraint violations become friendly messages.
5. `writeAudit()` records the change. `refresh()` re-renders the current route.

## Key decisions

| Decision | Reason |
|---|---|
| One user-scoped Supabase client for all UI work | RLS applies to every query. The service-role client is confined to seeding and, later, signed webhooks and the workflow runner. |
| Dashboard metrics as SQL functions (`security invoker`) | Numbers are computed where the data lives, are covered by RLS, and cannot drift from the records. |
| Scores only from a pure engine | A model can supply research but can never set a score or qualify a lead. The engine is deterministic and unit-tested. |
| Compliance guards as database triggers | They hold even if application code has a bug, and even for the service role. |
| Composite foreign keys `(tenant_id, id)` | A row can never reference another tenant's row, independent of RLS. |
| Schema and seed built before the UI | With a real local database, the dashboard never used throwaway fixtures. |
| Funnel stages as milestone timestamps on `companies` | "How many reached stage X in this period" is a simple, exact count. |
| A lead is a company plus its primary contact | Exposed through `leads_view`; no separate lead table to keep in sync. |
| Demo rows flagged `is_demo` | Resetting deletes only synthetic rows; real records are untouched. |
| Local Supabase on ports 55321–55329 | Another Supabase project on this machine already uses the defaults. |
| Models only produce data; deterministic code decides | Every AI output is schema-validated and checked against its input by guards. Models never score, qualify or send. See `ai-framework.md`. |
| One table for AI execution metadata | `workflow_executions` describes scheduled jobs and `audit_logs` records human decisions; neither fits model calls. |
| Official Anthropic SDK, SDK retries off | Typed errors and structured-output helpers from the SDK; retries owned by HUNTER's runner so each attempt is bounded, counted and logged. |

## Next.js 16 specifics

The project uses `cacheComponents` and `partialPrefetching`. Consequences that shape the code:

- Pages read `cookies`, `searchParams` and `params` inside a `<Suspense>` child, never at the top of a layout.
- `createClient()` calls `io()` before creating the Supabase client, because the auth client reads the clock.
- There is no `export const dynamic` or `revalidate`. Data is uncached and read per request.
- Mutations call `refresh()` from `next/cache`.
- Middleware is `src/proxy.ts`.

## Security model

- **Authentication:** Supabase Auth, email and password. Demo sign-in exists only when `NEXT_PUBLIC_DEMO_MODE=true`.
- **Authorisation:** roles owner, admin, member, viewer. Enforced in RLS policies and again in server actions.
- **Tenant isolation:** `tenant_id` on every table, RLS membership checks, composite foreign keys.
- **Secrets:** server environment variables only. `npm run check:bundle` scans the browser bundle.
- **Input:** Zod on every action and route. Free-text search is stripped of filter-syntax characters. CSV export neutralises formula injection.
- **Audit:** `audit_logs` and `ai_executions` are append-only (no update or delete policy; update and delete revoked).
- **AI:** keys read only in `src/server/ai/config.ts`; untrusted content delimited and never placed in system prompts; strict output schemas and evidence guards; no tools given to models. Structured logs redact secrets.
- **Headers:** `X-Frame-Options: DENY`, `nosniff`, strict referrer policy.

## Folder structure

```
supabase/migrations/      schema, RLS, views and metric functions
scripts/                  seed-demo.ts, check-client-bundle.mjs, ai-smoke.ts, update-prompt-lock.ts
src/app/(app)/            the 12 screens plus leads/[id]
src/app/login/            sign-in
src/app/api/export/       CSV export
src/components/           ui (shadcn), shell, dashboard, charts, leads, opportunities, settings, shared
src/server/               auth, db, repositories, actions, services, ai, demo, logger
src/lib/                  format, labels, date-range, lead-params
tests/                    unit, integration, e2e
docs/                     this folder
```
