"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { actionError, writeAudit, type ActionResult } from "@/server/audit";
import { getSessionContext, requireWriter } from "@/server/auth/context";
import { Constants } from "@/server/db/database.types";
import { normaliseDomain } from "@/server/services/scoring/engine";
import { rescoreCompany } from "@/server/services/scoring/rescore";

const E = Constants.public.Enums;

const emptyToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);
const optionalText = (max: number) => z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());

const leadSchema = z.object({
  name: z.string().trim().min(2, "Company name must be at least 2 characters.").max(160),
  domain: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .max(200)
      .transform((v) => normaliseDomain(v))
      .refine((v) => v !== null && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v), "Enter a domain such as example.com.")
      .optional(),
  ),
  industryId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  city: optionalText(80),
  state: optionalText(80),
  employeeRange: z.preprocess(emptyToUndefined, z.enum(E.employee_range).optional()),
  branchCount: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(10_000).optional()),
  acquisitionChannel: z.enum(E.acquisition_channel).default("other"),
  description: optionalText(2000),
  contactName: optionalText(120),
  contactTitle: optionalText(120),
  contactEmail: z.preprocess(emptyToUndefined, z.string().trim().toLowerCase().email("Enter a valid contact email.").optional()),
  contactPhone: optionalText(40),
  contactRole: z.enum(E.contact_role).default("other"),
});

/** Raw form values. Everything arrives as text and is validated by leadSchema. */
export interface LeadInput {
  name: string;
  domain: string;
  industryId: string;
  city: string;
  state: string;
  employeeRange: string;
  branchCount: string;
  acquisitionChannel: (typeof E.acquisition_channel)[number];
  description?: string;
  contactName: string;
  contactTitle: string;
  contactEmail: string;
  contactPhone: string;
  contactRole: (typeof E.contact_role)[number];
}

const SOURCE_KIND_FOR_CHANNEL = {
  email_outreach: "manual",
  referral: "referral",
  inbound: "inbound_form",
  partnership: "partner",
  event: "event",
  other: "manual",
} as const;

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}

export async function createLead(input: LeadInput): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireWriter();
    const parsed = leadSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const v = parsed.data;
    if (v.contactEmail && !v.contactName) return { ok: false, error: "Add the contact's name along with their email." };

    // Duplicate detection before insert. The unique index is the final guard.
    if (v.domain) {
      const existing = await ctx.supabase
        .from("companies")
        .select("id, name")
        .eq("tenant_id", ctx.tenantId)
        .eq("normalised_domain", v.domain)
        .maybeSingle();
      if (existing.data) {
        return { ok: false, error: `A company with the domain ${v.domain} already exists: ${existing.data.name}.` };
      }
    }
    if (v.contactEmail) {
      const existing = await ctx.supabase
        .from("contacts")
        .select("id")
        .eq("tenant_id", ctx.tenantId)
        .eq("email_normalised", v.contactEmail)
        .maybeSingle();
      if (existing.data) return { ok: false, error: `A contact with the email ${v.contactEmail} already exists.` };
    }

    const source = await ctx.supabase
      .from("sources")
      .insert({
        tenant_id: ctx.tenantId,
        kind: SOURCE_KIND_FOR_CHANNEL[v.acquisitionChannel],
        provider: "manual",
        label: `Entered by ${ctx.user.fullName ?? ctx.user.email}`,
      })
      .select("id")
      .single();
    if (source.error) throw source.error;

    const company = await ctx.supabase
      .from("companies")
      .insert({
        tenant_id: ctx.tenantId,
        name: v.name,
        domain: v.domain ?? null,
        website_url: v.domain ? `https://${v.domain}` : null,
        industry_id: v.industryId ?? null,
        city: v.city ?? null,
        state: v.state ?? null,
        employee_range: v.employeeRange ?? null,
        branch_count: v.branchCount ?? null,
        acquisition_channel: v.acquisitionChannel,
        description: v.description ?? null,
        source_id: source.data.id,
        owner_user_id: ctx.user.id,
      })
      .select("id")
      .single();
    if (company.error) {
      if (company.error.code === "23505") return { ok: false, error: "A company with this domain already exists." };
      throw company.error;
    }

    if (v.contactName) {
      const contact = await ctx.supabase.from("contacts").insert({
        tenant_id: ctx.tenantId,
        company_id: company.data.id,
        full_name: v.contactName,
        job_title: v.contactTitle ?? null,
        role_category: v.contactRole,
        email: v.contactEmail ?? null,
        phone: v.contactPhone ?? null,
        is_primary: true,
        source_id: source.data.id,
        provenance_note: `Entered manually by ${ctx.user.fullName ?? ctx.user.email}.`,
        // Fields a person entered are recorded as manual, so enrichment never overwrites them.
        field_provenance: Object.fromEntries(
          (["full_name", "job_title", "email"] as const)
            .filter((field) => (field === "full_name" ? v.contactName : field === "job_title" ? v.contactTitle : v.contactEmail))
            .map((field) => [field, { source: "manual", sourceId: source.data.id, retrievedAt: new Date().toISOString() }]),
        ),
      });
      if (contact.error) {
        if (contact.error.code === "23505") return { ok: false, error: "A contact with this email already exists." };
        throw contact.error;
      }
    }

    await ctx.supabase.from("activities").insert({
      tenant_id: ctx.tenantId,
      company_id: company.data.id,
      actor_type: "user",
      actor_user_id: ctx.user.id,
      type: "system",
      title: "Lead created manually",
    });
    await writeAudit(ctx, "lead.created", "company", company.data.id, { name: v.name, domain: v.domain ?? null });
    await rescoreCompany(ctx.supabase, ctx.tenantId, company.data.id);

    refresh();
    return { ok: true, data: { id: company.data.id }, message: "Lead created." };
  } catch (error) {
    return actionError(error, "The lead could not be created.");
  }
}

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2, "Company name must be at least 2 characters.").max(160),
  industryId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  city: optionalText(80),
  state: optionalText(80),
  employeeRange: z.preprocess(emptyToUndefined, z.enum(E.employee_range).optional()),
  branchCount: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(10_000).optional()),
  description: optionalText(2000),
  // Only stages a person may set directly. Qualification is decided by the scoring engine.
  stage: z.preprocess(emptyToUndefined, z.enum(["nurture", "rejected", "researched"]).optional()),
});

