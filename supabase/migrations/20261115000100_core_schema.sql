-- HUNTER core schema
-- Conventions:
--   * every tenant-owned table carries tenant_id -> workspaces(id)
--   * UUID primary keys, created_at / updated_at maintained by trigger
--   * is_demo marks synthetic seed rows so they can be labelled and reset
--   * JSONB is used only for provider payloads, score inputs and execution detail

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------
create type public.member_role as enum ('owner', 'admin', 'member', 'viewer');
create type public.outreach_mode as enum ('draft_only', 'human_approval', 'controlled_autonomy');
create type public.channel as enum ('email', 'linkedin', 'whatsapp', 'telegram', 'voice', 'referral', 'inbound');
create type public.acquisition_channel as enum ('email_outreach', 'referral', 'inbound', 'partnership', 'event', 'other');
create type public.lead_stage as enum (
  'discovered', 'researched', 'verified', 'qualified', 'contacted',
  'positive_reply', 'meeting', 'proposal', 'customer', 'nurture', 'rejected'
);
create type public.lead_priority as enum ('A', 'B', 'C');
create type public.employee_range as enum ('1-9', '10-49', '50-99', '100-200', '201-500', '500+');
create type public.source_kind as enum (
  'search_provider', 'website', 'directory', 'referral', 'inbound_form',
  'manual', 'import', 'event', 'partner', 'demo_seed'
);
create type public.industry_origin as enum ('catalogue', 'discovered');
create type public.experiment_status as enum ('planned', 'running', 'paused', 'completed');
create type public.contact_role as enum (
  'owner_founder', 'director_cxo', 'operations', 'sales_marketing', 'it', 'finance', 'other'
);
create type public.verification_status as enum ('unverified', 'valid', 'risky', 'catch_all', 'invalid', 'unknown');
create type public.research_kind as enum ('summary', 'observed_fact', 'ai_hypothesis');
create type public.page_type as enum (
  'about', 'services', 'products', 'contact', 'careers', 'locations', 'announcements', 'other'
);
create type public.content_origin as enum ('human', 'ai', 'provider', 'system', 'demo_seed');
create type public.signal_type as enum (
  'hiring_operations', 'hiring_support', 'new_branch', 'distribution_expansion',
  'product_launch', 'ecommerce_expansion', 'service_locations', 'new_process', 'other'
);
create type public.signal_source_type as enum (
  'careers_page', 'company_website', 'news', 'job_board', 'directory', 'manual', 'demo_seed'
);
create type public.signal_verification as enum ('unverified', 'verified', 'rejected');
create type public.opportunity_stage as enum (
  'identified', 'qualified', 'meeting_scheduled', 'proposal_sent', 'negotiation', 'won', 'lost'
);
create type public.campaign_status as enum ('draft', 'active', 'paused', 'completed', 'archived');
create type public.enrolment_status as enum ('pending', 'active', 'completed', 'stopped');
create type public.stop_reason as enum (
  'replied', 'unsubscribed', 'opted_out', 'hard_bounce', 'complaint', 'manual', 'suppressed'
);
create type public.conversation_status as enum ('open', 'awaiting_reply', 'needs_review', 'closed');
create type public.reply_intent as enum (
  'interested', 'wants_meeting', 'wants_pricing', 'requests_information', 'objection',
  'not_interested', 'unsubscribe', 'out_of_office', 'complaint', 'human_review'
);
create type public.message_direction as enum ('outbound', 'inbound');
create type public.message_status as enum (
  'draft', 'pending_approval', 'approved', 'scheduled', 'sent', 'delivered',
  'bounced', 'failed', 'rejected', 'cancelled', 'received'
);
create type public.consent_status as enum ('granted', 'withdrawn');
create type public.consent_basis as enum (
  'explicit_opt_in', 'inbound_enquiry', 'existing_relationship', 'callback_request', 'b2b_first_contact'
);
create type public.suppression_reason as enum (
  'unsubscribe', 'opt_out', 'hard_bounce', 'complaint', 'manual', 'do_not_contact'
);
create type public.address_type as enum ('email', 'phone', 'domain');
create type public.meeting_status as enum ('proposed', 'booked', 'rescheduled', 'cancelled', 'attended', 'no_show');
create type public.actor_type as enum ('user', 'ai', 'system', 'workflow');
create type public.activity_type as enum (
  'note', 'stage_change', 'research', 'score', 'email_sent', 'email_received',
  'meeting', 'call', 'task', 'tag', 'system'
);
create type public.workflow_job_status as enum ('active', 'paused');
create type public.workflow_mode as enum ('n8n', 'local_simulation');
create type public.execution_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');
create type public.execution_trigger as enum ('schedule', 'manual', 'webhook', 'retry');
create type public.provider_category as enum (
  'llm', 'search', 'discovery', 'website_research', 'enrichment',
  'email_verification', 'email_delivery', 'calendar', 'n8n'
);

