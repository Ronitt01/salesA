"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Copy, ExternalLink, Tag, X } from "lucide-react";
import { toast } from "sonner";
import { Pill, ScoreBadge, StageBadge, VerificationBadge } from "@/components/shared/badges";
import { DemoTag } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatRelative } from "@/lib/format";
import { SIGNAL_TYPE_LABEL, SOURCE_KIND_LABEL } from "@/lib/labels";
import { leadHref, type LeadParams } from "@/lib/lead-params";
import { cn } from "@/lib/utils";
import { bulkTagLeads } from "@/server/actions/leads";
import type { LeadRow } from "@/server/repositories/leads";

function SortHeader({
  column,
  label,
  params,
  align = "left",
}: {
  column: string;
  label: string;
  params: LeadParams;
  align?: "left" | "right";
}) {
  const currentSort = params.sort ?? "opportunity_score";
  const currentDir = params.dir ?? "desc";
  const active = currentSort === column;
  const nextDir = active && currentDir === "desc" ? "asc" : "desc";
  const Icon = !active ? ArrowUpDown : currentDir === "desc" ? ArrowDown : ArrowUp;
  return (
    <Link
      href={leadHref(params, { sort: column, dir: nextDir, page: null })}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-foreground",
        active && "text-foreground",
        align === "right" && "flex-row-reverse",
      )}
      aria-label={`Sort by ${label}, ${nextDir === "asc" ? "ascending" : "descending"}`}
    >
      {label}
      <Icon className={cn("size-3", !active && "opacity-50")} />
    </Link>
  );
}

