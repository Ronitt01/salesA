"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { actionError, type ActionResult } from "@/server/audit";
import { requireWriter } from "@/server/auth/context";
import { HunterClient, HunterError, loadHunterSettings } from "@/server/providers/hunter/client";
import { enrichCompanyContacts, verifyContactEmail, type EnrichmentSummary } from "@/server/services/enrichment/enrich";
import { loadEnrichmentPolicy } from "@/server/services/enrichment/policy";
import { HUNTER_STATUS_EXPLANATION } from "@/server/services/enrichment/verification";

/** Builds the Hunter client from the server environment. The key never leaves the server. */
function hunterFromEnv(): HunterClient | { error: string } {
  try {
    return new HunterClient({ apiKey: loadHunterSettings().apiKey });
  } catch (error) {
    if (error instanceof HunterError) return { error: error.message };
    throw error;
  }
}

const SKIP_LABELS: Record<string, string> = {
  generic_mailbox: "shared mailboxes",
  different_domain: "addresses on another domain",
  suppressed: "suppressed addresses",
  email_on_another_company: "already in HUNTER",
  no_person_name: "no person's name",
  below_relevance: "not a priority role",
  limit_reached: "over the per-run limit",
  kept_existing: "kept manual or higher-confidence data",
  data_processing_objection: "asked not to be processed",
  no_email_found: "no address found",
};

function describe(summary: EnrichmentSummary): string {
  const parts = [`${summary.created} added`, `${summary.updated} updated`, `${summary.verified} verified`];
  const skipped = Object.entries(summary.skipped)
    .filter(([, n]) => n)
    .map(([reason, n]) => `${n} ${SKIP_LABELS[reason] ?? reason}`);
  return `${parts.join(", ")}.${skipped.length ? ` Skipped: ${skipped.join(", ")}.` : ""}`;
}

export async function enrichCompanyContactsAction(
  companyId: string,
): Promise<ActionResult<{ created: number; updated: number; verified: number; errors: string[] }>> {
  try {
    const ctx = await requireWriter();
    const id = z.string().uuid().parse(companyId);
    const hunter = hunterFromEnv();
    if ("error" in hunter) return { ok: false, error: hunter.error };

    const outcome = await enrichCompanyContacts(ctx.supabase, ctx.tenantId, id, hunter, {
      actorUserId: ctx.user.id,
      policy: loadEnrichmentPolicy(),
    });
    if (!outcome.ok) return { ok: false, error: outcome.reason };

    refresh();
    const { summary } = outcome;
    return {
      ok: true,
      data: { created: summary.created, updated: summary.updated, verified: summary.verified, errors: summary.errors },
      message: `Contact enrichment finished: ${describe(summary)}${summary.errors.length ? ` ${summary.errors.length} problem(s) were recorded.` : ""}`,
    };
  } catch (error) {
    return actionError(error, "Contact enrichment could not be completed. No contacts were changed by the failed step.");
  }
}

export async function verifyContactEmailAction(
  contactId: string,
): Promise<ActionResult<{ status: string; hunterStatus: string | null; cached: boolean }>> {
  try {
    const ctx = await requireWriter();
    const id = z.string().uuid().parse(contactId);
    const hunter = hunterFromEnv();
    if ("error" in hunter) return { ok: false, error: hunter.error };

    const outcome = await verifyContactEmail(ctx.supabase, ctx.tenantId, id, hunter, {
      actorUserId: ctx.user.id,
      policy: loadEnrichmentPolicy(),
    });
    if (!outcome.ok) return { ok: false, error: outcome.reason };

    refresh();
    const explanation = outcome.hunterStatus ? (HUNTER_STATUS_EXPLANATION[outcome.hunterStatus] ?? "") : "";
    const message = outcome.cached
      ? `Verified recently, so Hunter was not called again. ${explanation}`.trim()
      : outcome.manualPreserved
        ? `Hunter says "${outcome.hunterStatus}". The status set by a person was kept; Hunter's result is in the history.`
        : `Hunter says "${outcome.hunterStatus}". ${explanation}`.trim();
    return { ok: true, data: { status: outcome.status, hunterStatus: outcome.hunterStatus, cached: outcome.cached }, message };
  } catch (error) {
    return actionError(error, "The email could not be verified. The contact was not changed.");
  }
}