-- ---------------------------------------------------------------------------
-- Tenancy and identity
-- ---------------------------------------------------------------------------
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  country text not null default 'IN',
  timezone text not null default 'Asia/Kolkata',
  currency text not null default 'INR',
  outreach_mode public.outreach_mode not null default 'human_approval',
  outbound_kill_switch boolean not null default false,
  daily_send_limit integer not null default 30 check (daily_send_limit >= 0),
  daily_qualified_target integer not null default 8 check (daily_qualified_target >= 0),
  data_retention_days integer not null default 730 check (data_retention_days > 0),
  has_demo_data boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Profile row for each auth user.
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

-- ---------------------------------------------------------------------------
-- Provenance
-- ---------------------------------------------------------------------------
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.workspaces (id) on delete cascade,
  kind public.source_kind not null,
  provider text,
  label text not null,
  url text,
  query text,
  licence_note text,
  retrieved_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);
create index sources_tenant_kind_idx on public.sources (tenant_id, kind);

-- ---------------------------------------------------------------------------
-- Market structure
-- ---------------------------------------------------------------------------
create table public.industries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  slug text not null,
  origin public.industry_origin not null default 'catalogue',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug),
  unique (tenant_id, id)
);

create table public.industry_experiments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.workspaces (id) on delete cascade,
  industry_id uuid not null,
  name text not null,
  hypothesis text,
  status public.experiment_status not null default 'planned',
  started_at timestamptz,
  ended_at timestamptz,
  target_companies integer not null default 0 check (target_companies >= 0),
  spend_inr numeric(14, 2) not null default 0 check (spend_inr >= 0),
  -- Initial assumptions, 0-10. Actual commercial data outweighs these as it accumulates.
  assumed_problem_evidence smallint not null default 5 check (assumed_problem_evidence between 0 and 10),
  assumed_ability_to_pay smallint not null default 5 check (assumed_ability_to_pay between 0 and 10),
  assumed_decision_maker_access smallint not null default 5 check (assumed_decision_maker_access between 0 and 10),
  assumed_deal_size smallint not null default 5 check (assumed_deal_size between 0 and 10),
  assumed_recurring_potential smallint not null default 5 check (assumed_recurring_potential between 0 and 10),
  assumed_delivery_profitability smallint not null default 5 check (assumed_delivery_profitability between 0 and 10),
  notes text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, industry_id) references public.industries (tenant_id, id) on delete cascade
);
create index industry_experiments_industry_idx on public.industry_experiments (tenant_id, industry_id);

create table public.service_catalogue (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  slug text not null,
  description text not null default '',
  ideal_customer_profile text not null default '',
  problems_solved text[] not null default '{}',
  deliverables text[] not null default '{}',
  price_min_inr numeric(14, 2) check (price_min_inr >= 0),
  price_max_inr numeric(14, 2) check (price_max_inr >= 0),
  delivery_weeks_min smallint check (delivery_weeks_min >= 0),
  delivery_weeks_max smallint check (delivery_weeks_max >= 0),
  est_implementation_cost_inr numeric(14, 2) check (est_implementation_cost_inr >= 0),
  recurring_support_options text[] not null default '{}',
  is_active boolean not null default true,
  -- Template rows ship with placeholder commercials that the agency must review.
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, slug),
  unique (tenant_id, id),
  check (price_max_inr is null or price_min_inr is null or price_max_inr >= price_min_inr)
);

