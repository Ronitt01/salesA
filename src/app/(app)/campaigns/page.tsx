import type { Metadata } from "next";
import { Suspense } from "react";
import { z } from "zod";
import { Megaphone } from "lucide-react";
import { Pill, type Tone } from "@/components/shared/badges";
import { StatTile } from "@/components/shared/data-table";
import { DemoTag, EmptyState, PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shell/shell-skeleton";
import { formatDate, formatPercent } from "@/lib/format";
import { CAMPAIGN_STATUS_LABEL, CHANNEL_LABEL } from "@/lib/labels";
import { getSessionContext } from "@/server/auth/context";
import { listCampaigns } from "@/server/repositories/crm";
import { MIN_SAMPLE_FOR_RATE } from "@/server/services/analytics/insights";

export const metadata: Metadata = { title: "Campaigns" };

const STATUS_TONE: Record<string, Tone> = { draft: "neutral", active: "success", paused: "warning", completed: "info", archived: "neutral" };
const stepSchema = z.array(z.object({ day: z.number(), kind: z.string(), guidance: z.string().optional() }));

async function Campaigns() {
  const ctx = await getSessionContext();
  const rows = await listCampaigns(ctx);
  const tz = ctx.workspace.timezone;
  const total = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((sum, r) => sum + pick(r), 0);

  return (
    <>
      <PageHeader title="Campaigns" description="Outreach sequences. Every message still passes the compliance gate and the workspace outreach mode." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Campaigns" value={String(rows.length)} hint={`${rows.filter((r) => r.status === "active").length} active`} />
        <StatTile label="Contacts enrolled" value={String(total((r) => r.enrolled))} hint={`${total((r) => r.active)} still in sequence`} />
        <StatTile label="Drafts awaiting approval" value={String(total((r) => r.pendingApproval))} />
        <StatTile label="Opt-outs" value={String(total((r) => r.optedOut))} hint="Suppressed immediately and permanently" />
      </div>

      {rows.length === 0 ? (
        <div className="mt-4 rounded-xl border bg-card">
          <EmptyState icon={Megaphone} title="No campaigns yet" description="Campaigns group qualified prospects into a follow-up sequence." />
        </div>
      ) : (
        <ul className="mt-4 grid gap-4 xl:grid-cols-2">
          {rows.map((c) => {
            const steps = stepSchema.safeParse(c.sequence);
            const smallSample = c.contacted < MIN_SAMPLE_FOR_RATE;
            return (
              <li key={c.id} className="rounded-xl border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                      {c.name}
                      {c.is_demo ? <DemoTag /> : null}
                    </h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {CHANNEL_LABEL[c.channel]} · {c.industries?.name ?? "All industries"} · {c.service_catalogue?.name ?? "No service set"}
                      {c.started_at ? ` · started ${formatDate(c.started_at, tz)}` : ""}
                    </p>
                  </div>
                  <Pill tone={STATUS_TONE[c.status]}>{CAMPAIGN_STATUS_LABEL[c.status]}</Pill>
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-x-4 gap-y-3 sm:grid-cols-6">
                  {[
                    ["Enrolled", String(c.enrolled)],
                    ["Contacted", String(c.contacted)],
                    ["Replied", String(c.replied)],
                    ["Positive", String(c.positive)],
                    ["Reply rate", c.replyRate === null ? "–" : formatPercent(c.replyRate, 0)],
                    ["Positive rate", c.positiveRate === null ? "–" : formatPercent(c.positiveRate, 0)],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="tabular mt-0.5 text-sm font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
                {c.contacted > 0 && smallSample ? (
                  <p className="mt-2 text-xs text-subtle">
                    Rates are based on {c.contacted} contacted compan{c.contacted === 1 ? "y" : "ies"}; fewer than {MIN_SAMPLE_FOR_RATE} is too few to compare.
                  </p>
                ) : null}

                {steps.success && steps.data.length > 0 ? (
                  <ol className="mt-4 flex flex-wrap gap-2 border-t pt-3">
                    {steps.data.map((step) => (
                      <li key={step.day} className="rounded-lg border bg-muted/50 px-2.5 py-1.5 text-xs" title={step.guidance}>
                        <span className="font-medium">Day {step.day}</span>
                        <span className="text-muted-foreground"> · {step.kind}</span>
                      </li>
                    ))}
                    <li className="self-center text-xs text-subtle">Stops on reply, opt-out, bounce, complaint or manual stop.</li>
                  </ol>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export default function CampaignsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Campaigns />
    </Suspense>
  );
}