/** Raw form values for the edit dialog, validated by updateSchema. */
export interface LeadUpdateInput {
  id: string;
  name: string;
  industryId: string;
  city: string;
  state: string;
  employeeRange: string;
  branchCount: string;
  description: string;
  stage: string;
}

export async function updateLead(input: LeadUpdateInput): Promise<ActionResult> {
  try {
    const ctx = await requireWriter();
    const parsed = updateSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const v = parsed.data;

    const before = await ctx.supabase
      .from("companies")
      .select("name, lead_stage")
      .eq("tenant_id", ctx.tenantId)
      .eq("id", v.id)
      .maybeSingle();
    if (before.error) throw before.error;
    if (!before.data) return { ok: false, error: "This lead no longer exists." };

    const update = await ctx.supabase
      .from("companies")
      .update({
        name: v.name,
        industry_id: v.industryId ?? null,
        city: v.city ?? null,
        state: v.state ?? null,
        employee_range: v.employeeRange ?? null,
        branch_count: v.branchCount ?? null,
        description: v.description ?? null,
        ...(v.stage ? { lead_stage: v.stage, is_qualified: false } : {}),
      })
      .eq("tenant_id", ctx.tenantId)
      .eq("id", v.id);
    if (update.error) throw update.error;

    if (v.stage && v.stage !== before.data.lead_stage) {
      await ctx.supabase.from("activities").insert({
        tenant_id: ctx.tenantId,
        company_id: v.id,
        actor_type: "user",
        actor_user_id: ctx.user.id,
        type: "stage_change",
        title: `Stage changed from ${before.data.lead_stage} to ${v.stage}`,
      });
    }
    await writeAudit(ctx, "lead.updated", "company", v.id, { stage: v.stage ?? null });
    // Firmographics feed the score, so an edit always triggers a rescore unless a person parked the lead.
    if (!v.stage) await rescoreCompany(ctx.supabase, ctx.tenantId, v.id);

    refresh();
    return { ok: true, data: undefined, message: "Lead updated." };
  } catch (error) {
    return actionError(error, "The lead could not be updated.");
  }
}

export async function rescoreLead(companyId: string): Promise<ActionResult<{ total: number; qualified: boolean }>> {
  try {
    const ctx = await requireWriter();
    const id = z.string().uuid().parse(companyId);
    const result = await rescoreCompany(ctx.supabase, ctx.tenantId, id);
    await ctx.supabase.from("activities").insert({
      tenant_id: ctx.tenantId,
      company_id: id,
      actor_type: "user",
      actor_user_id: ctx.user.id,
      type: "score",
      title: `Rescored: ${result.total} (Priority ${result.priority})${result.isQualified ? ", qualified" : ", not qualified"}`,
    });
    await writeAudit(ctx, "lead.rescored", "company", id, { total: result.total, qualified: result.isQualified });
    refresh();
    return {
      ok: true,
      data: { total: result.total, qualified: result.isQualified },
      message: `Score is ${result.total}. ${result.isQualified ? "Qualified." : "Not qualified."}`,
    };
  } catch (error) {
    return actionError(error, "The lead could not be rescored.");
  }
}

