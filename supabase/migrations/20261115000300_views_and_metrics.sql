-- Read models and metric functions.
-- Everything here is SECURITY INVOKER, so Row Level Security of the calling user applies.
-- Every number the dashboard shows is computed from stored rows by these functions.

-- Replies that count as "positive" across the product.
create function public.is_positive_intent(i public.reply_intent)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select i in ('interested', 'wants_meeting', 'wants_pricing', 'requests_information');
$$;

-- ---------------------------------------------------------------------------
-- Lead Explorer read model: one row per company with its best contact,
-- strongest live signal and leading opportunity.
-- ---------------------------------------------------------------------------
create view public.leads_view
with (security_invoker = true)
as
select
  c.id,
  c.tenant_id,
  c.name as company_name,
  c.domain,
  c.website_url,
  c.industry_id,
  i.name as industry_name,
  c.city,
  c.state,
  c.country,
  c.employee_range,
  c.employee_count_estimate,
  c.opportunity_score,
  c.priority,
  c.is_qualified,
  c.lead_stage,
  c.acquisition_channel,
  c.tags,
  c.discovered_at,
  c.qualified_at,
  c.last_researched_at,
  c.is_demo,
  c.created_at,
  c.updated_at,
  s.kind as source_kind,
  s.label as source_label,
  pc.id as contact_id,
  pc.full_name as contact_name,
  pc.job_title as contact_job_title,
  pc.email as contact_email,
  pc.verification_status as contact_verification_status,
  pc.reliability_score as contact_reliability,
  sig.signal_type as top_signal_type,
  sig.evidence_summary as top_signal_summary,
  sig.observed_at as top_signal_observed_at,
  coalesce(sigs.active_signal_types, '{}') as active_signal_types,
  coalesce(sigs.active_signal_count, 0) as active_signal_count,
  opp.service_id as recommended_service_id,
  svc.name as recommended_service_name,
  (dup.same_name_count > 1) as possible_duplicate
from public.companies c
left join public.industries i on i.id = c.industry_id
left join public.sources s on s.id = c.source_id
left join lateral (
  select ct.id, ct.full_name, ct.job_title, ct.email, ct.verification_status, ct.reliability_score
  from public.contacts ct
  where ct.company_id = c.id
  order by ct.is_primary desc, ct.reliability_score desc nulls last, ct.created_at
  limit 1
) pc on true
left join lateral (
  select b.signal_type, b.evidence_summary, b.observed_at
  from public.buying_signals b
  where b.company_id = c.id and b.expires_at > now() and b.verification_status <> 'rejected'
  order by b.confidence desc, b.observed_at desc
  limit 1
) sig on true
left join lateral (
  select array_agg(distinct b.signal_type) as active_signal_types, count(*)::int as active_signal_count
  from public.buying_signals b
  where b.company_id = c.id and b.expires_at > now() and b.verification_status <> 'rejected'
) sigs on true
left join lateral (
  select o.service_id
  from public.opportunities o
  where o.company_id = c.id and o.stage <> 'lost' and o.service_id is not null
  order by o.estimated_value_inr desc nulls last, o.created_at
  limit 1
) opp on true
left join public.service_catalogue svc on svc.id = opp.service_id
left join lateral (
  select count(*) as same_name_count
  from public.companies d
  where d.tenant_id = c.tenant_id and d.normalised_name = c.normalised_name
) dup on true;

