/**
 * Industry attractiveness score, 0-100.
 *
 * It starts from the team's stated assumptions and moves towards what actually
 * happened as evidence accumulates. With no outreach the score is pure assumption;
 * once enough companies have been contacted and deals closed, actual commercial
 * results carry all the weight. It never optimises for reply or lead counts alone:
 * 55 of the 100 "actual" points come from revenue, margin and cost efficiency.
 *
 * Pure function. No clock, no I/O.
 */

export interface IndustryAssumptions {
  /** Each 0-10. */
  problemEvidence: number;
  abilityToPay: number;
  decisionMakerAccess: number;
  dealSize: number;
  recurringPotential: number;
  deliveryProfitability: number;
}

export interface IndustryActuals {
  discovered: number;
  qualified: number;
  contacted: number;
  positiveReplies: number;
  meetings: number;
  won: number;
  revenue: number;
  grossProfit: number;
  acquisitionCost: number;
}

export interface IndustryScore {
  score: number;
  assumedScore: number;
  /** Null until there is any outreach to measure. */
  actualScore: number | null;
  /** 0 = assumptions only, 1 = actuals only. */
  evidenceWeight: number;
  components: Array<{ label: string; value: number; weight: number; basis: string }>;
}

const ASSUMPTION_WEIGHTS: Array<[keyof IndustryAssumptions, number]> = [
  ["problemEvidence", 20],
  ["abilityToPay", 20],
  ["decisionMakerAccess", 15],
  ["dealSize", 15],
  ["recurringPotential", 15],
  ["deliveryProfitability", 15],
];

/** Outreach volume at which actuals fully replace assumptions. A won deal counts as five contacts. */
export const FULL_EVIDENCE_AT = 25;

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

export function scoreIndustry(assumptions: IndustryAssumptions, actuals: IndustryActuals): IndustryScore {
  const assumedScore = Math.round(
    ASSUMPTION_WEIGHTS.reduce((sum, [key, weight]) => sum + clamp(assumptions[key], 0, 10) * 10 * (weight / 100), 0),
  );

  const evidenceWeight = clamp((actuals.contacted + 5 * actuals.won) / FULL_EVIDENCE_AT, 0, 1);

  if (actuals.contacted === 0 && actuals.won === 0) {
    return { score: assumedScore, assumedScore, actualScore: null, evidenceWeight: 0, components: [] };
  }

  const margin = ratio(actuals.grossProfit, actuals.revenue);
  const revenuePerDeal = ratio(actuals.revenue, actuals.won);
  const efficiency =
    actuals.grossProfit <= 0 ? 0 : actuals.acquisitionCost <= 0 ? 100 : clamp((actuals.grossProfit / actuals.acquisitionCost / 5) * 100);

  const components: IndustryScore["components"] = [
    {
      label: "Evidence of relevant problems",
      weight: 15,
      value: clamp(ratio(actuals.qualified, actuals.discovered) * 100),
      basis: `${actuals.qualified} of ${actuals.discovered} discovered companies qualified`,
    },
    {
      label: "Access to decision-makers",
      weight: 15,
      // A 30% positive reply rate earns full marks.
      value: clamp((ratio(actuals.positiveReplies, actuals.contacted) / 0.3) * 100),
      basis: `${actuals.positiveReplies} positive replies from ${actuals.contacted} contacted`,
    },
    {
      label: "Conversion to meetings",
      weight: 15,
      // 20% of contacted companies reaching a meeting earns full marks.
      value: clamp((ratio(actuals.meetings, actuals.contacted) / 0.2) * 100),
      basis: `${actuals.meetings} meetings from ${actuals.contacted} contacted`,
    },
    {
      label: "Average deal size",
      weight: 20,
      // ₹5 lakh collected per won deal earns full marks.
      value: clamp((revenuePerDeal / 500_000) * 100),
      basis: actuals.won === 0 ? "No won deals yet" : `₹${Math.round(revenuePerDeal).toLocaleString("en-IN")} collected per won deal`,
    },
    {
      label: "Delivery profitability",
      weight: 20,
      value: clamp(margin * 100),
      basis: actuals.revenue === 0 ? "No collected revenue yet" : `${Math.round(margin * 100)}% gross margin`,
    },
    {
      label: "Return on acquisition cost",
      weight: 15,
      value: efficiency,
      basis:
        actuals.grossProfit <= 0
          ? "No gross profit yet"
          : actuals.acquisitionCost <= 0
            ? "Gross profit with no recorded acquisition cost"
            : `Gross profit is ${(actuals.grossProfit / actuals.acquisitionCost).toFixed(1)}× acquisition cost`,
    },
  ];

  const actualScore = Math.round(components.reduce((sum, c) => sum + c.value * (c.weight / 100), 0));
  const score = Math.round((1 - evidenceWeight) * assumedScore + evidenceWeight * actualScore);
  return { score, assumedScore, actualScore, evidenceWeight, components };
}
