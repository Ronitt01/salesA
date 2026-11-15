import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import { Search, Users } from "lucide-react";
import { Pill, VerificationBadge } from "@/components/shared/badges";
import { DataTable, StatTile } from "@/components/shared/data-table";
import { DemoTag, EmptyState, PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shell/shell-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { CONTACT_ROLE_LABEL, SOURCE_KIND_LABEL } from "@/lib/labels";
import { getSessionContext } from "@/server/auth/context";
import { listContacts } from "@/server/repositories/crm";

export const metadata: Metadata = { title: "Contacts" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function Contacts({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : undefined;
  const ctx = await getSessionContext();
  const rows = await listContacts(ctx, q);
  const tz = ctx.workspace.timezone;

  const valid = rows.filter((r) => r.verification_status === "valid").length;
  const unverified = rows.filter((r) => !r.last_verified_at).length;
  const blocked = rows.filter((r) => r.do_not_contact).length;

  return (
    <>
      <PageHeader title="Contacts" description="People at prospect companies, with where each record came from and how reliable it is." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={q ? "Matching contacts" : "Contacts"} value={String(rows.length)} />
        <StatTile label="Verified as valid" value={String(valid)} />
        <StatTile label="Never verified" value={String(unverified)} hint="Cannot support a qualified lead" />
        <StatTile label="Do not contact" value={String(blocked)} hint="Blocked from every campaign" />
      </div>

      <Form action="/contacts" className="mt-4 flex max-w-md items-center gap-2" role="search">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" />
          <Input key={q ?? ""} name="q" defaultValue={q ?? ""} placeholder="Name, email or job title" aria-label="Search contacts" className="h-8 pl-8 text-sm" />
        </div>
        <Button type="submit" variant="outline" size="sm">
          Search
        </Button>
        {q ? (
          <Button asChild variant="ghost" size="sm">
            <Link href="/contacts">Clear</Link>
          </Button>
        ) : null}
      </Form>

      <section className="mt-4 overflow-hidden rounded-xl border bg-card">
        {rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={q ? "No contacts match your search" : "No contacts yet"}
            description={q ? "Try part of the name or the email domain." : "Contacts are added during research and enrichment, or along with a new lead."}
          />
        ) : (
          <DataTable
            caption="Contacts"
            rows={rows}
            rowKey={(r) => r.id}
            minWidth="1150px"
            columns={[
              {
                header: "Contact",
                cell: (r) => (
                  <>
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-medium">{r.full_name}</span>
                      {r.is_primary ? <Pill tone="info">Primary</Pill> : null}
                      {r.is_demo ? <DemoTag /> : null}
                    </span>
                    <span className="text-xs text-muted-foreground">{r.job_title ?? "Title unknown"}</span>
                  </>
                ),
              },
              {
                header: "Company",
                cell: (r) => (
                  <Link href={`/leads/${r.company_id}`} className="hover:underline">
                    {r.companies?.name ?? "Unknown"}
                  </Link>
                ),
              },
              { header: "Role", cell: (r) => CONTACT_ROLE_LABEL[r.role_category], className: "text-muted-foreground whitespace-nowrap" },
              { header: "Email", cell: (r) => r.email ?? "–", className: "text-muted-foreground" },
              { header: "Verification", cell: (r) => <VerificationBadge status={r.verification_status} /> },
              { header: "Last verified", cell: (r) => (r.last_verified_at ? formatDate(r.last_verified_at, tz) : "Never"), className: "text-muted-foreground whitespace-nowrap" },
              { header: "Reliability", align: "right", cell: (r) => (r.reliability_score === null ? "–" : r.reliability_score) },
              {
                header: "Provenance",
                cell: (r) => (r.sources ? SOURCE_KIND_LABEL[r.sources.kind] : "Not recorded"),
                className: "text-muted-foreground whitespace-nowrap",
              },
              { header: "Status", cell: (r) => (r.do_not_contact ? <Pill tone="danger">Do not contact</Pill> : <Pill>Contactable</Pill>) },
            ]}
          />
        )}
      </section>
    </>
  );
}

export default function ContactsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Contacts searchParams={searchParams} />
    </Suspense>
  );
}