-- ---------------------------------------------------------------------------
-- Dashboard KPIs with the previous comparable period.
-- Flow metrics compare [from, to) with the period of equal length before it.
-- Stock metrics compare "now" with the value as of p_from.
-- ---------------------------------------------------------------------------
create function public.dashboard_kpis(p_tenant uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with ws as (
    select timezone as tz from public.workspaces where id = p_tenant
  ),
  b as (
    select
      p_from as cur_from,
      p_to as cur_to,
      p_from - (p_to - p_from) as prev_from,
      (date_trunc('day', now() at time zone ws.tz) at time zone ws.tz) as today_start
    from ws
  ),
  wf as (
    select
      count(*) filter (where e.status = 'succeeded' and e.finished_at >= b.cur_from and e.finished_at < b.cur_to) as cur_ok,
      count(*) filter (where e.status = 'failed' and e.finished_at >= b.cur_from and e.finished_at < b.cur_to) as cur_fail,
      count(*) filter (where e.status = 'succeeded' and e.finished_at >= b.prev_from and e.finished_at < b.cur_from) as prev_ok,
      count(*) filter (where e.status = 'failed' and e.finished_at >= b.prev_from and e.finished_at < b.cur_from) as prev_fail
    from b
    left join public.workflow_executions e on e.tenant_id = p_tenant
  )
  select jsonb_build_object(
    'new_qualified_today', jsonb_build_object(
      'value', (select count(*) from public.companies c, b
                where c.tenant_id = p_tenant and c.qualified_at >= b.today_start),
      'previous', (select count(*) from public.companies c, b
                   where c.tenant_id = p_tenant
                     and c.qualified_at >= b.today_start - interval '1 day' and c.qualified_at < b.today_start)
    ),
    'total_qualified', jsonb_build_object(
      'value', (select count(*) from public.companies c
                where c.tenant_id = p_tenant and c.is_qualified),
      'previous', (select count(*) from public.companies c, b
                   where c.tenant_id = p_tenant and c.is_qualified and c.qualified_at < b.cur_from)
    ),
    'high_priority', jsonb_build_object(
      'value', (select count(*) from public.companies c
                where c.tenant_id = p_tenant and c.is_qualified and c.priority = 'A'),
      'previous', (select count(*) from public.companies c, b
                   where c.tenant_id = p_tenant and c.is_qualified and c.priority = 'A' and c.qualified_at < b.cur_from)
    ),
    'positive_replies', jsonb_build_object(
      'value', (select count(*) from public.messages m, b
                where m.tenant_id = p_tenant and m.direction = 'inbound' and public.is_positive_intent(m.intent)
                  and m.received_at >= b.cur_from and m.received_at < b.cur_to),
      'previous', (select count(*) from public.messages m, b
                   where m.tenant_id = p_tenant and m.direction = 'inbound' and public.is_positive_intent(m.intent)
                     and m.received_at >= b.prev_from and m.received_at < b.cur_from)
    ),
    'meetings_booked', jsonb_build_object(
      'value', (select count(*) from public.meetings mt, b
                where mt.tenant_id = p_tenant and mt.booked_at >= b.cur_from and mt.booked_at < b.cur_to),
      'previous', (select count(*) from public.meetings mt, b
                   where mt.tenant_id = p_tenant and mt.booked_at >= b.prev_from and mt.booked_at < b.cur_from)
    ),
    'meetings_attended', jsonb_build_object(
      'value', (select count(*) from public.meetings mt, b
                where mt.tenant_id = p_tenant and mt.attended_at >= b.cur_from and mt.attended_at < b.cur_to),
      'previous', (select count(*) from public.meetings mt, b
                   where mt.tenant_id = p_tenant and mt.attended_at >= b.prev_from and mt.attended_at < b.cur_from)
    ),
    'active_opportunities', jsonb_build_object(
      'value', (select count(*) from public.opportunities o
                where o.tenant_id = p_tenant and o.stage not in ('won', 'lost')),
      'previous', (select count(*) from public.opportunities o, b
                   where o.tenant_id = p_tenant and o.created_at < b.cur_from
                     and (o.won_at is null or o.won_at >= b.cur_from)
                     and (o.lost_at is null or o.lost_at >= b.cur_from))
    ),
    'pipeline_value', jsonb_build_object(
      'value', (select coalesce(sum(o.estimated_value_inr), 0) from public.opportunities o
                where o.tenant_id = p_tenant and o.stage not in ('won', 'lost')),
      'previous', (select coalesce(sum(o.estimated_value_inr), 0) from public.opportunities o, b
                   where o.tenant_id = p_tenant and o.created_at < b.cur_from
                     and (o.won_at is null or o.won_at >= b.cur_from)
                     and (o.lost_at is null or o.lost_at >= b.cur_from))
    ),
    'workflow_success_rate', jsonb_build_object(
      'value', (select case when cur_ok + cur_fail = 0 then null
                            else round(100.0 * cur_ok / (cur_ok + cur_fail), 1) end from wf),
      'previous', (select case when prev_ok + prev_fail = 0 then null
                               else round(100.0 * prev_ok / (prev_ok + prev_fail), 1) end from wf)
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Acquisition funnel: companies reaching each milestone inside the period.
-- ---------------------------------------------------------------------------
create function public.dashboard_funnel(p_tenant uuid, p_from timestamptz, p_to timestamptz)
returns table (stage text, ordinal int, companies bigint)
language sql
stable
set search_path = ''
as $$
  select v.stage, v.ordinal, v.companies
  from (
    select
      count(*) filter (where c.discovered_at >= p_from and c.discovered_at < p_to) as discovered,
      count(*) filter (where c.researched_at >= p_from and c.researched_at < p_to) as researched,
      count(*) filter (where c.verified_at >= p_from and c.verified_at < p_to) as verified,
      count(*) filter (where c.qualified_at >= p_from and c.qualified_at < p_to) as qualified,
      count(*) filter (where c.first_contacted_at >= p_from and c.first_contacted_at < p_to) as contacted,
      count(*) filter (where c.first_positive_reply_at >= p_from and c.first_positive_reply_at < p_to) as positive_reply,
      count(*) filter (where c.first_meeting_at >= p_from and c.first_meeting_at < p_to) as meeting,
      count(*) filter (where c.customer_at >= p_from and c.customer_at < p_to) as customer
    from public.companies c
    where c.tenant_id = p_tenant
  ) f
  cross join lateral (
    values
      ('discovered', 1, f.discovered),
      ('researched', 2, f.researched),
      ('verified', 3, f.verified),
      ('qualified', 4, f.qualified),
      ('contacted', 5, f.contacted),
      ('positive_reply', 6, f.positive_reply),
      ('meeting', 7, f.meeting),
      ('customer', 8, f.customer)
  ) as v (stage, ordinal, companies)
  order by v.ordinal;
$$;

-- ---------------------------------------------------------------------------
-- Industry performance. Rates use companies contacted in the period as the base.
-- ---------------------------------------------------------------------------
create function public.industry_performance(p_tenant uuid, p_from timestamptz, p_to timestamptz)
returns table (
  industry_id uuid,
  industry_name text,
  discovered bigint,
  qualified bigint,
  contacted bigint,
  replied bigint,
  positive_replies bigint,
  positive_reply_rate numeric,
  meetings bigint,
  proposals bigint,
  won bigint,
  revenue_inr numeric,
  gross_profit_inr numeric,
  acquisition_cost_inr numeric
)
language sql
stable
set search_path = ''
as $$
  with comp as (
    select
      c.industry_id,
      count(*) filter (where c.discovered_at >= p_from and c.discovered_at < p_to) as discovered,
      count(*) filter (where c.qualified_at >= p_from and c.qualified_at < p_to) as qualified
    from public.companies c
    where c.tenant_id = p_tenant
    group by c.industry_id
  ),
  msg as (
    select
      c.industry_id,
      count(distinct m.company_id) filter (
        where m.direction = 'outbound' and m.sent_at >= p_from and m.sent_at < p_to) as contacted,
      count(distinct m.company_id) filter (
        where m.direction = 'inbound' and m.received_at >= p_from and m.received_at < p_to) as replied,
      count(distinct m.company_id) filter (
        where m.direction = 'inbound' and public.is_positive_intent(m.intent)
          and m.received_at >= p_from and m.received_at < p_to) as positive_replies
    from public.messages m
    join public.companies c on c.id = m.company_id
    where m.tenant_id = p_tenant
    group by c.industry_id
  ),
  meet as (
    select c.industry_id, count(*) as meetings
    from public.meetings mt
    join public.companies c on c.id = mt.company_id
    where mt.tenant_id = p_tenant and mt.booked_at >= p_from and mt.booked_at < p_to
    group by c.industry_id
  ),
  opp as (
    select
      c.industry_id,
      count(*) filter (where o.proposal_sent_at >= p_from and o.proposal_sent_at < p_to) as proposals,
      count(*) filter (where o.won_at >= p_from and o.won_at < p_to) as won,
      coalesce(sum(o.collected_revenue_inr) filter (where o.won_at >= p_from and o.won_at < p_to), 0) as revenue_inr,
      coalesce(sum(o.collected_revenue_inr - o.delivery_cost_inr)
        filter (where o.won_at >= p_from and o.won_at < p_to), 0) as gross_profit_inr
    from public.opportunities o
    join public.companies c on c.id = o.company_id
    where o.tenant_id = p_tenant
    group by c.industry_id
  ),
  cost as (
    select x.industry_id, sum(x.spend) as acquisition_cost_inr
    from (
      select e.industry_id, e.spend_inr as spend
      from public.industry_experiments e where e.tenant_id = p_tenant
      union all
      select ca.industry_id, ca.spend_inr
      from public.campaigns ca where ca.tenant_id = p_tenant and ca.industry_id is not null
    ) x
    group by x.industry_id
  )
  select
    i.id,
    i.name,
    coalesce(comp.discovered, 0),
    coalesce(comp.qualified, 0),
    coalesce(msg.contacted, 0),
    coalesce(msg.replied, 0),
    coalesce(msg.positive_replies, 0),
    case when coalesce(msg.contacted, 0) = 0 then null
         else round(100.0 * msg.positive_replies / msg.contacted, 1) end,
    coalesce(meet.meetings, 0),
    coalesce(opp.proposals, 0),
    coalesce(opp.won, 0),
    coalesce(opp.revenue_inr, 0),
    coalesce(opp.gross_profit_inr, 0),
    coalesce(cost.acquisition_cost_inr, 0)
  from public.industries i
  left join comp on comp.industry_id = i.id
  left join msg on msg.industry_id = i.id
  left join meet on meet.industry_id = i.id
  left join opp on opp.industry_id = i.id
  left join cost on cost.industry_id = i.id
  where i.tenant_id = p_tenant and i.is_active
  order by coalesce(comp.qualified, 0) desc, i.name;
$$;

-- ---------------------------------------------------------------------------
-- Acquisition channel performance.
-- ---------------------------------------------------------------------------
create function public.channel_performance(p_tenant uuid, p_from timestamptz, p_to timestamptz)
returns table (
  channel public.acquisition_channel,
  leads bigint,
  qualified bigint,
  positive_replies bigint,
  meetings bigint,
  won bigint,
  revenue_inr numeric,
  gross_profit_inr numeric
)
language sql
stable
set search_path = ''
as $$
  with ch as (
    select unnest(enum_range(null::public.acquisition_channel)) as channel
  ),
  comp as (
    select
      c.acquisition_channel as channel,
      count(*) filter (where c.discovered_at >= p_from and c.discovered_at < p_to) as leads,
      count(*) filter (where c.qualified_at >= p_from and c.qualified_at < p_to) as qualified,
      count(*) filter (where c.first_positive_reply_at >= p_from and c.first_positive_reply_at < p_to) as positive_replies,
      count(*) filter (where c.first_meeting_at >= p_from and c.first_meeting_at < p_to) as meetings
    from public.companies c
    where c.tenant_id = p_tenant
    group by c.acquisition_channel
  ),
  opp as (
    select
      c.acquisition_channel as channel,
      count(*) filter (where o.won_at >= p_from and o.won_at < p_to) as won,
      coalesce(sum(o.collected_revenue_inr) filter (where o.won_at >= p_from and o.won_at < p_to), 0) as revenue_inr,
      coalesce(sum(o.collected_revenue_inr - o.delivery_cost_inr)
        filter (where o.won_at >= p_from and o.won_at < p_to), 0) as gross_profit_inr
    from public.opportunities o
    join public.companies c on c.id = o.company_id
    where o.tenant_id = p_tenant
    group by c.acquisition_channel
  )
  select
    ch.channel,
    coalesce(comp.leads, 0),
    coalesce(comp.qualified, 0),
    coalesce(comp.positive_replies, 0),
    coalesce(comp.meetings, 0),
    coalesce(opp.won, 0),
    coalesce(opp.revenue_inr, 0),
    coalesce(opp.gross_profit_inr, 0)
  from ch
  left join comp on comp.channel = ch.channel
  left join opp on opp.channel = ch.channel
  order by ch.channel;
$$;

-- ---------------------------------------------------------------------------
-- Discovered and qualified companies per day or week, in the workspace timezone.
-- ---------------------------------------------------------------------------
create function public.lead_generation_series(
  p_tenant uuid, p_from timestamptz, p_to timestamptz, p_bucket text default 'day'
)
returns table (bucket_start date, discovered bigint, qualified bigint)
language sql
stable
set search_path = ''
as $$
  with ws as (
    select
      timezone as tz,
      case when p_bucket = 'week' then 'week' else 'day' end as unit,
      case when p_bucket = 'week' then interval '1 week' else interval '1 day' end as step
    from public.workspaces where id = p_tenant
  ),
  series as (
    select generate_series(
      date_trunc(ws.unit, p_from at time zone ws.tz),
      date_trunc(ws.unit, (p_to - interval '1 second') at time zone ws.tz),
      ws.step
    ) as bucket
    from ws
  )
  select
    s.bucket::date,
    (select count(*) from public.companies c, ws
     where c.tenant_id = p_tenant and c.discovered_at >= p_from and c.discovered_at < p_to
       and date_trunc(ws.unit, c.discovered_at at time zone ws.tz) = s.bucket),
    (select count(*) from public.companies c, ws
     where c.tenant_id = p_tenant and c.qualified_at >= p_from and c.qualified_at < p_to
       and date_trunc(ws.unit, c.qualified_at at time zone ws.tz) = s.bucket)
  from series s
  order by s.bucket;
$$;

-- ---------------------------------------------------------------------------
-- Pipeline by stage. Open stages show the current book; won and lost show
-- deals closed inside the period.
-- ---------------------------------------------------------------------------
create function public.pipeline_by_stage(p_tenant uuid, p_from timestamptz, p_to timestamptz)
returns table (stage public.opportunity_stage, opportunities bigint, value_inr numeric)
language sql
stable
set search_path = ''
as $$
  with st as (
    select unnest(enum_range(null::public.opportunity_stage)) as stage
  )
  select
    st.stage,
    count(o.id),
    coalesce(sum(o.estimated_value_inr), 0)
  from st
  left join public.opportunities o
    on o.tenant_id = p_tenant
   and o.stage = st.stage
   and (
     o.stage not in ('won', 'lost')
     or (o.stage = 'won' and o.won_at >= p_from and o.won_at < p_to)
     or (o.stage = 'lost' and o.lost_at >= p_from and o.lost_at < p_to)
   )
  group by st.stage
  order by st.stage;
$$;

-- ---------------------------------------------------------------------------
-- Workflow execution counts per workflow for the period.
-- ---------------------------------------------------------------------------
create function public.workflow_stats(p_tenant uuid, p_from timestamptz, p_to timestamptz)
returns table (
  workflow_key text,
  workflow_name text,
  succeeded bigint,
  failed bigint,
  running bigint,
  queued bigint,
  cancelled bigint,
  avg_duration_ms numeric
)
language sql
stable
set search_path = ''
as $$
  select
    j.workflow_key,
    j.name,
    count(e.id) filter (where e.status = 'succeeded'),
    count(e.id) filter (where e.status = 'failed'),
    count(e.id) filter (where e.status = 'running'),
    count(e.id) filter (where e.status = 'queued'),
    count(e.id) filter (where e.status = 'cancelled'),
    round(avg(e.duration_ms) filter (where e.status = 'succeeded'))
  from public.workflow_jobs j
  left join public.workflow_executions e
    on e.job_id = j.id and e.queued_at >= p_from and e.queued_at < p_to
  where j.tenant_id = p_tenant
  group by j.workflow_key, j.name
  order by j.workflow_key;
$$;

-- These are for signed-in users only.
revoke all on public.leads_view from anon;
revoke execute on function public.dashboard_kpis(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.dashboard_funnel(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.industry_performance(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.channel_performance(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.lead_generation_series(uuid, timestamptz, timestamptz, text) from public, anon;
revoke execute on function public.pipeline_by_stage(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.workflow_stats(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.dashboard_kpis(uuid, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.dashboard_funnel(uuid, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.industry_performance(uuid, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.channel_performance(uuid, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.lead_generation_series(uuid, timestamptz, timestamptz, text) to authenticated, service_role;
grant execute on function public.pipeline_by_stage(uuid, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.workflow_stats(uuid, timestamptz, timestamptz) to authenticated, service_role;