-- ---------------------------------------------------------------------------
-- Companies and contacts
-- ---------------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  domain text,
  normalised_domain text generated always as (
    nullif(regexp_replace(lower(trim(domain)), '^(https?://)?(www\.)?|[/?#].*$', '', 'g'), '')
  ) stored,
  normalised_name text generated always as (
    regexp_replace(lower(name), '[^a-z0-9]+', '', 'g')
  ) stored,
  website_url text,
  description text,
  industry_id uuid,
  employee_range public.employee_range,
  employee_count_estimate integer check (employee_count_estimate >= 0),
  city text,
  state text,
  country text not null default 'IN',
  branch_count integer check (branch_count >= 0),
  lead_stage public.lead_stage not null default 'discovered',
  acquisition_channel public.acquisition_channel not null default 'other',
  source_id uuid,
  owner_user_id uuid references public.users (id) on delete set null,
  tags text[] not null default '{}',
  -- Denormalised from the latest lead_score_snapshots row.
  opportunity_score smallint check (opportunity_score between 0 and 100),
  priority public.lead_priority,
  is_qualified boolean not null default false,
  -- Funnel milestones. A stage is "reached" when its timestamp is set.
  discovered_at timestamptz not null default now(),
  researched_at timestamptz,
  verified_at timestamptz,
  qualified_at timestamptz,
  first_contacted_at timestamptz,
  first_positive_reply_at timestamptz,
  first_meeting_at timestamptz,
  customer_at timestamptz,
  last_researched_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, industry_id) references public.industries (tenant_id, id) on delete set null (industry_id),
  foreign key (tenant_id, source_id) references public.sources (tenant_id, id) on delete set null (source_id)
);
-- Deduplication: one company per domain per tenant.
create unique index companies_tenant_domain_uniq on public.companies (tenant_id, normalised_domain)
  where normalised_domain is not null;
create index companies_tenant_name_idx on public.companies (tenant_id, normalised_name);
create index companies_tenant_stage_idx on public.companies (tenant_id, lead_stage);
create index companies_tenant_industry_idx on public.companies (tenant_id, industry_id);
create index companies_tenant_score_idx on public.companies (tenant_id, opportunity_score desc nulls last);
create index companies_tenant_qualified_idx on public.companies (tenant_id, qualified_at) where qualified_at is not null;
create index companies_tenant_discovered_idx on public.companies (tenant_id, discovered_at);
create index companies_tenant_state_idx on public.companies (tenant_id, state);
create index companies_tags_idx on public.companies using gin (tags);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.workspaces (id) on delete cascade,
  company_id uuid not null,
  full_name text not null check (length(trim(full_name)) > 0),
  job_title text,
  role_category public.contact_role not null default 'other',
  email text,
  email_normalised text generated always as (nullif(lower(trim(email)), '')) stored,
  phone text,
  -- Stored only as a reference for human-led activity. Never used for automation.
  linkedin_url text,
  is_primary boolean not null default false,
  source_id uuid,
  provenance_note text,
  verification_status public.verification_status not null default 'unverified',
  verification_provider text,
  last_verified_at timestamptz,
  reliability_score smallint check (reliability_score between 0 and 100),
  do_not_contact boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, company_id) references public.companies (tenant_id, id) on delete cascade,
  foreign key (tenant_id, source_id) references public.sources (tenant_id, id) on delete set null (source_id)
);
-- Deduplication: one contact per email per tenant.
create unique index contacts_tenant_email_uniq on public.contacts (tenant_id, email_normalised)
  where email_normalised is not null;
create index contacts_company_idx on public.contacts (tenant_id, company_id);
-- At most one primary contact per company.
create unique index contacts_one_primary_uniq on public.contacts (company_id) where is_primary;

create table public.contact_verifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid not null,
  provider text not null,
  result public.verification_status not null,
  detail jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, contact_id) references public.contacts (tenant_id, id) on delete cascade
);
create index contact_verifications_contact_idx on public.contact_verifications (tenant_id, contact_id, checked_at desc);

-- ---------------------------------------------------------------------------
-- Research and signals
-- ---------------------------------------------------------------------------
-- One row per statement. kind separates observed facts from AI hypotheses.
create table public.research_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.workspaces (id) on delete cascade,
  company_id uuid not null,
  kind public.research_kind not null,
  statement text not null,
  -- Observed facts must point at evidence; hypotheses are labelled assumptions.
  evidence_url text,
  evidence_quote text,
  page_type public.page_type,
  confidence numeric(3, 2) check (confidence between 0 and 1),
  origin public.content_origin not null default 'human',
  model text,
  source_id uuid,
  researched_at timestamptz not null default now(),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, company_id) references public.companies (tenant_id, id) on delete cascade,
  foreign key (tenant_id, source_id) references public.sources (tenant_id, id) on delete set null (source_id),
  constraint research_fact_needs_evidence check (kind <> 'observed_fact' or evidence_url is not null)
);
create index research_records_company_idx on public.research_records (tenant_id, company_id, kind);

