import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { Building2, Search } from "lucide-react";
import { ScoreBadge, StageBadge } from "@/components/shared/badges";
import { DataTable, StatTile } from "@/components/shared/data-table";
import { DemoTag, EmptyState, PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shell/shell-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatInrCompact, formatRelative } from "@/lib/format";
import { getSessionContext } from "@/server/auth/context";
import { listCompanies } from "@/server/repositories/crm";

export const metadata: Metadata = { title: "Companies" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function Companies({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : undefined;
  const ctx = await getSessionContext();
  const now = new Date();
  const rows = await listCompanies(ctx, q, undefined);

  const researched = rows.filter((r) => r.last_researched_at).length;
  const qualified = rows.filter((r) => r.is_qualified).length;
  const withoutDomain = rows.filter((r) => !r.domain).length;

  return (
    <>
      <PageHeader title="Companies" description="Every company record in the workspace, with its contacts and opportunities." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={q ? "Matching companies" : "Companies"} value={String(rows.length)} />
        <StatTile label="Researched" value={String(researched)} hint={`${rows.length - researched} not yet researched`} />
        <StatTile label="Qualified" value={String(qualified)} />
        <StatTile label="Without a website" value={String(withoutDomain)} hint="Cannot be deduplicated by domain" />
      </div>

      <Form action="/companies" className="mt-4 flex max-w-md items-center gap-2" role="search">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" />
          <Input key={q ?? ""} name="q" defaultValue={q ?? ""} placeholder="Name, domain or city" aria-label="Search companies" className="h-8 pl-8 text-sm" />
        </div>
        <Button type="submit" variant="outline" size="sm">
          Search
        </Button>
        {q ? (
          <Button asChild variant="ghost" size="sm">
            <Link href="/companies">Clear</Link>
          </Button>
        ) : null}
      </Form>

      <section className="mt-4 overflow-hidden rounded-xl border bg-card">
        {rows.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={q ? "No companies match your search" : "No companies yet"}
            description={q ? "Try a shorter name or the company's domain." : "Companies appear here after discovery runs or when a lead is added."}
          />
        ) : (
          <DataTable
            caption="Companies"
            rows={rows}
            rowKey={(r) => r.id}
            minWidth="1100px"
            columns={[
              {
                header: "Company",
                cell: (r) => (
                  <>
                    <span className="flex items-center gap-1.5">
                      <Link href={`/leads/${r.id}`} className="truncate font-medium hover:underline">
                        {r.name}
                      </Link>
                      {r.is_demo ? <DemoTag /> : null}
                    </span>
                    <span className="text-xs text-muted-foreground">{r.domain ?? "No website"}</span>
                  </>
                ),
              },
              { header: "Industry", cell: (r) => r.industries?.name ?? "–" },
              { header: "Location", cell: (r) => [r.city, r.state].filter(Boolean).join(", ") || "–", className: "text-muted-foreground whitespace-nowrap" },
              { header: "Employees", cell: (r) => r.employee_range ?? "Unknown", className: "text-muted-foreground" },
              { header: "Stage", cell: (r) => <StageBadge stage={r.lead_stage} /> },
              { header: "Score", cell: (r) => <ScoreBadge score={r.opportunity_score} priority={r.priority} /> },
              { header: "Contacts", align: "right", cell: (r) => r.contactCount },
              { header: "Opportunities", align: "right", cell: (r) => r.opportunityCount },
              { header: "Open value", align: "right", cell: (r) => (r.openValue > 0 ? formatInrCompact(r.openValue) : "–") },
              {
                header: "Last researched",
                cell: (r) => (r.last_researched_at ? formatRelative(r.last_researched_at, now) : "Never"),
                className: "text-muted-foreground whitespace-nowrap",
              },
            ]}
          />
        )}
      </section>
    </>
  );
}

export default function CompaniesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Companies searchParams={searchParams} />
    </Suspense>
  );
}
