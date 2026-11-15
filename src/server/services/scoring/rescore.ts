import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/server/db/database.types";
import { scoreLead, type ScoreResult, type ScoringInput } from "./engine";

type Client = SupabaseClient<Database>;

export class RescoreError extends Error {
  override name = "RescoreError";
}

/**
 * Loads a company's current evidence, runs the deterministic engine and stores the
 * result as a new snapshot. This is the only code path that writes a score.
 *
 * Stage effects are deliberately narrow:
 *   - newly qualified and still pre-outreach  -> stage becomes "qualified"
 *   - no longer qualified while at "qualified" -> stage returns to "verified"
 * Later stages (contacted onwards) are never moved by a rescore.
 */
export async function rescoreCompany(
  client: Client,
  tenantId: string,
  companyId: string,
  now: Date = new Date(),
): Promise<ScoreResult> {
  const [company, workspace, contacts, facts, signals, opportunities] = await Promise.all([
    client
      .from("companies")
      .select("id, country, domain, employee_range, branch_count, lead_stage, qualified_at, verified_at, researched_at, industry_id, industries(is_active)")
      .eq("tenant_id", tenantId)
      .eq("id", companyId)
      .maybeSingle(),
    client.from("workspaces").select("country").eq("id", tenantId).single(),
    client
      .from("contacts")
      .select("id, role_category, verification_status, last_verified_at, email, email_normalised, phone, is_primary, do_not_contact, reliability_score, sources(kind)")
      .eq("tenant_id", tenantId)
      .eq("company_id", companyId)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true }),
    client
      .from("research_records")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("company_id", companyId)
      .eq("kind", "observed_fact")
      .not("evidence_url", "is", null),
    client
      .from("buying_signals")
      .select("observed_at, expires_at, verification_status")
      .eq("tenant_id", tenantId)
      .eq("company_id", companyId),
    client
      .from("opportunities")
      .select("estimated_value_inr, stage, service_catalogue(is_active)")
      .eq("tenant_id", tenantId)
      .eq("company_id", companyId)
      .neq("stage", "lost")
      .order("estimated_value_inr", { ascending: false, nullsFirst: false }),
  ]);

  if (company.error) throw new RescoreError(company.error.message);
  if (!company.data) throw new RescoreError("Company not found.");
  if (workspace.error) throw new RescoreError(workspace.error.message);
  if (contacts.error) throw new RescoreError(contacts.error.message);
  if (facts.error) throw new RescoreError(facts.error.message);
  if (signals.error) throw new RescoreError(signals.error.message);
  if (opportunities.error) throw new RescoreError(opportunities.error.message);

  const primary = contacts.data[0] ?? null;

  let suppressed = false;
  if (primary?.email_normalised) {
    const domain = primary.email_normalised.split("@")[1] ?? "";
    const suppression = await client
      .from("suppressions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .or(`and(address_type.eq.email,address.eq.${primary.email_normalised}),and(address_type.eq.domain,address.eq.${domain})`);
    if (suppression.error) throw new RescoreError(suppression.error.message);
    suppressed = (suppression.count ?? 0) > 0;
  }

  const matched = opportunities.data.find((o) => o.service_catalogue?.is_active);
  const input: ScoringInput = {
    targetCountry: workspace.data.country,
    company: {
      country: company.data.country,
      domain: company.data.domain,
      employeeRange: company.data.employee_range,
      branchCount: company.data.branch_count,
      industryInCatalogue: Boolean(company.data.industries?.is_active),
    },
    observedFactCount: facts.count ?? 0,
    signals: signals.data.map((s) => ({
      observedAt: s.observed_at,
      expiresAt: s.expires_at,
      verification: s.verification_status,
    })),
    contact: primary
      ? {
          role: primary.role_category,
          verificationStatus: primary.verification_status,
          lastVerifiedAt: primary.last_verified_at,
          sourceKind: primary.sources?.kind ?? null,
          email: primary.email,
          hasPhone: Boolean(primary.phone),
          suppressed,
          doNotContact: primary.do_not_contact,
        }
      : null,
    contactCount: contacts.data.length,
    opportunity:
      opportunities.data.length > 0
        ? {
            hasActiveServiceMatch: Boolean(matched),
            estimatedValueInr: (matched ?? opportunities.data[0]).estimated_value_inr,
          }
        : null,
  };

  const result = scoreLead(input, now);
  const nowIso = now.toISOString();

  const snapshot = await client.from("lead_score_snapshots").insert({
    tenant_id: tenantId,
    company_id: companyId,
    contact_id: primary?.id ?? null,
    total_score: result.total,
    icp_fit: result.factors.icpFit.points,
    problem_evidence: result.factors.problemEvidence.points,
    decision_maker_access: result.factors.decisionMakerAccess.points,
    commercial_potential: result.factors.commercialPotential.points,
    timing_signal: result.factors.timingSignal.points,
    delivery_fit: result.factors.deliveryFit.points,
    contact_reliability: result.contactReliability?.score ?? null,
    priority: result.priority,
    is_qualified: result.isQualified,
    disqualification_reasons: result.disqualificationReasons,
    inputs: JSON.parse(JSON.stringify(input)) as { [key: string]: Json | undefined },
    explanations: JSON.parse(
      JSON.stringify({ factors: result.factors, contactReliability: result.contactReliability }),
    ) as { [key: string]: Json | undefined },
    engine_version: result.engineVersion,
    computed_at: nowIso,
  });
  if (snapshot.error) throw new RescoreError(snapshot.error.message);

  const stage = company.data.lead_stage;
  const preOutreach = stage === "discovered" || stage === "researched" || stage === "verified";
  const update: Database["public"]["Tables"]["companies"]["Update"] = {
    opportunity_score: result.total,
    priority: result.priority,
    is_qualified: result.isQualified,
  };
  if (result.isQualified && preOutreach) {
    update.lead_stage = "qualified";
    update.qualified_at = company.data.qualified_at ?? nowIso;
    update.verified_at = company.data.verified_at ?? nowIso;
    update.researched_at = company.data.researched_at ?? nowIso;
  } else if (!result.isQualified && stage === "qualified") {
    update.lead_stage = "verified";
    update.qualified_at = null;
  }

  const updated = await client.from("companies").update(update).eq("tenant_id", tenantId).eq("id", companyId);
  if (updated.error) throw new RescoreError(updated.error.message);

  if (primary && result.contactReliability) {
    const contactUpdate = await client
      .from("contacts")
      .update({ reliability_score: result.contactReliability.score })
      .eq("tenant_id", tenantId)
      .eq("id", primary.id);
    if (contactUpdate.error) throw new RescoreError(contactUpdate.error.message);
  }

  return result;
}
