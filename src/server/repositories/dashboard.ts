import "server-only";
import { z } from "zod";
import type { SessionContext } from "@/server/auth/context";
import type { Database } from "@/server/db/database.types";
import type { ResolvedRange } from "@/lib/date-range";
import { buildDailyInsights, buildIndustryRecommendations } from "@/server/services/analytics/insights";

type Enums = Database["public"]["Enums"];

const metric = z.object({ value: z.number().nullable(), previous: z.number().nullable() });
const kpiSchema = z.object({
  new_qualified_today: metric,
  total_qualified: metric,
  high_priority: metric,
  positive_replies: metric,
  meetings_booked: metric,
  meetings_attended: metric,
  active_opportunities: metric,
  pipeline_value: metric,
  workflow_success_rate: metric,
});

export type DashboardKpis = z.infer<typeof kpiSchema>;
export type KpiMetric = z.infer<typeof metric>;

export interface FunnelRow {
  stage: string;
  companies: number;
}
export interface IndustryRow {
  industryId: string;
  industry: string;
  discovered: number;
  qualified: number;
  contacted: number;
  positiveReplies: number;
  positiveReplyRate: number | null;
  meetings: number;
  proposals: number;
  won: number;
  revenue: number;
  grossProfit: number;
  acquisitionCost: number;
}
export interface ChannelRow {
  channel: Enums["acquisition_channel"];
  leads: number;
  qualified: number;
  positiveReplies: number;
  meetings: number;
  won: number;
  revenue: number;
  grossProfit: number;
}
export interface SeriesRow {
  date: string;
  discovered: number;
  qualified: number;
}
export interface PipelineRow {
  stage: Enums["opportunity_stage"];
  opportunities: number;
  value: number;
}
export interface WorkflowRow {
  key: string;
  name: string;
  succeeded: number;
  failed: number;
  running: number;
  queued: number;
  cancelled: number;
  avgDurationMs: number | null;
}

export interface DashboardData {
  kpis: DashboardKpis;
  funnel: FunnelRow[];
  industries: IndustryRow[];
  channels: ChannelRow[];
  series: SeriesRow[];
  bucket: "day" | "week";
  pipeline: PipelineRow[];
  workflows: WorkflowRow[];
  topOpportunities: Array<{
    id: string;
    company: string;
    industry: string | null;
    score: number | null;
    priority: Enums["lead_priority"] | null;
    stage: Enums["lead_stage"];
    service: string | null;
    signal: string | null;
    isDemo: boolean;
  }>;
  positiveReplies: Array<{
    id: string;
    companyId: string;
    company: string;
    contact: string;
    intent: Enums["reply_intent"];
    excerpt: string;
    receivedAt: string;
  }>;
  upcomingMeetings: Array<{
    id: string;
    companyId: string;
    title: string;
    contact: string;
    startsAt: string;
    status: Enums["meeting_status"];
  }>;
  recentSignals: Array<{
    id: string;
    companyId: string;
    company: string;
    type: Enums["signal_type"];
    summary: string;
    observedAt: string;
    confidence: number;
    sourceUrl: string;
  }>;
  failures: Array<{ id: string; key: string; error: string; finishedAt: string | null }>;
  recommendations: ReturnType<typeof buildIndustryRecommendations>;
  insights: ReturnType<typeof buildDailyInsights>;
  dailyTarget: number;
}

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`Dashboard query failed (${what}): ${result.error.message}`);
  if (result.data === null) throw new Error(`Dashboard query returned nothing (${what})`);
  return result.data;
}

const n = (value: number | string | null | undefined): number => (value === null || value === undefined ? 0 : Number(value));

