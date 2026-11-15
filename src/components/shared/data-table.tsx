import { cn } from "@/lib/utils";

export interface Column<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
  align?: "left" | "right";
  className?: string;
}

/** Plain server-rendered table used by the simpler list screens. */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  minWidth = "900px",
  caption,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  minWidth?: string;
  caption: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" style={{ minWidth }}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b">
            {columns.map((column) => (
              <th
                key={column.header}
                scope="col"
                className={cn(
                  "px-4 py-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground",
                  column.align === "right" ? "text-right" : "text-left",
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/60">
              {columns.map((column) => (
                <td
                  key={column.header}
                  className={cn("px-4 py-2.5 align-middle", column.align === "right" && "tabular text-right", column.className)}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Compact headline number used above tables. */
export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl leading-none font-semibold">{value}</p>
      {hint ? <p className="mt-1.5 text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}
