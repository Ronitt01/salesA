import "server-only";
import type { SessionContext } from "@/server/auth/context";
import type { ResolvedRange } from "@/lib/date-range";
import { buildIndustryRecommendations } from "@/server/services/analytics/insights";
import { scoreIndustry } from "@/server/services/market/industry-score";

/** Read models for Market Intelligence, Analytics and Automations. */

const n = (value: number | string | null | undefined): number => (value === null || value === undefined ? 0 : Number(value));

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`Could not load ${what}: ${result.error.message}`);
  if (result.data === null) throw new Error(`Could not load ${what}: no data returned`);
  return result.data;
}

async function industryRows(ctx: SessionContext, range: ResolvedRange) {
  const result = await ctx.supabase.rpc("industry_performance", { p_tenant: ctx.tenantId, p_from: range.from, p_to: range.to });
  return unwrap(result, "industry performance").map((r) => ({
    industryId: r.industry_id,
    industry: r.industry_name,
    discovered: n(r.discovered),
    qualified: n(r.qualified),
    contacted: n(r.contacted),
    replied: n(r.replied),
    positiveReplies: n(r.positive_replies),
    positiveReplyRate: r.positive_reply_rate === null ? null : Number(r.positive_reply_rate),
    meetings: n(r.meetings),
    proposals: n(r.proposals),
    won: n(r.won),
    revenue: n(r.revenue_inr),
    grossProfit: n(r.gross_profit_inr),
    acquisitionCost: n(r.acquisition_cost_inr),
  }));
}

export async function getMarketIntelligence(ctx: SessionContext, range: ResolvedRange) {
  const [rows, experiments] = await Promise.all([
    industryRows(ctx, range),
    ctx.supabase
      .from("industry_experiments")
      .select("*")
      .eq("tenant_id", ctx.tenantId)
      .order("created_at", { ascending: false }),
  ]);
  const experimentRows = unwrap(experiments, "industry experiments");
  const recommendations = new Map(buildIndustryRecommendations(rows).map((r) => [r.industryId, r]));

  const industries = rows
    .map((row) => {
      const experiment = experimentRows.find((e) => e.industry_id === row.industryId) ?? null;
      const scored = scoreIndustry(
        {
          problemEvidence: experiment?.assumed_problem_evidence ?? 5,
          abilityToPay: experiment?.assumed_ability_to_pay ?? 5,
          decisionMakerAccess: experiment?.assumed_decision_maker_access ?? 5,
          dealSize: experiment?.assumed_deal_size ?? 5,
          recurringPotential: experiment?.assumed_recurring_potential ?? 5,
          deliveryProfitability: experiment?.assumed_delivery_profitability ?? 5,
        },
        row,
      );
      return { ...row, experiment, scored, recommendation: recommendations.get(row.industryId) ?? null };
    })
    .sort((a, b) => b.scored.score - a.scored.score);

  return { industries };
}