export async function getDashboardData(
  ctx: SessionContext,
  range: ResolvedRange,
  bucket: "day" | "week",
  now: Date,
): Promise<DashboardData> {
  const { supabase, tenantId } = ctx;
  const args = { p_tenant: tenantId, p_from: range.from, p_to: range.to };
  const nowIso = now.toISOString();

  const [kpis, funnel, industries, channels, series, pipeline, workflows, top, replies, meetings, signals, failures] =
    await Promise.all([
      supabase.rpc("dashboard_kpis", args),
      supabase.rpc("dashboard_funnel", args),
      supabase.rpc("industry_performance", args),
      supabase.rpc("channel_performance", args),
      supabase.rpc("lead_generation_series", { ...args, p_bucket: bucket }),
      supabase.rpc("pipeline_by_stage", args),
      supabase.rpc("workflow_stats", args),
      supabase
        .from("leads_view")
        .select(
          "id, company_name, industry_name, opportunity_score, priority, lead_stage, recommended_service_name, top_signal_type, top_signal_summary, is_demo",
        )
        .eq("tenant_id", tenantId)
        .eq("is_qualified", true)
        .in("lead_stage", ["qualified", "contacted", "positive_reply", "meeting"])
        .order("opportunity_score", { ascending: false, nullsFirst: false })
        .limit(6),
      supabase
        .from("messages")
        .select("id, intent, body, received_at, company_id, companies(name), contacts(full_name)")
        .eq("tenant_id", tenantId)
        .eq("direction", "inbound")
        .in("intent", ["interested", "wants_meeting", "wants_pricing", "requests_information"])
        .order("received_at", { ascending: false })
        .limit(5),
      supabase
        .from("meetings")
        .select("id, title, starts_at, status, company_id, contacts(full_name)")
        .eq("tenant_id", tenantId)
        .in("status", ["booked", "rescheduled"])
        .gte("starts_at", nowIso)
        .order("starts_at", { ascending: true })
        .limit(5),
      supabase
        .from("buying_signals")
        .select("id, signal_type, evidence_summary, observed_at, confidence, source_url, company_id, companies(name)")
        .eq("tenant_id", tenantId)
        .gt("expires_at", nowIso)
        .neq("verification_status", "rejected")
        .order("observed_at", { ascending: false })
        .limit(6),
      supabase
        .from("workflow_executions")
        .select("id, workflow_key, error_message, finished_at")
        .eq("tenant_id", tenantId)
        .eq("status", "failed")
        .order("finished_at", { ascending: false })
        .limit(5),
    ]);

  const parsedKpis = kpiSchema.parse(unwrap(kpis, "kpis"));

  const industryRows: IndustryRow[] = unwrap(industries, "industry performance").map((r) => ({
    industryId: r.industry_id,
    industry: r.industry_name,
    discovered: n(r.discovered),
    qualified: n(r.qualified),
    contacted: n(r.contacted),
    positiveReplies: n(r.positive_replies),
    positiveReplyRate: r.positive_reply_rate === null ? null : Number(r.positive_reply_rate),
    meetings: n(r.meetings),
    proposals: n(r.proposals),
    won: n(r.won),
    revenue: n(r.revenue_inr),
    grossProfit: n(r.gross_profit_inr),
    acquisitionCost: n(r.acquisition_cost_inr),
  }));

  const channelRows: ChannelRow[] = unwrap(channels, "channel performance").map((r) => ({
    channel: r.channel,
    leads: n(r.leads),
    qualified: n(r.qualified),
    positiveReplies: n(r.positive_replies),
    meetings: n(r.meetings),
    won: n(r.won),
    revenue: n(r.revenue_inr),
    grossProfit: n(r.gross_profit_inr),
  }));

  const funnelRows: FunnelRow[] = unwrap(funnel, "funnel").map((r) => ({ stage: r.stage, companies: n(r.companies) }));
  const seriesRows: SeriesRow[] = unwrap(series, "lead generation").map((r) => ({
    date: r.bucket_start,
    discovered: n(r.discovered),
    qualified: n(r.qualified),
  }));
  const pipelineRows: PipelineRow[] = unwrap(pipeline, "pipeline").map((r) => ({
    stage: r.stage,
    opportunities: n(r.opportunities),
    value: n(r.value_inr),
  }));
  const workflowRows: WorkflowRow[] = unwrap(workflows, "workflow stats").map((r) => ({
    key: r.workflow_key,
    name: r.workflow_name,
    succeeded: n(r.succeeded),
    failed: n(r.failed),
    running: n(r.running),
    queued: n(r.queued),
    cancelled: n(r.cancelled),
    avgDurationMs: r.avg_duration_ms === null ? null : Number(r.avg_duration_ms),
  }));

  return {
    kpis: parsedKpis,
    funnel: funnelRows,
    industries: industryRows,
    channels: channelRows,
    series: seriesRows,
    bucket,
    pipeline: pipelineRows,
    workflows: workflowRows,
    topOpportunities: unwrap(top, "top opportunities").map((r) => ({
      id: r.id as string,
      company: r.company_name ?? "Unnamed company",
      industry: r.industry_name,
      score: r.opportunity_score,
      priority: r.priority,
      stage: r.lead_stage as Enums["lead_stage"],
      service: r.recommended_service_name,
      signal: r.top_signal_summary,
      isDemo: Boolean(r.is_demo),
    })),
    positiveReplies: unwrap(replies, "positive replies").map((r) => ({
      id: r.id,
      companyId: r.company_id,
      company: r.companies?.name ?? "Unknown company",
      contact: r.contacts?.full_name ?? "Unknown contact",
      intent: r.intent as Enums["reply_intent"],
      excerpt: r.body.split("\n")[0].slice(0, 140),
      receivedAt: r.received_at ?? nowIso,
    })),
    upcomingMeetings: unwrap(meetings, "upcoming meetings").map((r) => ({
      id: r.id,
      companyId: r.company_id,
      title: r.title,
      contact: r.contacts?.full_name ?? "Unknown contact",
      startsAt: r.starts_at,
      status: r.status,
    })),
    recentSignals: unwrap(signals, "recent signals").map((r) => ({
      id: r.id,
      companyId: r.company_id,
      company: r.companies?.name ?? "Unknown company",
      type: r.signal_type,
      summary: r.evidence_summary,
      observedAt: r.observed_at,
      confidence: Number(r.confidence),
      sourceUrl: r.source_url,
    })),
    failures: unwrap(failures, "failures").map((r) => ({
      id: r.id,
      key: r.workflow_key,
      error: r.error_message ?? "No error message recorded",
      finishedAt: r.finished_at,
    })),
    recommendations: buildIndustryRecommendations(industryRows),
    insights: buildDailyInsights({
      kpis: parsedKpis,
      industries: industryRows,
      channels: channelRows,
      workflows: workflowRows,
      dailyTarget: ctx.workspace.daily_qualified_target,
      rangeLabel: range.label,
    }),
    dailyTarget: ctx.workspace.daily_qualified_target,
  };
}
