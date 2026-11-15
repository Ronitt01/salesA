import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { WorkflowRow } from "@/server/repositories/dashboard";

// Status colours describe state, so they come from the status palette, not the series palette.
const STATES = [
  { key: "succeeded", label: "Succeeded", color: "var(--status-good)" },
  { key: "failed", label: "Failed", color: "var(--status-critical)" },
  { key: "running", label: "Running", color: "var(--chart-1)" },
  { key: "queued", label: "Queued", color: "var(--status-neutral)" },
] as const;

export function WorkflowMonitor({ rows }: { rows: WorkflowRow[] }) {
  const totals = STATES.map((s) => ({ ...s, total: rows.reduce((sum, r) => sum + r[s.key], 0) }));
  const grand = totals.reduce((sum, s) => sum + s.total, 0);

  if (rows.length === 0 || grand === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No workflow executions in this period</p>;
  }

  return (
    <div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {totals.map((s) => (
          <div key={s.key} className="rounded-lg border bg-muted/50 px-3 py-2.5">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: s.color }} />
              {s.label}
            </dt>
            <dd className="mt-1 text-xl leading-none font-semibold">{s.total}</dd>
          </div>
        ))}
      </dl>

      <ul className="mt-4 space-y-1">
        {rows.map((row) => {
          const total = STATES.reduce((sum, s) => sum + row[s.key], 0);
          const finished = row.succeeded + row.failed;
          return (
            <li key={row.key}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    tabIndex={0}
                    className="grid grid-cols-[minmax(0,13rem)_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-1.5 py-1.5 outline-none hover:bg-muted focus-visible:bg-muted"
                  >
                    <span className="truncate text-sm">
                      <span className="font-mono text-xs text-muted-foreground">{row.key}</span> {row.name}
                    </span>
                    {/* Thin segmented bar: a 2px surface gap separates the parts. */}
                    <span className="flex h-2 gap-0.5 overflow-hidden rounded-full">
                      {total === 0 ? (
                        <span className="h-full w-full rounded-full bg-muted" />
                      ) : (
                        STATES.filter((s) => row[s.key] > 0).map((s) => (
                          <span
                            key={s.key}
                            className="h-full min-w-1 rounded-full"
                            style={{ flexGrow: row[s.key], flexBasis: 0, background: s.color }}
                          />
                        ))
                      )}
                    </span>
                    <span className="tabular w-24 text-right text-xs text-muted-foreground">
                      {finished === 0 ? "No finished runs" : `${Math.round((row.succeeded / finished) * 100)}% success`}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" align="start">
                  <p className="font-medium">
                    {row.key} {row.name}
                  </p>
                  {STATES.map((s) => (
                    <p key={s.key} className="opacity-80">
                      {s.label}: {row[s.key]}
                    </p>
                  ))}
                  {row.avgDurationMs !== null ? (
                    <p className="opacity-80">Average duration: {(row.avgDurationMs / 1000).toFixed(1)}s</p>
                  ) : null}
                </TooltipContent>
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
