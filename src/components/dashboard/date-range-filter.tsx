"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { RANGE_OPTIONS, type RangeKey } from "@/lib/date-range";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function DateRangeFilter({
  basePath,
  active,
  fromDate,
  toDate,
  maxDate,
}: {
  basePath: string;
  active: RangeKey;
  fromDate: string;
  toDate: string;
  /** Today in the workspace timezone; later dates cannot be picked. */
  maxDate: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(fromDate);
  const [to, setTo] = useState(toDate);
  const invalid = !from || !to || from > to;

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Date range">
      <div className="inline-flex rounded-lg border bg-card p-0.5">
        {RANGE_OPTIONS.map((option) => (
          <Link
            key={option.key}
            href={`${basePath}?range=${option.key}`}
            aria-current={active === option.key ? "true" : undefined}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs whitespace-nowrap transition-colors",
              active === option.key
                ? "bg-secondary font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn("h-[30px] gap-1.5 text-xs", active === "custom" && "border-ring text-foreground")}
          >
            <CalendarDays className="size-3.5" />
            {active === "custom" ? `${fromDate} – ${toDate}` : "Custom range"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (invalid) return;
              setOpen(false);
              router.push(`${basePath}?range=custom&from=${from}&to=${to}`);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="range-from" className="text-xs">
                From
              </Label>
              <Input id="range-from" type="date" value={from} max={maxDate} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="range-to" className="text-xs">
                To
              </Label>
              <Input id="range-to" type="date" value={to} max={maxDate} onChange={(e) => setTo(e.target.value)} />
            </div>
            {from && to && from > to ? <p className="text-xs text-danger">The start date must be before the end date.</p> : null}
            <Button type="submit" size="sm" className="w-full" disabled={invalid}>
              Apply range
            </Button>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  );
}
