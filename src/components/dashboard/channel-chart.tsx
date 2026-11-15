"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartLegend, ChartTooltipBody } from "@/components/charts/chart-tooltip";
import { ACQUISITION_CHANNEL_LABEL } from "@/lib/labels";
import type { ChannelRow } from "@/server/repositories/dashboard";

// Fixed assignment: a series keeps its colour whatever else is on screen.
const SERIES = [
  { key: "leads", label: "Leads discovered", color: "var(--chart-1)" },
  { key: "qualified", label: "Qualified", color: "var(--chart-2)" },
  { key: "positiveReplies", label: "Positive replies", color: "var(--chart-3)" },
  { key: "meetings", label: "Meetings", color: "var(--chart-4)" },
] as const;

export function ChannelChart({ rows }: { rows: ChannelRow[] }) {
  const data = rows.map((r) => ({ ...r, name: ACQUISITION_CHANNEL_LABEL[r.channel] }));
  const hasData = rows.some((r) => r.leads + r.qualified + r.positiveReplies + r.meetings > 0);

  if (!hasData) {
    return <p className="py-16 text-center text-sm text-muted-foreground">No acquisition activity in this period</p>;
  }

  return (
    <div>
      <div className="h-64" role="img" aria-label="Grouped column chart of leads, qualified leads, positive replies and meetings by acquisition channel">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }} barGap={2} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={{ stroke: "var(--input)" }}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              interval={0}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              width={44}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              content={(props) => (
                <ChartTooltipBody active={props.active} payload={props.payload} title={String(props.label ?? "")} />
              )}
            />
            {SERIES.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={s.color}
                radius={[4, 4, 0, 0]}
                maxBarSize={14}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend items={SERIES.map((s) => ({ label: s.label, color: s.color }))} />
    </div>
  );
}
