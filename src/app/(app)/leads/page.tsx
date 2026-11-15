import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight, Crosshair, Download } from "lucide-react";
import { LeadFilters } from "@/components/leads/lead-filters";
import { LeadFormDialog } from "@/components/leads/lead-form-dialog";
import { LeadTable } from "@/components/leads/lead-table";
import { EmptyState, PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shell/shell-skeleton";
import { Button } from "@/components/ui/button";
import { leadHref, onlyFilters, toLeadParams } from "@/lib/lead-params";
import { canWrite, getSessionContext } from "@/server/auth/context";
import { PAGE_SIZES, activeFilterCount, getLeadFilterOptions, listLeads, parseLeadFilters } from "@/server/repositories/leads";

export const metadata: Metadata = { title: "Lead Explorer" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function LeadExplorer({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const ctx = await getSessionContext();
  const now = new Date();
  const filters = parseLeadFilters(raw);
  const params = toLeadParams(filters);

  const [{ rows, total }, options] = await Promise.all([listLeads(ctx, filters, now), getLeadFilterOptions(ctx)]);

  const pageCount = Math.max(1, Math.ceil(total / filters.per));
  const first = total === 0 ? 0 : (filters.page - 1) * filters.per + 1;
  const last = Math.min(filters.page * filters.per, total);
  const filtered = activeFilterCount(filters) > 0;
  const writer = canWrite(ctx.role);
  const exportHref = leadHref(onlyFilters(params), { sort: params.sort ?? null, dir: params.dir ?? null }, "/api/export/leads");

  return (
    <>
      <PageHeader
        title="Lead Explorer"
        description="Every discovered company with its best contact, live signals and score."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              {/* A plain anchor: this downloads a file rather than navigating. */}
              <a href={exportHref} download>
                <Download />
                Export CSV
              </a>
            </Button>
            {writer ? <LeadFormDialog industries={options.industries} /> : null}
          </>
        }
      />

      <LeadFilters params={params} industries={options.industries} services={options.services} savedFilters={options.savedFilters} />

      <section className="mt-4 overflow-hidden rounded-xl border bg-card" aria-label="Leads">
        {rows.length === 0 ? (
          <EmptyState
            icon={Crosshair}
            title={filtered ? "No leads match these filters" : "No leads yet"}
            description={
              filtered
                ? "Remove a filter or widen the score range to see more companies."
                : "Run company discovery from Automations, or add a lead you already know about."
            }
            action={
              filtered ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/leads">Clear filters</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <LeadTable rows={rows} params={params} renderedAt={now.toISOString()} canWrite={writer} />
        )}

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-2.5 text-xs text-muted-foreground">
          <span className="tabular">
            {total === 0 ? "0 leads" : `${first}–${last} of ${total} lead${total === 1 ? "" : "s"}`}
          </span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              Rows
              {PAGE_SIZES.map((size) => (
                <Link
                  key={size}
                  href={leadHref(params, { per: String(size), page: null })}
                  aria-current={filters.per === size ? "true" : undefined}
                  className={`rounded px-1.5 py-0.5 ${filters.per === size ? "bg-secondary font-medium text-foreground" : "hover:text-foreground"}`}
                >
                  {size}
                </Link>
              ))}
            </span>
            <span className="flex items-center gap-1">
              {filters.page > 1 ? (
                <Button asChild variant="outline" size="icon-xs" aria-label="Previous page">
                  <Link href={leadHref(params, { page: String(filters.page - 1) })}>
                    <ChevronLeft />
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="icon-xs" disabled aria-label="Previous page">
                  <ChevronLeft />
                </Button>
              )}
              <span className="tabular px-1">
                Page {Math.min(filters.page, pageCount)} of {pageCount}
              </span>
              {filters.page < pageCount ? (
                <Button asChild variant="outline" size="icon-xs" aria-label="Next page">
                  <Link href={leadHref(params, { page: String(filters.page + 1) })}>
                    <ChevronRight />
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" size="icon-xs" disabled aria-label="Next page">
                  <ChevronRight />
                </Button>
              )}
            </span>
          </div>
        </footer>
      </section>
    </>
  );
}

export default function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LeadExplorer searchParams={searchParams} />
    </Suspense>
  );
}