create table public.buying_signals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.workspaces (id) on delete cascade,
  company_id uuid not null,
  signal_type public.signal_type not null,
  evidence_summary text not null,
  source_url text not null,
  source_type public.signal_source_type not null,
  source_id uuid,
  observed_at timestamptz not null,
  confidence numeric(3, 2) not null check (confidence between 0 and 1),
  -- Signals go stale. Expired signals are ignored by scoring.
  expires_at timestamptz not null,
  verification_status public.signal_verification not null default 'unverified',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, company_id) references public.companies (tenant_id, id) on delete cascade,
  foreign key (tenant_id, source_id) references public.sources (tenant_id, id) on delete set null (source_id),
  check (expires_at > observed_at)
);
create index buying_signals_company_idx on public.buying_signals (tenant_id, company_id, expires_at desc);
create index buying_signals_observed_idx on public.buying_signals (tenant_id, observed_at desc);

-- ---------------------------------------------------------------------------
-- Opportunities and scoring
-- ---------------------------------------------------------------------------
create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.workspaces (id) on delete cascade,
  company_id uuid not null,
  primary_contact_id uuid,
  service_id uuid,
  title text not null,
  stage public.opportunity_stage not null default 'identified',
  estimated_value_inr numeric(14, 2) check (estimated_value_inr >= 0),
  -- Matching output. Hypotheses, not promises.
  observed_facts text[] not null default '{}',
  problem_hypothesis text,
  recommended_solution text,
  relevance_rationale text,
  possible_impact text,
  validation_questions text[] not null default '{}',
  outreach_angle text,
  origin public.content_origin not null default 'human',
  acquisition_channel public.acquisition_channel not null default 'other',
  owner_user_id uuid references public.users (id) on delete set null,
  expected_close_date date,
  proposal_sent_at timestamptz,
  won_at timestamptz,
  lost_at timestamptz,
  lost_reason text,
  -- Actuals, entered once money has moved.
  collected_revenue_inr numeric(14, 2) not null default 0 check (collected_revenue_inr >= 0),
  delivery_cost_inr numeric(14, 2) not null default 0 check (delivery_cost_inr >= 0),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, company_id) references public.companies (tenant_id, id) on delete cascade,
  foreign key (tenant_id, primary_contact_id) references public.contacts (tenant_id, id) on delete set null (primary_contact_id),
  foreign key (tenant_id, service_id) references public.service_catalogue (tenant_id, id) on delete set null (service_id)
);
create index opportunities_company_idx on public.opportunities (tenant_id, company_id);
create index opportunities_stage_idx on public.opportunities (tenant_id, stage);
create index opportunities_service_idx on public.opportunities (tenant_id, service_id);

create table public.lead_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.workspaces (id) on delete cascade,
  company_id uuid not null,
  contact_id uuid,
  total_score smallint not null check (total_score between 0 and 100),
  icp_fit smallint not null check (icp_fit between 0 and 30),
  problem_evidence smallint not null check (problem_evidence between 0 and 25),
  decision_maker_access smallint not null check (decision_maker_access between 0 and 15),
  commercial_potential smallint not null check (commercial_potential between 0 and 15),
  timing_signal smallint not null check (timing_signal between 0 and 10),
  delivery_fit smallint not null check (delivery_fit between 0 and 5),
  contact_reliability smallint check (contact_reliability between 0 and 100),
  priority public.lead_priority not null,
  is_qualified boolean not null,
  disqualification_reasons text[] not null default '{}',
  -- The exact inputs and per-factor explanations, so a score can always be explained.
  inputs jsonb not null default '{}'::jsonb,
  explanations jsonb not null default '{}'::jsonb,
  engine_version text not null,
  computed_at timestamptz not null default now(),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, company_id) references public.companies (tenant_id, id) on delete cascade,
  foreign key (tenant_id, contact_id) references public.contacts (tenant_id, id) on delete set null (contact_id),
  check (total_score = icp_fit + problem_evidence + decision_maker_access + commercial_potential + timing_signal + delivery_fit)
);
create index lead_score_snapshots_company_idx on public.lead_score_snapshots (tenant_id, company_id, computed_at desc);

