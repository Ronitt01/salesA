import { z } from "zod";
import type { Database } from "@/server/db/database.types";
import type { ContactRole } from "./ranking";

/**
 * How enrichment results are merged into existing contacts. Pure, so every rule is
 * unit-tested:
 *
 * - A field entered by a person (or with no recorded provenance) is never overwritten.
 * - A contact whose email was verified by a person is never given a different email.
 * - A provider email replaces an earlier provider email only when the new confidence is
 *   strictly higher, or the earlier one was verified invalid.
 * - Names of existing contacts are never changed.
 * - No contact is created twice: results are matched by email, then by name, and an
 *   email already held by a contact at another company is skipped.
 * - Suppressed addresses and domains are not stored, and neither are generic mailboxes,
 *   addresses outside the company's domain, or results without a person's name.
 */

type VerificationStatus = Database["public"]["Enums"]["verification_status"];
export type ProvenanceField = "full_name" | "job_title" | "email" | "verification";

export const PROVIDER_SOURCES = {
  domainSearch: "hunter.io:domain_search",
  emailFinder: "hunter.io:email_finder",
  emailVerifier: "hunter.io:email_verifier",
} as const;

const entrySchema = z.object({
  source: z.string().min(1),
  sourceId: z.string().nullable().optional(),
  confidence: z.number().nullable().optional(),
  retrievedAt: z.string(),
  hunterSources: z.number().optional(),
  hunterStatus: z.string().nullable().optional(),
});
export type ProvenanceEntry = z.infer<typeof entrySchema>;
export type FieldProvenance = Partial<Record<ProvenanceField, ProvenanceEntry>>;

const provenanceSchema = z.object({
  full_name: entrySchema.optional(),
  job_title: entrySchema.optional(),
  email: entrySchema.optional(),
  verification: entrySchema.optional(),
});

export function parseProvenance(value: unknown): FieldProvenance {
  const parsed = provenanceSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : {};
}

