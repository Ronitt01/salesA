# Database schema

PostgreSQL 17 on Supabase. Source of truth: `supabase/migrations/`. Generated types: `src/server/db/database.types.ts` (`npm run db:types`).

## Conventions

- UUID primary keys (`gen_random_uuid()`).
- `tenant_id uuid not null references workspaces(id) on delete cascade` on every tenant table.
- `created_at`, `updated_at` on every table; `updated_at` is maintained by a trigger.
- `is_demo boolean` on every table that holds seeded data.
- Enumerated values are Postgres enums, so the generated TypeScript types are exact.
- JSONB is used only for: provider metadata, score inputs and explanations, message processing history, campaign sequence steps, workflow input/output.
- Parent tables have `unique (tenant_id, id)`; children reference `(tenant_id, parent_id)`, so cross-tenant references are impossible.

## Tables

| Table | Purpose | Notable constraints |
|---|---|---|
| `workspaces` | Tenant. Outreach mode, kill switch, limits, timezone | `slug` unique |
| `users` | Profile for each `auth.users` row | Created by trigger on sign-up |
| `memberships` | User ↔ workspace with role | `unique (tenant_id, user_id)` |
| `sources` | Where a record came from | |
| `industries` | Industry catalogue | `unique (tenant_id, slug)`; removed = `is_active false` |
| `industry_experiments` | Assumptions and spend per industry | Assumption scores 0–10 |
| `service_catalogue` | What the agency sells | `unique (tenant_id, slug)`; `needs_review` flag |
| `companies` | Company record, funnel milestones, latest score | **Unique `(tenant_id, normalised_domain)`** |
| `contacts` | People at companies | **Unique `(tenant_id, email_normalised)`**; one primary per company |
| `contact_verifications` | Verification history | |
| `research_records` | One statement per row: summary, observed fact, AI hypothesis | **Observed fact requires `evidence_url`** |
| `buying_signals` | Signal with evidence, confidence and expiry | `expires_at > observed_at` |
| `opportunities` | One service need at one company | Many per company |
| `lead_score_snapshots` | Score breakdown, inputs, explanations | Total must equal the sum of the six factors |
| `campaigns` | Sequence definition | |
| `campaign_contacts` | Enrolment | `unique (campaign_id, contact_id)`; **suppression trigger** |
| `conversations` | Thread with a contact | |
| `messages` | Outbound and inbound messages | **Unique `(tenant_id, idempotency_key)`** |
| `channel_policies` | Per-country, per-channel rules | `unique (tenant_id, country, channel)`; no row = blocked |
| `consent_records` | Consent granted or withdrawn | |
| `suppressions` | Do-not-contact list | Unique on `(tenant_id, channel, address_type, address)`, nulls not distinct |
| `meetings` | Proposed, booked, attended | **Booked requires `slot_selected_by_prospect`** |
| `activities` | Timeline per company | |
| `workflow_jobs` | The six workflows | `unique (tenant_id, workflow_key)` |
| `workflow_executions` | Run history | Unique idempotency key when present |
| `provider_settings` | Non-secret provider configuration | `unique (tenant_id, category)` |
| `saved_filters` | A user's saved Lead Explorer filters | |
| `audit_logs` | Append-only audit trail | No update or delete |

## Deduplication

- **Companies:** `normalised_domain` is a generated column (lower-case, no scheme, no `www.`, no path). A unique index on `(tenant_id, normalised_domain)` refuses a second company with the same domain.
- **Contacts:** `email_normalised` is generated (trimmed, lower-case) with a unique index per tenant.
- **Possible duplicates without a domain:** `normalised_name` (alphanumeric only) is indexed; `leads_view.possible_duplicate` is true when two companies share it.
- **Messages:** the idempotency key prevents a duplicate send for the same enrolment and step.

## Row Level Security

Enabled on every table. Helper functions live in the `private` schema, which the API does not expose.

| Group | Read | Insert / update | Delete |
|---|---|---|---|
| Working data (companies, contacts, opportunities, messages, …) | Members | Owner, admin, member | Owner, admin |
| Configuration (industries, services, policies, workflows, providers) | Members | Owner, admin | Owner, admin |
| `workspaces` | Members | Owner, admin (update only) | Service role |
| `memberships` | Members | Owner, admin | Owner, admin |
| `users` | Self and people in a shared workspace | Self | – |
| `saved_filters` | Owner of the filter | Owner of the filter | Owner of the filter |
| `audit_logs` | Members | Members, as themselves | Nobody |

The `anon` role has no access to any table, view or metric function.

## Compliance triggers

| Trigger | Effect |
|---|---|
| `block_suppressed_enrolment` on `campaign_contacts` insert | Raises an error if the contact is do-not-contact or their email, phone or email domain is suppressed for that channel. Applies to the service role too. |
| `apply_suppression` on `suppressions` insert | Stops every pending or active enrolment for the matching contacts and cancels their unsent outbound messages. |

## Read models and metric functions

All are `security invoker`, so the caller's RLS applies.

| Object | Returns |
|---|---|
| `leads_view` | One row per company with its best contact, strongest live signal, leading opportunity and duplicate flag |
| `dashboard_kpis(tenant, from, to)` | The KPI values with their comparison values |
| `dashboard_funnel(tenant, from, to)` | Companies reaching each of the 8 funnel stages in the period |
| `industry_performance(tenant, from, to)` | Per industry: discovered, qualified, contacted, replies, rate, meetings, proposals, won, revenue, gross profit, acquisition cost |
| `channel_performance(tenant, from, to)` | The same idea per acquisition channel |
| `lead_generation_series(tenant, from, to, bucket)` | Discovered and qualified per day or week, in the workspace timezone |
| `pipeline_by_stage(tenant, from, to)` | Opportunity count and value by stage |
| `workflow_stats(tenant, from, to)` | Executions by status per workflow |

**Definitions used by the metrics**

- *Positive reply:* intent is interested, wants a meeting, wants pricing or requests information.
- *Flow metrics* (positive replies, meetings booked, success rate) compare the period with the equal-length period before it.
- *Stock metrics* (total qualified, high priority, active opportunities, pipeline value) compare now with the value at the start of the period.
- *Meeting booked* uses `booked_at`; *meeting attended* uses `attended_at`. They are separate numbers.
- *Revenue* is `collected_revenue_inr` on won opportunities, never the estimate. *Gross profit* is revenue minus `delivery_cost_inr`.

## Changing the schema

1. Add a new file in `supabase/migrations/` (never edit an applied one).
2. `npx supabase migration up`
3. `npm run db:types`
4. Add or update integration tests in `tests/integration/`.
