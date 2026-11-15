"use client";

import { useState } from "react";
import { ChartColumn, Table2 } from "lucide-react";
import { BarList, type BarListRow } from "@/components/charts/bar-list";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatInr, formatInrCompact, formatNumber, formatPercent } from "@/lib/format";
import type { IndustryRow } from "@/server/repositories/dashboard";

type MetricKey = "qualified" | "positiveReplyRate" | "meetings" | "proposals" | "won" | "revenue" | "grossProfit";

const METRICS: Array<{ key: MetricKey; label: string; format: (v: number) => string }> = [
  { key: "qualified", label: "Qualified leads", format: formatNumber },
  { key: "positiveReplyRate", label: "Positive response rate", format: (v) => formatPercent(v) },
  { key: "meetings", label: "Meetings", format: formatNumber },
  { key: "proposals", label: "Proposals", format: formatNumber },
  { key: "won", label: "Won deals", format: formatNumber },
  { key: "revenue", label: "Revenue", format: formatInrCompact },
  { key: "grossProfit", label: "Gross profit", format: formatInrCompact },
];

export function IndustryPerformance({ rows }: { rows: IndustryRow[] }) {
  const [metricKey, setMetricKey] = useState<MetricKey>("qualified");
  const [view, setView] = useState<"chart" | "table">("chart");
  const metric = METRICS.find((m) => m.key === metricKey)!;

  const barRows: BarListRow[] = rows
    .map((r) => {
      const raw = r[metricKey];
      return {
        key: r.industryId,
        label: r.industry,
        value: raw ?? 0,
        display: raw === null ? "–" : metric.format(raw),
        secondary:
          metricKey === "positiveReplyRate"
            ? r.contacted === 0
              ? "none contacted"
              : `${r.positiveReplies} of ${r.contacted} contacted`
            : undefined,
        tooltip: [
          `Qualified leads: ${r.qualified}`,
          `Positive response rate: ${r.positiveReplyRate === null ? "not enough outreach" : formatPercent(r.positiveReplyRate)}`,
          `Meetings: ${r.meetings} · Proposals: ${r.proposals} · Won: ${r.won}`,
          `Revenue: ${formatInr(r.revenue)} · Gross profit: ${formatInr(r.grossProfit)}`,
        ],
      };
    })
    .sort((a, b) => b.value - a.value);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Select value={metricKey} onValueChange={(v) => setMetricKey(v as MetricKey)}>
          <SelectTrigger size="sm" className="w-52" aria-label="Metric">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METRICS.map((m) => (
              <SelectItem key={m.key} value={m.key}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="inline-flex rounded-lg border p-0.5">
          <Button
            variant={view === "chart" ? "secondary" : "ghost"}
            size="icon-xs"
            aria-label="Show as chart"
            aria-pressed={view === "chart"}
            onClick={() => setView("chart")}
          >
            <ChartColumn />
          </Button>
          <Button
            variant={view === "table" ? "secondary" : "ghost"}
            size="icon-xs"
            aria-label="Show as table"
            aria-pressed={view === "table"}
            onClick={() => setView("table")}
          >
            <Table2 />
          </Button>
        </div>
      </div>

      {view === "chart" ? (
        <BarList rows={barRows} labelWidth="10.5rem" emptyLabel={`No ${metric.label.toLowerCase()} recorded in this period`} />
      ) : (
        <div className="overflow-x-auto">
          <table className="tabular w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Industry</th>
                <th className="px-2 py-2 text-right font-medium">Qualified</th>
                <th className="px-2 py-2 text-right font-medium">Positive rate</th>
                <th className="px-2 py-2 text-right font-medium">Meetings</th>
                <th className="px-2 py-2 text-right font-medium">Proposals</th>
                <th className="px-2 py-2 text-right font-medium">Won</th>
                <th className="px-2 py-2 text-right font-medium">Revenue</th>
                <th className="py-2 pl-2 text-right font-medium">Gross profit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.industryId} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-3">{r.industry}</td>
                  <td className="px-2 py-2 text-right">{r.qualified}</td>
                  <td className="px-2 py-2 text-right">{r.positiveReplyRate === null ? "–" : formatPercent(r.positiveReplyRate)}</td>
                  <td className="px-2 py-2 text-right">{r.meetings}</td>
                  <td className="px-2 py-2 text-right">{r.proposals}</td>
                  <td className="px-2 py-2 text-right">{r.won}</td>
                  <td className="px-2 py-2 text-right">{formatInrCompact(r.revenue)}</td>
                  <td className="py-2 pl-2 text-right">{formatInrCompact(r.grossProfit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
