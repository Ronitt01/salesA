import "server-only";
import { z } from "zod";
import type { SessionContext } from "@/server/auth/context";
import { Constants, type Database } from "@/server/db/database.types";

type Enums = Database["public"]["Enums"];
export type LeadRow = Database["public"]["Views"]["leads_view"]["Row"];

const E = Constants.public.Enums;

export const LEAD_SORT_COLUMNS = [
  "company_name",
  "contact_name",
  "industry_name",
  "state",
  "employee_count_estimate",
  "opportunity_score",
  "contact_reliability",
  "lead_stage",
  "last_researched_at",
  "discovered_at",
] as const;
export type LeadSortColumn = (typeof LEAD_SORT_COLUMNS)[number];

export const PAGE_SIZES = [25, 50, 100] as const;

const csv = <T extends string>(allowed: readonly T[]) =>
  z
    .string()
    .optional()
    .transform((value) => (value ? value.split(",").filter((v): v is T => (allowed as readonly string[]).includes(v)) : []));

const optionalUuid = z.string().uuid().optional().catch(undefined);
const optionalScore = z.coerce.number().int().min(0).max(100).optional().catch(undefined);

/** Every filter the Lead Explorer accepts, parsed from URL search params. */
export const leadFiltersSchema = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  industry: optionalUuid,
  state: z.string().trim().max(60).optional().catch(undefined),
  employees: csv(E.employee_range),
  score_min: optionalScore,
  score_max: optionalScore,
  signal: z.enum(E.signal_type).optional().catch(undefined),
  service: optionalUuid,
  stage: csv(E.lead_stage),
  verification: z.enum(E.verification_status).optional().catch(undefined),
  source: z.enum(E.source_kind).optional().catch(undefined),
  researched: z.enum(["7d", "30d", "90d", "never"]).optional().catch(undefined),
  qualified: z.enum(["yes", "no"]).optional().catch(undefined),
  tag: z.string().trim().max(40).optional().catch(undefined),
  sort: z.enum(LEAD_SORT_COLUMNS).default("opportunity_score").catch("opportunity_score"),
  dir: z.enum(["asc", "desc"]).default("desc").catch("desc"),
  page: z.coerce.number().int().min(1).default(1).catch(1),
  per: z.coerce.number().int().refine((v) => (PAGE_SIZES as readonly number[]).includes(v)).default(25).catch(25),
});

export type LeadFilters = z.infer<typeof leadFiltersSchema>;

export function parseLeadFilters(params: Record<string, string | string[] | undefined>): LeadFilters {
  const flat = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  return leadFiltersSchema.parse(flat);
}

/** Filters that narrow the result set (excludes sort and paging). */
export function activeFilterCount(f: LeadFilters): number {
  return [
    f.q,
    f.industry,
    f.state,
    f.employees.length > 0,
    f.score_min !== undefined,
    f.score_max !== undefined,
    f.signal,
    f.service,
    f.stage.length > 0,
    f.verification,
    f.source,
    f.researched,
    f.qualified,
    f.tag,
  ].filter(Boolean).length;
}

