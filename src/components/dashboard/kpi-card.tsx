import { ArrowDownRight, ArrowUpRight, Info, Minus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type KpiTone = "info" | "success" | "ai" | "warning" | "danger";

const TONE: Record<KpiTone, string> = {
  info: "bg-info/12 text-info",
  success: "bg-success/12 text-success",
  ai: "bg-ai/12 text-ai",
  warning: "bg-warning/12 text-warning",
  danger: "bg-danger/12 text-danger",
};

export interface KpiCardProps {
  label: string;
  /** Already formatted for display. */
  value: string;
  icon: LucideIcon;
  tone: KpiTone;
  /** Plain-language definition of the metric, shown on hover and focus. */
  explanation: string;
  /** Signed difference against the comparison period, or null when not comparable. */
  delta: number | null;
  /** Formatted magnitude of the delta, without sign. */
  deltaDisplay: string | null;
  comparisonLabel: string;
  caption?: string;
}

export function KpiCard(props: KpiCardProps) {
  const { delta } = props;
  const direction = delta === null || delta === 0 ? "flat" : delta > 0 ? "up" : "down";
  const DeltaIcon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;

  return (
    <div className="flex min-w-0 flex-col rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <span className={cn("flex size-8 items-center justify-center rounded-lg", TONE[props.tone])}>
          <props.icon className="size-4" strokeWidth={2} />
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="rounded p-0.5 text-subtle transition-colors hover:text-muted-foreground focus-visible:text-muted-foreground"
              aria-label={`About ${props.label}`}
            >
              <Info className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-64 leading-relaxed">{props.explanation}</TooltipContent>
        </Tooltip>
      </div>

      <p className="mt-3 truncate text-xs text-muted-foreground">{props.label}</p>
      <p className="mt-1 text-2xl leading-none font-semibold tracking-tight">{props.value}</p>

      <p className="mt-2.5 flex min-h-4 items-center gap-1 text-xs text-muted-foreground">
        {delta === null ? (
          <span className="text-subtle">{props.caption ?? "No earlier period to compare"}</span>
        ) : (
          <>
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium",
                direction === "up" && "text-success",
                direction === "down" && "text-danger",
              )}
            >
              <DeltaIcon className="size-3.5" />
              {direction === "flat" ? "No change" : `${direction === "up" ? "+" : "−"}${props.deltaDisplay}`}
            </span>
            <span className="truncate">{props.comparisonLabel}</span>
          </>
        )}
      </p>
    </div>
  );
}
