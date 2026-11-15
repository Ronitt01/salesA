import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/server/db/database.types";
import { logger } from "@/server/logger";
import { HunterError, type HunterApi, type HunterCredits, type HunterEndpoint } from "@/server/providers/hunter/client";
import type { EmailVerifierResponse } from "@/server/providers/hunter/schemas";
import { rescoreCompany } from "@/server/services/scoring/rescore";
import {
  PROVIDER_SOURCES,
  belongsToDomain,
  decideEmail,
  finderTargets,
  maskEmail,
  normaliseEmail,
  parseProvenance,
  planContactChanges,
  planUpdate,
  type Candidate,
  type CreatePlan,
  type ExistingContact,
  type FieldProvenance,
  type Skip,
  type SkipReason,
  type UpdatePlan,
} from "./merge";
import { checkEnrichmentEligibility, isRecentlyVerified, type EnrichmentPolicy } from "./policy";
import { DEFAULT_RANKING, rankPeople, type RankingConfig } from "./ranking";
import { mapHunterVerification } from "./verification";

/**
 * Contact discovery for one company, and verification of one contact's email.
 *
 * Every Hunter call happens before any database write. If the Domain Search fails,
 * nothing is written. Later per-person failures only affect that person. Each write is
 * self-contained, and an update is re-checked against the contact as it is at write
 * time, so a person's edit made meanwhile is never overwritten.
 *
 * Nothing here contacts anyone. Discovered people are stored as contacts and still go
 * through qualification, the compliance gate and the approval queue like any other.
 */

type Client = SupabaseClient<Database>;
type ContactRow = Database["public"]["Tables"]["contacts"]["Row"];
type JsonObject = { [key: string]: Json | undefined };

export const HUNTER_PROVIDER = "hunter.io";

export interface EnrichmentSummary {
  companyId: string;
  domain: string;
  candidatesFound: number;
  created: number;
  updated: number;
  verified: number;
  findersRun: number;
  skipped: Partial<Record<SkipReason, number>>;
  errors: string[];
  calls: Partial<Record<HunterEndpoint, number>>;
  credits: Record<string, number>;
  contactIds: string[];
}

export type EnrichmentOutcome =
  | { ok: true; summary: EnrichmentSummary }
  | { ok: false; kind: "ineligible" | "provider_error" | "test_key" | "not_found"; reason: string; summary?: EnrichmentSummary };

export interface EnrichOptions {
  actorUserId: string | null;
  policy: EnrichmentPolicy;
  ranking?: RankingConfig;
  force?: boolean;
  now?: Date;
}

const TEST_KEY_REASON =
  "HUNTER_API_KEY is Hunter's test key, which returns fixed dummy data. It is for smoke tests only and cannot be used to enrich records.";

function toExisting(row: ContactRow): ExistingContact {
  return {
    id: row.id,
    fullName: row.full_name,
    jobTitle: row.job_title,
    email: row.email,
    verificationStatus: row.verification_status,
    verificationProvider: row.verification_provider,
    emailConfidence: row.email_confidence,
    provenance: parseProvenance(row.field_provenance),
    doNotContact: row.do_not_contact,
    isPrimary: row.is_primary,
  };
}

class CallTracker {
  readonly calls: Partial<Record<HunterEndpoint, number>> = {};
  readonly credits: Record<string, number> = {};
  record(endpoint: HunterEndpoint, credits: HunterCredits | null) {
    this.calls[endpoint] = (this.calls[endpoint] ?? 0) + 1;
    if (credits?.used) this.credits[credits.unit ?? "credit"] = (this.credits[credits.unit ?? "credit"] ?? 0) + credits.used;
  }
}

/** Errors after which no further paid calls should be attempted in this run. */
function stopsRun(error: HunterError): boolean {
  return error.kind === "quota_exhausted" || error.kind === "account_restricted" || error.kind === "authentication" || error.kind === "configuration";
}

function verificationDetail(result: EmailVerifierResponse["data"], credits: HunterCredits | null): JsonObject {
  return {
    hunter_status: result.status,
    score: result.score,
    checks: {
      regexp: result.regexp,
      gibberish: result.gibberish,
      disposable: result.disposable,
      webmail: result.webmail,
      mx_records: result.mx_records,
      smtp_server: result.smtp_server,
      smtp_check: result.smtp_check,
      accept_all: result.accept_all,
      block: result.block,
    },
    sources_found: result.sources.length,
    credits_used: credits?.used ?? null,
    credits_unit: credits?.unit ?? null,
  } as JsonObject;
}

