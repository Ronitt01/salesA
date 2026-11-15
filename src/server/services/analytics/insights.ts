/**
 * Rule-based insight and recommendation builders.
 *
 * Pure functions over already-computed metrics. Every sentence cites the number it
 * came from, and nothing here calls a model, so the output is reproducible and can
 * never state something the data does not show. When a live AI provider is
 * configured it may rephrase these, but it is given only these facts to work from.
 */

interface IndustryMetrics {
  industryId: string;
  industry: string;
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

interface ChannelMetrics {
  channel: string;
  leads: number;
  qualified: number;
  meetings: number;
  won: number;
}

interface WorkflowMetrics {
  key: string;
  name: string;
  succeeded: number;
  failed: number;
}

interface Metric {
  value: number | null;
  previous: number | null;
}

export interface Insight {
  id: string;
  tone: "positive" | "neutral" | "attention";
  text: string;
  /** The figures the sentence is built from. */
  basis: string;
}

export interface IndustryRecommendation {
  industryId: string;
  industry: string;
  action: "invest" | "keep_testing" | "review" | "insufficient_data";
  headline: string;
  reason: string;
}

/** Below this many contacted companies, a rate is noise rather than evidence. */
export const MIN_SAMPLE_FOR_RATE = 5;

export function buildIndustryRecommendations(rows: IndustryMetrics[]): IndustryRecommendation[] {
  const recommendations = rows.map((r): IndustryRecommendation & { rank: number } => {
    const base = { industryId: r.industryId, industry: r.industry };

    // Actual commercial outcomes outrank reply counts.
    if (r.won > 0 && r.grossProfit > r.acquisitionCost) {
      return {
        ...base,
        action: "invest",
        headline: "Allocate more research and sales time",
        reason: `${r.won} won deal${r.won === 1 ? "" : "s"} with gross profit above acquisition cost in this period.`,
        rank: 4_000_000 + r.grossProfit,
      };
    }
    if (r.contacted < MIN_SAMPLE_FOR_RATE) {
      return {
        ...base,
        action: "insufficient_data",
        headline: "Too little outreach to judge",
        reason: `Only ${r.contacted} compan${r.contacted === 1 ? "y" : "ies"} contacted; at least ${MIN_SAMPLE_FOR_RATE} are needed before the reply rate means anything.`,
        rank: 1_000_000 + r.qualified,
      };
    }
    if (r.meetings > 0 || r.proposals > 0) {
      return {
        ...base,
        action: "keep_testing",
        headline: "Promising, not yet proven",
        reason: `${r.meetings} meeting${r.meetings === 1 ? "" : "s"} and ${r.proposals} proposal${r.proposals === 1 ? "" : "s"} from ${r.contacted} companies contacted, but no closed revenue yet.`,
        rank: 3_000_000 + r.meetings * 10 + r.proposals,
      };
    }
    return {
      ...base,
      action: "review",
      headline: "Review targeting or message",
      reason: `${r.contacted} companies contacted with ${r.positiveReplies} positive repl${r.positiveReplies === 1 ? "y" : "ies"} and no meetings.`,
      rank: 2_000_000 - r.contacted,
    };
  });

  return recommendations
    .sort((a, b) => b.rank - a.rank)
    .map((r) => ({ industryId: r.industryId, industry: r.industry, action: r.action, headline: r.headline, reason: r.reason }));
}

export function buildDailyInsights(input: {
  kpis: {
    new_qualified_today: Metric;
    positive_replies: Metric;
    meetings_booked: Metric;
    meetings_attended: Metric;
    workflow_success_rate: Metric;
  };
  industries: IndustryMetrics[];
  channels: ChannelMetrics[];
  workflows: WorkflowMetrics[];
  dailyTarget: number;
  rangeLabel: string;
}): Insight[] {
  const insights: Insight[] = [];
  const period = input.rangeLabel.toLowerCase();

  const today = input.kpis.new_qualified_today.value ?? 0;
  if (input.dailyTarget > 0) {
    const reached = today >= input.dailyTarget;
    insights.push({
      id: "target",
      tone: reached ? "positive" : "neutral",
      text: reached
        ? `${today} leads qualified today, meeting the daily target of ${input.dailyTarget}.`
        : `${today} of ${input.dailyTarget} target leads qualified so far today. The target is a guide; qualification standards do not relax to reach it.`,
      basis: `Qualified today: ${today}. Daily target: ${input.dailyTarget}.`,
    });
  }

  const withRevenue = input.industries.filter((i) => i.won > 0).sort((a, b) => b.grossProfit - a.grossProfit);
  if (withRevenue.length > 0) {
    const best = withRevenue[0];
    insights.push({
      id: "profit",
      tone: "positive",
      text: `${best.industry} produced the most gross profit in the ${period}: ${best.won} won deal${best.won === 1 ? "" : "s"}.`,
      basis: `Gross profit ₹${Math.round(best.grossProfit).toLocaleString("en-IN")} on revenue ₹${Math.round(best.revenue).toLocaleString("en-IN")}.`,
    });
  }

  const rated = input.industries
    .filter((i) => i.contacted >= MIN_SAMPLE_FOR_RATE && i.positiveReplyRate !== null)
    .sort((a, b) => (b.positiveReplyRate ?? 0) - (a.positiveReplyRate ?? 0));
  if (rated.length > 0) {
    const best = rated[0];
    insights.push({
      id: "reply-rate",
      tone: "neutral",
      text: `${best.industry} has the highest positive reply rate among industries with at least ${MIN_SAMPLE_FOR_RATE} companies contacted. Replies are an early indicator, not revenue.`,
      basis: `${best.positiveReplies} of ${best.contacted} contacted companies replied positively (${best.positiveReplyRate}%).`,
    });
  } else if (input.industries.some((i) => i.contacted > 0)) {
    insights.push({
      id: "reply-rate",
      tone: "neutral",
      text: `No industry has ${MIN_SAMPLE_FOR_RATE} or more companies contacted in the ${period}, so reply rates are not yet comparable.`,
      basis: `Largest sample: ${Math.max(...input.industries.map((i) => i.contacted))} companies contacted.`,
    });
  }

  const booked = input.kpis.meetings_booked.value ?? 0;
  const attended = input.kpis.meetings_attended.value ?? 0;
  if (booked > 0) {
    insights.push({
      id: "meetings",
      tone: "neutral",
      text: `${booked} meeting${booked === 1 ? " was" : "s were"} booked and ${attended} attended in the ${period}. Booked and attended are tracked separately.`,
      basis: `Booked: ${booked}. Attended: ${attended}.`,
    });
  }

  const failing = input.workflows
    .map((w) => ({ ...w, total: w.succeeded + w.failed }))
    .filter((w) => w.total >= 5 && w.failed / w.total >= 0.1)
    .sort((a, b) => b.failed / b.total - a.failed / a.total);
  if (failing.length > 0) {
    const worst = failing[0];
    insights.push({
      id: "workflow",
      tone: "attention",
      text: `${worst.key} ${worst.name} is failing more often than the others and should be checked.`,
      basis: `${worst.failed} of ${worst.total} runs failed (${Math.round((worst.failed / worst.total) * 100)}%).`,
    });
  }

  return insights;
}