-- ---------------------------------------------------------------------------
-- Campaigns, conversations and messages
-- ---------------------------------------------------------------------------
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  description text,
  channel public.channel not null default 'email',
  status public.campaign_status not null default 'draft',
  country text not null default 'IN',
  industry_id uuid,
  service_id uuid,
  -- Null inherits the workspace outreach mode. A campaign can only be stricter, never looser.
  mode_override public.outreach_mode,
  -- Ordered steps: [{ "day": 0, "kind": "introduction", "guidance": "..." }, ...]
  sequence jsonb not null default '[]'::jsonb,
  daily_limit integer not null default 20 check (daily_limit >= 0),
  spend_inr numeric(14, 2) not null default 0 check (spend_inr >= 0),
  started_at timestamptz,
  ended_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, industry_id) references public.industries (tenant_id, id) on delete set null (industry_id),
  foreign key (tenant_id, service_id) references public.service_catalogue (tenant_id, id) on delete set null (service_id)
);
create index campaigns_status_idx on public.campaigns (tenant_id, status);

create table public.campaign_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.workspaces (id) on delete cascade,
  campaign_id uuid not null,
  contact_id uuid not null,
  company_id uuid not null,
  status public.enrolment_status not null default 'pending',
  stop_reason public.stop_reason,
  current_step smallint not null default 0,
  next_send_at timestamptz,
  enrolled_at timestamptz not null default now(),
  stopped_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, contact_id),
  unique (tenant_id, id),
  foreign key (tenant_id, campaign_id) references public.campaigns (tenant_id, id) on delete cascade,
  foreign key (tenant_id, contact_id) references public.contacts (tenant_id, id) on delete cascade,
  foreign key (tenant_id, company_id) references public.companies (tenant_id, id) on delete cascade,
  check ((status = 'stopped') = (stop_reason is not null))
);
create index campaign_contacts_due_idx on public.campaign_contacts (tenant_id, status, next_send_at);
create index campaign_contacts_contact_idx on public.campaign_contacts (tenant_id, contact_id);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.workspaces (id) on delete cascade,
  company_id uuid not null,
  contact_id uuid not null,
  campaign_id uuid,
  channel public.channel not null default 'email',
  subject text,
  status public.conversation_status not null default 'open',
  last_intent public.reply_intent,
  human_takeover boolean not null default false,
  assigned_user_id uuid references public.users (id) on delete set null,
  last_message_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, company_id) references public.companies (tenant_id, id) on delete cascade,
  foreign key (tenant_id, contact_id) references public.contacts (tenant_id, id) on delete cascade,
  foreign key (tenant_id, campaign_id) references public.campaigns (tenant_id, id) on delete set null (campaign_id)
);
create index conversations_recent_idx on public.conversations (tenant_id, last_message_at desc nulls last);
create index conversations_contact_idx on public.conversations (tenant_id, contact_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.workspaces (id) on delete cascade,
  conversation_id uuid not null,
  campaign_contact_id uuid,
  company_id uuid not null,
  contact_id uuid not null,
  direction public.message_direction not null,
  channel public.channel not null default 'email',
  subject text,
  body text not null,
  status public.message_status not null,
  sequence_step smallint,
  -- Inbound classification.
  intent public.reply_intent,
  intent_confidence numeric(3, 2) check (intent_confidence between 0 and 1),
  -- Ordered processing history: classification, drafting, gate decisions.
  processing_history jsonb not null default '[]'::jsonb,
  -- Outbound provenance.
  origin public.content_origin not null default 'human',
  model text,
  -- research_records ids the draft relied on, so every claim is traceable.
  supporting_fact_ids uuid[] not null default '{}',
  gate_result jsonb,
  approved_by uuid references public.users (id) on delete set null,
  approved_at timestamptz,
  scheduled_for timestamptz,
  sent_at timestamptz,
  received_at timestamptz,
  provider text,
  provider_message_id text,
  -- Prevents duplicate sends: one message per (enrolment, step) or per external id.
  idempotency_key text not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, conversation_id) references public.conversations (tenant_id, id) on delete cascade,
  foreign key (tenant_id, campaign_contact_id) references public.campaign_contacts (tenant_id, id) on delete set null (campaign_contact_id),
  foreign key (tenant_id, company_id) references public.companies (tenant_id, id) on delete cascade,
  foreign key (tenant_id, contact_id) references public.contacts (tenant_id, id) on delete cascade
);
create index messages_conversation_idx on public.messages (tenant_id, conversation_id, created_at);
create index messages_status_idx on public.messages (tenant_id, status);
create index messages_inbound_idx on public.messages (tenant_id, received_at desc) where direction = 'inbound';
create index messages_sent_idx on public.messages (tenant_id, sent_at desc) where direction = 'outbound';

