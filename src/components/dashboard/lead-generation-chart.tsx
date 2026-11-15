"use client";

import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartLegend, ChartTooltipBody } from "@/components/charts/chart-tooltip";
import type { SeriesRow } from "@/server/repositories/dashboard";

const QUALIFIED = "var(--chart-1)";
const DISCOVERED = "var(--chart-2)";

function shortDate(isoDate: string): string {
  // The value is a calendar date already in the workspace timezone.
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

export function LeadGenerationChart({
  rows,
  bucket,
  dailyTarget,
}: {
  rows: SeriesRow[];
  bucket: "day" | "week";
  dailyTarget: number;
}) {
  const data = rows.map((r) => ({ ...r, label: bucket === "week" ? `Week of ${shortDate(r.date)}` : shortDate(r.date) }));
  const hasData = rows.some((r) => r.discovered + r.qualified > 0);
  const showTarget = bucket === "day" && dailyTarget > 0;

  if (!hasData) {
    return <p className="py-16 text-center text-sm text-muted-foreground">No companies discovered or qualified in this period</p>;
  }

  return (
    <div>
      <div className="h-64 xl:h-[22rem]" role="img" aria-label={`Line chart of companies discovered and qualified per ${bucket}`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: "var(--input)" }}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              minTickGap={28}
              tickFormatter={(value: string) => value.replace("Week of ", "")}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              width={44}
            />
            <Tooltip
              cursor={{ stroke: "var(--ring)", strokeWidth: 1 }}
              content={(props) => (
                <ChartTooltipBody active={props.active} payload={props.payload} title={String(props.label ?? "")} />
              )}
            />
            {showTarget ? (
              <ReferenceLine
                y={dailyTarget}
                stroke="var(--subtle)"
                strokeDasharray="4 4"
                label={{ value: `Daily target ${dailyTarget}`, position: "insideTopRight", fill: "var(--muted-foreground)", fontSize: 11 }}
              />
            ) : null}
            {/* Straight segments: these are counts per period, and a smoothed curve
                would draw values between days that never existed. */}
            <Area
              type="linear"
              dataKey="qualified"
              name="Qualified"
              stroke={QUALIFIED}
              strokeWidth={2}
              fill={QUALIFIED}
              fillOpacity={0.1}
              dot={false}
              activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="discovered"
              name="Discovered"
              stroke={DISCOVERED}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend
        items={[
          { label: "Qualified", color: QUALIFIED, shape: "line" },
          { label: "Discovered", color: DISCOVERED, shape: "line" },
        ]}
      />
    </div>
  );
}
