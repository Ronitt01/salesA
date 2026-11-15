import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/server/db/database.types";
import { INDUSTRY_CATALOGUE, SERVICE_TEMPLATES, bootstrapWorkspace, type IndustrySlug, type ServiceSlug } from "./bootstrap";
import { generateDemoDataset, type DemoDataset } from "./generate";

type Admin = SupabaseClient<Database>;
type TableName = keyof Database["public"]["Tables"];

export interface SeedSummary {
  companies: number;
  contacts: number;
  buyingSignals: number;
  opportunities: number;
  conversations: number;
  messages: number;
  meetings: number;
  campaigns: number;
  workflowExecutions: number;
  demotedCount: number;
}

/** Tables holding is_demo rows, child tables first so deletes never trip a foreign key. */
const DEMO_TABLES_DELETE_ORDER: TableName[] = [
  "audit_logs",
  "activities",
  "meetings",
  "messages",
  "conversations",
  "campaign_contacts",
  "campaigns",
  "consent_records",
  "suppressions",
  "lead_score_snapshots",
  "opportunities",
  "buying_signals",
  "research_records",
  "contact_verifications",
  "contacts",
  "companies",
  "workflow_executions",
  "industry_experiments",
  "sources",
];

async function insertAll<T extends TableName>(
  admin: Admin,
  table: T,
  rows: Database["public"]["Tables"][T]["Insert"][],
): Promise<void> {
  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    // The generic table name defeats supabase-js's per-table inference, so the
    // rows are passed through as the already-validated Insert type.
    // defaultToNull: false makes columns missing from a row fall back to their
    // database default instead of being sent as NULL in a mixed-shape batch.
    const { error } = await admin.from(table).insert(chunk as never, { defaultToNull: false });
    if (error) throw new Error(`Demo seed failed inserting into ${table}: ${error.message}`);
  }
}

/** Removes every synthetic row for the tenant. Real records are never touched. */
export async function clearDemoData(admin: Admin, tenantId: string): Promise<void> {
  for (const table of DEMO_TABLES_DELETE_ORDER) {
    const { error } = await admin.from(table).delete().eq("tenant_id", tenantId).eq("is_demo", true);
    if (error) throw new Error(`Demo reset failed clearing ${table}: ${error.message}`);
  }
  const { error } = await admin.from("workspaces").update({ has_demo_data: false }).eq("id", tenantId);
  if (error) throw new Error(`Demo reset failed updating workspace: ${error.message}`);
}

async function loadRefs(admin: Admin, tenantId: string) {
  const [industries, services, jobs, workspace] = await Promise.all([
    admin.from("industries").select("id, slug").eq("tenant_id", tenantId),
    admin.from("service_catalogue").select("id, slug").eq("tenant_id", tenantId),
    admin.from("workflow_jobs").select("id, workflow_key").eq("tenant_id", tenantId),
    admin.from("workspaces").select("country").eq("id", tenantId).single(),
  ]);
  if (industries.error) throw new Error(industries.error.message);
  if (services.error) throw new Error(services.error.message);
  if (jobs.error) throw new Error(jobs.error.message);
  if (workspace.error) throw new Error(workspace.error.message);

  const industryMap = Object.fromEntries(industries.data.map((r) => [r.slug, r.id]));
  const serviceMap = Object.fromEntries(services.data.map((r) => [r.slug, r.id]));
  for (const i of INDUSTRY_CATALOGUE) {
    if (!industryMap[i.slug]) throw new Error(`Industry "${i.slug}" is missing; the demo dataset needs the default catalogue.`);
  }
  for (const s of SERVICE_TEMPLATES) {
    if (!serviceMap[s.slug]) throw new Error(`Service "${s.slug}" is missing; the demo dataset needs the default catalogue.`);
  }
  return {
    industries: industryMap as Record<IndustrySlug, string>,
    services: serviceMap as Record<ServiceSlug, string>,
    jobs: Object.fromEntries(jobs.data.map((r) => [r.workflow_key, r.id])),
    targetCountry: workspace.data.country,
  };
}

