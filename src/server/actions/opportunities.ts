"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { actionError, writeAudit, type ActionResult } from "@/server/audit";
import { requireWriter } from "@/server/auth/context";
import { Constants } from "@/server/db/database.types";

const E = Constants.public.Enums;
const blank = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);
const money = z.preprocess(blank, z.coerce.number().min(0).max(1_000_000_000).optional());

export interface OpportunityInput {
  companyId: string;
  serviceId: string;
  title: string;
  estimatedValue: string;
  problemHypothesis: string;
}

const createSchema = z.object({
  companyId: z.string().uuid("Choose a company."),
  serviceId: z.preprocess(blank, z.string().uuid().optional()),
  title: z.string().trim().min(3, "Give the opportunity a title.").max(200),
  estimatedValue: money,
  problemHypothesis: z.preprocess(blank, z.string().trim().max(2000).optional()),
});

export async function createOpportunity(input: OpportunityInput): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireWriter();
    const parsed = createSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
    const v = parsed.data;

    const { data, error } = await ctx.supabase
      .from("opportunities")
      .insert({
        tenant_id: ctx.tenantId,
        company_id: v.companyId,
        service_id: v.serviceId ?? null,
        title: v.title,
        estimated_value_inr: v.estimatedValue ?? null,
        problem_hypothesis: v.problemHypothesis ?? null,
        origin: "human",
        owner_user_id: ctx.user.id,
      })
      .select("id")
      .single();
    if (error) throw error;

    await ctx.supabase.from("activities").insert({
      tenant_id: ctx.tenantId,
      company_id: v.companyId,
      opportunity_id: data.id,
      actor_type: "user",
      actor_user_id: ctx.user.id,
      type: "system",
      title: `Opportunity created: ${v.title}`,
    });
    await writeAudit(ctx, "opportunity.created", "opportunity", data.id, { title: v.title });
    refresh();
    return { ok: true, data: { id: data.id }, message: "Opportunity created." };
  } catch (error) {
    return actionError(error, "The opportunity could not be created.");
  }
}

export interface StageChangeInput {
  id: string;
  stage: string;
  collectedRevenue?: string;
  deliveryCost?: string;
  lostReason?: string;
}

const stageSchema = z.object({
  id: z.string().uuid(),
  stage: z.enum(E.opportunity_stage),
  collectedRevenue: money,
  deliveryCost: money,
  lostReason: z.preprocess(blank, z.string().trim().max(500).optional()),
});

export async function changeOpportunityStage(input: StageChangeInput): Promise<ActionResult> {
  try {
    const ctx = await requireWriter();
    const parsed = stageSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the values." };
    const v = parsed.data;

    const current = await ctx.supabase
      .from("opportunities")
      .select("stage, company_id, title, proposal_sent_at")
      .eq("tenant_id", ctx.tenantId)
      .eq("id", v.id)
      .maybeSingle();
    if (current.error) throw current.error;
    if (!current.data) return { ok: false, error: "This opportunity no longer exists." };
    if (current.data.stage === v.stage) return { ok: true, data: undefined };
    if (v.stage === "lost" && !v.lostReason) return { ok: false, error: "Record why the opportunity was lost." };

    const now = new Date().toISOString();
    const { error } = await ctx.supabase
      .from("opportunities")
      .update({
        stage: v.stage,
        won_at: v.stage === "won" ? now : null,
        lost_at: v.stage === "lost" ? now : null,
        lost_reason: v.stage === "lost" ? (v.lostReason ?? null) : null,
        proposal_sent_at:
          v.stage === "proposal_sent" || v.stage === "negotiation" || v.stage === "won"
            ? (current.data.proposal_sent_at ?? now)
            : current.data.proposal_sent_at,
        ...(v.stage === "won"
          ? { collected_revenue_inr: v.collectedRevenue ?? 0, delivery_cost_inr: v.deliveryCost ?? 0 }
          : {}),
      })
      .eq("tenant_id", ctx.tenantId)
      .eq("id", v.id);
    if (error) throw error;

    // A won deal makes the company a customer; nothing else moves the company stage from here.
    if (v.stage === "won") {
      const company = await ctx.supabase
        .from("companies")
        .update({ lead_stage: "customer", customer_at: now })
        .eq("tenant_id", ctx.tenantId)
        .eq("id", current.data.company_id);
      if (company.error) throw company.error;
    }

    await ctx.supabase.from("activities").insert({
      tenant_id: ctx.tenantId,
      company_id: current.data.company_id,
      opportunity_id: v.id,
      actor_type: "user",
      actor_user_id: ctx.user.id,
      type: "stage_change",
      title: `Opportunity "${current.data.title}" moved from ${current.data.stage.replace(/_/g, " ")} to ${v.stage.replace(/_/g, " ")}`,
    });
    await writeAudit(ctx, "opportunity.stage_changed", "opportunity", v.id, { from: current.data.stage, to: v.stage });
    refresh();
    return { ok: true, data: undefined, message: "Stage updated." };
  } catch (error) {
    return actionError(error, "The stage could not be changed.");
  }
}
