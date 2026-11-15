import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  Activity,
  CalendarCheck,
  CalendarDays,
  CircleAlert,
  CircleCheck,
  Flame,
  IndianRupee,
  Lightbulb,
  MessagesSquare,
  Radar,
  Sparkles,
  Target,
  UserCheck,
  Users,
  Workflow,
} from "lucide-react";
import { BarList } from "@/components/charts/bar-list";
import { ChannelChart } from "@/components/dashboard/channel-chart";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { IndustryPerformance } from "@/components/dashboard/industry-performance";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { LeadGenerationChart } from "@/components/dashboard/lead-generation-chart";
import { WorkflowMonitor } from "@/components/dashboard/workflow-monitor";
import { IntentBadge, Pill, ScoreBadge, StageBadge } from "@/components/shared/badges";
import { DemoTag, EmptyState, PageHeader, Panel } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shell/shell-skeleton";
import { cn } from "@/lib/utils";
import { resolveRange } from "@/lib/date-range";
import { formatDateTime, formatInrCompact, formatNumber, formatPercent, formatRelative } from "@/lib/format";
import { FUNNEL_STAGE_LABEL, OPPORTUNITY_STAGE_LABEL, SIGNAL_TYPE_LABEL } from "@/lib/labels";
import { getSessionContext } from "@/server/auth/context";
import { getDashboardData, type KpiMetric } from "@/server/repositories/dashboard";