export async function addLeadNote(companyId: string, body: string): Promise<ActionResult> {
  try {
    const ctx = await requireWriter();
    const parsed = z
      .object({ companyId: z.string().uuid(), body: z.string().trim().min(1, "Write a note first.").max(4000) })
      .safeParse({ companyId, body });
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

    const { error } = await ctx.supabase.from("activities").insert({
      tenant_id: ctx.tenantId,
      company_id: parsed.data.companyId,
      actor_type: "user",
      actor_user_id: ctx.user.id,
      type: "note",
      title: "Note",
      body: parsed.data.body,
    });
    if (error) throw error;
    refresh();
    return { ok: true, data: undefined, message: "Note added." };
  } catch (error) {
    return actionError(error, "The note could not be saved.");
  }
}

export async function bulkTagLeads(companyIds: string[], tag: string, mode: "add" | "remove"): Promise<ActionResult<{ updated: number }>> {
  try {
    const ctx = await requireWriter();
    const parsed = z
      .object({
        ids: z.array(z.string().uuid()).min(1, "Select at least one lead.").max(500),
        tag: z
          .string()
          .trim()
          .toLowerCase()
          .min(1, "Enter a tag.")
          .max(40)
          .regex(/^[a-z0-9][a-z0-9 _-]*$/, "Tags may contain letters, numbers, spaces, hyphens and underscores."),
        mode: z.enum(["add", "remove"]),
      })
      .safeParse({ ids: companyIds, tag, mode });
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

    const current = await ctx.supabase
      .from("companies")
      .select("id, tags")
      .eq("tenant_id", ctx.tenantId)
      .in("id", parsed.data.ids);
    if (current.error) throw current.error;

    let updated = 0;
    for (const company of current.data) {
      const has = company.tags.includes(parsed.data.tag);
      if (parsed.data.mode === "add" ? has : !has) continue;
      const tags =
        parsed.data.mode === "add" ? [...company.tags, parsed.data.tag] : company.tags.filter((t) => t !== parsed.data.tag);
      const { error } = await ctx.supabase.from("companies").update({ tags }).eq("tenant_id", ctx.tenantId).eq("id", company.id);
      if (error) throw error;
      updated++;
    }
    await writeAudit(ctx, `lead.tags.${parsed.data.mode}`, "company", null, {
      tag: parsed.data.tag,
      requested: parsed.data.ids.length,
      updated,
    });
    refresh();
    return {
      ok: true,
      data: { updated },
      message: `${parsed.data.mode === "add" ? "Tagged" : "Untagged"} ${updated} lead${updated === 1 ? "" : "s"}.`,
    };
  } catch (error) {
    return actionError(error, "Tags could not be updated.");
  }
}

export async function saveLeadFilter(name: string, params: Record<string, string>): Promise<ActionResult> {
  try {
    // Saved filters are personal, so viewers may keep them too.
    const ctx = await getSessionContext();
    const parsed = z
      .object({
        name: z.string().trim().min(1, "Name the filter.").max(60),
        params: z.record(z.string().max(30), z.string().max(200)).refine((p) => Object.keys(p).length <= 20),
      })
      .safeParse({ name, params });
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

    const { error } = await ctx.supabase.from("saved_filters").upsert(
      {
        tenant_id: ctx.tenantId,
        user_id: ctx.user.id,
        scope: "leads",
        name: parsed.data.name,
        params: parsed.data.params,
      },
      { onConflict: "tenant_id,user_id,scope,name" },
    );
    if (error) throw error;
    refresh();
    return { ok: true, data: undefined, message: `Saved "${parsed.data.name}".` };
  } catch (error) {
    return actionError(error, "The filter could not be saved.");
  }
}

export async function deleteLeadFilter(id: string): Promise<ActionResult> {
  try {
    const ctx = await getSessionContext();
    const { error } = await ctx.supabase
      .from("saved_filters")
      .delete()
      .eq("tenant_id", ctx.tenantId)
      .eq("user_id", ctx.user.id)
      .eq("id", z.string().uuid().parse(id));
    if (error) throw error;
    refresh();
    return { ok: true, data: undefined, message: "Saved filter removed." };
  } catch (error) {
    return actionError(error, "The filter could not be removed.");
  }
}