/** Characters with meaning in PostgREST filter syntax are removed from free text. */
function sanitiseSearch(q: string): string {
  return q.replace(/[,()*%\\"':]/g, " ").replace(/\s+/g, " ").trim();
}

const DAY_MS = 86_400_000;

function applyFilters<Q>(query: Q, f: LeadFilters, now: Date): Q {
  // The Supabase builder is chainable; `any` is avoided by re-typing through a minimal interface.
  type Chain = {
    eq(c: string, v: unknown): Chain;
    in(c: string, v: readonly unknown[]): Chain;
    gte(c: string, v: unknown): Chain;
    lte(c: string, v: unknown): Chain;
    is(c: string, v: null): Chain;
    or(filters: string): Chain;
    contains(c: string, v: readonly unknown[]): Chain;
  };
  let q = query as unknown as Chain;

  if (f.q) {
    const term = sanitiseSearch(f.q);
    if (term) q = q.or(`company_name.ilike.%${term}%,contact_name.ilike.%${term}%,domain.ilike.%${term}%,city.ilike.%${term}%`);
  }
  if (f.industry) q = q.eq("industry_id", f.industry);
  if (f.state) q = q.eq("state", f.state);
  if (f.employees.length > 0) q = q.in("employee_range", f.employees);
  if (f.score_min !== undefined) q = q.gte("opportunity_score", f.score_min);
  if (f.score_max !== undefined) q = q.lte("opportunity_score", f.score_max);
  if (f.signal) q = q.contains("active_signal_types", [f.signal]);
  if (f.service) q = q.eq("recommended_service_id", f.service);
  if (f.stage.length > 0) q = q.in("lead_stage", f.stage);
  if (f.verification) q = q.eq("contact_verification_status", f.verification);
  if (f.source) q = q.eq("source_kind", f.source);
  if (f.qualified) q = q.eq("is_qualified", f.qualified === "yes");
  if (f.tag) q = q.contains("tags", [f.tag]);
  if (f.researched === "never") q = q.is("last_researched_at", null);
  else if (f.researched) {
    const days = { "7d": 7, "30d": 30, "90d": 90 }[f.researched];
    q = q.gte("last_researched_at", new Date(now.getTime() - days * DAY_MS).toISOString());
  }
  return q as unknown as Q;
}

export async function listLeads(ctx: SessionContext, filters: LeadFilters, now: Date) {
  const from = (filters.page - 1) * filters.per;
  const base = ctx.supabase.from("leads_view").select("*", { count: "exact" }).eq("tenant_id", ctx.tenantId);
  const { data, error, count } = await applyFilters(base, filters, now)
    .order(filters.sort, { ascending: filters.dir === "asc", nullsFirst: false })
    .order("id", { ascending: true })
    .range(from, from + filters.per - 1);

  if (error) throw new Error(`Could not load leads: ${error.message}`);
  return { rows: data ?? [], total: count ?? 0 };
}

/** All rows matching the filters, for export. Capped to keep exports bounded. */
export async function listLeadsForExport(ctx: SessionContext, filters: LeadFilters, now: Date, cap = 5000) {
  const base = ctx.supabase.from("leads_view").select("*").eq("tenant_id", ctx.tenantId);
  const { data, error } = await applyFilters(base, filters, now)
    .order(filters.sort, { ascending: filters.dir === "asc", nullsFirst: false })
    .limit(cap);
  if (error) throw new Error(`Could not export leads: ${error.message}`);
  return data ?? [];
}

export async function getLeadFilterOptions(ctx: SessionContext) {
  const [industries, services, saved] = await Promise.all([
    ctx.supabase.from("industries").select("id, name").eq("tenant_id", ctx.tenantId).eq("is_active", true).order("name"),
    ctx.supabase.from("service_catalogue").select("id, name").eq("tenant_id", ctx.tenantId).eq("is_active", true).order("name"),
    ctx.supabase
      .from("saved_filters")
      .select("id, name, params")
      .eq("tenant_id", ctx.tenantId)
      .eq("user_id", ctx.user.id)
      .eq("scope", "leads")
      .order("name"),
  ]);
  if (industries.error) throw new Error(industries.error.message);
  if (services.error) throw new Error(services.error.message);
  if (saved.error) throw new Error(saved.error.message);
  return {
    industries: industries.data,
    services: services.data,
    savedFilters: saved.data.map((s) => ({
      id: s.id,
      name: s.name,
      params: (s.params ?? {}) as Record<string, string>,
    })),
  };
}

export async function getLeadDetail(ctx: SessionContext, companyId: string) {
  const { supabase, tenantId } = ctx;
  const scoped = <T extends { eq(c: string, v: string): T }>(q: T) => q.eq("tenant_id", tenantId).eq("company_id", companyId);

  const [company, contacts, research, signals, opportunities, snapshots, messages, meetings, activities] = await Promise.all([
    supabase
      .from("companies")
      .select("*, industries(id, name), sources(kind, label, provider, retrieved_at, licence_note)")
      .eq("tenant_id", tenantId)
      .eq("id", companyId)
      .maybeSingle(),
    scoped(
      supabase
        .from("contacts")
        .select("*, sources(kind, label), contact_verifications(id, provider, result, checked_at)"),
    )
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true }),
    scoped(supabase.from("research_records").select("*")).order("researched_at", { ascending: false }),
    scoped(supabase.from("buying_signals").select("*")).order("observed_at", { ascending: false }),
    scoped(supabase.from("opportunities").select("*, service_catalogue(id, name)")).order("created_at", { ascending: false }),
    scoped(supabase.from("lead_score_snapshots").select("*")).order("computed_at", { ascending: false }).limit(5),
    scoped(supabase.from("messages").select("*, contacts(full_name)")).order("created_at", { ascending: true }),
    scoped(supabase.from("meetings").select("*, contacts(full_name)")).order("starts_at", { ascending: false }),
    scoped(supabase.from("activities").select("*, users(full_name, email)")).order("occurred_at", { ascending: false }).limit(60),
  ]);

  for (const r of [company, contacts, research, signals, opportunities, snapshots, messages, meetings, activities]) {
    if (r.error) throw new Error(`Could not load lead: ${r.error.message}`);
  }
  if (!company.data) return null;

  return {
    company: company.data,
    contacts: contacts.data ?? [],
    research: research.data ?? [],
    signals: signals.data ?? [],
    opportunities: opportunities.data ?? [],
    snapshots: snapshots.data ?? [],
    messages: messages.data ?? [],
    meetings: meetings.data ?? [],
    activities: activities.data ?? [],
  };
}

export type LeadDetail = NonNullable<Awaited<ReturnType<typeof getLeadDetail>>>;
export type { Enums as LeadEnums };