/**
 * Replaces the tenant's synthetic dataset with a freshly generated one.
 * Safe to run repeatedly: it clears is_demo rows first, then reseeds.
 */
export async function seedDemoData(
  admin: Admin,
  tenantId: string,
  ownerUserId: string,
  now: Date = new Date(),
): Promise<SeedSummary> {
  await bootstrapWorkspace(admin, tenantId);
  await clearDemoData(admin, tenantId);

  const refs = await loadRefs(admin, tenantId);
  const data: DemoDataset = generateDemoDataset({ tenantId, ownerUserId, ...refs }, now);

  // Contacts are inserted contactable, then flagged afterwards, because the database
  // refuses to enrol a do-not-contact person (which is exactly the guard we want).
  const doNotContactIds = data.contacts.filter((c) => c.do_not_contact).map((c) => c.id as string);
  const contacts = data.contacts.map((c) => ({ ...c, do_not_contact: false }));

  await insertAll(admin, "sources", data.sources);
  await insertAll(admin, "industry_experiments", data.industryExperiments);
  await insertAll(admin, "companies", data.companies);
  await insertAll(admin, "contacts", contacts);
  await insertAll(admin, "contact_verifications", data.contactVerifications);
  await insertAll(admin, "research_records", data.researchRecords);
  await insertAll(admin, "buying_signals", data.buyingSignals);
  await insertAll(admin, "opportunities", data.opportunities);
  await insertAll(admin, "lead_score_snapshots", data.leadScoreSnapshots);
  await insertAll(admin, "campaigns", data.campaigns);
  await insertAll(admin, "campaign_contacts", data.campaignContacts);
  await insertAll(admin, "conversations", data.conversations);
  await insertAll(admin, "messages", data.messages);
  await insertAll(admin, "consent_records", data.consentRecords);
  await insertAll(admin, "meetings", data.meetings);
  await insertAll(admin, "activities", data.activities);
  await insertAll(admin, "workflow_executions", data.workflowExecutions);
  await insertAll(admin, "audit_logs", data.auditLogs);
  await insertAll(admin, "suppressions", data.suppressions);

  if (doNotContactIds.length > 0) {
    const { error } = await admin
      .from("contacts")
      .update({ do_not_contact: true })
      .eq("tenant_id", tenantId)
      .in("id", doNotContactIds);
    if (error) throw new Error(`Demo seed failed flagging do-not-contact: ${error.message}`);
  }

  // Reflect the latest execution on each workflow job.
  const latest = new Map<string, { at: string; status: Database["public"]["Enums"]["execution_status"] }>();
  for (const e of data.workflowExecutions) {
    const at = (e.finished_at ?? e.started_at ?? e.queued_at) as string;
    const current = latest.get(e.job_id);
    if (e.status && e.status !== "queued" && (!current || at > current.at)) {
      latest.set(e.job_id, { at, status: e.status });
    }
  }
  for (const [jobId, run] of latest) {
    const { error } = await admin
      .from("workflow_jobs")
      .update({ last_run_at: run.at, last_status: run.status })
      .eq("id", jobId)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(`Demo seed failed updating workflow job: ${error.message}`);
  }

  const { error } = await admin.from("workspaces").update({ has_demo_data: true }).eq("id", tenantId);
  if (error) throw new Error(`Demo seed failed updating workspace: ${error.message}`);

  return {
    companies: data.companies.length,
    contacts: data.contacts.length,
    buyingSignals: data.buyingSignals.length,
    opportunities: data.opportunities.length,
    conversations: data.conversations.length,
    messages: data.messages.length,
    meetings: data.meetings.length,
    campaigns: data.campaigns.length,
    workflowExecutions: data.workflowExecutions.length,
    demotedCount: data.demotedCount,
  };
}
