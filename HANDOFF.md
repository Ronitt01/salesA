# HUNTER handoff

Last updated: 23 November 2026. For whoever picks this up next, person or AI session.

HUNTER is an internal AI client-acquisition platform for an Indian technology agency. It finds, researches and qualifies SMEs (10–200 employees), drafts outreach for human approval, books meetings, and learns which industries and channels convert.

**Read these first, in this order:** [CLAUDE.md](CLAUDE.md) (rules that must not be broken, commands), [PROGRESS.md](PROGRESS.md) (what is built and what is not), then the relevant file in [docs/](docs/).

## Getting it running

Needs Node 22, Docker Desktop running, and a `.env.local` copied from [.env.example](.env.example).

```bash
npm install
npm run db:start      # local Supabase on ports 55321–55329
npm run db:seed       # synthetic demo data and the demo user
npm run dev           # http://localhost:3000, "Sign in as demo user"
npm run n8n:start     # optional: local n8n on http://localhost:5678
```

Checks, all passing at the last commit: `npm run typecheck`, `npm run lint`, `npm test` (293), `npm run test:integration` (51), `npm run test:e2e` (24), `npm run build && npm run check:bundle`.

## Where things stand

| Area | State |
|---|---|
| Dashboard, Lead Explorer, lead detail, companies, opportunities, settings | Built on real database rows; demo data is synthetic and labelled |
| Database, RLS, tenant isolation, compliance triggers | Built and tested |
| Deterministic scoring engine | Built and tested; the only source of scores |
| Compliance gate and approval queue | Built; nothing can be sent (live sending off, mock delivery only) |
| AI framework (`runPrompt`, Gemini, Anthropic, mock, six prompts) | Built and tested against fakes; **no agent is connected to a screen or workflow yet** |
| Hunter.io contact discovery and email verification | Built and tested against fakes; **live calls blocked**, see below |
| n8n | Runs locally in Docker; HUNTER's webhook endpoints do not exist yet |
| Email sending, calendar, company discovery, website fetching | Not built |

## Decisions made by the owner

- **AI:** Gemini first (`LLM_PROVIDER=gemini`), Anthropic later. Switching is only an env change.
- **Calendar:** Google.
- **n8n:** local Docker for development (`n8n/docker-compose.yml`).
- **Email: two modes.** *Manual*: HUNTER drafts, the person sends from their own mailbox (Open in Gmail / Copy), then clicks Mark as sent so follow-ups and logging still work. *Automatic*: HUNTER sends.

Proposed, not yet confirmed by the owner (treat as the default unless told otherwise):

- Automatic email through the **Gmail API (Google Workspace)**, not SendGrid, Postmark, Resend or SES, whose terms generally forbid cold outreach.
- Discovery through **Google Places API**, plus a built-in website fetcher that respects robots.txt. One Google Cloud project then covers Places, Calendar and Gmail. No LinkedIn scraping.

## Next steps (agreed order)

1. Connect the AI agents to screens through `runPrompt`: company research (hypotheses and signals, then rescore), outreach drafts into the approval queue, reply classification with the deterministic opt-out override.
2. Manual email mode end to end: Open in Gmail / Copy, Mark as sent, follow-up timers, reply logging, unsubscribe link, suppression and consent actions on Contacts.
3. Discovery → research → enrich → draft pipeline, with a Places adapter and the website fetcher, tested against fakes.
4. n8n: signed webhook endpoints in HUNTER (design in [docs/n8n-workflows.md](docs/n8n-workflows.md)), importable workflow JSON, setup guide.
5. Google adapters: Calendar, Gmail sending and reply reading.
6. A go-live check command that runs each provider's smoke test once and reports pass or fail.

## Open issues for the owner

- **Hunter account restricted.** The key authenticates, but every search and verification returns 429 `restricted_account`. Log in at hunter.io to resolve it, then run `npm run hunter:smoke:live`.
- **`.env.local` sets `LLM_PROVIDER` twice** (`mock`, then `gemini`; the last one wins). Remove the one not wanted.
- **Keys still needed:** `GEMINI_API_KEY` (if not already set), later `ANTHROPIC_API_KEY`, a Google Cloud project with OAuth credentials for Places, Calendar and Gmail.

## Things that will trip you up

- **Next.js 16.4 differs from older versions.** Read `node_modules/next/dist/docs/` before using an API from memory. Middleware is `src/proxy.ts`; pages use `<Suspense>`; mutations call `refresh()`.
- **Never send, call or contact anyone during development**, and never weaken the suppression triggers or the compliance gate. See the rules in CLAUDE.md.
- **Windows:** run vitest from PowerShell. From Git Bash it fails with "Vitest failed to find the runner" (drive-letter casing). Python is not installed.
- **The project sits in OneDrive.** No lock problems so far; if a build fails with `EPERM`, pause OneDrive sync.
- **Another Supabase project ("muul") runs on this machine** on the default ports. HUNTER uses 553xx on purpose.
- **Prompt changes** need a version bump and `npm run ai:lock`. **Migrations** are new files only, then `npm run db:types`.
- `.env.local` is git-ignored and must never be committed. `npm run check:bundle` fails if a server secret reaches browser code.
