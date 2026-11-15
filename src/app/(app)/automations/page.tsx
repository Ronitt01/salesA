import type { Metadata } from "next";
import { Suspense } from "react";
import { FlaskConical, Workflow } from "lucide-react";
import { ExecutionStatusBadge, Pill } from "@/components/shared/badges";
import { DataTable, StatTile } from "@/components/shared/data-table";
import { DemoTag, EmptyState, PageHeader, Panel } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shell/shell-skeleton";
import { formatDateTime, formatPercent, formatRelative } from "@/lib/format";
import { getSessionContext } from "@/server/auth/context";
import { getAutomations } from "@/server/repositories/insight";

export const metadata: Metadata = { title: "Automations" };

async function Automations() {
  const ctx = await getSessionContext();
  const { jobs, executions } = await getAutomations(ctx);
  const now = new Date();
  const tz = ctx.workspace.timezone;
  const n8nConnected = Boolean(process.env.N8N_BASE_URL);
  const total = (pick: (j: (typeof jobs)[number]) => number) => jobs.reduce((sum, j) => sum + pick(j), 0);
  const finished = total((j) => j.succeeded) + total((j) => j.failed);

  return (
    <>
      <PageHeader title="Automations" description="The six acquisition workflows. HUNTER holds the logic and controls; n8n schedules and orchestrates." />

      {!n8nConnected ? (
        <p className="mb-4 flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm leading-relaxed">
          <FlaskConical className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            <span className="font-medium">Local simulation mode.</span>{" "}
            <span className="text-muted-foreground">
              No n8n instance is connected (N8N_BASE_URL is not set), so workflows are not being triggered on a
              schedule. The executions below marked as demo are synthetic history.
            </span>
          </span>
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Workflows" value={String(jobs.length)} hint={`${jobs.filter((j) => j.status === "active").length} active`} />
        <StatTile label="Success rate (30 days)" value={finished === 0 ? "–" : formatPercent((total((j) => j.succeeded) / finished) * 100)} hint={`${finished} finished runs`} />
        <StatTile label="Failed (30 days)" value={String(total((j) => j.failed))} />
        <StatTile label="Running or queued" value={String(total((j) => j.running) + total((j) => j.queued))} />
      </div>

      <div className="mt-4 space-y-4">
        <Panel title="Workflows" bodyClassName="px-0 pb-0">
          {jobs.length === 0 ? (
            <EmptyState icon={Workflow} title="No workflows configured" description="Workflows are created when a workspace is set up." className="py-8" />
          ) : (
            <DataTable
              caption="Workflows"
              rows={jobs}
              rowKey={(j) => j.id}
              minWidth="1000px"
              columns={[
                {
                  header: "Workflow",
                  cell: (j) => (
                    <>
                      <span className="font-medium">
                        <span className="font-mono text-xs text-muted-foreground">{j.workflow_key}</span> {j.name}
                      </span>
                      <span className="block max-w-xl text-xs text-muted-foreground">{j.description}</span>
                    </>
                  ),
                },
                { header: "Status", cell: (j) => <Pill tone={j.status === "active" ? "success" : "warning"}>{j.status === "active" ? "Active" : "Paused"}</Pill> },
                { header: "Mode", cell: (j) => <Pill tone={j.mode === "n8n" ? "info" : "warning"}>{j.mode === "n8n" ? "n8n" : "Local simulation"}</Pill> },
                { header: "Schedule (cron)", cell: (j) => <span className="font-mono text-xs">{j.schedule_cron ?? "On demand"}</span>, className: "whitespace-nowrap" },
                {
                  header: "Last execution",
                  cell: (j) =>
                    j.last_run_at ? (
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        {j.last_status ? <ExecutionStatusBadge status={j.last_status} /> : null}
                        <span className="text-xs text-muted-foreground">{formatRelative(j.last_run_at, now)}</span>
                      </span>
                    ) : (
                      <span className="text-subtle">Never run</span>
                    ),
                },
                {
                  header: "Next run",
                  cell: (j) => (j.next_run_at ? formatDateTime(j.next_run_at, tz) : n8nConnected ? "Set by n8n" : "Not scheduled"),
                  className: "text-muted-foreground whitespace-nowrap",
                },
                { header: "Success (30d)", align: "right", cell: (j) => (j.successRate === null ? "–" : formatPercent(j.successRate, 0)) },
              ]}
            />
          )}
        </Panel>

        <Panel title="Execution history" description="Most recent 40 executions, with error details" bodyClassName="px-0 pb-0">
          {executions.length === 0 ? (
            <EmptyState icon={Workflow} title="No executions yet" description="Each run is recorded here with its status, duration and any error." className="py-8" />
          ) : (
            <DataTable
              caption="Execution history"
              rows={executions}
              rowKey={(e) => e.id}
              minWidth="1000px"
              columns={[
                {
                  header: "Workflow",
                  cell: (e) => (
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs">{e.workflow_key}</span>
                      {e.is_demo ? <DemoTag /> : null}
                    </span>
                  ),
                },
                { header: "Status", cell: (e) => <ExecutionStatusBadge status={e.status} /> },
                { header: "Trigger", cell: (e) => e.trigger, className: "text-muted-foreground capitalize" },
                { header: "Queued", cell: (e) => formatDateTime(e.queued_at, tz), className: "text-muted-foreground whitespace-nowrap" },
                { header: "Duration", align: "right", cell: (e) => (e.duration_ms === null ? "–" : `${(e.duration_ms / 1000).toFixed(1)}s`) },
                { header: "Items", align: "right", cell: (e) => e.items_processed },
                { header: "Attempt", align: "right", cell: (e) => e.attempt },
                {
                  header: "Error",
                  cell: (e) => (e.error_message ? <span className="text-danger">{e.error_message}</span> : <span className="text-subtle">–</span>),
                  className: "max-w-md text-xs",
                },
              ]}
            />
          )}
        </Panel>
      </div>
    </>
  );
}

export default function AutomationsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Automations />
    </Suspense>
  );
}
