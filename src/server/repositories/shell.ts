import "server-only";
import type { SessionContext } from "@/server/auth/context";
import type { ShellNotification, ShellStatusItem } from "@/components/shell/app-shell";
import { OUTREACH_MODE_LABEL, REPLY_INTENT_LABEL } from "@/lib/labels";

const POSITIVE_INTENTS = ["interested", "wants_meeting", "wants_pricing", "requests_information"] as const;

/** Notification centre items, derived from live records rather than stored separately. */
export async function getShellNotifications(ctx: SessionContext, now: Date): Promise<ShellNotification[]> {
  const { supabase, tenantId } = ctx;
  const since = new Date(now.getTime() - 48 * 3_600_000).toISOString();
  const nextDay = new Date(now.getTime() + 24 * 3_600_000).toISOString();

  const [approvals, replies, failures, meetings] = await Promise.all([
    supabase
      .from("messages")
      .select("id, created_at", { count: "exact" })
      .eq("tenant_id", tenantId)
      .eq("status", "pending_approval")
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("messages")
      .select("id, intent, received_at, companies(name)")
      .eq("tenant_id", tenantId)
      .eq("direction", "inbound")
      .in("intent", [...POSITIVE_INTENTS])
      .gte("received_at", since)
      .order("received_at", { ascending: false })
      .limit(4),
    supabase
      .from("workflow_executions")
      .select("id, workflow_key, error_message, finished_at")
      .eq("tenant_id", tenantId)
      .eq("status", "failed")
      .gte("finished_at", since)
      .order("finished_at", { ascending: false })
      .limit(3),
    supabase
      .from("meetings")
      .select("id, title, starts_at")
      .eq("tenant_id", tenantId)
      .in("status", ["booked", "rescheduled"])
      .gte("starts_at", now.toISOString())
      .lte("starts_at", nextDay)
      .order("starts_at", { ascending: true })
      .limit(3),
  ]);

  const items: ShellNotification[] = [];

  if (approvals.count && approvals.count > 0 && approvals.data?.[0]) {
    items.push({
      id: "approvals",
      tone: "warning",
      title: `${approvals.count} message${approvals.count === 1 ? "" : "s"} waiting for approval`,
      detail: "Nothing is sent until a person approves it.",
      href: "/conversations?view=approvals",
      at: approvals.data[0].created_at,
    });
  }
  for (const m of meetings.data ?? []) {
    items.push({
      id: `meeting-${m.id}`,
      tone: "info",
      title: "Meeting in the next 24 hours",
      detail: m.title,
      href: "/meetings",
      at: m.starts_at,
    });
  }
  for (const r of replies.data ?? []) {
    items.push({
      id: `reply-${r.id}`,
      tone: "success",
      title: `Positive reply: ${r.intent ? REPLY_INTENT_LABEL[r.intent] : "reply"}`,
      detail: r.companies?.name ?? "Unknown company",
      href: "/conversations",
      at: r.received_at ?? now.toISOString(),
    });
  }
  for (const f of failures.data ?? []) {
    items.push({
      id: `failure-${f.id}`,
      tone: "danger",
      title: `${f.workflow_key} failed`,
      detail: f.error_message ?? "No error message recorded",
      href: "/automations",
      at: f.finished_at ?? now.toISOString(),
    });
  }
  return items;
}

/** Honest summary of what is real and what is simulated in this deployment. */
export function getShellStatus(ctx: SessionContext): ShellStatusItem[] {
  const llm = process.env.LLM_PROVIDER ?? "mock";
  const n8n = process.env.N8N_BASE_URL;
  const live = process.env.OUTBOUND_LIVE_SENDING === "true";
  const ws = ctx.workspace;

  return [
    { label: "Database", value: "Connected", tone: "ok" },
    {
      label: "AI provider",
      value: llm === "mock" ? "Mock (deterministic)" : llm === "anthropic" ? "Anthropic Claude" : "OpenAI",
      tone: llm === "mock" ? "notice" : "ok",
    },
    { label: "Workflows", value: n8n ? "n8n connected" : "Local simulation", tone: n8n ? "ok" : "notice" },
    { label: "Outreach mode", value: OUTREACH_MODE_LABEL[ws.outreach_mode], tone: "ok" },
    {
      label: "Outbound sending",
      value: ws.outbound_kill_switch ? "Stopped by kill switch" : live ? "Live" : "Off (nothing is sent)",
      tone: ws.outbound_kill_switch ? "alert" : live ? "ok" : "notice",
    },
  ];
}
