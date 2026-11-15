"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bookmark, ListFilter, LoaderCircle, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  EMPLOYEE_RANGES,
  INDIAN_STATES,
  LEAD_STAGE_LABEL,
  SIGNAL_TYPE_LABEL,
  SOURCE_KIND_LABEL,
  VERIFICATION_LABEL,
} from "@/lib/labels";
import { FILTER_KEYS, leadHref, onlyFilters, type LeadParams } from "@/lib/lead-params";
import { deleteLeadFilter, saveLeadFilter } from "@/server/actions/leads";

const ANY = "__any";

interface Option {
  id: string;
  name: string;
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string | null) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
}) {
  return (
    <Select value={value ?? ANY} onValueChange={(v) => onChange(v === ANY ? null : v)}>
      <SelectTrigger size="sm" className={className} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{label}: any</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function LeadFilters({
  params,
  industries,
  services,
  savedFilters,
}: {
  params: LeadParams;
  industries: Option[];
  services: Option[];
  savedFilters: Array<{ id: string; name: string; params: Record<string, string> }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saveName, setSaveName] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);

  const filters = onlyFilters(params);
  const activeCount = Object.keys(filters).length;
  const moreKeys = ["state", "employees", "signal", "service", "verification", "source", "researched", "qualified"];
  const moreCount = moreKeys.filter((k) => params[k]).length;

  // Any filter change returns to the first page.
  const apply = (changes: Record<string, string | null>) =>
    startTransition(() => router.push(leadHref(params, { ...changes, page: null })));

  const clearAll = () =>
    startTransition(() =>
      router.push(leadHref(params, Object.fromEntries([...FILTER_KEYS.map((k) => [k, null]), ["page", null]]))),
    );

  const industryName = (id: string) => industries.find((i) => i.id === id)?.name ?? "Industry";
  const serviceName = (id: string) => services.find((s) => s.id === id)?.name ?? "Service";
  const chipLabel = (key: string, value: string): string => {
    switch (key) {
      case "q":
        return `Search: ${value}`;
      case "industry":
        return industryName(value);
      case "service":
        return serviceName(value);
      case "stage":
        return value.split(",").map((s) => LEAD_STAGE_LABEL[s as keyof typeof LEAD_STAGE_LABEL] ?? s).join(", ");
      case "signal":
        return SIGNAL_TYPE_LABEL[value as keyof typeof SIGNAL_TYPE_LABEL] ?? value;
      case "verification":
        return `Contact: ${VERIFICATION_LABEL[value as keyof typeof VERIFICATION_LABEL] ?? value}`;
      case "source":
        return `Source: ${SOURCE_KIND_LABEL[value as keyof typeof SOURCE_KIND_LABEL] ?? value}`;
      case "employees":
        return `${value} employees`;
      case "score_min":
        return `Score ≥ ${value}`;
      case "score_max":
        return `Score ≤ ${value}`;
      case "researched":
        return value === "never" ? "Never researched" : `Researched in last ${value.replace("d", " days")}`;
      case "qualified":
        return value === "yes" ? "Qualified" : "Not qualified";
      case "tag":
        return `Tag: ${value}`;
      default:
        return value;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form
          role="search"
          className="relative w-full sm:w-64"
          onSubmit={(event) => {
            event.preventDefault();
            const q = new FormData(event.currentTarget).get("q");
            apply({ q: typeof q === "string" && q.trim() ? q.trim() : null });
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" />
          <Input
            key={params.q ?? ""}
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Company, contact, domain, city"
            aria-label="Search leads"
            className="h-8 pl-8 text-sm"
          />
        </form>

        <FilterSelect
          label="Industry"
          value={params.industry}
          onChange={(v) => apply({ industry: v })}
          options={industries.map((i) => ({ value: i.id, label: i.name }))}
          className="w-44"
        />
        <FilterSelect
          label="Stage"
          value={params.stage}
          onChange={(v) => apply({ stage: v })}
          options={Object.entries(LEAD_STAGE_LABEL).map(([value, label]) => ({ value, label }))}
          className="w-40"
        />
        <FilterSelect
          label="Score"
          value={params.score_min}
          onChange={(v) => apply({ score_min: v, score_max: null })}
          options={[
            { value: "80", label: "Priority A (80+)" },
            { value: "65", label: "Qualifying (65+)" },
            { value: "50", label: "50 and above" },
          ]}
          className="w-40"
        />

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <ListFilter />
              More filters
              {moreCount > 0 ? (
                <span className="flex size-4 items-center justify-center rounded-full bg-info text-[10px] font-semibold text-white">
                  {moreCount}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Geography</Label>
                <FilterSelect
                  label="State"
                  value={params.state}
                  onChange={(v) => apply({ state: v })}
                  options={INDIAN_STATES.map((s) => ({ value: s, label: s }))}
                  className="w-full"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Employee count</Label>
                <FilterSelect
                  label="Employees"
                  value={params.employees}
                  onChange={(v) => apply({ employees: v })}
                  options={EMPLOYEE_RANGES.map((r) => ({ value: r, label: r }))}
                  className="w-full"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Buying signal</Label>
                <FilterSelect
                  label="Signal"
                  value={params.signal}
                  onChange={(v) => apply({ signal: v })}
                  options={Object.entries(SIGNAL_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
                  className="w-full"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Recommended service</Label>
                <FilterSelect
                  label="Service"
                  value={params.service}
                  onChange={(v) => apply({ service: v })}
                  options={services.map((s) => ({ value: s.id, label: s.name }))}
                  className="w-full"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Contact verification</Label>
                <FilterSelect
                  label="Verification"
                  value={params.verification}
                  onChange={(v) => apply({ verification: v })}
                  options={Object.entries(VERIFICATION_LABEL).map(([value, label]) => ({ value, label }))}
                  className="w-full"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Source</Label>
                <FilterSelect
                  label="Source"
                  value={params.source}
                  onChange={(v) => apply({ source: v })}
                  options={Object.entries(SOURCE_KIND_LABEL)
                    .filter(([value]) => value !== "demo_seed")
                    .map(([value, label]) => ({ value, label }))}
                  className="w-full"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Research date</Label>
                <FilterSelect
                  label="Researched"
                  value={params.researched}
                  onChange={(v) => apply({ researched: v })}
                  options={[
                    { value: "7d", label: "Last 7 days" },
                    { value: "30d", label: "Last 30 days" },
                    { value: "90d", label: "Last 90 days" },
                    { value: "never", label: "Never researched" },
                  ]}
                  className="w-full"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Qualification</Label>
                <FilterSelect
                  label="Qualified"
                  value={params.qualified}
                  onChange={(v) => apply({ qualified: v })}
                  options={[
                    { value: "yes", label: "Qualified" },
                    { value: "no", label: "Not qualified" },
                  ]}
                  className="w-full"
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Bookmark />
              Saved
              {savedFilters.length > 0 ? <span className="text-muted-foreground">{savedFilters.length}</span> : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Saved filters</DropdownMenuLabel>
            {savedFilters.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">No saved filters yet.</p>
            ) : (
              savedFilters.map((saved) => (
                <DropdownMenuItem
                  key={saved.id}
                  className="justify-between gap-2"
                  onSelect={() => startTransition(() => router.push(leadHref(saved.params)))}
                >
                  <span className="truncate">{saved.name}</span>
                  <button
                    type="button"
                    aria-label={`Delete saved filter ${saved.name}`}
                    className="rounded p-0.5 text-subtle hover:text-danger"
                    onClick={(event) => {
                      event.stopPropagation();
                      event.preventDefault();
                      startTransition(async () => {
                        const result = await deleteLeadFilter(saved.id);
                        if (result.ok) toast.success(result.message);
                        else toast.error(result.error);
                      });
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={activeCount === 0} onSelect={() => setSaveOpen(true)}>
              Save current filters…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {pending ? <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-label="Updating" /> : null}
      </div>

      {saveOpen ? (
        <form
          className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 p-2"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              const result = await saveLeadFilter(saveName, filters);
              if (result.ok) {
                toast.success(result.message);
                setSaveOpen(false);
                setSaveName("");
              } else toast.error(result.error);
            });
          }}
        >
          <Input
            autoFocus
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Name this filter set"
            aria-label="Saved filter name"
            maxLength={60}
            className="h-8 w-60 text-sm"
          />
          <Button type="submit" size="sm" disabled={pending || saveName.trim() === ""}>
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setSaveOpen(false)}>
            Cancel
          </Button>
        </form>
      ) : null}

      {activeCount > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {Object.entries(filters).map(([key, value]) => (
            <button
              key={key}
              type="button"
              onClick={() => apply({ [key]: null })}
              className="inline-flex h-6 items-center gap-1 rounded-md border bg-secondary px-2 text-xs transition-colors hover:border-ring"
              aria-label={`Remove filter ${chipLabel(key, value)}`}
            >
              {chipLabel(key, value)}
              <X className="size-3 text-muted-foreground" />
            </button>
          ))}
          <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={clearAll}>
            Clear all
          </Button>
        </div>
      ) : null}
    </div>
  );
}
