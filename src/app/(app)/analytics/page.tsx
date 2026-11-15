import type { Metadata } from "next";
import { Suspense } from "react";
import { BarList } from "@/components/charts/bar-list";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { WorkflowMonitor } from "@/components/dashboard/workflow-monitor";
import { DataTable, StatTile } from "@/components/shared/data-table";
import { PageHeader, Panel } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shell/shell-skeleton";
import { resolveRange } from "@/lib/date-range";
import { formatInrCompact, formatNumber, formatPercent, formatShortDate } from "@/lib/format";
import { ACQUISITION_CHANNEL_LABEL, FUNNEL_STAGE_LABEL } from "@/lib/labels";
import { getSessionContext } from "@/server/auth/context";
import { getAnalytics } from "@/server/repositories/insight";

export const metadata: Metadata = { title: "Analytics" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const rate = (value: number | null, digits = 0) => (value === null ? "–" : formatPercent(value, digits));

async function Analytics({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const ctx = await getSessionContext();
  const now = new Date();
  const tz = ctx.workspace.timezone;
  const range = resolveRange(raw.range ? raw : { range: "90d" }, tz, now);
  const data = await getAnalytics(ctx, range);
  const c = data.conversion;

  return (
    <>
      <PageHeader
        title="Analytics"
        description={`Every figure is calculated from stored records · ${range.label}`}
        actions={
          <DateRangeFilter
            basePath="/analytics"
            active={range.key}
            fromDate={range.fromDate}
            toDate={range.toDate}
            maxDate={resolveRange({ range: "today" }, tz, now).toDate}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Collected revenue" value={formatInrCompact(c.revenue)} hint={`${c.won} won deal${c.won === 1 ? "" : "s"} in the period`} />
        <StatTile label="Gross profit" value={formatInrCompact(c.grossProfit)} hint="Revenue minus delivery cost" />
        <StatTile label="Acquisition cost" value={formatInrCompact(c.acquisitionCost)} hint="Recorded campaign and experiment spend, all time" />
        <StatTile label="Win rate" value={rate(c.winRate)} hint={c.won + c.lost === 0 ? "No opportunities closed" : `${c.won} won, ${c.lost} lost`} />
        <StatTile label="Reply rate" value={rate(c.replyRate)} hint={`${c.replied} of ${c.contacted} contacted companies`} />
        <StatTile label="Positive reply rate" value={rate(c.positiveRate)} hint={`${c.positive} positive`} />
        <StatTile label="Reply to meeting" value={rate(c.meetingConversion)} hint={`${c.booked} booked, ${c.attended} attended`} />
        <StatTile label="Meeting to proposal" value={rate(c.proposalConversion)} hint={`${c.proposals} proposal${c.proposals === 1 ? "" : "s"} sent`} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel title="Overall sales funnel" description="Companies reaching each stage in the period">
          <BarList
            labelWidth="7rem"
            rows={data.funnel.map((row, i) => {
              const prev = i === 0 ? null : data.funnel[i - 1].companies;
              return {
                key: row.stage,
                label: FUNNEL_STAGE_LABEL[row.stage] ?? row.stage,
                value: row.companies,
                display: formatNumber(row.companies),
                secondary: prev && prev > 0 ? `${formatPercent((row.companies / prev) * 100, 0)} of previous` : undefined,
              };
            })}
          />
        </Panel>

        <Panel title="Lead quality distribution" description="Companies by current opportunity score">
          <BarList
            labelWidth="10rem"
            color="var(--chart-7)"
            rows={data.quality.buckets.map((b) => ({ key: b.label, label: b.label, value: b.count, display: formatNumber(b.count) }))}
            emptyLabel="No companies scored yet"
          />
          <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
            {data.quality.unscored} compan{data.quality.unscored === 1 ? "y has" : "ies have"} not been scored because no research exists yet.
          </p>
        </Panel>

        <Panel title="Reply-rate trend" description="Per week: companies that replied out of companies contacted" bodyClassName="px-0 pb-0">
          <DataTable
            caption="Weekly reply rate"
            rows={data.replyTrend}
            rowKey={(w) => w.weekStart}
            minWidth="420px"
            columns={[
              { header: "Week starting", cell: (w) => formatShortDate(w.weekStart, tz) },
              { header: "Contacted", align: "right", cell: (w) => w.contacted },
              { header: "Replied", align: "right", cell: (w) => w.replied },
              { header: "Reply rate", align: "right", cell: (w) => rate(w.rate) },
            ]}
          />
        </Panel>

        <Panel title="Sales team performance" description="By opportunity owner" bodyClassName="px-0 pb-0">
          {data.team.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">No opportunities have an owner yet.</p>
          ) : (
            <DataTable
              caption="Sales team performance"
              rows={data.team}
              rowKey={(t) => t.name}
              minWidth="520px"
              columns={[
                { header: "Owner", cell: (t) => t.name },
                { header: "Open", align: "right", cell: (t) => t.open },
                { header: "Open pipeline", align: "right", cell: (t) => formatInrCompact(t.pipeline) },
                { header: "Won", align: "right", cell: (t) => t.won },
                { header: "Lost", align: "right", cell: (t) => t.lost },
                { header: "Revenue", align: "right", cell: (t) => formatInrCompact(t.revenue) },
              ]}
            />
          )}
        </Panel>

        <Panel className="xl:col-span-2" title="Industry performance" bodyClassName="px-0 pb-0">
          <DataTable
            caption="Industry performance"
            rows={data.industries}
            rowKey={(r) => r.industryId}
            minWidth="1000px"
            columns={[
              { header: "Industry", cell: (r) => r.industry },
              { header: "Discovered", align: "right", cell: (r) => r.discovered },
              { header: "Qualified", align: "right", cell: (r) => r.qualified },
              { header: "Contacted", align: "right", cell: (r) => r.contacted },
              { header: "Positive rate", align: "right", cell: (r) => rate(r.positiveReplyRate) },
              { header: "Meetings", align: "right", cell: (r) => r.meetings },
              { header: "Proposals", align: "right", cell: (r) => r.proposals },
              { header: "Won", align: "right", cell: (r) => r.won },
              { header: "Revenue", align: "right", cell: (r) => formatInrCompact(r.revenue) },
              { header: "Gross profit", align: "right", cell: (r) => formatInrCompact(r.grossProfit) },
              { header: "Acq. cost", align: "right", cell: (r) => formatInrCompact(r.acquisitionCost) },
            ]}
          />
        </Panel>

        <Panel title="Channel performance" bodyClassName="px-0 pb-0">
          <DataTable
            caption="Channel performance"
            rows={data.channels}
            rowKey={(r) => r.channel}
            minWidth="560px"
            columns={[
              { header: "Channel", cell: (r) => ACQUISITION_CHANNEL_LABEL[r.channel] },
              { header: "Leads", align: "right", cell: (r) => r.leads },
              { header: "Qualified", align: "right", cell: (r) => r.qualified },
              { header: "Positive", align: "right", cell: (r) => r.positiveReplies },
              { header: "Meetings", align: "right", cell: (r) => r.meetings },
              { header: "Won", align: "right", cell: (r) => r.won },
              { header: "Revenue", align: "right", cell: (r) => formatInrCompact(r.revenue) },
            ]}
          />
        </Panel>

        <Panel title="Data quality" description="Gaps that weaken scoring and outreach" bodyClassName="px-0 pb-0">
          <DataTable
            caption="Data quality"
            rows={data.dataQuality}
            rowKey={(r) => r.label}
            minWidth="420px"
            columns={[
              { header: "Check", cell: (r) => r.label },
              { header: "Records", align: "right", cell: (r) => r.count },
              { header: "Share", align: "right", cell: (r) => (r.total === 0 ? "–" : formatPercent((r.count / r.total) * 100, 0)) },
            ]}
          />
        </Panel>

        <Panel className="xl:col-span-2" title="Workflow performance" description="Executions per workflow in the period">
          <WorkflowMonitor rows={data.workflows} />
        </Panel>
      </div>
    </>
  );
}

export default function AnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Analytics searchParams={searchParams} />
    </Suspense>
  );
}