async function lastEnrichedAt(client: Client, tenantId: string, companyId: string): Promise<string | null> {
  const { data } = await client
    .from("audit_logs")
    .select("created_at")
    .eq("tenant_id", tenantId)
    .eq("entity_type", "company")
    .eq("entity_id", companyId)
    .eq("action", "contacts.enriched")
    .order("created_at", { ascending: false })
    .limit(1);
  return data?.[0]?.created_at ?? null;
}

async function audit(client: Client, tenantId: string, actorUserId: string | null, action: string, entityType: string, entityId: string, detail: JsonObject) {
  const { error } = await client.from("audit_logs").insert({
    tenant_id: tenantId,
    actor_type: actorUserId ? "user" : "system",
    actor_user_id: actorUserId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    detail,
  });
  if (error) logger.error("enrichment", "Could not write audit log", { action, error: error.message });
}

export async function enrichCompanyContacts(
  client: Client,
  tenantId: string,
  companyId: string,
  hunter: HunterApi,
  options: EnrichOptions,
): Promise<EnrichmentOutcome> {
  const now = options.now ?? new Date();
  const ranking = options.ranking ?? DEFAULT_RANKING;
  const policy = options.policy;
  if (hunter.testKey) return { ok: false, kind: "test_key", reason: TEST_KEY_REASON };

  // 1. The company and whether it should be enriched.
  const companyResult = await client
    .from("companies")
    .select("id, name, normalised_domain, lead_stage, researched_at, opportunity_score, is_demo")
    .eq("tenant_id", tenantId)
    .eq("id", companyId)
    .maybeSingle();
  if (companyResult.error) throw new Error(`Could not load the company: ${companyResult.error.message}`);
  const company = companyResult.data;
  if (!company) return { ok: false, kind: "not_found", reason: "The company does not exist." };

  const eligibility = checkEnrichmentEligibility(
    {
      isDemo: company.is_demo,
      domain: company.normalised_domain,
      leadStage: company.lead_stage,
      researchedAt: company.researched_at,
      opportunityScore: company.opportunity_score,
    },
    await lastEnrichedAt(client, tenantId, companyId),
    now,
    policy,
    options.force,
  );
  if (!eligibility.eligible) return { ok: false, kind: "ineligible", reason: eligibility.reason };
  const domain = company.normalised_domain as string;

  const tracker = new CallTracker();
  const summary: EnrichmentSummary = {
    companyId,
    domain,
    candidatesFound: 0,
    created: 0,
    updated: 0,
    verified: 0,
    findersRun: 0,
    skipped: {},
    errors: [],
    calls: tracker.calls,
    credits: tracker.credits,
    contactIds: [],
  };
  const countSkip = (skip: Skip) => {
    summary.skipped[skip.reason] = (summary.skipped[skip.reason] ?? 0) + 1;
  };

  // 2. Domain Search. A failure here ends the run before anything is written.
  let search;
  try {
    search = await hunter.domainSearch({ domain, limit: policy.domainSearchLimit, type: "personal" });
    tracker.record("domain-search", search.meta.credits);
  } catch (error) {
    const failure = error instanceof HunterError ? error : new HunterError("unknown", String(error));
    tracker.record("domain-search", null);
    await audit(client, tenantId, options.actorUserId, "contacts.enrichment_failed", "company", companyId, {
      provider: HUNTER_PROVIDER,
      error_kind: failure.kind,
      calls: tracker.calls,
    } as JsonObject);
    return { ok: false, kind: "provider_error", reason: failure.message, summary };
  }
  if (search.data.data.domain.toLowerCase() !== domain) {
    return { ok: false, kind: "provider_error", reason: "Hunter returned results for a different domain. Nothing was stored.", summary };
  }

  const retrievedAt = search.meta.retrievedAt;
  const ranked = rankPeople(
    search.data.data.emails.map((e) => ({
      email: normaliseEmail(e.value),
      firstName: e.first_name,
      lastName: e.last_name,
      position: e.position ?? e.position_raw,
      seniority: e.seniority,
      department: e.department,
      decisionMaker: e.decision_maker,
      confidence: e.confidence,
      hunterSources: e.sources.length,
      hunterStatus: e.verification?.status ?? null,
      generic: e.type === "generic",
    })),
    ranking,
  );
  summary.candidatesFound = ranked.length;
  const candidates: Candidate[] = ranked.map((p) => ({
    email: p.email,
    firstName: p.firstName,
    lastName: p.lastName,
    position: p.position,
    confidence: p.confidence,
    hunterSources: p.hunterSources,
    hunterStatus: p.hunterStatus,
    origin: PROVIDER_SOURCES.domainSearch,
    role: p.relevance.role,
    relevanceScore: p.relevance.score,
    generic: p.generic,
  }));

  // 3. Existing contacts, addresses held elsewhere, and suppressions.
  const [existingResult, elsewhereResult, suppressionResult] = await Promise.all([
    client.from("contacts").select("*").eq("tenant_id", tenantId).eq("company_id", companyId),
    candidates.length
      ? client.from("contacts").select("email_normalised, company_id").eq("tenant_id", tenantId).in("email_normalised", candidates.map((c) => c.email))
      : Promise.resolve({ data: [], error: null }),
    client.from("suppressions").select("address, address_type").eq("tenant_id", tenantId).or(`address_type.eq.domain,address_type.eq.email`),
  ]);
  for (const r of [existingResult, elsewhereResult, suppressionResult]) if (r.error) throw new Error(`Could not load contacts: ${r.error.message}`);
  const existingRows = existingResult.data ?? [];
  const existing = existingRows.map(toExisting);
  const emailsElsewhere = new Set(
    (elsewhereResult.data ?? []).filter((r) => r.company_id !== companyId && r.email_normalised).map((r) => r.email_normalised as string),
  );
  const suppressedEmails = new Set((suppressionResult.data ?? []).filter((s) => s.address_type === "email").map((s) => s.address));
  const suppressedDomains = new Set((suppressionResult.data ?? []).filter((s) => s.address_type === "domain").map((s) => s.address));
  const isSuppressed = (email: string) => suppressedEmails.has(normaliseEmail(email)) || [...suppressedDomains].some((d) => belongsToDomain(email, d));

  // 4. Plan creates and updates from the Domain Search.
  const plan = planContactChanges({
    companyDomain: domain,
    existing,
    emailsElsewhere,
    isSuppressed,
    candidates,
    maxNewContacts: policy.maxNewContacts,
    minRelevance: ranking.minRelevance,
    sourceId: null,
    retrievedAt,
  });
  plan.skips.forEach(countSkip);
  let stopped = false;

  // 5. Email Finder, only for known people without an address.
  const updatedIds = new Set(plan.updates.map((u) => u.contactId));
  for (const target of finderTargets(existing, updatedIds).slice(0, policy.maxFinderCallsPerRun)) {
    if (stopped) break;
    try {
      const found = await hunter.emailFinder({ domain, firstName: target.firstName, lastName: target.lastName });
      tracker.record("email-finder", found.meta.credits);
      summary.findersRun += 1;
      const email = found.data.data.email ? normaliseEmail(found.data.data.email) : null;
      if (!email) {
        countSkip({ reason: "no_email_found", detail: "Hunter found no address for this person." });
        continue;
      }
      if (!belongsToDomain(email, domain)) {
        countSkip({ reason: "different_domain", detail: "The address is not on the company's domain." });
        continue;
      }
      if (isSuppressed(email)) {
        countSkip({ reason: "suppressed", detail: "The address is on the suppression list." });
        continue;
      }
      if (emailsElsewhere.has(email) || plan.creates.some((c) => c.email === email)) {
        countSkip({ reason: "email_on_another_company", detail: "A contact with this address already exists." });
        continue;
      }
      const { update } = planUpdate(
        target,
        {
          email,
          firstName: target.firstName,
          lastName: target.lastName,
          position: found.data.data.position,
          confidence: found.data.data.score,
          hunterSources: found.data.data.sources.length,
          hunterStatus: found.data.data.verification?.status ?? null,
          origin: PROVIDER_SOURCES.emailFinder,
          role: "other",
          relevanceScore: 0,
          generic: false,
        },
        null,
        found.meta.retrievedAt,
      );
      if (update) {
        // A finder result never changes the person's role from their title alone.
        delete update.patch.role_category;
        plan.updates.push(update);
      }
    } catch (error) {
      tracker.record("email-finder", null);
      if (!(error instanceof HunterError)) throw error;
      if (error.kind === "data_processing_objection") countSkip({ reason: "data_processing_objection", detail: error.message });
      else if (error.kind === "not_found") countSkip({ reason: "no_email_found", detail: error.message });
      else summary.errors.push(`Email Finder: ${error.message}`);
      if (stopsRun(error)) stopped = true;
    }
  }

  // 6. Email Verifier on the addresses this run will store.
  const verifications = new Map<string, { data: EmailVerifierResponse["data"]; credits: HunterCredits | null }>();
  const objections = new Set<string>();
  const targets = [
    ...plan.creates.map((c) => ({ email: c.email, score: c.relevanceScore })),
    ...plan.updates.filter((u) => u.newEmail).map((u) => ({ email: u.newEmail as string, score: u.relevanceScore })),
  ]
    .sort((a, b) => b.score - a.score)
    .slice(0, policy.maxVerificationsPerRun);
  for (const target of targets) {
    if (stopped) break;
    try {
      const result = await hunter.emailVerifier({ email: target.email });
      tracker.record("email-verifier", result.meta.credits);
      if (normaliseEmail(result.data.data.email) === target.email) verifications.set(target.email, { data: result.data.data, credits: result.meta.credits });
    } catch (error) {
      tracker.record("email-verifier", null);
      if (!(error instanceof HunterError)) throw error;
      if (error.kind === "data_processing_objection") {
        objections.add(target.email);
        countSkip({ reason: "data_processing_objection", detail: error.message });
      } else {
        summary.errors.push(`Email Verifier (${maskEmail(target.email)}): ${error.message}`);
      }
      if (stopsRun(error)) stopped = true;
    }
  }

  // 7. Writes. First a source row describing this run, for provenance.
  const source = await client
    .from("sources")
    .insert({
      tenant_id: tenantId,
      kind: "search_provider",
      provider: HUNTER_PROVIDER,
      label: "Hunter.io domain search",
      query: domain,
      retrieved_at: retrievedAt,
      metadata: {
        endpoints: tracker.calls,
        credits: tracker.credits,
        results: search.data.data.emails.length,
        organization: search.data.data.organization,
        pattern: search.data.data.pattern,
        accept_all_domain: search.data.data.accept_all,
      } as JsonObject,
    })
    .select("id")
    .single();
  if (source.error) throw new Error(`Could not record the enrichment source: ${source.error.message}`);
  const sourceId = source.data.id;
  const withSource = (provenance: FieldProvenance): FieldProvenance =>
    Object.fromEntries(Object.entries(provenance).map(([k, v]) => [k, v && v.source.startsWith("hunter.io:") && !v.sourceId ? { ...v, sourceId } : v]));

  const verificationRows: Database["public"]["Tables"]["contact_verifications"]["Insert"][] = [];
  const nowIso = now.toISOString();
  const verificationFields = (email: string, current: { verificationProvider: string | null }) => {
    const v = verifications.get(email);
    if (!v || current.verificationProvider === "manual") return {};
    return { verification_status: mapHunterVerification(v.data.status), verification_provider: HUNTER_PROVIDER, last_verified_at: nowIso };
  };

  for (const create of plan.creates as CreatePlan[]) {
    if (objections.has(create.email)) continue;
    const v = verifications.get(create.email);
    const provenance = withSource(create.provenance);
    if (v) provenance.verification = { source: PROVIDER_SOURCES.emailVerifier, sourceId, retrievedAt: nowIso, hunterStatus: v.data.status };
    const inserted = await client
      .from("contacts")
      .insert({
        tenant_id: tenantId,
        company_id: companyId,
        full_name: create.fullName,
        job_title: create.jobTitle,
        role_category: create.roleCategory,
        email: create.email,
        email_confidence: create.emailConfidence,
        is_primary: create.isPrimary,
        source_id: sourceId,
        provenance_note: "Discovered by Hunter.io domain search.",
        field_provenance: provenance as JsonObject,
        ...verificationFields(create.email, { verificationProvider: null }),
      })
      .select("id")
      .single();
    if (inserted.error) {
      if (inserted.error.code === "23505") countSkip({ reason: "email_on_another_company", detail: "A contact with this address was added meanwhile." });
      else summary.errors.push(`Could not add a contact: ${inserted.error.message}`);
      continue;
    }
    summary.created += 1;
    summary.contactIds.push(inserted.data.id);
    if (v) verificationRows.push({ tenant_id: tenantId, contact_id: inserted.data.id, provider: HUNTER_PROVIDER, result: mapHunterVerification(v.data.status), detail: verificationDetail(v.data, v.credits), checked_at: nowIso });
  }

  for (const update of plan.updates as UpdatePlan[]) {
    if (update.newEmail && objections.has(update.newEmail)) continue;
    // Re-check against the contact as it is now, so concurrent manual edits win.
    const fresh = await client.from("contacts").select("*").eq("tenant_id", tenantId).eq("id", update.contactId).maybeSingle();
    if (fresh.error || !fresh.data) continue;
    const current = toExisting(fresh.data);
    if (update.newEmail) {
      const decision = decideEmail(current, { email: update.newEmail, confidence: update.patch.email_confidence ?? null });
      if (decision.action === "keep") {
        countSkip({ reason: "kept_existing", detail: decision.reason });
        continue;
      }
    }
    const provenance = withSource({ ...current.provenance, ...update.patch.field_provenance });
    const emailForVerification = update.newEmail ?? current.email;
    const v = update.newEmail ? verifications.get(update.newEmail) : undefined;
    if (v && current.verificationProvider !== "manual") {
      provenance.verification = { source: PROVIDER_SOURCES.emailVerifier, sourceId, retrievedAt: nowIso, hunterStatus: v.data.status };
    }
    const { field_provenance: _ignored, ...patch } = update.patch;
    void _ignored;
    const saved = await client
      .from("contacts")
      .update({
        ...patch,
        field_provenance: provenance as JsonObject,
        // A replaced address loses the old address's verification until it is verified.
        ...(update.newEmail && current.email && current.verificationProvider !== "manual"
          ? { verification_status: "unverified" as const, last_verified_at: null }
          : {}),
        ...(emailForVerification ? verificationFields(normaliseEmail(emailForVerification), current) : {}),
      })
      .eq("tenant_id", tenantId)
      .eq("id", update.contactId);
    if (saved.error) {
      if (saved.error.code === "23505") countSkip({ reason: "email_on_another_company", detail: "Another contact holds this address." });
      else summary.errors.push(`Could not update a contact: ${saved.error.message}`);
      continue;
    }
    summary.updated += 1;
    summary.contactIds.push(update.contactId);
    if (v) verificationRows.push({ tenant_id: tenantId, contact_id: update.contactId, provider: HUNTER_PROVIDER, result: mapHunterVerification(v.data.status), detail: verificationDetail(v.data, v.credits), checked_at: nowIso });
  }

  if (verificationRows.length) {
    const { error } = await client.from("contact_verifications").insert(verificationRows);
    if (error) summary.errors.push(`Could not store verification history: ${error.message}`);
    else summary.verified = verificationRows.length;
  }

  const description = `${summary.created} added, ${summary.updated} updated, ${summary.verified} verified`;
  await client.from("activities").insert({
    tenant_id: tenantId,
    company_id: companyId,
    actor_type: options.actorUserId ? "user" : "system",
    actor_user_id: options.actorUserId,
    type: "research",
    title: `Contact enrichment (Hunter.io): ${description}`,
    metadata: { source_id: sourceId, calls: tracker.calls, credits: tracker.credits } as JsonObject,
  });
  await audit(client, tenantId, options.actorUserId, "contacts.enriched", "company", companyId, {
    provider: HUNTER_PROVIDER,
    source_id: sourceId,
    created: summary.created,
    updated: summary.updated,
    verified: summary.verified,
    finders_run: summary.findersRun,
    skipped: summary.skipped,
    errors: summary.errors.length,
    calls: tracker.calls,
    credits: tracker.credits,
  } as JsonObject);

  if (summary.created + summary.updated > 0) await rescoreCompany(client, tenantId, companyId, now);
  logger.info("enrichment", "Contact enrichment finished", {
    tenantId,
    companyId,
    created: summary.created,
    updated: summary.updated,
    verified: summary.verified,
    errors: summary.errors.length,
    calls: tracker.calls,
    credits: tracker.credits,
  });
  return { ok: true, summary };
}

