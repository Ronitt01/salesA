-- Expose the primary contact's do-not-contact flag and the company's branch count on
-- the Lead Explorer read model. Exports use the flag to withhold contact details.
-- CREATE OR REPLACE VIEW may only append columns, so the new ones go at the end.
create or replace view public.leads_view
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
  (dup.same_name_count > 1) as possible_duplicate,
  coalesce(pc.do_not_contact, false) as contact_do_not_contact,
  c.branch_count
from public.companies c
left join public.industries i on i.id = c.industry_id
left join public.sources s on s.id = c.source_id
left join lateral (
  select ct.id, ct.full_name, ct.job_title, ct.email, ct.verification_status, ct.reliability_score, ct.do_not_contact
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

revoke all on public.leads_view from anon;
