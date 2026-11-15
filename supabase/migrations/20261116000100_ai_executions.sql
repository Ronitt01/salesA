-- AI execution log.
--
-- One row per call to HUNTER's AI runner, successful or not. It records which
-- versioned prompt ran, on which provider and model, how long it took, how many
-- attempts it needed, token usage when the provider reports it, and why it failed.
--
-- Existing tables were considered first: workflow_executions requires a workflow
-- job and describes scheduled runs, and audit_logs records human decisions. AI calls
-- fit neither, so they get this one table.
--
-- Append-only: there is no update or delete policy for any user role.

create type public.ai_execution_status as enum ('succeeded', 'failed');

create table public.ai_executions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.workspaces (id) on delete cascade,
  prompt_id text not null check (prompt_id ~ '^[a-z][a-z0-9_]{1,62}$'),
  prompt_version text not null check (prompt_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  -- 'unconfigured' marks a call that failed before any provider could be selected.
  provider text not null check (provider in ('mock', 'anthropic', 'openai', 'unconfigured')),
  model text,
  status public.ai_execution_status not null,
  error_kind text,
  error_message text check (error_message is null or length(error_message) <= 1000),
  attempts smallint not null default 0 check (attempts between 0 and 20),
  duration_ms integer not null check (duration_ms >= 0),
  -- Null when the provider does not report usage (the mock never does).
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  cache_read_input_tokens integer check (cache_read_input_tokens >= 0),
  cache_creation_input_tokens integer check (cache_creation_input_tokens >= 0),
  input_chars integer not null default 0 check (input_chars >= 0),
  -- Prompt-injection patterns detected in untrusted input. Recorded, never acted on.
  injection_signals text[] not null default '{}',
  -- True when the output came from the mock provider. Synthetic output is never research.
  synthetic boolean not null default false,
  -- What the call was about, for example ('company', <uuid>).
  entity_type text,
  entity_id uuid,
  actor_type public.actor_type not null default 'system',
  actor_user_id uuid references public.users (id) on delete set null,
  provider_request_id text,
  -- The validated output. Null on failure.
  output jsonb,
  -- The start of an unusable response, kept for debugging invalid output. Secrets are redacted.
  raw_excerpt text check (raw_excerpt is null or length(raw_excerpt) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_executions_status_error check ((status = 'succeeded') = (error_kind is null)),
  constraint ai_executions_output_on_success check (status = 'succeeded' or output is null)
);

create index ai_executions_recent_idx on public.ai_executions (tenant_id, created_at desc);
create index ai_executions_prompt_idx on public.ai_executions (tenant_id, prompt_id, created_at desc);
create index ai_executions_failed_idx on public.ai_executions (tenant_id, created_at desc) where status = 'failed';
create index ai_executions_entity_idx on public.ai_executions (tenant_id, entity_type, entity_id);

create trigger set_updated_at before update on public.ai_executions
  for each row execute function private.set_updated_at();

alter table public.ai_executions enable row level security;
revoke all on public.ai_executions from anon;

create policy ai_executions_select on public.ai_executions
  for select to authenticated using (private.is_member(tenant_id));

-- Writers record executions as themselves. Workflows record with the service role.
create policy ai_executions_insert on public.ai_executions
  for insert to authenticated
  with check (
    private.has_role(tenant_id, array['owner', 'admin', 'member']::public.member_role[])
    and (actor_user_id is null or actor_user_id = (select auth.uid()))
  );

revoke update, delete, truncate on public.ai_executions from authenticated;