export async function getAnalytics(ctx: SessionContext, range: ResolvedRange) {
  const { supabase, tenantId } = ctx;
  const args = { p_tenant: tenantId, p_from: range.from, p_to: range.to };

  const [funnel, industries, channels, workflows, companies, contacts, opportunities, meetings, messages, experiments, campaigns] =
    await Promise.all([
      supabase.rpc("dashboard_funnel", args),
      industryRows(ctx, range),
      supabase.rpc("channel_performance", args),
      supabase.rpc("workflow_stats", args),
      supabase
        .from("companies")
        .select("id, opportunity_score, priority, is_qualified, domain, employee_range, last_researched_at, industry_id")
        .eq("tenant_id", tenantId)
        .limit(10000),
      supabase.from("contacts").select("company_id, verification_status, email, last_verified_at").eq("tenant_id", tenantId).limit(20000),
      supabase
        .from("opportunities")
        .select("stage, won_at, lost_at, proposal_sent_at, collected_revenue_inr, delivery_cost_inr, estimated_value_inr, owner_user_id, users(full_name, email)")
        .eq("tenant_id", tenantId)
        .limit(10000),
      supabase.from("meetings").select("booked_at, attended_at, status").eq("tenant_id", tenantId).limit(10000),
      supabase
        .from("messages")
        .select("direction, intent, sent_at, received_at, company_id")
        .eq("tenant_id", tenantId)
        .or(`and(sent_at.gte.${range.from},sent_at.lt.${range.to}),and(received_at.gte.${range.from},received_at.lt.${range.to})`)
        .limit(20000),
      supabase.from("industry_experiments").select("spend_inr").eq("tenant_id", tenantId),
      supabase.from("campaigns").select("spend_inr").eq("tenant_id", tenantId),
    ]);

  const companyRows = unwrap(companies, "companies");
  const contactRows = unwrap(contacts, "contacts");
  const oppRows = unwrap(opportunities, "opportunities");
  const meetingRows = unwrap(meetings, "meetings");
  const messageRows = unwrap(messages, "messages");
  const inRange = (iso: string | null) => iso !== null && iso >= range.from && iso < range.to;

  // Lead quality distribution
  const buckets = [
    { label: "80–100 (Priority A)", min: 80, max: 100 },
    { label: "65–79 (Priority B)", min: 65, max: 79 },
    { label: "50–64", min: 50, max: 64 },
    { label: "Below 50", min: 0, max: 49 },
  ].map((b) => ({
    ...b,
    count: companyRows.filter((c) => c.opportunity_score !== null && c.opportunity_score >= b.min && c.opportunity_score <= b.max).length,
  }));
  const unscored = companyRows.filter((c) => c.opportunity_score === null).length;

  // Conversion metrics for the period
  const positive = new Set(["interested", "wants_meeting", "wants_pricing", "requests_information"]);
  const contacted = new Set(messageRows.filter((m) => m.direction === "outbound" && inRange(m.sent_at)).map((m) => m.company_id));
  const replied = new Set(messageRows.filter((m) => m.direction === "inbound" && inRange(m.received_at)).map((m) => m.company_id));
  const positiveReplied = new Set(
    messageRows.filter((m) => m.direction === "inbound" && inRange(m.received_at) && m.intent && positive.has(m.intent)).map((m) => m.company_id),
  );
  const booked = meetingRows.filter((m) => inRange(m.booked_at)).length;
  const attended = meetingRows.filter((m) => inRange(m.attended_at)).length;
  const proposals = oppRows.filter((o) => inRange(o.proposal_sent_at)).length;
  const won = oppRows.filter((o) => inRange(o.won_at));
  const lost = oppRows.filter((o) => inRange(o.lost_at));
  const revenue = won.reduce((sum, o) => sum + n(o.collected_revenue_inr), 0);
  const grossProfit = revenue - won.reduce((sum, o) => sum + n(o.delivery_cost_inr), 0);
  const acquisitionCost =
    unwrap(experiments, "experiments").reduce((sum, e) => sum + n(e.spend_inr), 0) +
    unwrap(campaigns, "campaigns").reduce((sum, c) => sum + n(c.spend_inr), 0);
  const pct = (a: number, b: number) => (b === 0 ? null : (a / b) * 100);

  // Weekly reply-rate trend
  const weekMs = 7 * 86_400_000;
  const start = new Date(range.from).getTime();
  const end = new Date(range.to).getTime();
  const weeks: Array<{ weekStart: string; contacted: number; replied: number; rate: number | null }> = [];
  for (let t = start; t < end; t += weekMs) {
    const a = new Date(t).toISOString();
    const b = new Date(Math.min(t + weekMs, end)).toISOString();
    const sent = new Set(messageRows.filter((m) => m.direction === "outbound" && m.sent_at && m.sent_at >= a && m.sent_at < b).map((m) => m.company_id));
    const got = new Set(messageRows.filter((m) => m.direction === "inbound" && m.received_at && m.received_at >= a && m.received_at < b).map((m) => m.company_id));
    weeks.push({ weekStart: a, contacted: sent.size, replied: got.size, rate: pct(got.size, sent.size) });
  }

  // Sales team performance, by opportunity owner
  const owners = new Map<string, { name: string; open: number; won: number; lost: number; revenue: number; pipeline: number }>();
  for (const o of oppRows) {
    const key = o.owner_user_id ?? "unassigned";
    const entry = owners.get(key) ?? {
      name: o.users?.full_name ?? o.users?.email ?? "Unassigned",
      open: 0,
      won: 0,
      lost: 0,
      revenue: 0,
      pipeline: 0,
    };
    if (o.stage === "won") {
      if (inRange(o.won_at)) {
        entry.won++;
        entry.revenue += n(o.collected_revenue_inr);
      }
    } else if (o.stage === "lost") {
      if (inRange(o.lost_at)) entry.lost++;
    } else {
      entry.open++;
      entry.pipeline += n(o.estimated_value_inr);
    }
    owners.set(key, entry);
  }

  // Data quality
  const contactsByCompany = new Map<string, typeof contactRows>();
  for (const c of contactRows) contactsByCompany.set(c.company_id, [...(contactsByCompany.get(c.company_id) ?? []), c]);
  const staleCutoff = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const dataQuality = [
    { label: "Companies without a website domain", count: companyRows.filter((c) => !c.domain).length, total: companyRows.length },
    { label: "Companies with no industry", count: companyRows.filter((c) => !c.industry_id).length, total: companyRows.length },
    { label: "Companies with unknown employee range", count: companyRows.filter((c) => !c.employee_range).length, total: companyRows.length },
    { label: "Companies with no contact", count: companyRows.filter((c) => !contactsByCompany.has(c.id)).length, total: companyRows.length },
    { label: "Companies never researched", count: companyRows.filter((c) => !c.last_researched_at).length, total: companyRows.length },
    {
      label: "Research older than 90 days",
      count: companyRows.filter((c) => c.last_researched_at && c.last_researched_at < staleCutoff).length,
      total: companyRows.length,
    },
    { label: "Contacts never verified", count: contactRows.filter((c) => !c.last_verified_at).length, total: contactRows.length },
    { label: "Contacts with an invalid email", count: contactRows.filter((c) => c.verification_status === "invalid").length, total: contactRows.length },
    { label: "Contacts without an email", count: contactRows.filter((c) => !c.email).length, total: contactRows.length },
  ];

  return {
    funnel: unwrap(funnel, "funnel").map((r) => ({ stage: r.stage, companies: n(r.companies) })),
    industries,
    channels: unwrap(channels, "channels").map((r) => ({
      channel: r.channel,
      leads: n(r.leads),
      qualified: n(r.qualified),
      positiveReplies: n(r.positive_replies),
      meetings: n(r.meetings),
      won: n(r.won),
      revenue: n(r.revenue_inr),
      grossProfit: n(r.gross_profit_inr),
    })),
    workflows: unwrap(workflows, "workflows").map((r) => ({
      key: r.workflow_key,
      name: r.workflow_name,
      succeeded: n(r.succeeded),
      failed: n(r.failed),
      running: n(r.running),
      queued: n(r.queued),
      cancelled: n(r.cancelled),
      avgDurationMs: r.avg_duration_ms === null ? null : Number(r.avg_duration_ms),
    })),
    quality: { buckets, unscored },
    conversion: {
      contacted: contacted.size,
      replied: replied.size,
      positive: positiveReplied.size,
      replyRate: pct(replied.size, contacted.size),
      positiveRate: pct(positiveReplied.size, contacted.size),
      booked,
      attended,
      meetingConversion: pct(booked, positiveReplied.size),
      attendanceRate: pct(attended, booked),
      proposals,
      proposalConversion: pct(proposals, attended),
      won: won.length,
      lost: lost.length,
      winRate: pct(won.length, won.length + lost.length),
      revenue,
      grossProfit,
      acquisitionCost,
    },
    replyTrend: weeks,
    team: [...owners.values()].sort((a, b) => b.revenue - a.revenue || b.pipeline - a.pipeline),
    dataQuality,
  };
}