-- ---------------------------------------------------------------------------
-- Compliance
-- ---------------------------------------------------------------------------
create table public.channel_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.workspaces (id) on delete cascade,
  country text not null,
  channel public.channel not null,
  -- No row for a (country, channel) pair means outbound is blocked.
  outbound_allowed boolean not null default false,
  automation_allowed boolean not null default false,
  requires_consent boolean not null default true,
  requires_inbound_initiation boolean not null default false,
  daily_limit integer not null default 0 check (daily_limit >= 0),
  notes text,
  reviewed_by uuid references public.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, country, channel)
);

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid not null,
  channel public.channel not null,
  status public.consent_status not null,
  basis public.consent_basis not null,
  evidence text,
  source_id uuid,
  recorded_by uuid references public.users (id) on delete set null,
  recorded_at timestamptz not null default now(),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, contact_id) references public.contacts (tenant_id, id) on delete cascade,
  foreign key (tenant_id, source_id) references public.sources (tenant_id, id) on delete set null (source_id)
);
create index consent_records_contact_idx on public.consent_records (tenant_id, contact_id, channel, recorded_at desc);

create table public.suppressions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.workspaces (id) on delete cascade,
  -- Null channel suppresses the address on every channel.
  channel public.channel,
  address_type public.address_type not null default 'email',
  address text not null check (address = lower(trim(address)) and length(address) > 0),
  reason public.suppression_reason not null,
  contact_id uuid,
  note text,
  created_by uuid references public.users (id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, contact_id) references public.contacts (tenant_id, id) on delete set null (contact_id)
);
-- NULLS NOT DISTINCT so an all-channel suppression (channel is null) is also unique.
create unique index suppressions_uniq on public.suppressions (tenant_id, channel, address_type, address)
  nulls not distinct;
create index suppressions_address_idx on public.suppressions (tenant_id, address);

-- ---------------------------------------------------------------------------
-- Meetings and activity
-- ---------------------------------------------------------------------------
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.workspaces (id) on delete cascade,
  company_id uuid not null,
  contact_id uuid not null,
  opportunity_id uuid,
  conversation_id uuid,
  title text not null,
  status public.meeting_status not null default 'proposed',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  host_timezone text not null default 'Asia/Kolkata',
  prospect_timezone text not null default 'Asia/Kolkata',
  meeting_url text,
  provider text,
  provider_event_id text,
  -- A meeting is booked only after the prospect explicitly picks a slot.
  slot_selected_by_prospect boolean not null default false,
  booked_at timestamptz,
  attended_at timestamptz,
  outcome_notes text,
  owner_user_id uuid references public.users (id) on delete set null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, company_id) references public.companies (tenant_id, id) on delete cascade,
  foreign key (tenant_id, contact_id) references public.contacts (tenant_id, id) on delete cascade,
  foreign key (tenant_id, opportunity_id) references public.opportunities (tenant_id, id) on delete set null (opportunity_id),
  foreign key (tenant_id, conversation_id) references public.conversations (tenant_id, id) on delete set null (conversation_id),
  check (ends_at > starts_at),
  constraint booked_requires_prospect_choice check (
    status not in ('booked', 'rescheduled', 'attended', 'no_show') or slot_selected_by_prospect
  )
);
create index meetings_starts_idx on public.meetings (tenant_id, starts_at);
create index meetings_company_idx on public.meetings (tenant_id, company_id);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.workspaces (id) on delete cascade,
  company_id uuid not null,
  contact_id uuid,
  opportunity_id uuid,
  actor_type public.actor_type not null default 'user',
  actor_user_id uuid references public.users (id) on delete set null,
  type public.activity_type not null,
  title text not null,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, company_id) references public.companies (tenant_id, id) on delete cascade,
  foreign key (tenant_id, contact_id) references public.contacts (tenant_id, id) on delete set null (contact_id),
  foreign key (tenant_id, opportunity_id) references public.opportunities (tenant_id, id) on delete set null (opportunity_id)
);
create index activities_company_idx on public.activities (tenant_id, company_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Workflows and providers
-- ---------------------------------------------------------------------------
create table public.workflow_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.workspaces (id) on delete cascade,
  workflow_key text not null check (workflow_key ~ '^WF-[0-9]{2}$'),
  name text not null,
  description text,
  status public.workflow_job_status not null default 'active',
  mode public.workflow_mode not null default 'local_simulation',
  schedule_cron text,
  last_run_at timestamptz,
  next_run_at timestamptz,
  last_status public.execution_status,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, workflow_key),
  unique (tenant_id, id)
);

