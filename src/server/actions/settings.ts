"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { actionError, writeAudit, type ActionResult } from "@/server/audit";
import { requireAdmin } from "@/server/auth/context";
import { createAdminClient } from "@/server/db/admin";
import { Constants } from "@/server/db/database.types";
import { clearDemoData, seedDemoData } from "@/server/demo/seed";
import { isDemoMode } from "@/server/env";

const E = Constants.public.Enums;
const blank = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

export interface WorkspaceSettingsInput {
  outreachMode: string;
  killSwitch: boolean;
  dailySendLimit: string;
  dailyQualifiedTarget: string;
  dataRetentionDays: string;
}

const workspaceSchema = z.object({
  outreachMode: z.enum(E.outreach_mode),
  killSwitch: z.boolean(),
  dailySendLimit: z.coerce.number().int().min(0).max(500),
  dailyQualifiedTarget: z.coerce.number().int().min(0).max(200),
  dataRetentionDays: z.coerce.number().int().min(30).max(3650),
});

export async function updateWorkspaceSettings(input: WorkspaceSettingsInput): Promise<ActionResult> {
  try {
    const ctx = await requireAdmin();
    const parsed = workspaceSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the values." };
    const v = parsed.data;

    const { error } = await ctx.supabase
      .from("workspaces")
      .update({
        outreach_mode: v.outreachMode,
        outbound_kill_switch: v.killSwitch,
        daily_send_limit: v.dailySendLimit,
        daily_qualified_target: v.dailyQualifiedTarget,
        data_retention_days: v.dataRetentionDays,
      })
      .eq("id", ctx.tenantId);
    if (error) throw error;

    await writeAudit(ctx, "workspace.settings_updated", "workspace", ctx.tenantId, {
      outreach_mode: v.outreachMode,
      kill_switch: v.killSwitch,
      previous_mode: ctx.workspace.outreach_mode,
      previous_kill_switch: ctx.workspace.outbound_kill_switch,
    });
    refresh();
    return { ok: true, data: undefined, message: "Workspace settings saved." };
  } catch (error) {
    return actionError(error, "Settings could not be saved.");
  }
}

export async function addIndustry(name: string): Promise<ActionResult> {
  try {
    const ctx = await requireAdmin();
    const parsed = z.string().trim().min(2, "Enter an industry name.").max(80).safeParse(name);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter an industry name." };
    const slug = parsed.data.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!slug) return { ok: false, error: "Use letters or numbers in the name." };

    const { error } = await ctx.supabase
      .from("industries")
      .insert({ tenant_id: ctx.tenantId, name: parsed.data, slug, origin: "catalogue" });
    if (error) {
      if (error.code === "23505") return { ok: false, error: "That industry is already in the catalogue." };
      throw error;
    }
    await writeAudit(ctx, "industry.added", "industry", null, { name: parsed.data });
    refresh();
    return { ok: true, data: undefined, message: `Added ${parsed.data}.` };
  } catch (error) {
    return actionError(error, "The industry could not be added.");
  }
}

/** Industries are deactivated, not deleted, so historical performance stays intact. */
export async function setIndustryActive(id: string, active: boolean): Promise<ActionResult> {
  try {
    const ctx = await requireAdmin();
    const { error } = await ctx.supabase
      .from("industries")
      .update({ is_active: active })
      .eq("tenant_id", ctx.tenantId)
      .eq("id", z.string().uuid().parse(id));
    if (error) throw error;
    await writeAudit(ctx, active ? "industry.activated" : "industry.removed", "industry", id);
    refresh();
    return { ok: true, data: undefined, message: active ? "Industry restored." : "Industry removed from the catalogue." };
  } catch (error) {
    return actionError(error, "The industry could not be updated.");
  }
}

export interface ServiceInput {
  id: string;
  name: string;
  description: string;
  idealCustomerProfile: string;
  problemsSolved: string;
  deliverables: string;
  priceMin: string;
  priceMax: string;
  weeksMin: string;
  weeksMax: string;
  implementationCost: string;
  supportOptions: string;
  isActive: boolean;
  reviewed: boolean;
}

const lines = z
  .string()
  .max(4000)
  .transform((value) => value.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 30));
const optionalMoney = z.preprocess(blank, z.coerce.number().min(0).max(1_000_000_000).optional());
const optionalWeeks = z.preprocess(blank, z.coerce.number().int().min(0).max(520).optional());

const serviceSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(2, "Enter a service name.").max(120),
    description: z.string().trim().max(2000),
    idealCustomerProfile: z.string().trim().max(2000),
    problemsSolved: lines,
    deliverables: lines,
    priceMin: optionalMoney,
    priceMax: optionalMoney,
    weeksMin: optionalWeeks,
    weeksMax: optionalWeeks,
    implementationCost: optionalMoney,
    supportOptions: lines,
    isActive: z.boolean(),
    reviewed: z.boolean(),
  })
  .refine((v) => v.priceMin === undefined || v.priceMax === undefined || v.priceMax >= v.priceMin, {
    message: "The maximum price must be at least the minimum price.",
  })
  .refine((v) => v.weeksMin === undefined || v.weeksMax === undefined || v.weeksMax >= v.weeksMin, {
    message: "The longest delivery time must be at least the shortest.",
  });

export async function updateService(input: ServiceInput): Promise<ActionResult> {
  try {
    const ctx = await requireAdmin();
    const parsed = serviceSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the values." };
    const v = parsed.data;

    const { error } = await ctx.supabase
      .from("service_catalogue")
      .update({
        name: v.name,
        description: v.description,
        ideal_customer_profile: v.idealCustomerProfile,
        problems_solved: v.problemsSolved,
        deliverables: v.deliverables,
        price_min_inr: v.priceMin ?? null,
        price_max_inr: v.priceMax ?? null,
        delivery_weeks_min: v.weeksMin ?? null,
        delivery_weeks_max: v.weeksMax ?? null,
        est_implementation_cost_inr: v.implementationCost ?? null,
        recurring_support_options: v.supportOptions,
        is_active: v.isActive,
        needs_review: !v.reviewed,
      })
      .eq("tenant_id", ctx.tenantId)
      .eq("id", v.id);
    if (error) throw error;
    await writeAudit(ctx, "service.updated", "service", v.id, { name: v.name, reviewed: v.reviewed });
    refresh();
    return { ok: true, data: undefined, message: "Service saved." };
  } catch (error) {
    return actionError(error, "The service could not be saved.");
  }
}

/** Replaces the synthetic dataset. Only available in demo mode, and only to admins. */
export async function resetDemoData(): Promise<ActionResult> {
  try {
    const ctx = await requireAdmin();
    if (!isDemoMode()) return { ok: false, error: "Demo data controls are disabled outside demo mode." };
    const summary = await seedDemoData(createAdminClient(), ctx.tenantId, ctx.user.id);
    await writeAudit(ctx, "demo.reset", "workspace", ctx.tenantId, { companies: summary.companies });
    refresh();
    return { ok: true, data: undefined, message: `Demo data reset: ${summary.companies} synthetic companies loaded.` };
  } catch (error) {
    return actionError(error, "Demo data could not be reset.");
  }
}

/** Deletes every synthetic row. Real records are never touched. */
export async function removeDemoData(): Promise<ActionResult> {
  try {
    const ctx = await requireAdmin();
    await clearDemoData(createAdminClient(), ctx.tenantId);
    await writeAudit(ctx, "demo.removed", "workspace", ctx.tenantId);
    refresh();
    return { ok: true, data: undefined, message: "All synthetic demo data was removed." };
  } catch (error) {
    return actionError(error, "Demo data could not be removed.");
  }
}
