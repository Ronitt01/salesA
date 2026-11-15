import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { Bot, MessagesSquare, UserRound } from "lucide-react";
import { IntentBadge, MessageStatusBadge, Pill } from "@/components/shared/badges";
import { DemoTag, EmptyState, PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shell/shell-skeleton";
import { cn } from "@/lib/utils";
import { formatDateTime, formatRelative } from "@/lib/format";
import { CHANNEL_LABEL, OUTREACH_MODE_LABEL } from "@/lib/labels";
import { getSessionContext } from "@/server/auth/context";
import { getConversation, listConversations } from "@/server/repositories/crm";

export const metadata: Metadata = { title: "Conversation Centre" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const VIEWS = [
  { key: "all", label: "All" },
  { key: "approvals", label: "Awaiting approval" },
  { key: "review", label: "Needs review" },
] as const;

async function Conversations({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const view = VIEWS.find((v) => v.key === params.view)?.key ?? "all";
  const ctx = await getSessionContext();
  const now = new Date();
  const tz = ctx.workspace.timezone;

  const list = await listConversations(ctx, view);
  const requested = typeof params.c === "string" && z.string().uuid().safeParse(params.c).success ? params.c : null;
  const selectedId = requested ?? list[0]?.id ?? null;
  const thread = selectedId ? await getConversation(ctx, selectedId) : null;
  const href = (changes: Record<string, string>) => `/conversations?${new URLSearchParams({ view, ...changes }).toString()}`;

  return (
    <>
      <PageHeader
        title="Conversation Centre"
        description={`Outreach and replies in one place. Outreach mode: ${OUTREACH_MODE_LABEL[ctx.workspace.outreach_mode]}.`}
        actions={
          <div className="inline-flex rounded-lg border bg-card p-0.5">
            {VIEWS.map((v) => (
              <Link
                key={v.key}
                href={`/conversations?view=${v.key}`}
                aria-current={view === v.key ? "true" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs whitespace-nowrap transition-colors",
                  view === v.key ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v.label}
              </Link>
            ))}
          </div>
        }
      />

      {list.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState
            icon={MessagesSquare}
            title={view === "all" ? "No conversations yet" : "Nothing in this view"}
            description={
              view === "approvals"
                ? "Drafts waiting for a person to approve them appear here."
                : view === "review"
                  ? "Replies the classifier was unsure about, objections and complaints appear here."
                  : "Conversations start when outreach is drafted or a reply arrives."
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <nav aria-label="Conversations" className="max-h-[70vh] overflow-y-auto rounded-xl border bg-card lg:max-h-[calc(100dvh-13rem)]">
            <ul className="divide-y divide-border/60">
              {list.map((c) => (
                <li key={c.id}>
                  <Link
                    href={href({ c: c.id })}
                    aria-current={c.id === selectedId ? "true" : undefined}
                    className={cn("block px-4 py-3 transition-colors hover:bg-muted/60", c.id === selectedId && "bg-secondary/70")}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{c.companies?.name ?? "Unknown company"}</span>
                      <span className="shrink-0 text-xs text-subtle">{c.last_message_at ? formatRelative(c.last_message_at, now) : ""}</span>
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.contacts?.full_name ?? "Contact"} · {c.subject ?? "(no subject)"}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {c.last_intent ? <IntentBadge intent={c.last_intent} /> : null}
                      {c.pendingApproval > 0 ? <Pill tone="warning">Awaiting approval</Pill> : null}
                      {c.status === "needs_review" ? <Pill tone="warning">Needs review</Pill> : null}
                      {c.human_takeover ? <Pill tone="info">Human handling</Pill> : null}
                      {c.contacts?.do_not_contact ? <Pill tone="danger">Opted out</Pill> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <section aria-label="Thread" className="min-w-0 rounded-xl border bg-card">
            {!thread ? (
              <EmptyState icon={MessagesSquare} title="Select a conversation" description="Choose a conversation to read the full thread." />
            ) : (
              <>
                <header className="border-b px-5 py-4">
                  <h2 className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                    <Link href={`/leads/${thread.company_id}`} className="hover:underline">
                      {thread.companies?.name ?? "Unknown company"}
                    </Link>
                    {thread.is_demo ? <DemoTag /> : null}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {thread.contacts?.full_name ?? "Contact"} · {CHANNEL_LABEL[thread.channel]}
                    {thread.campaigns?.name ? ` · ${thread.campaigns.name}` : " · no campaign"}
                  </p>
                  {thread.contacts?.do_not_contact ? (
                    <p className="mt-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                      This contact opted out. No further message can be sent to them on any channel.
                    </p>
                  ) : null}
                </header>
                <ol className="space-y-4 p-5">
                  {thread.messages.map((m) => {
                    const outbound = m.direction === "outbound";
                    const at = m.sent_at ?? m.received_at ?? m.created_at;
                    return (
                      <li key={m.id} className={cn("flex gap-3", outbound && "flex-row-reverse")}>
                        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", outbound ? "bg-ai/12 text-ai" : "bg-secondary")}>
                          {outbound ? <Bot className="size-4" /> : <UserRound className="size-4" />}
                        </span>
                        <div className={cn("max-w-[85%] min-w-0 rounded-xl border p-3", outbound ? "bg-elevated" : "bg-muted/60")}>
                          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">
                              {outbound ? (m.origin === "human" ? "Sent by the team" : "Drafted by AI") : (thread.contacts?.full_name ?? "Prospect")}
                            </span>
                            <span>{formatDateTime(at, tz)}</span>
                            <MessageStatusBadge status={m.status} />
                            {m.intent ? <IntentBadge intent={m.intent} /> : null}
                          </p>
                          <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">{m.body}</p>
                          {m.intent && m.intent_confidence !== null ? (
                            <p className="mt-2 text-xs text-subtle">
                              Classified with {Math.round(Number(m.intent_confidence) * 100)}% confidence.
                            </p>
                          ) : null}
                          {m.status === "pending_approval" ? (
                            <p className="mt-2 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
                              Waiting for a person to approve. It has not been sent.
                            </p>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}

export default function ConversationsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Conversations searchParams={searchParams} />
    </Suspense>
  );
}
