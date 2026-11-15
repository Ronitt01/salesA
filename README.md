# HUNTER

AI-powered revenue intelligence and client acquisition platform for a technology agency selling to Indian SMEs with 10–200 employees.

HUNTER discovers and researches companies, qualifies them with a deterministic scoring engine, tracks outreach and replies, and measures which industries and channels actually produce profitable customers.

**Current state:** Phase 1 is complete. The dashboard, Lead Explorer, lead detail, Companies, Opportunities and Settings are fully working against a real database. Sending, approvals, the AI copilot and live integrations are not built yet. See [PROGRESS.md](PROGRESS.md) for the exact status of every module.

## Requirements

- Node.js 22.12 or later
- Docker Desktop (for the local Supabase stack)

## First-time setup

```bash
npm install
cp .env.example .env.local      # then fill in the values (see below)
npm run db:start                # starts Supabase; first run downloads images
npm run db:status               # prints the local URL and keys for .env.local
npm run db:seed                 # creates the demo user and loads synthetic data
npm run dev
```

Open <http://localhost:3000> and choose **Sign in as demo user**.

### Values for `.env.local`

`npm run db:status` prints them. You need:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `API_URL` (http://127.0.0.1:55321) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `ANON_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | `SERVICE_ROLE_KEY` |
| `DEMO_USER_PASSWORD` | Any password of 6+ characters; the seed script creates the demo user with it |

HUNTER's local Supabase uses ports **55321–55329** so it does not collide with other Supabase projects on the same machine. Supabase Studio is at <http://127.0.0.1:55323>.

## Daily use

```bash
npm run db:start    # if Docker was restarted
npm run dev
```

| Command | What it does |
|---|---|
| `npm run db:seed` | Replace the synthetic demo data with a fresh set dated relative to today |
| `npm run db:reset` | Rebuild the database from migrations, then seed |
| `npm run db:types` | Regenerate TypeScript types after a schema change |
| `npm run typecheck` / `npm run lint` | Static checks |
| `npm test` | Unit tests |
| `npm run test:integration` | Database tests (RLS, deduplication, compliance guards) |
| `npm run test:e2e` | Browser tests |
| `npm run build && npm run check:bundle` | Production build, then confirm no secret reached the browser bundle |

## Demo data

The demo workspace holds 50 companies, 70 contacts, 100 buying signals, 40 opportunities, plus campaigns, conversations, meetings and workflow runs. **All of it is synthetic.** Company names are invented, domains use the reserved `.example` suffix, and every record carries a Demo tag in the interface and a "Demo record" column in exports. No message in the demo data was ever sent.

Reset or remove it from **Settings → Demo data**, or with `npm run db:seed`.

## Safety defaults

- Outreach mode starts at **Human approval**.
- `OUTBOUND_LIVE_SENDING=false`: nothing can leave the system.
- Suppressed and do-not-contact people cannot be enrolled in a campaign. This is enforced by the database itself.
- The kill switch in Settings stops all outbound activity.

## Documentation

| Document | Contents |
|---|---|
| [PROGRESS.md](PROGRESS.md) | What is built, what is not, what is next |
| [docs/architecture.md](docs/architecture.md) | Structure, request flow, key decisions |
| [docs/database-schema.md](docs/database-schema.md) | Tables, constraints, RLS, metric functions |
| [docs/agent-design.md](docs/agent-design.md) | Scoring, insights, planned AI agents |
| [docs/outreach-policies.md](docs/outreach-policies.md) | Channel rules and compliance guards |
| [docs/n8n-workflows.md](docs/n8n-workflows.md) | The six workflows and the n8n integration plan |
| [docs/testing.md](docs/testing.md) | Test suites and the acceptance checklist |
| [docs/deployment.md](docs/deployment.md) | Moving to hosted Supabase and production |