create table public.workflow_executions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.workspaces (id) on delete cascade,
  job_id uuid not null,
  workflow_key text not null,
  status public.execution_status not null default 'queued',
  trigger public.execution_trigger not null default 'manual',
  mode public.workflow_mode not null default 'local_simulation',
  attempt smallint not null default 1 check (attempt >= 1),
  retry_of uuid references public.workflow_executions (id) on delete set null,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer check (duration_ms >= 0),
  items_processed integer not null default 0 check (items_processed >= 0),
  error_message text,
  error_detail jsonb,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  idempotency_key text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, job_id) references public.workflow_jobs (tenant_id, id) on delete cascade
);
create unique index workflow_executions_idem_uniq on public.workflow_executions (tenant_id, idempotency_key)
  where idempotency_key is not null;
create index workflow_executions_job_idx on public.workflow_executions (tenant_id, job_id, queued_at desc);
create index workflow_executions_status_idx on public.workflow_executions (tenant_id, status, queued_at desc);

-- Non-secret provider configuration. Secrets live in server environment variables only;
-- secret_env_var records which variable a provider reads, never its value.
create table public.provider_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.workspaces (id) on delete cascade,
  category public.provider_category not null,
  provider text not null default 'mock',
  is_enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  secret_env_var text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, category)
);

-- ---------------------------------------------------------------------------
-- User conveniences and audit
-- ---------------------------------------------------------------------------
create table public.saved_filters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  scope text not null default 'leads',
  name text not null check (length(trim(name)) > 0),
  params jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id, scope, name)
);

-- Append-only. No update or delete policy exists for any role.
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.workspaces (id) on delete cascade,
  actor_type public.actor_type not null default 'user',
  actor_user_id uuid references public.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  detail jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index audit_logs_recent_idx on public.audit_logs (tenant_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (tenant_id, entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t record;
begin
  for t in
    select table_name
    from information_schema.columns
    where table_schema = 'public' and column_name = 'updated_at'
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      t.table_name
    );
  end loop;
end;
$$;

-- Mirror auth users into public.users.
create function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

-- Database-level guard: a suppressed or do-not-contact contact can never be enrolled,
-- whatever the calling code or model decided.
create function private.block_suppressed_enrolment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  campaign_channel public.channel;
begin
  select email_normalised, phone, do_not_contact into c
  from public.contacts where id = new.contact_id and tenant_id = new.tenant_id;

  if c.do_not_contact then
    raise exception 'Contact % is marked do-not-contact and cannot be enrolled', new.contact_id
      using errcode = 'P0001', hint = 'suppressed';
  end if;

  select channel into campaign_channel
  from public.campaigns where id = new.campaign_id and tenant_id = new.tenant_id;

  if exists (
    select 1 from public.suppressions s
    where s.tenant_id = new.tenant_id
      and (s.channel is null or s.channel = campaign_channel)
      and (
        (s.address_type = 'email' and s.address = c.email_normalised)
        or (s.address_type = 'phone' and s.address = lower(trim(c.phone)))
        or (s.address_type = 'domain' and c.email_normalised like '%@' || s.address)
      )
  ) then
    raise exception 'Contact % is on the suppression list and cannot be enrolled', new.contact_id
      using errcode = 'P0001', hint = 'suppressed';
  end if;

  return new;
end;
$$;

create trigger block_suppressed_enrolment
  before insert on public.campaign_contacts
  for each row execute function private.block_suppressed_enrolment();