export async function getAutomations(ctx: SessionContext) {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [jobs, stats, executions] = await Promise.all([
    ctx.supabase.from("workflow_jobs").select("*").eq("tenant_id", ctx.tenantId).order("workflow_key"),
    ctx.supabase.rpc("workflow_stats", { p_tenant: ctx.tenantId, p_from: since, p_to: new Date().toISOString() }),
    ctx.supabase
      .from("workflow_executions")
      .select("id, workflow_key, status, trigger, mode, attempt, queued_at, started_at, finished_at, duration_ms, items_processed, error_message, is_demo")
      .eq("tenant_id", ctx.tenantId)
      .order("queued_at", { ascending: false })
      .limit(40),
  ]);
  const statRows = unwrap(stats, "workflow stats");
  return {
    jobs: unwrap(jobs, "workflows").map((job) => {
      const s = statRows.find((r) => r.workflow_key === job.workflow_key);
      const succeeded = n(s?.succeeded);
      const failed = n(s?.failed);
      return {
        ...job,
        succeeded,
        failed,
        running: n(s?.running),
        queued: n(s?.queued),
        successRate: succeeded + failed === 0 ? null : (succeeded / (succeeded + failed)) * 100,
      };
    }),
    executions: unwrap(executions, "executions"),
  };
}
