import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarDays } from "lucide-react";
import { MeetingStatusBadge } from "@/components/shared/badges";
import { DataTable, StatTile } from "@/components/shared/data-table";
import { DemoTag, EmptyState, PageHeader, Panel } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shell/shell-skeleton";
import { formatDate, formatDateTime, formatPercent, formatRelative } from "@/lib/format";
import { getSessionContext } from "@/server/auth/context";
import { listMeetings } from "@/server/repositories/crm";

export const metadata: Metadata = { title: "Meetings" };

async function Meetings() {
  const ctx = await getSessionContext();
  const rows = await listMeetings(ctx);
  const now = new Date();
  const nowIso = now.toISOString();
  const tz = ctx.workspace.timezone;

  const upcoming = rows.filter((m) => m.starts_at >= nowIso && (m.status === "booked" || m.status === "rescheduled")).reverse();
  const proposed = rows.filter((m) => m.status === "proposed");
  const past = rows.filter((m) => !upcoming.includes(m) && m.status !== "proposed");
  const booked = rows.filter((m) => m.booked_at).length;
  const attended = rows.filter((m) => m.attended_at).length;
  const noShow = rows.filter((m) => m.status === "no_show").length;
  const held = attended + noShow;

  type Row = (typeof rows)[number];
  const columns = [
    {
      header: "Meeting",
      cell: (m: Row) => (
        <>
          <span className="flex items-center gap-1.5">
            <Link href={`/leads/${m.company_id}`} className="truncate font-medium hover:underline">
              {m.title}
            </Link>
            {m.is_demo ? <DemoTag /> : null}
          </span>
          <span className="text-xs text-muted-foreground">with {m.contacts?.full_name ?? "contact"}</span>
        </>
      ),
    },
    {
      header: `When (${tz})`,
      cell: (m: Row) => (
        <>
          {formatDateTime(m.starts_at, tz)}
          <span className="block text-xs text-muted-foreground">{formatRelative(m.starts_at, now)}</span>
        </>
      ),
      className: "whitespace-nowrap",
    },
    {
      header: "Prospect time",
      cell: (m: Row) => (m.prospect_timezone === tz ? "Same timezone" : `${formatDateTime(m.starts_at, m.prospect_timezone)} (${m.prospect_timezone})`),
      className: "text-muted-foreground whitespace-nowrap",
    },
    { header: "Booked", cell: (m: Row) => (m.booked_at ? formatDate(m.booked_at, tz) : "Not booked"), className: "text-muted-foreground whitespace-nowrap" },
    { header: "Attended", cell: (m: Row) => (m.attended_at ? formatDate(m.attended_at, tz) : "–"), className: "text-muted-foreground whitespace-nowrap" },
    { header: "Status", cell: (m: Row) => <MeetingStatusBadge status={m.status} /> },
  ];

  return (
    <>
      <PageHeader title="Meetings" description="A meeting counts as booked only after the prospect picks a slot. Attendance is recorded separately." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Upcoming" value={String(upcoming.length)} />
        <StatTile label="Booked (all time)" value={String(booked)} />
        <StatTile label="Attended (all time)" value={String(attended)} />
        <StatTile label="Attendance rate" value={held === 0 ? "–" : formatPercent((attended / held) * 100, 0)} hint={held === 0 ? "No meetings held yet" : `${noShow} no-show${noShow === 1 ? "" : "s"}`} />
      </div>

      <div className="mt-4 space-y-4">
        <Panel title="Upcoming meetings" bodyClassName="px-0 pb-0">
          {upcoming.length === 0 ? (
            <EmptyState icon={CalendarDays} title="Nothing scheduled" description="Booked meetings appear here once a prospect selects a slot." className="py-8" />
          ) : (
            <DataTable caption="Upcoming meetings" rows={upcoming} rowKey={(m) => m.id} columns={columns} />
          )}
        </Panel>

        {proposed.length > 0 ? (
          <Panel title="Slots proposed, awaiting the prospect" description="These are not bookings and are not counted as meetings." bodyClassName="px-0 pb-0">
            <DataTable caption="Proposed meetings" rows={proposed} rowKey={(m) => m.id} columns={columns} />
          </Panel>
        ) : null}

        <Panel title="Past meetings" bodyClassName="px-0 pb-0">
          {past.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No past meetings" description="Completed, missed and cancelled meetings are listed here." className="py-8" />
          ) : (
            <DataTable caption="Past meetings" rows={past} rowKey={(m) => m.id} columns={columns} />
          )}
        </Panel>
      </div>
    </>
  );
}

export default function MeetingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Meetings />
    </Suspense>
  );
}
