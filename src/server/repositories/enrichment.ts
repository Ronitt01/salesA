import "server-only";
import type { SessionContext } from "@/server/auth/context";
import { hunterKeyStatus } from "@/server/providers/hunter/client";
import { checkEnrichmentEligibility, isRecentlyVerified, loadEnrichmentPolicy } from "@/server/services/enrichment/policy";
import { formatRelative } from "@/lib/format";
import type { Database } from "@/server/db/database.types";

type Company = Pick<
  Database["public"]["Tables"]["companies"]["Row"],
  "id" | "is_demo" | "normalised_domain" | "lead_stage" | "researched_at" | "opportunity_score"
>;

/** Why the enrichment controls are disabled, if they are, computed without calling Hunter. */
export async function getEnrichmentAvailability(ctx: SessionContext, company: Company, now: Date) {
  const policy = loadEnrichmentPolicy();
  const keyStatus = hunterKeyStatus();
  const configured = keyStatus !== "missing";
  const testKey = keyStatus === "test";

  const { data } = await ctx.supabase
    .from("audit_logs")
    .select("created_at")
    .eq("tenant_id", ctx.tenantId)
    .eq("entity_type", "company")
    .eq("entity_id", company.id)
    .eq("action", "contacts.enriched")
    .order("created_at", { ascending: false })
    .limit(1);
  const lastEnrichedAt = data?.[0]?.created_at ?? null;

  let companyReason: string | null = null;
  if (!configured) companyReason = "Contact enrichment is not configured: HUNTER_API_KEY is not set on the server.";
  else if (testKey) companyReason = "HUNTER_API_KEY is Hunter's test key. It returns dummy data and cannot enrich real records.";
  else {
    const eligibility = checkEnrichmentEligibility(
      {
        isDemo: company.is_demo,
        domain: company.normalised_domain,
        leadStage: company.lead_stage,
        researchedAt: company.researched_at,
        opportunityScore: company.opportunity_score,
      },
      lastEnrichedAt,
      now,
      policy,
    );
    if (!eligibility.eligible) companyReason = eligibility.reason;
  }

  const verifyReason = (contact: {
    email: string | null;
    is_demo: boolean;
    last_verified_at: string | null;
    verification_provider: string | null;
  }): string | null => {
    if (!configured) return "Email verification is not configured: HUNTER_API_KEY is not set on the server.";
    if (testKey) return "HUNTER_API_KEY is Hunter's test key and cannot verify real addresses.";
    if (contact.is_demo || company.is_demo) return "Synthetic demo contact: verification is disabled so no credits are spent on fictional data.";
    if (!contact.email) return "No email address to verify.";
    if (isRecentlyVerified({ lastVerifiedAt: contact.last_verified_at, verificationProvider: contact.verification_provider }, now, policy)) {
      return `Verified by Hunter.io ${formatRelative(contact.last_verified_at, now)}. It can be checked again after ${policy.verifyCooldownDays} days.`;
    }
    return null;
  };

  return { configured, lastEnrichedAt, companyReason, verifyReason };
}