export type VerificationOutcome =
  | { ok: true; cached: boolean; status: Database["public"]["Enums"]["verification_status"]; hunterStatus: string | null; manualPreserved: boolean }
  | { ok: false; kind: "ineligible" | "provider_error" | "test_key" | "not_found"; reason: string };

export async function verifyContactEmail(
  client: Client,
  tenantId: string,
  contactId: string,
  hunter: HunterApi,
  options: EnrichOptions,
): Promise<VerificationOutcome> {
  const now = options.now ?? new Date();
  if (hunter.testKey) return { ok: false, kind: "test_key", reason: TEST_KEY_REASON };

  const found = await client
    .from("contacts")
    .select("*, companies(id, is_demo)")
    .eq("tenant_id", tenantId)
    .eq("id", contactId)
    .maybeSingle();
  if (found.error) throw new Error(`Could not load the contact: ${found.error.message}`);
  const contact = found.data;
  if (!contact) return { ok: false, kind: "not_found", reason: "The contact does not exist." };
  if (contact.is_demo || contact.companies?.is_demo) {
    return { ok: false, kind: "ineligible", reason: "This is a synthetic demo contact. Verification is disabled so no credits are spent on fictional data." };
  }
  if (!contact.email_normalised) return { ok: false, kind: "ineligible", reason: "The contact has no email address to verify." };

  if (!options.force && isRecentlyVerified({ lastVerifiedAt: contact.last_verified_at, verificationProvider: contact.verification_provider }, now, options.policy)) {
    const latest = await client
      .from("contact_verifications")
      .select("detail")
      .eq("tenant_id", tenantId)
      .eq("contact_id", contactId)
      .order("checked_at", { ascending: false })
      .limit(1);
    const detail = latest.data?.[0]?.detail as { hunter_status?: string } | undefined;
    return { ok: true, cached: true, status: contact.verification_status, hunterStatus: detail?.hunter_status ?? null, manualPreserved: false };
  }

  let result;
  try {
    result = await hunter.emailVerifier({ email: contact.email_normalised });
  } catch (error) {
    const failure = error instanceof HunterError ? error : new HunterError("unknown", String(error));
    await audit(client, tenantId, options.actorUserId, "contact.email_verification_failed", "contact", contactId, {
      provider: HUNTER_PROVIDER,
      error_kind: failure.kind,
    } as JsonObject);
    return { ok: false, kind: "provider_error", reason: failure.message };
  }
  if (normaliseEmail(result.data.data.email) !== contact.email_normalised) {
    return { ok: false, kind: "provider_error", reason: "Hunter verified a different address than the one requested. Nothing was stored." };
  }

  const hunterStatus = result.data.data.status;
  const mapped = mapHunterVerification(hunterStatus);
  const nowIso = now.toISOString();
  const manualPreserved = contact.verification_provider === "manual";

  const history = await client.from("contact_verifications").insert({
    tenant_id: tenantId,
    contact_id: contactId,
    provider: HUNTER_PROVIDER,
    result: mapped,
    detail: verificationDetail(result.data.data, result.meta.credits),
    checked_at: nowIso,
  });
  if (history.error) throw new Error(`Could not store the verification: ${history.error.message}`);

  if (!manualPreserved) {
    const provenance = parseProvenance(contact.field_provenance);
    provenance.verification = { source: PROVIDER_SOURCES.emailVerifier, retrievedAt: nowIso, hunterStatus };
    const saved = await client
      .from("contacts")
      .update({ verification_status: mapped, verification_provider: HUNTER_PROVIDER, last_verified_at: nowIso, field_provenance: provenance as JsonObject })
      .eq("tenant_id", tenantId)
      .eq("id", contactId);
    if (saved.error) throw new Error(`Could not update the contact: ${saved.error.message}`);
  }

  await audit(client, tenantId, options.actorUserId, "contact.email_verified", "contact", contactId, {
    provider: HUNTER_PROVIDER,
    hunter_status: hunterStatus,
    result: mapped,
    manual_preserved: manualPreserved,
    credits_used: result.meta.credits.used,
    credits_unit: result.meta.credits.unit,
  } as JsonObject);
  if (!manualPreserved && contact.company_id) await rescoreCompany(client, tenantId, contact.company_id, now);
  return { ok: true, cached: false, status: manualPreserved ? contact.verification_status : mapped, hunterStatus, manualPreserved };
}
