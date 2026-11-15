/** Shared tooltip body for Recharts charts. Text uses text tokens; a swatch carries identity. */
export interface ChartTooltipEntry {
  name?: unknown;
  value?: unknown;
  color?: string;
  dataKey?: unknown;
}

export function ChartTooltipBody({
  active,
  payload,
  title,
  formatValue = (v) => String(v),
}: {
  active?: boolean;
  payload?: ReadonlyArray<ChartTooltipEntry>;
  title: string;
  formatValue?: (value: number, key: string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="min-w-36 rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-1.5 font-medium text-popover-foreground">{title}</p>
      <ul className="space-y-1">
        {payload.map((entry) => (
          <li key={String(entry.dataKey)} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-[2px]" style={{ background: entry.color }} />
              {String(entry.name)}
            </span>
            <span className="tabular font-medium text-popover-foreground">
              {formatValue(Number(entry.value ?? 0), String(entry.dataKey))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Legend row rendered in HTML so it matches the rest of the interface. */
export function ChartLegend({ items }: { items: Array<{ label: string; color: string; shape?: "square" | "line" }> }) {
  return (
    <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            className={item.shape === "line" ? "h-0.5 w-3.5 rounded-full" : "size-2.5 rounded-[3px]"}
            style={{ background: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