export function LeadTable({
  rows,
  params,
  renderedAt,
  canWrite,
}: {
  rows: LeadRow[];
  params: LeadParams;
  renderedAt: string;
  canWrite: boolean;
}) {
  const now = new Date(renderedAt);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tag, setTag] = useState("");
  const [pending, startTransition] = useTransition();

  const ids = rows.map((r) => r.id);
  const visibleSelected = ids.filter((id) => selected.has(id));
  const allSelected = ids.length > 0 && visibleSelected.length === ids.length;

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const runTag = (mode: "add" | "remove") =>
    startTransition(async () => {
      const result = await bulkTagLeads(visibleSelected, tag, mode);
      if (result.ok) {
        toast.success(result.message);
        setSelected(new Set());
        setTag("");
      } else toast.error(result.error);
    });

  const th = "px-3 py-2.5 text-left text-xs font-medium text-muted-foreground";
  const td = "px-3 py-2.5 align-middle";

  return (
    <div>
      {visibleSelected.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b bg-secondary/60 px-4 py-2">
          <span className="text-sm font-medium">{visibleSelected.length} selected</span>
          {canWrite ? (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                runTag("add");
              }}
            >
              <div className="relative">
                <Tag className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-subtle" />
                <Input
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  placeholder="Tag name"
                  aria-label="Tag name"
                  maxLength={40}
                  className="h-7 w-40 pl-7 text-xs"
                />
              </div>
              <Button type="submit" size="xs" disabled={pending || tag.trim() === ""}>
                Add tag
              </Button>
              <Button type="button" size="xs" variant="outline" disabled={pending || tag.trim() === ""} onClick={() => runTag("remove")}>
                Remove tag
              </Button>
            </form>
          ) : (
            <span className="text-xs text-muted-foreground">Viewers cannot edit tags.</span>
          )}
          <Button size="xs" variant="ghost" className="ml-auto text-muted-foreground" onClick={() => setSelected(new Set())}>
            <X />
            Clear selection
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1500px] border-collapse text-sm">
          <thead>
            <tr className="border-b">
              <th className={cn(th, "w-10 pr-0")}>
                <Checkbox
                  checked={allSelected ? true : visibleSelected.length > 0 ? "indeterminate" : false}
                  onCheckedChange={(v) => setSelected(v === true ? new Set(ids) : new Set())}
                  aria-label="Select all leads on this page"
                />
              </th>
              <th className={cn(th, "sticky left-0 z-10 bg-card")}>
                <SortHeader column="company_name" label="Company" params={params} />
              </th>
              <th className={th}>
                <SortHeader column="contact_name" label="Contact" params={params} />
              </th>
              <th className={th}>Job title</th>
              <th className={th}>
                <SortHeader column="industry_name" label="Industry" params={params} />
              </th>
              <th className={th}>
                <SortHeader column="state" label="Location" params={params} />
              </th>
              <th className={th}>
                <SortHeader column="employee_count_estimate" label="Employees" params={params} />
              </th>
              <th className={th}>
                <SortHeader column="opportunity_score" label="Opportunity score" params={params} />
              </th>
              <th className={th}>
                <SortHeader column="contact_reliability" label="Contact reliability" params={params} />
              </th>
              <th className={th}>Buying signal</th>
              <th className={th}>Recommended service</th>
              <th className={th}>
                <SortHeader column="lead_stage" label="Stage" params={params} />
              </th>
              <th className={th}>Source</th>
              <th className={th}>
                <SortHeader column="last_researched_at" label="Last researched" params={params} />
              </th>
              <th className={cn(th, "text-right")}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isSelected = selected.has(row.id);
              return (
                <tr
                  key={row.id}
                  data-selected={isSelected || undefined}
                  className="group border-b border-border/60 transition-colors last:border-0 hover:bg-muted/60 data-selected:bg-secondary/50"
                >
                  <td className={cn(td, "pr-0")}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(v) => toggle(row.id, v === true)}
                      aria-label={`Select ${row.company_name}`}
                    />
                  </td>
                  <td className={cn(td, "sticky left-0 z-10 max-w-64 bg-card group-hover:bg-[color-mix(in_srgb,var(--muted)_60%,var(--card))]")}>
                    <span className="flex items-center gap-1.5">
                      <Link href={`/leads/${row.id}`} className="truncate font-medium hover:underline">
                        {row.company_name}
                      </Link>
                      {row.is_demo ? <DemoTag className="shrink-0" /> : null}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="truncate">{row.domain ?? "No website"}</span>
                      {row.possible_duplicate ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-0.5 text-warning">
                              <Copy className="size-3" />
                              Possible duplicate
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Another company in this workspace has the same normalised name.</TooltipContent>
                        </Tooltip>
                      ) : null}
                      {row.tags.map((t) => (
                        <Pill key={t}>{t}</Pill>
                      ))}
                    </span>
                  </td>
                  <td className={cn(td, "max-w-44 truncate")}>
                    {row.contact_name ?? <span className="text-subtle">No contact</span>}
                    {row.contact_do_not_contact ? <Pill tone="danger" className="ml-1.5">Do not contact</Pill> : null}
                  </td>
                  <td className={cn(td, "max-w-44 truncate text-muted-foreground")}>{row.contact_job_title ?? "–"}</td>
                  <td className={cn(td, "max-w-44 truncate")}>{row.industry_name ?? "–"}</td>
                  <td className={cn(td, "whitespace-nowrap text-muted-foreground")}>
                    {[row.city, row.state].filter(Boolean).join(", ") || "–"}
                  </td>
                  <td className={cn(td, "tabular whitespace-nowrap text-muted-foreground")}>{row.employee_range ?? "Unknown"}</td>
                  <td className={td}>
                    <ScoreBadge score={row.opportunity_score} priority={row.priority} />
                  </td>
                  <td className={td}>
                    {row.contact_id ? (
                      <span className="flex items-center gap-1.5">
                        <span className="tabular w-6 text-sm">{row.contact_reliability ?? "–"}</span>
                        {row.contact_verification_status ? <VerificationBadge status={row.contact_verification_status} /> : null}
                      </span>
                    ) : (
                      <span className="text-subtle">–</span>
                    )}
                  </td>
                  <td className={cn(td, "max-w-56")}>
                    {row.top_signal_type ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1.5">
                            <Pill tone="info">{SIGNAL_TYPE_LABEL[row.top_signal_type]}</Pill>
                            {(row.active_signal_count ?? 0) > 1 ? (
                              <span className="text-xs text-muted-foreground">+{(row.active_signal_count ?? 1) - 1}</span>
                            ) : null}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-72">
                          {row.top_signal_summary}
                          <span className="block opacity-70">Observed {formatRelative(row.top_signal_observed_at, now)}</span>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-xs text-subtle">No live signal</span>
                    )}
                  </td>
                  <td className={cn(td, "max-w-52 truncate text-muted-foreground")}>{row.recommended_service_name ?? "–"}</td>
                  <td className={td}>
                    <StageBadge stage={row.lead_stage} />
                  </td>
                  <td className={cn(td, "whitespace-nowrap text-muted-foreground")}>
                    {row.source_kind ? SOURCE_KIND_LABEL[row.source_kind] : "–"}
                  </td>
                  <td className={cn(td, "whitespace-nowrap text-muted-foreground")}>
                    {row.last_researched_at ? formatRelative(row.last_researched_at, now) : "Never"}
                  </td>
                  <td className={cn(td, "text-right")}>
                    <Button asChild variant="ghost" size="xs">
                      <Link href={`/leads/${row.id}`}>
                        Open
                        <ExternalLink />
                      </Link>
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
