import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface BarListRow {
  key: string;
  label: string;
  value: number;
  /** Formatted value shown at the tip of the bar. */
  display: string;
  /** Muted text after the value, e.g. a conversion rate. */
  secondary?: string;
  /** Lines shown in the hover tooltip. */
  tooltip?: string[];
}

/**
 * Horizontal bar list for one measure across categories.
 * One hue (magnitude is carried by length), thin bars with a rounded data end
 * and a square baseline, value printed at the tip in text colour.
 */
export function BarList({
  rows,
  color = "var(--chart-1)",
  labelWidth = "8.5rem",
  emptyLabel = "No data for this period",
  className,
}: {
  rows: BarListRow[];
  color?: string;
  labelWidth?: string;
  emptyLabel?: string;
  className?: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  if (rows.length === 0 || max === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <ul className={cn("space-y-1", className)}>
      {rows.map((row) => {
        const width = max === 0 ? 0 : (row.value / max) * 100;
        return (
          <li key={row.key}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  tabIndex={0}
                  className="grid items-center gap-3 rounded-md px-1.5 py-1.5 outline-none hover:bg-muted focus-visible:bg-muted"
                  style={{ gridTemplateColumns: `${labelWidth} minmax(0, 1fr)` }}
                >
                  <span className="truncate text-sm text-muted-foreground">{row.label}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 shrink-0 rounded-r-[4px]"
                      style={{ width: `max(${width * 0.72}%, ${row.value > 0 ? 2 : 0}px)`, background: color }}
                    />
                    <span className="tabular shrink-0 text-sm font-medium">{row.display}</span>
                    {row.secondary ? (
                      <span className="tabular truncate text-xs text-muted-foreground">{row.secondary}</span>
                    ) : null}
                  </span>
                </div>
              </TooltipTrigger>
              {row.tooltip ? (
                <TooltipContent side="top" align="start">
                  <p className="font-medium">{row.label}</p>
                  {row.tooltip.map((line) => (
                    <p key={line} className="opacity-80">
                      {line}
                    </p>
                  ))}
                </TooltipContent>
              ) : null}
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}
