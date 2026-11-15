import type { Database } from "@/server/db/database.types";

/**
 * When enrichment may run, and how many paid calls one run may make. Pure.
 *
 * Enrichment is not run on every discovered business: only on researched companies
 * that are not rejected and either score at least minScore or are already in a
 * qualified-or-later stage. Synthetic demo companies are never sent to Hunter.
 */

type Stage = Database["public"]["Enums"]["lead_stage"];

export interface EnrichmentPolicy {
  minScore: number;
  /** A company is not re-enriched within this many days unless forced. */
  cooldownDays: number;
  /** An address verified within this many days is not verified again unless forced. */
  verifyCooldownDays: number;
  /** New contacts added per run. */
  maxNewContacts: number;
  maxVerificationsPerRun: number;
  maxFinderCallsPerRun: number;
  domainSearchLimit: number;
}

export const DEFAULT_POLICY: EnrichmentPolicy = {
  minScore: 50,
  cooldownDays: 30,
  verifyCooldownDays: 30,
  maxNewContacts: 5,
  maxVerificationsPerRun: 5,
  maxFinderCallsPerRun: 3,
  domainSearchLimit: 10,
};

function bounded(env: Record<string, string | undefined>, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

export function loadEnrichmentPolicy(env: Record<string, string | undefined> = process.env): EnrichmentPolicy {
  return {
    minScore: bounded(env, "HUNTER_MIN_SCORE", DEFAULT_POLICY.minScore, 0, 100),
    cooldownDays: bounded(env, "HUNTER_ENRICH_COOLDOWN_DAYS", DEFAULT_POLICY.cooldownDays, 0, 365),
    verifyCooldownDays: bounded(env, "HUNTER_VERIFY_COOLDOWN_DAYS", DEFAULT_POLICY.verifyCooldownDays, 0, 365),
    maxNewContacts: bounded(env, "HUNTER_MAX_NEW_CONTACTS", DEFAULT_POLICY.maxNewContacts, 0, 25),
    maxVerificationsPerRun: bounded(env, "HUNTER_MAX_VERIFICATIONS_PER_RUN", DEFAULT_POLICY.maxVerificationsPerRun, 0, 25),
    maxFinderCallsPerRun: bounded(env, "HUNTER_MAX_FINDER_CALLS_PER_RUN", DEFAULT_POLICY.maxFinderCallsPerRun, 0, 25),
    domainSearchLimit: bounded(env, "HUNTER_DOMAIN_SEARCH_LIMIT", DEFAULT_POLICY.domainSearchLimit, 1, 100),
  };
}

const RESERVED_TLD = /\.(example|test|invalid|localhost|local)$/i;
const DOMAIN = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const QUALIFIED_STAGES: ReadonlySet<Stage> = new Set(["qualified", "contacted", "positive_reply", "meeting", "proposal", "customer"]);

/** True for a syntactically valid public domain. Reserved test domains are rejected. */
export function isEnrichableDomain(domain: string | null): domain is string {
  return Boolean(domain && DOMAIN.test(domain) && !RESERVED_TLD.test(domain));
}

export interface CompanyForEnrichment {
  isDemo: boolean;
  domain: string | null;
  leadStage: Stage;
  researchedAt: string | null;
  opportunityScore: number | null;
}

export type Eligibility = { eligible: true } | { eligible: false; reason: string };

export function checkEnrichmentEligibility(
  company: CompanyForEnrichment,
  lastEnrichedAt: string | null,
  now: Date,
  policy: EnrichmentPolicy,
  force = false,
): Eligibility {
  if (company.isDemo) return { eligible: false, reason: "This is a synthetic demo company. Enrichment is disabled so no credits are spent on fictional data." };
  if (!isEnrichableDomain(company.domain)) return { eligible: false, reason: "The company has no valid public website domain to search." };
  if (company.leadStage === "rejected") return { eligible: false, reason: "The company has been rejected." };
  if (company.leadStage === "discovered" || !company.researchedAt) {
    return { eligible: false, reason: "Research the company before enriching contacts, so credits go to companies that have been looked at." };
  }
  if (!QUALIFIED_STAGES.has(company.leadStage) && (company.opportunityScore ?? 0) < policy.minScore) {
    return {
      eligible: false,
      reason: `The opportunity score (${company.opportunityScore ?? "not scored"}) is below the enrichment threshold of ${policy.minScore}.`,
    };
  }
  if (!force && lastEnrichedAt && policy.cooldownDays > 0) {
    const ageDays = (now.getTime() - new Date(lastEnrichedAt).getTime()) / 86_400_000;
    if (ageDays < policy.cooldownDays) {
      return { eligible: false, reason: `Contacts were enriched ${Math.floor(ageDays)} day(s) ago. Enrichment can run again after ${policy.cooldownDays} days.` };
    }
  }
  return { eligible: true };
}

/** True when a recent Hunter verification of the same address makes another call unnecessary. */
export function isRecentlyVerified(
  contact: { lastVerifiedAt: string | null; verificationProvider: string | null },
  now: Date,
  policy: EnrichmentPolicy,
): boolean {
  if (!contact.lastVerifiedAt || policy.verifyCooldownDays <= 0) return false;
  if (!contact.verificationProvider?.startsWith("hunter.io")) return false;
  return (now.getTime() - new Date(contact.lastVerifiedAt).getTime()) / 86_400_000 < policy.verifyCooldownDays;
}