export function isProviderOwned(entry: ProvenanceEntry | undefined): boolean {
  return Boolean(entry?.source.startsWith("hunter.io:"));
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normaliseName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** First and last name from a full name, or null when there are not at least two parts. */
export function splitName(fullName: string): { firstName: string; lastName: string } | null {
  const parts = fullName.trim().split(/\s+/).filter((p) => /[\p{L}]/u.test(p));
  if (parts.length < 2) return null;
  return { firstName: parts[0], lastName: parts[parts.length - 1] };
}

export function emailDomain(email: string): string {
  return normaliseEmail(email).split("@")[1] ?? "";
}

export function belongsToDomain(email: string, companyDomain: string): boolean {
  const domain = emailDomain(email);
  const company = companyDomain.toLowerCase();
  return domain === company || domain.endsWith(`.${company}`);
}

export interface ExistingContact {
  id: string;
  fullName: string;
  jobTitle: string | null;
  email: string | null;
  verificationStatus: VerificationStatus;
  verificationProvider: string | null;
  emailConfidence: number | null;
  provenance: FieldProvenance;
  doNotContact: boolean;
  isPrimary: boolean;
}

export interface Candidate {
  email: string;
  firstName: string | null;
  lastName: string | null;
  position: string | null;
  confidence: number | null;
  /** Number of public pages Hunter found the address on. */
  hunterSources: number;
  /** Hunter's stored verification for the address, kept for provenance only. */
  hunterStatus: string | null;
  origin: typeof PROVIDER_SOURCES.domainSearch | typeof PROVIDER_SOURCES.emailFinder;
  role: ContactRole;
  relevanceScore: number;
  generic: boolean;
}

export type EmailDecision =
  | { action: "set" | "replace" | "refresh"; reason: string }
  | { action: "keep"; reason: string };

/** Whether a candidate email may be written to an existing contact. */
export function decideEmail(existing: ExistingContact, candidate: Pick<Candidate, "email" | "confidence">): EmailDecision {
  const next = normaliseEmail(candidate.email);
  const current = existing.email ? normaliseEmail(existing.email) : null;
  const owned = isProviderOwned(existing.provenance.email);

  if (!current) return { action: "set", reason: "The contact had no email address." };
  if (current === next) {
    return owned
      ? { action: "refresh", reason: "Same address; provider details refreshed." }
      : { action: "keep", reason: "Same address, entered by a person; left unchanged." };
  }
  if (existing.verificationProvider === "manual") return { action: "keep", reason: "The current address was verified by a person." };
  if (!owned) return { action: "keep", reason: "The current address was entered by a person." };
  if (existing.verificationStatus === "invalid") return { action: "replace", reason: "The previous provider address was verified invalid." };
  if ((candidate.confidence ?? -1) > (existing.emailConfidence ?? -1)) {
    return { action: "replace", reason: "The new provider address has higher confidence." };
  }
  return { action: "keep", reason: "The new address does not have higher confidence than the current one." };
}

/** Whether a candidate position may be written to an existing contact. */
export function decideJobTitle(existing: ExistingContact, position: string | null): "set" | "keep" {
  if (!position?.trim()) return "keep";
  if (!existing.jobTitle?.trim()) return "set";
  if (isProviderOwned(existing.provenance.job_title) && existing.jobTitle.trim() !== position.trim()) return "set";
  return "keep";
}

export interface ContactPatch {
  email?: string;
  email_confidence?: number | null;
  job_title?: string;
  role_category?: ContactRole;
  field_provenance: FieldProvenance;
}

export interface UpdatePlan {
  contactId: string;
  patch: ContactPatch;
  changes: string[];
  /** The address now held after this update, if it changed. */
  newEmail: string | null;
  relevanceScore: number;
}

export interface CreatePlan {
  fullName: string;
  jobTitle: string | null;
  roleCategory: ContactRole;
  email: string;
  emailConfidence: number | null;
  provenance: FieldProvenance;
  isPrimary: boolean;
  relevanceScore: number;
}

export type SkipReason =
  | "generic_mailbox"
  | "different_domain"
  | "suppressed"
  | "email_on_another_company"
  | "no_person_name"
  | "below_relevance"
  | "limit_reached"
  | "kept_existing"
  | "data_processing_objection"
  | "no_email_found";

export interface Skip {
  reason: SkipReason;
  detail: string;
}

export interface PlanInput {
  companyDomain: string;
  existing: ExistingContact[];
  /** Normalised emails held by contacts of other companies in the workspace. */
  emailsElsewhere: ReadonlySet<string>;
  isSuppressed: (email: string) => boolean;
  /** Ranked, most relevant first. */
  candidates: Candidate[];
  maxNewContacts: number;
  minRelevance: number;
  sourceId: string | null;
  retrievedAt: string;
}

export interface Plan {
  creates: CreatePlan[];
  updates: UpdatePlan[];
  skips: Skip[];
}

function provenanceEntry(candidate: Candidate, sourceId: string | null, retrievedAt: string, withConfidence: boolean): ProvenanceEntry {
  return {
    source: candidate.origin,
    sourceId,
    ...(withConfidence ? { confidence: candidate.confidence } : {}),
    retrievedAt,
    hunterSources: candidate.hunterSources,
    hunterStatus: candidate.hunterStatus,
  };
}

/** Builds the update for one candidate matched to one existing contact, or null if nothing changes. */
export function planUpdate(existing: ExistingContact, candidate: Candidate, sourceId: string | null, retrievedAt: string): { update: UpdatePlan | null; skip: Skip | null } {
  const provenance: FieldProvenance = { ...existing.provenance };
  const patch: ContactPatch = { field_provenance: provenance };
  const changes: string[] = [];
  let newEmail: string | null = null;

  const emailDecision = decideEmail(existing, candidate);
  if (emailDecision.action !== "keep") {
    if (emailDecision.action !== "refresh") {
      patch.email = normaliseEmail(candidate.email);
      newEmail = patch.email;
      changes.push(emailDecision.action === "set" ? "email added" : "email replaced");
    } else {
      changes.push("email details refreshed");
    }
    patch.email_confidence = candidate.confidence;
    provenance.email = provenanceEntry(candidate, sourceId, retrievedAt, true);
  }

  if (decideJobTitle(existing, candidate.position) === "set" && candidate.position) {
    patch.job_title = candidate.position.trim();
    patch.role_category = candidate.role;
    provenance.job_title = provenanceEntry(candidate, sourceId, retrievedAt, false);
    changes.push("job title added");
  }

  if (changes.length === 0) {
    return { update: null, skip: { reason: "kept_existing", detail: emailDecision.reason } };
  }
  return {
    update: { contactId: existing.id, patch, changes, newEmail, relevanceScore: candidate.relevanceScore },
    skip: emailDecision.action === "keep" ? { reason: "kept_existing", detail: emailDecision.reason } : null,
  };
}

export function planContactChanges(input: PlanInput): Plan {
  const plan: Plan = { creates: [], updates: [], skips: [] };
  const byEmail = new Map(input.existing.filter((c) => c.email).map((c) => [normaliseEmail(c.email!), c]));
  const byName = new Map(input.existing.map((c) => [normaliseName(c.fullName), c]));
  const usedEmails = new Set(byEmail.keys());
  const touched = new Set<string>();
  let hasPrimary = input.existing.some((c) => c.isPrimary);

  for (const candidate of input.candidates) {
    const email = normaliseEmail(candidate.email);
    if (candidate.generic) {
      plan.skips.push({ reason: "generic_mailbox", detail: "Shared mailbox, not a person." });
      continue;
    }
    if (!belongsToDomain(email, input.companyDomain)) {
      plan.skips.push({ reason: "different_domain", detail: "The address is not on the company's domain." });
      continue;
    }
    if (input.isSuppressed(email)) {
      plan.skips.push({ reason: "suppressed", detail: "The address or its domain is on the suppression list." });
      continue;
    }

    const fullName = [candidate.firstName, candidate.lastName].filter((p) => p?.trim()).join(" ").trim();
    const matchedByEmail = byEmail.get(email);
    const match = matchedByEmail ?? (fullName ? byName.get(normaliseName(fullName)) : undefined);

    if (match) {
      if (touched.has(match.id)) continue; // already updated from a more relevant result
      if (!matchedByEmail && input.emailsElsewhere.has(email)) {
        plan.skips.push({ reason: "email_on_another_company", detail: "Another company's contact already holds this address." });
        continue;
      }
      const { update, skip } = planUpdate(match, candidate, input.sourceId, input.retrievedAt);
      if (update) {
        plan.updates.push(update);
        touched.add(match.id);
        if (update.newEmail) usedEmails.add(update.newEmail);
      }
      if (skip) plan.skips.push(skip);
      continue;
    }

    if (input.emailsElsewhere.has(email) || usedEmails.has(email)) {
      plan.skips.push({ reason: "email_on_another_company", detail: "A contact with this address already exists." });
      continue;
    }
    if (!candidate.firstName?.trim() || !candidate.lastName?.trim()) {
      plan.skips.push({ reason: "no_person_name", detail: "Hunter did not return a first and last name." });
      continue;
    }
    if (candidate.relevanceScore < input.minRelevance) {
      plan.skips.push({ reason: "below_relevance", detail: "Not a priority role for outreach." });
      continue;
    }
    if (plan.creates.length >= input.maxNewContacts) {
      plan.skips.push({ reason: "limit_reached", detail: "The per-run limit on new contacts was reached." });
      continue;
    }

    plan.creates.push({
      fullName,
      jobTitle: candidate.position?.trim() || null,
      roleCategory: candidate.role,
      email,
      emailConfidence: candidate.confidence,
      provenance: {
        full_name: provenanceEntry(candidate, input.sourceId, input.retrievedAt, false),
        email: provenanceEntry(candidate, input.sourceId, input.retrievedAt, true),
        ...(candidate.position ? { job_title: provenanceEntry(candidate, input.sourceId, input.retrievedAt, false) } : {}),
      },
      isPrimary: !hasPrimary,
      relevanceScore: candidate.relevanceScore,
    });
    hasPrimary = true;
    usedEmails.add(email);
  }
  return plan;
}

/** Existing contacts that have a usable name but no email: Email Finder targets. */
export function finderTargets(existing: ExistingContact[], excludeIds: ReadonlySet<string>): Array<ExistingContact & { firstName: string; lastName: string }> {
  return existing.flatMap((c) => {
    if (c.email || c.doNotContact || excludeIds.has(c.id)) return [];
    const name = splitName(c.fullName);
    return name ? [{ ...c, ...name }] : [];
  });
}

/** Masks an email for logs and summaries: a***@domain.com. */
export function maskEmail(email: string): string {
  const [local, domain] = normaliseEmail(email).split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}
