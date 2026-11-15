import type { Metadata } from "next";
import { Suspense } from "react";
import { Globe } from "lucide-react";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { Pill } from "@/components/shared/badges";
import { EmptyState, PageHeader, Panel } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shell/shell-skeleton";
import { resolveRange } from "@/lib/date-range";
import { formatInrCompact, formatPercent } from "@/lib/format";
import { getSessionContext } from "@/server/auth/context";
import { getMarketIntelligence } from "@/server/repositories/insight";

export const metadata: Metadata = { title: "Market Intelligence" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const ACTION = {
  invest: { label: "Invest", tone: "success" },
  keep_testing: { label: "Keep testing", tone: "info" },
  review: { label: "Review", tone: "warning" },
  insufficient_data: { label: "More data needed", tone: "neutral" },
} as const;

async function Market({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const ctx = await getSessionContext();
  const now = new Date();
  const tz = ctx.workspace.timezone;
  // Market questions need a longer window than the dashboard default.
  const range = resolveRange(raw.range ? raw : { range: "90d" }, tz, now);
  const { industries } = await getMarketIntelligence(ctx, range);

  return (
    <>
      <PageHeader
        title="Market Intelligence"
        description={`Which industries deserve more research and sales time · ${range.label}`}
        actions={
          <DateRangeFilter
            basePath="/market-intelligence"
            active={range.key}
            fromDate={range.fromDate}
            toDate={range.toDate}
            maxDate={resolveRange({ range: "today" }, tz, now).toDate}
          />
        }
      />

      <Panel
        title="How the industry score works"
        description="No industry is assumed to be best. Scores start from stated assumptions and move to actual results as outreach accumulates."
      >
        <p className="text-sm leading-relaxed text-muted-foreground">
          Each score blends an assumption score with an actual score. The weight on actuals grows with the number of
          companies contacted and deals won, reaching 100% at 25 contact-equivalents (a won deal counts as five). In
          the actual score, 55 of 100 points come from deal size, gross margin and return on acquisition cost, so an
          industry cannot rank highly on replies or lead counts alone.
        </p>
      </Panel>

      {industries.length === 0 ? (
        <div className="mt-4 rounded-xl border bg-card">
          <EmptyState icon={Globe} title="No industries configured" description="Add industries in Settings to start exploring them." />
        </div>
      ) : (
        <ul className="mt-4 grid gap-4 xl:grid-cols-2">
          {industries.map((row, index) => {
            const action = row.recommendation ? ACTION[row.recommendation.action] : null;
            const weight = Math.round(row.scored.evidenceWeight * 100);
            return (
              <li key={row.industryId} className="rounded-xl border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-subtle">Rank {index + 1}</p>
                    <h2 className="text-[15px] font-semibold">{row.industry}</h2>
                    {row.experiment ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Experiment {row.experiment.status}
                        {row.experiment.is_demo ? " · synthetic assumptions" : ""}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs text-muted-foreground">No experiment recorded; neutral assumptions used</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-3xl leading-none font-semibold">{row.scored.score}</p>
                    <p className="mt-1 text-xs text-muted-foreground">of 100</p>
                  </div>
                </div>

                <div className="mt-3">
                  {/* Share of the score that comes from actual results rather than assumptions. */}
                  <div className="flex h-1.5 overflow-hidden rounded-full bg-ai/20" role="img" aria-label={`${weight}% of this score is based on actual results`}>
                    <span className="h-full rounded-full bg-success" style={{ width: `${weight}%` }} />
                  </div>
                  <p className="mt-1.5 flex justify-between text-xs text-muted-foreground">
                    <span>
                      Actual results: {row.scored.actualScore ?? "–"} ({weight}% weight)
                    </span>
                    <span>
                      Assumptions: {row.scored.assumedScore} ({100 - weight}% weight)
                    </span>
                  </p>
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-x-4 gap-y-3 sm:grid-cols-6">
                  {[
                    ["Discovered", String(row.discovered)],
                    ["Qualified", String(row.qualified)],
                    ["Contacted", String(row.contacted)],
                    ["Reply rate", row.contacted === 0 ? "–" : formatPercent((row.replied / row.contacted) * 100, 0)],
                    ["Positive rate", row.positiveReplyRate === null ? "–" : formatPercent(row.positiveReplyRate, 0)],
                    ["Meetings", String(row.meetings)],
                    ["Proposals", String(row.proposals)],
                    ["Won", String(row.won)],
                    ["Revenue", formatInrCompact(row.revenue)],
                    ["Gross profit", formatInrCompact(row.grossProfit)],
                    ["Acq. cost", formatInrCompact(row.acquisitionCost)],
                    ["Profit ÷ cost", row.acquisitionCost > 0 && row.grossProfit > 0 ? `${(row.grossProfit / row.acquisitionCost).toFixed(1)}×` : "–"],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="tabular mt-0.5 text-sm font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>

                {row.scored.components.length > 0 ? (
                  <details className="mt-4 border-t pt-3 text-xs">
                    <summary className="cursor-pointer text-info">How the actual score was calculated</summary>
                    <ul className="mt-2 space-y-1.5">
                      {row.scored.components.map((c) => (
                        <li key={c.label} className="flex justify-between gap-3 text-muted-foreground">
                          <span>
                            {c.label} <span className="text-subtle">({c.weight}% weight)</span>
                            <span className="block text-subtle">{c.basis}</span>
                          </span>
                          <span className="tabular shrink-0 text-foreground">{Math.round(c.value)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}

                {row.recommendation && action ? (
                  <div className="mt-4 flex items-start gap-3 border-t pt-3">
                    <Pill tone={action.tone}>{action.label}</Pill>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      <span className="font-medium text-foreground">{row.recommendation.headline}.</span> {row.recommendation.reason}
                    </p>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export default function MarketIntelligencePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Market searchParams={searchParams} />
    </Suspense>
  );
}
