"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { calendarDate, startOfDateInTz } from "@/lib/date-range";
import { actionError, writeAudit, type ActionResult } from "@/server/audit";
import { requireWriter, type SessionContext } from "@/server/auth/context";
import type { Json } from "@/server/db/database.types";
import { getEmailProvider } from "@/server/providers/email";
import { evaluateOutbound, type GateDecision } from "@/server/services/compliance/gate";

type JsonObject = { [key: string]: Json | undefined };

function historyWith(existing: Json, entry: JsonObject): Json[] {
  return [...(Array.isArray(existing) ? existing : []), entry];
}

async function loadPendingMessage(ctx: SessionContext, messageId: string) {
  const { data, error } = await ctx.supabase
    .from("messages")
    .select(
      "id, direction, status, channel, subject, body, origin, sequence_step, supporting_fact_ids, processing_history, idempotency_key, conversation_id, company_id, contact_id, campaign_contact_id, contacts(email, email_normalised, do_not_contact, verification_status), companies(lead_stage, first_contacted_at), campaign_contacts(id, campaign_id, campaigns(status, daily_limit, mode_override))",
    )
    .eq("tenant_id", ctx.tenantId)
    .eq("id", messageId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Loads every fact the gate needs and evaluates it. The gate itself does no I/O. */
async function runGate(ctx: SessionContext, message: NonNullable<Awaited<ReturnType<typeof loadPendingMessage>>>, now: Date): Promise<GateDecision> {
  const { supabase, tenantId, workspace } = ctx;
  const contact = message.contacts;
  const campaign = message.campaign_contacts?.campaigns ?? null;
  const campaignId = message.campaign_contacts?.campaign_id ?? null;
  const email = contact?.email_normalised ?? null;
  const domain = email ? (email.split("@")[1] ?? "") : "";
  const dayStart = startOfDateInTz(calendarDate(now, workspace.timezone), workspace.timezone).toISOString();

  const sentSince = () =>
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("direction", "outbound").eq("status", "sent").gte("sent_at", dayStart);

  const [policy, suppression, consent, inbound, sentWorkspace, sentChannel, sentCampaign, facts] = await Promise.all([
    supabase.from("channel_policies").select("*").eq("tenant_id", tenantId).eq("country", workspace.country).eq("channel", message.channel).maybeSingle(),
    email
      ? supabase
          .from("suppressions")
          .select("id, channel")
          .eq("tenant_id", tenantId)
          .or(`and(address_type.eq.email,address.eq.${email}),and(address_type.eq.domain,address.eq.${domain})`)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("consent_records")
      .select("status, basis, recorded_at")
      .eq("tenant_id", tenantId)
      .eq("contact_id", message.contact_id)
      .eq("channel", message.channel)
      .order("recorded_at", { ascending: false })
      .limit(1),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("conversation_id", message.conversation_id)
      .eq("direction", "inbound"),
    sentSince(),
    sentSince().eq("channel", message.channel),
    campaignId
      ? supabase
          .from("messages")
          .select("id, campaign_contacts!inner(campaign_id)", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("direction", "outbound")
          .eq("status", "sent")
          .gte("sent_at", dayStart)
          .eq("campaign_contacts.campaign_id", campaignId)
      : Promise.resolve({ count: 0, error: null }),
    message.supporting_fact_ids.length > 0
      ? supabase
          .from("research_records")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("company_id", message.company_id)
          .eq("kind", "observed_fact")
          .in("id", message.supporting_fact_ids)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [policy, suppression, consent, inbound, sentWorkspace, sentChannel, sentCampaign, facts]) {
    if (r.error) throw r.error;
  }

  const suppressed = (suppression.data ?? []).some((s) => s.channel === null || s.channel === message.channel);
  const latestConsent = consent.data?.[0] ?? null;
  const consentGranted = latestConsent?.status === "granted";
  const inboundInitiated =
    (inbound.count ?? 0) > 0 || (consentGranted && (latestConsent?.basis === "inbound_enquiry" || latestConsent?.basis === "callback_request"));

  const found = new Set((facts.data ?? []).map((f) => f.id));
  const unsupportedClaims = message.supporting_fact_ids.filter((id) => !found.has(id)).map((id) => `cited fact ${id} is not an observed fact on record for this company`);
  // An AI-drafted introduction must rest on at least one stored fact.
  if (message.origin !== "human" && message.sequence_step === 0 && message.supporting_fact_ids.length === 0) {
    unsupportedClaims.push("the introduction cites no observed fact");
  }

  return evaluateOutbound({
    liveSendingEnabled: process.env.OUTBOUND_LIVE_SENDING === "true",
    workspace: {
      killSwitch: workspace.outbound_kill_switch,
      outreachMode: workspace.outreach_mode,
      dailySendLimit: workspace.daily_send_limit,
      country: workspace.country,
    },
    channel: message.channel,
    policy: policy.data
      ? {
          outboundAllowed: policy.data.outbound_allowed,
          automationAllowed: policy.data.automation_allowed,
          requiresConsent: policy.data.requires_consent,
          requiresInboundInitiation: policy.data.requires_inbound_initiation,
          dailyLimit: policy.data.daily_limit,
        }
      : null,
    campaign: campaign ? { status: campaign.status, dailyLimit: campaign.daily_limit, modeOverride: campaign.mode_override } : null,
    contact: {
      hasAddress: Boolean(contact?.email),
      doNotContact: Boolean(contact?.do_not_contact),
      addressInvalid: contact?.verification_status === "invalid",
    },
    suppressed,
    consent: { granted: consentGranted, inboundInitiated },
    actor: { kind: "human", approvedByHuman: true },
    sentToday: { workspace: sentWorkspace.count ?? 0, campaign: sentCampaign.count ?? 0, channel: sentChannel.count ?? 0 },
    message: {
      alreadyProcessed: message.status !== "pending_approval",
      unsupportedClaims,
      hasOptOut: /unsubscribe|opt[ -]?out/i.test(message.body),
    },
  });
}

export interface ApprovalOutcome {
  /** sent: transmitted. held: approved but live sending is off. blocked: the gate refused. */
  outcome: "sent" | "held" | "blocked";
  reasons: string[];
}

/**
 * A person approves an outbound draft. The compliance gate decides what happens next;
 * approval alone never sends anything.
 */
export async function approveMessage(messageId: string): Promise<ActionResult<ApprovalOutcome>> {
  try {
    const ctx = await requireWriter();
    const id = z.string().uuid().parse(messageId);
    const message = await loadPendingMessage(ctx, id);
    if (!message) return { ok: false, error: "This message no longer exists." };
    if (message.direction !== "outbound") return { ok: false, error: "Only outbound drafts can be approved." };
    if (message.status !== "pending_approval") return { ok: false, error: "This message is no longer waiting for approval." };

    const now = new Date();
    const nowIso = now.toISOString();
    const decision = await runGate(ctx, message, now);
    const gateResult = JSON.parse(JSON.stringify({ ...decision, evaluatedAt: nowIso, evaluatedBy: ctx.user.id })) as JsonObject;
    const table = ctx.supabase.from("messages");

    if (!decision.allowed) {
      const { error } = await table
        .update({
          gate_result: gateResult,
          processing_history: historyWith(message.processing_history, { step: "approval_blocked", at: nowIso, by: ctx.user.id, reasons: decision.blockedBy }),
        })
        .eq("tenant_id", ctx.tenantId)
        .eq("id", id);
      if (error) throw error;
      await writeAudit(ctx, "message.approval_blocked", "message", id, { reasons: decision.blockedBy });
      refresh();
      return { ok: true, data: { outcome: "blocked", reasons: decision.blockedBy }, message: "The compliance gate blocked this message." };
    }

    const provider = getEmailProvider();
    const canSendNow = decision.delivery === "live" && message.channel === "email" && provider.canTransmit;

    if (!canSendNow) {
      const reason =
        decision.delivery === "held"
          ? "Live sending is switched off, so the message was approved but not sent."
          : "Live sending is on, but no delivery provider that can transmit is configured. The message was approved but not sent.";
      // The status filter makes approval idempotent: a second click changes nothing.
      const { data, error } = await table
        .update({
          status: "approved",
          approved_by: ctx.user.id,
          approved_at: nowIso,
          gate_result: gateResult,
          processing_history: historyWith(message.processing_history, { step: "approved_not_sent", at: nowIso, by: ctx.user.id, reason }),
        })
        .eq("tenant_id", ctx.tenantId)
        .eq("id", id)
        .eq("status", "pending_approval")
        .select("id");
      if (error) throw error;
      if ((data ?? []).length === 0) return { ok: false, error: "This message was already handled by someone else." };
      await writeAudit(ctx, "message.approved", "message", id, { delivery: "not_sent", reason });
      refresh();
      return { ok: true, data: { outcome: "held", reasons: [reason] }, message: "Approved. Not sent." };
    }

    // Claim the message before transmitting, so two approvers cannot both send it.
    const claimed = await table
      .update({ status: "approved", approved_by: ctx.user.id, approved_at: nowIso, gate_result: gateResult })
      .eq("tenant_id", ctx.tenantId)
      .eq("id", id)
      .eq("status", "pending_approval")
      .select("id");
    if (claimed.error) throw claimed.error;
    if ((claimed.data ?? []).length === 0) return { ok: false, error: "This message was already handled by someone else." };

    const result = await provider.send({
      to: message.contacts?.email ?? "",
      subject: message.subject ?? "",
      body: message.body,
      idempotencyKey: message.idempotency_key,
    });
    if (!result.transmitted) {
      await writeAudit(ctx, "message.send_failed", "message", id, { provider: result.provider });
      refresh();
      return { ok: true, data: { outcome: "held", reasons: ["The delivery provider did not transmit the message."] }, message: "Approved. Not sent." };
    }

    const sent = await table
      .update({
        status: "sent",
        sent_at: nowIso,
        provider: result.provider,
        provider_message_id: result.providerMessageId,
        processing_history: historyWith(message.processing_history, { step: "sent", at: nowIso, by: ctx.user.id, provider: result.provider }),
      })
      .eq("tenant_id", ctx.tenantId)
      .eq("id", id);
    if (sent.error) throw sent.error;

    await ctx.supabase
      .from("conversations")
      .update({ status: "awaiting_reply", last_message_at: nowIso })
      .eq("tenant_id", ctx.tenantId)
      .eq("id", message.conversation_id);
    if (message.campaign_contact_id) {
      await ctx.supabase
        .from("campaign_contacts")
        .update({ status: "active", current_step: message.sequence_step ?? 0 })
        .eq("tenant_id", ctx.tenantId)
        .eq("id", message.campaign_contact_id)
        .eq("status", "pending");
    }
    if (!message.companies?.first_contacted_at) {
      await ctx.supabase
        .from("companies")
        .update({ first_contacted_at: nowIso, ...(message.companies?.lead_stage === "qualified" ? { lead_stage: "contacted" as const } : {}) })
        .eq("tenant_id", ctx.tenantId)
        .eq("id", message.company_id);
    }
    await ctx.supabase.from("activities").insert({
      tenant_id: ctx.tenantId,
      company_id: message.company_id,
      contact_id: message.contact_id,
      actor_type: "user",
      actor_user_id: ctx.user.id,
      type: "email_sent",
      title: "Message approved and sent",
    });
    await writeAudit(ctx, "message.sent", "message", id, { provider: result.provider });
    refresh();
    return { ok: true, data: { outcome: "sent", reasons: [] }, message: "Approved and sent." };
  } catch (error) {
    return actionError(error, "The message could not be approved.");
  }
}

export async function rejectMessage(messageId: string, reason: string): Promise<ActionResult> {
  try {
    const ctx = await requireWriter();
    const parsed = z
      .object({ id: z.string().uuid(), reason: z.string().trim().min(3, "Say briefly why the draft is rejected.").max(500) })
      .safeParse({ id: messageId, reason });
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the reason." };

    const message = await loadPendingMessage(ctx, parsed.data.id);
    if (!message) return { ok: false, error: "This message no longer exists." };
    if (message.status !== "pending_approval") return { ok: false, error: "This message is no longer waiting for approval." };

    const nowIso = new Date().toISOString();
    const { data, error } = await ctx.supabase
      .from("messages")
      .update({
        status: "rejected",
        processing_history: historyWith(message.processing_history, { step: "rejected", at: nowIso, by: ctx.user.id, reason: parsed.data.reason }),
      })
      .eq("tenant_id", ctx.tenantId)
      .eq("id", parsed.data.id)
      .eq("status", "pending_approval")
      .select("id");
    if (error) throw error;
    if ((data ?? []).length === 0) return { ok: false, error: "This message was already handled by someone else." };

    await writeAudit(ctx, "message.rejected", "message", parsed.data.id, { reason: parsed.data.reason });
    refresh();
    return { ok: true, data: undefined, message: "Draft rejected. Nothing was sent." };
  } catch (error) {
    return actionError(error, "The draft could not be rejected.");
  }
}
