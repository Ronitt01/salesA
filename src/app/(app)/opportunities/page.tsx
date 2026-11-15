import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Target } from "lucide-react";
import { NewOpportunityDialog, StageSelect } from "@/components/opportunities/opportunity-controls";
import { OpportunityStageBadge } from "@/components/shared/badges";
import { StatTile } from "@/components/shared/data-table";
import { DemoTag, EmptyState, PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shell/shell-skeleton";
import { formatInrCompact, formatPercent } from "@/lib/format";
import { OPPORTUNITY_STAGE_LABEL } from "@/lib/labels";
import { canWrite, getSessionContext } from "@/server/auth/context";
import { getOpportunityFormOptions, listOpportunities } from "@/server/repositories/crm";

export const metadata: Metadata = { title: "Opportunities" };

const STAGES = Object.keys(OPPORTUNITY_STAGE_LABEL) as Array<keyof typeof OPPORTUNITY_STAGE_LABEL>;

async function Opportunities() {
  const ctx = await getSessionContext();
  const [rows, options] = await Promise.all([listOpportunities(ctx), getOpportunityFormOptions(ctx)]);
  const writer = canWrite(ctx.role);

  const open = rows.filter((o) => o.stage !== "won" && o.stage !== "lost");
  const won = rows.filter((o) => o.stage === "won");
  const lost = rows.filter((o) => o.stage === "lost");
  const sum = (items: typeof rows, pick: (o: (typeof rows)[number]) => number | null) =>
    items.reduce((total, o) => total + Number(pick(o) ?? 0), 0);
  const closed = won.length + lost.length;
  const revenue = sum(won, (o) => o.collected_revenue_inr);
  const profit = revenue - sum(won, (o) => o.delivery_cost_inr);

  return (
    <>
      <PageHeader
        title="Opportunities"
        description="Each opportunity is one service need at one company. A company can have several."
        actions={writer ? <NewOpportunityDialog companies={options.companies} services={options.services} /> : undefined}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Open pipeline (estimated)" value={formatInrCompact(sum(open, (o) => o.estimated_value_inr))} hint={`${open.length} open opportunities`} />
        <StatTile
          label="Win rate"
          value={closed === 0 ? "–" : formatPercent((won.length / closed) * 100, 0)}
          hint={closed === 0 ? "No closed opportunities yet" : `${won.length} won of ${closed} closed`}
        />
        <StatTile label="Collected revenue" value={formatInrCompact(revenue)} hint="Actuals from won deals" />
        <StatTile label="Gross profit" value={formatInrCompact(profit)} hint="Collected revenue minus delivery cost" />
      </div>

      {rows.length === 0 ? (
        <div className="mt-4 rounded-xl border bg-card">
          <EmptyState icon={Target} title="No opportunities yet" description="Opportunities are created when research finds an evidenced problem that maps to a service, or added by hand." />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto pb-2">
          <div className="grid min-w-[1400px] grid-cols-7 gap-3">
            {STAGES.map((stage) => {
              const items = rows.filter((o) => o.stage === stage);
              return (
                <section key={stage} aria-label={OPPORTUNITY_STAGE_LABEL[stage]} className="flex min-w-0 flex-col rounded-xl border bg-card">
                  <header className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
                    <OpportunityStageBadge stage={stage} />
                    <span className="tabular text-xs text-muted-foreground">
                      {items.length} · {formatInrCompact(sum(items, (o) => (stage === "won" ? o.collected_revenue_inr : o.estimated_value_inr)))}
                    </span>
                  </header>
                  <ul className="flex-1 space-y-2 p-2">
                    {items.length === 0 ? <li className="px-1 py-6 text-center text-xs text-subtle">Empty</li> : null}
                    {items.map((o) => (
                      <li key={o.id} className="rounded-lg border bg-elevated p-2.5">
                        <Link href={`/leads/${o.company_id}`} className="block text-sm leading-snug font-medium hover:underline">
                          {o.companies?.name ?? "Unknown company"}
                        </Link>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{o.service_catalogue?.name ?? o.title}</p>
                        <p className="mt-1.5 flex items-center justify-between gap-2 text-xs">
                          <span className="tabular font-medium">
                            {stage === "won" ? formatInrCompact(Number(o.collected_revenue_inr)) : formatInrCompact(o.estimated_value_inr)}
                            {stage === "won" ? <span className="font-normal text-muted-foreground"> collected</span> : null}
                          </span>
                          {o.is_demo ? <DemoTag /> : null}
                        </p>
                        {stage === "lost" && o.lost_reason ? <p className="mt-1 text-xs text-muted-foreground">{o.lost_reason}</p> : null}
                        {writer ? (
                          <div className="mt-2">
                            <StageSelect id={o.id} stage={o.stage} title={o.title} />
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

export default function OpportunitiesPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Opportunities />
    </Suspense>
  );
}
