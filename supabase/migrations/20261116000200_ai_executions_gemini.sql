-- Allow Google Gemini as a recorded AI provider.
alter table public.ai_executions drop constraint if exists ai_executions_provider_check;
alter table public.ai_executions
  add constraint ai_executions_provider_check
  check (provider in ('mock', 'anthropic', 'gemini', 'openai', 'unconfigured'));
