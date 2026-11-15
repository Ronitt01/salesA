# Deployment

HUNTER has only been run locally. This document describes the steps to take it to a hosted environment. **None of this has been executed or tested yet**; treat it as a checklist to validate, not a proven runbook.

## Before deploying

The product cannot send outreach yet (Phase 4 is not built). A deployment now gives the team the dashboard, Lead Explorer, opportunities pipeline and settings with real data entered by hand.

## 1. Create the Supabase project

1. Create a project in a region close to your users (for India, Mumbai).
2. Check the Postgres major version matches `major_version` in `supabase/config.toml` (17).
3. Link and push the schema:

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

4. In **Authentication → Providers**, keep email enabled. Turn on email confirmations and set a strong minimum password length; the local config relaxes both.
5. In **Authentication → URL configuration**, set the site URL to your production URL.

## 2. Create the first workspace and owner

There is no sign-up or invitation flow yet. Create the first user in the Supabase dashboard, then run this once in the SQL editor, replacing the placeholders:

```sql
insert into public.workspaces (name, slug) values ('<Agency name>', '<agency-slug>');

insert into public.memberships (tenant_id, user_id, role)
select w.id, u.id, 'owner'
from public.workspaces w, public.users u
where w.slug = '<agency-slug>' and u.email = '<owner email>';
```

The workspace also needs its starting configuration (industries, service templates, channel policies, workflows, provider rows). Today that is done by `bootstrapWorkspace()`, which the seed script calls. A production bootstrap command that does this without loading demo data does not exist yet and needs to be written.

## 3. Environment variables

Set these in the hosting platform. Only `NEXT_PUBLIC_*` values reach the browser.

| Variable | Production value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key. Server only. Never prefix with `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_DEMO_MODE` | `false` |
| `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD` | Leave unset |
| `APP_URL` | Production URL |
| `LLM_PROVIDER` | `mock` until the LLM layer is built |
| `OUTBOUND_LIVE_SENDING` | `false` |
| `N8N_BASE_URL`, `N8N_WEBHOOK_SECRET` | Leave unset until the n8n integration is built |

## 4. Build and host

Any Node.js 22 host works. The app needs the Node runtime (the proxy does not run on the edge runtime).

```bash
npm ci
npm run build
npm run check:bundle
npm run start
```

`check:bundle` must pass before every release.

## 5. After deploying

- Sign in as the owner and confirm the workspace loads.
- Open **Settings**: outreach mode should be "Human approval" and outbound sending should read "Off".
- Review every service in the catalogue; the template prices are placeholders flagged "review needed".
- Review the channel policies against your legal advice.

## Not yet in place for production

- Workspace bootstrap without demo data, sign-up and invitations
- Rate limiting on routes and actions
- Error monitoring and alerting
- Database backups policy and a restore drill (Supabase provides backups; the drill is yours to run)
- Data-retention purge job
- Content Security Policy header