export const metadata: Metadata = { title: "Overview" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function delta(metric: KpiMetric): number | null {
  if (metric.value === null || metric.previous === null) return null;
  return metric.value - metric.previous;
}

const RECOMMENDATION_TONE = {
  invest: "success",
  keep_testing: "info",
  review: "warning",
  insufficient_data: "neutral",
} as const;

const RECOMMENDATION_LABEL = {
  invest: "Invest",
  keep_testing: "Keep testing",
  review: "Review",
  insufficient_data: "More data needed",
} as const;

async function Overview({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const ctx = await getSessionContext();
  const now = new Date();
  const tz = ctx.workspace.timezone;
  const range = resolveRange(params, tz, now);
  const requestedBucket = Array.isArray(params.bucket) ? params.bucket[0] : params.bucket;
  const bucket = requestedBucket === "week" || requestedBucket === "day" ? requestedBucket : range.bucket;
  const data = await getDashboardData(ctx, range, bucket, now);
  const k = data.kpis;

  const rangeQuery =
    range.key === "custom" ? `range=custom&from=${range.fromDate}&to=${range.toDate}` : `range=${range.key}`;
  const flowLabel = "vs previous period";
  const stockLabel = "since period start";

  const funnelRows = data.funnel.map((row, index) => {
    const previous = index === 0 ? null : data.funnel[index - 1].companies;
    const conversion = previous && previous > 0 ? (row.companies / previous) * 100 : null;
    return {
      key: row.stage,
      label: FUNNEL_STAGE_LABEL[row.stage] ?? row.stage,
      value: row.companies,
      display: formatNumber(row.companies),
      secondary: conversion === null ? undefined : `${formatPercent(conversion, 0)} of previous`,
      tooltip: [
        `${row.companies} compan${row.companies === 1 ? "y" : "ies"} reached this stage in the period`,
        ...(conversion === null ? [] : [`${formatPercent(conversion, 0)} of the previous stage`]),
      ],
    };
  });

  const openStages = data.pipeline.filter((p) => p.stage !== "lost");
  const lost = data.pipeline.find((p) => p.stage === "lost");
  const pipelineRows = openStages.map((p) => ({
    key: p.stage,
    label: OPPORTUNITY_STAGE_LABEL[p.stage],
    value: p.value,
    display: formatInrCompact(p.value),
    secondary: `${p.opportunities} open`.replace("open", p.stage === "won" ? "won" : "open"),
    tooltip: [`Estimated value: ${formatInrCompact(p.value)}`, `Opportunities: ${p.opportunities}`],
  }));

  return (
    <>
      <PageHeader
        title="Overview"
        description={`Acquisition performance for ${ctx.workspace.name} · ${range.label}`}
        actions={
          <DateRangeFilter
            basePath="/overview"
            active={range.key}
            fromDate={range.fromDate}
            toDate={range.toDate}
            maxDate={resolveRange({ range: "today" }, tz, now).toDate}
          />
        }
      />

      <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:gap-4">
        <KpiCard
          label="New qualified leads today"
          value={formatNumber(k.new_qualified_today.value)}
          icon={UserCheck}
          tone="success"
          delta={delta(k.new_qualified_today)}
          deltaDisplay={formatNumber(Math.abs(delta(k.new_qualified_today) ?? 0))}
          comparisonLabel="vs yesterday"
          explanation={`Companies that met every qualification rule today (score, evidence and contact quality). The operating target is ${data.dailyTarget} per working day; standards are never lowered to reach it.`}
        />
        <KpiCard
          label="Total qualified prospects"
          value={formatNumber(k.total_qualified.value)}
          icon={Users}
          tone="info"
          delta={delta(k.total_qualified)}
          deltaDisplay={formatNumber(Math.abs(delta(k.total_qualified) ?? 0))}
          comparisonLabel={stockLabel}
          explanation="All companies currently qualified by the scoring engine: a score of 65 or more, at least two evidenced facts, a live buying signal and a reliable contact."
        />
        <KpiCard
          label="High-priority prospects"
          value={formatNumber(k.high_priority.value)}
          icon={Flame}
          tone="warning"
          delta={delta(k.high_priority)}
          deltaDisplay={formatNumber(Math.abs(delta(k.high_priority) ?? 0))}
          comparisonLabel={stockLabel}
          explanation="Qualified companies in Priority A, meaning an opportunity score of 80 to 100."
        />
        <KpiCard
          label="Positive replies"
          value={formatNumber(k.positive_replies.value)}
          icon={MessagesSquare}
          tone="success"
          delta={delta(k.positive_replies)}
          deltaDisplay={formatNumber(Math.abs(delta(k.positive_replies) ?? 0))}
          comparisonLabel={flowLabel}
          explanation="Inbound replies in the period classified as interested, wants a meeting, wants pricing or requests information."
        />
        <KpiCard
          label="Meetings booked"
          value={formatNumber(k.meetings_booked.value)}
          icon={CalendarCheck}
          tone="info"
          delta={delta(k.meetings_booked)}
          deltaDisplay={formatNumber(Math.abs(delta(k.meetings_booked) ?? 0))}
          comparisonLabel={flowLabel}
          explanation={`Meetings booked in the period after the prospect chose a slot. Booked is not the same as attended: ${formatNumber(k.meetings_attended.value)} meetings were attended in this period.`}
        />
        <KpiCard
          label="Active opportunities"
          value={formatNumber(k.active_opportunities.value)}
          icon={Target}
          tone="warning"
          delta={delta(k.active_opportunities)}
          deltaDisplay={formatNumber(Math.abs(delta(k.active_opportunities) ?? 0))}
          comparisonLabel={stockLabel}
          explanation="Opportunities that are open right now, in any stage other than won or lost."
        />
        <KpiCard
          label="Estimated pipeline value"
          value={formatInrCompact(k.pipeline_value.value)}
          icon={IndianRupee}
          tone="success"
          delta={delta(k.pipeline_value)}
          deltaDisplay={formatInrCompact(Math.abs(delta(k.pipeline_value) ?? 0))}
          comparisonLabel={stockLabel}
          explanation="Sum of the estimated value of all open opportunities. These are estimates entered against each opportunity, not forecast revenue."
        />
        <KpiCard
          label="Workflow success rate"
          value={k.workflow_success_rate.value === null ? "–" : formatPercent(k.workflow_success_rate.value)}
          icon={Activity}
          tone="info"
          delta={delta(k.workflow_success_rate)}
          deltaDisplay={`${Math.abs(delta(k.workflow_success_rate) ?? 0).toFixed(1)} pts`}
          comparisonLabel={flowLabel}
          caption={k.workflow_success_rate.value === null ? "No finished runs in this period" : undefined}
          explanation="Succeeded runs divided by all runs that finished (succeeded or failed) in the period. Running and queued executions are excluded."
        />
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="Lead generation over time"
          description={`Companies discovered and qualified per ${data.bucket}`}
          actions={
            <div className="inline-flex rounded-lg border p-0.5">
              {(["day", "week"] as const).map((b) => (
                <Link
                  key={b}
                  href={`/overview?${rangeQuery}&bucket=${b}`}
                  aria-current={data.bucket === b ? "true" : undefined}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs transition-colors",
                    data.bucket === b ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {b === "day" ? "Daily" : "Weekly"}
                </Link>
              ))}
            </div>
          }
        >
          <LeadGenerationChart rows={data.series} bucket={data.bucket} dailyTarget={data.dailyTarget} />
        </Panel>

        <Panel
          title="Daily insights"
          description="Summarised from the records behind this page"
          actions={
            <span className="flex size-7 items-center justify-center rounded-lg bg-ai/12 text-ai">
              <Sparkles className="size-4" />
            </span>
          }
        >
          {data.insights.length === 0 ? (
            <EmptyState icon={Lightbulb} title="Nothing to report yet" description="Insights appear once there is activity in the selected period." className="py-8" />
          ) : (
            <ul className="space-y-3">
              {data.insights.map((insight) => (
                <li key={insight.id} className="flex gap-2.5">
                  <span
                    className={cn(
                      "mt-1.5 size-1.5 shrink-0 rounded-full",
                      insight.tone === "positive" && "bg-success",
                      insight.tone === "neutral" && "bg-ai",
                      insight.tone === "attention" && "bg-warning",
                    )}
                  />
                  <div className="min-w-0">
                    <p className="text-sm leading-relaxed">{insight.text}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{insight.basis}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 border-t pt-3 text-xs leading-relaxed text-subtle">
            Each line is computed from stored records by fixed rules and shows the figures it is based on. No model wrote
            these.
          </p>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel title="Lead acquisition funnel" description="Companies reaching each stage in the period">
          <BarList rows={funnelRows} labelWidth="7rem" emptyLabel="No companies moved through the funnel in this period" />
        </Panel>
        <Panel title="Sales pipeline" description="Estimated value and opportunity count by stage">
          <BarList rows={pipelineRows} labelWidth="9rem" color="var(--chart-3)" emptyLabel="No opportunities yet" />
          {lost && lost.opportunities > 0 ? (
            <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
              Lost in this period: {lost.opportunities} opportunit{lost.opportunities === 1 ? "y" : "ies"} worth{" "}
              {formatInrCompact(lost.value)}.
            </p>
          ) : null}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel title="Industry performance" description="Compare industries on one measure at a time">
          <IndustryPerformance rows={data.industries} />
        </Panel>
        <Panel title="Acquisition channel performance" description="Where leads come from and how far they progress">
          <ChannelChart rows={data.channels} />
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Panel title="Today's top opportunities" description="Highest-scoring qualified leads in play" bodyClassName="px-2 pb-2">
          {data.topOpportunities.length === 0 ? (
            <EmptyState icon={Target} title="No qualified leads yet" description="Qualified leads appear here once research and verification are complete." className="py-8" />
          ) : (
            <ul>
              {data.topOpportunities.map((lead) => (
                <li key={lead.id}>
                  <Link href={`/leads/${lead.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {lead.company} {lead.isDemo ? <DemoTag className="ml-1" /> : null}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{lead.service ?? lead.industry ?? "No service matched yet"}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <ScoreBadge score={lead.score} priority={lead.priority} />
                      <StageBadge stage={lead.stage} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Latest positive replies" description="Most recent interested responses" bodyClassName="px-2 pb-2">
          {data.positiveReplies.length === 0 ? (
            <EmptyState icon={MessagesSquare} title="No positive replies yet" description="Replies classified as interested will be listed here." className="py-8" />
          ) : (
            <ul>
              {data.positiveReplies.map((reply) => (
                <li key={reply.id}>
                  <Link href={`/leads/${reply.companyId}`} className="block rounded-lg px-3 py-2.5 transition-colors hover:bg-muted">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{reply.company}</p>
                      <span className="shrink-0 text-xs text-subtle">{formatRelative(reply.receivedAt, now)}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {reply.contact}: {reply.excerpt}
                    </p>
                    <div className="mt-1.5">
                      <IntentBadge intent={reply.intent} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Upcoming meetings" description="Booked after the prospect chose a slot" bodyClassName="px-2 pb-2" className="lg:col-span-2 xl:col-span-1">
          {data.upcomingMeetings.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No meetings scheduled" description="Meetings appear here once a prospect selects a slot." className="py-8" />
          ) : (
            <ul>
              {data.upcomingMeetings.map((meeting) => (
                <li key={meeting.id}>
                  <Link href={`/leads/${meeting.companyId}`} className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-info/12 text-info">
                      <CalendarDays className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{meeting.title}</p>
                      <p className="truncate text-xs text-muted-foreground">with {meeting.contact}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs">{formatDateTime(meeting.startsAt, tz)}</p>
                      <p className="text-xs text-subtle">{formatRelative(meeting.startsAt, now)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel title="Recent buying signals" description="Live signals. A signal suggests timing; it is not proof of intent." bodyClassName="px-2 pb-2">
          {data.recentSignals.length === 0 ? (
            <EmptyState icon={Radar} title="No live signals" description="Signals are recorded during company research and expire when stale." className="py-8" />
          ) : (
            <ul>
              {data.recentSignals.map((signal) => (
                <li key={signal.id}>
                  <Link href={`/leads/${signal.companyId}`} className="flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{signal.company}</p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{signal.summary}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Pill tone="info">{SIGNAL_TYPE_LABEL[signal.type]}</Pill>
                      <span className="text-xs text-subtle">
                        {formatRelative(signal.observedAt, now)} · {Math.round(signal.confidence * 100)}% confidence
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Industry recommendations" description="Where to put research and sales time, ranked on outcomes before replies">
          {data.recommendations.length === 0 ? (
            <EmptyState icon={Lightbulb} title="No industries configured" description="Add industries in Settings to start comparing them." className="py-8" />
          ) : (
            <ul className="divide-y divide-border/60">
              {data.recommendations.slice(0, 6).map((rec) => (
                <li key={rec.industryId} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{rec.industry}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{rec.reason}</p>
                  </div>
                  <Pill tone={RECOMMENDATION_TONE[rec.action]}>{RECOMMENDATION_LABEL[rec.action]}</Pill>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Workflow monitoring" description="Executions per workflow in the period">
          <WorkflowMonitor rows={data.workflows} />
        </Panel>
        <Panel title="Recent automation failures" description="Latest failed executions" bodyClassName="px-2 pb-2">
          {data.failures.length === 0 ? (
            <EmptyState icon={CircleCheck} title="No failures" description="Failed workflow executions will be listed here with their error." className="py-8" />
          ) : (
            <ul>
              {data.failures.map((failure) => (
                <li key={failure.id}>
                  <Link href="/automations" className="flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted">
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        <Workflow className="mr-1 inline size-3.5 text-muted-foreground" />
                        {failure.key}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{failure.error}</p>
                    </div>
                    <span className="shrink-0 text-xs text-subtle">{formatRelative(failure.finishedAt, now)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}

export default function OverviewPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Overview searchParams={searchParams} />
    </Suspense>
  );
}
