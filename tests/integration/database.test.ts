import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDemoData } from "@/server/demo/seed";
import { rescoreCompany } from "@/server/services/scoring/rescore";
import { adminClient, anonClient, createTenant, destroyTenant, insertCompany, type TestTenant } from "./helpers";

const admin = adminClient();
let a: TestTenant;
let b: TestTenant;

beforeAll(async () => {
  a = await createTenant(admin, "a", ["owner", "member", "viewer"]);
  b = await createTenant(admin, "b", ["owner"]);
});

afterAll(async () => {
  await destroyTenant(admin, a);
  await destroyTenant(admin, b);
});

describe("row level security: tenant isolation", () => {
  let companyA: string;
  let companyB: string;

  beforeAll(async () => {
    const ca = await insertCompany(a.users.owner.client, a.tenantId, "Tenant A Company", "tenant-a.example");
    const cb = await insertCompany(b.users.owner.client, b.tenantId, "Tenant B Company", "tenant-b.example");
    expect(ca.error).toBeNull();
    expect(cb.error).toBeNull();
    companyA = ca.data!.id;
    companyB = cb.data!.id;
  });

  it("lets a member read their own workspace's companies", async () => {
    const { data, error } = await a.users.member.client.from("companies").select("id");
    expect(error).toBeNull();
    expect(data!.map((r) => r.id)).toContain(companyA);
  });

  it("never returns another tenant's rows, even when asked for by id", async () => {
    const all = await a.users.owner.client.from("companies").select("id, tenant_id");
    expect(all.data!.every((r) => r.tenant_id === a.tenantId)).toBe(true);
    const direct = await a.users.owner.client.from("companies").select("id").eq("id", companyB);
    expect(direct.data).toEqual([]);
    const byTenant = await a.users.owner.client.from("companies").select("id").eq("tenant_id", b.tenantId);
    expect(byTenant.data).toEqual([]);
  });

  it("hides other tenants' workspaces, memberships, contacts and audit logs", async () => {
    const client = a.users.owner.client;
    expect((await client.from("workspaces").select("id")).data!.map((w) => w.id)).toEqual([a.tenantId]);
    expect((await client.from("memberships").select("tenant_id")).data!.every((m) => m.tenant_id === a.tenantId)).toBe(true);
    expect((await client.from("contacts").select("id").eq("tenant_id", b.tenantId)).data).toEqual([]);
    expect((await client.from("audit_logs").select("id").eq("tenant_id", b.tenantId)).data).toEqual([]);
    expect((await client.from("leads_view").select("id").eq("tenant_id", b.tenantId)).data).toEqual([]);
  });

  it("rejects inserting a row into another tenant", async () => {
    const { error } = await insertCompany(a.users.owner.client, b.tenantId, "Planted Company");
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");
  });

  it("cannot update or delete another tenant's row", async () => {
    const update = await a.users.owner.client.from("companies").update({ name: "Hijacked" }).eq("id", companyB).select("id");
    expect(update.data).toEqual([]);
    const del = await a.users.owner.client.from("companies").delete().eq("id", companyB).select("id");
    expect(del.data).toEqual([]);
    const still = await admin.from("companies").select("name").eq("id", companyB).single();
    expect(still.data!.name).toBe("Tenant B Company");
  });

  it("cannot move its own row into another tenant", async () => {
    const { error, data } = await a.users.owner.client.from("companies").update({ tenant_id: b.tenantId }).eq("id", companyA).select("id");
    expect(error !== null || (data ?? []).length === 0).toBe(true);
    const still = await admin.from("companies").select("tenant_id").eq("id", companyA).single();
    expect(still.data!.tenant_id).toBe(a.tenantId);
  });

  it("refuses a contact that points at another tenant's company", async () => {
    const { error } = await a.users.owner.client
      .from("contacts")
      .insert({ tenant_id: a.tenantId, company_id: companyB, full_name: "Cross Tenant" });
    expect(error).not.toBeNull();
    // Composite foreign key (tenant_id, company_id) fails.
    expect(error!.code).toBe("23503");
  });

  it("returns nothing from metric functions for a tenant the caller does not belong to", async () => {
    const args = { p_tenant: b.tenantId, p_from: "2020-01-01T00:00:00Z", p_to: "2100-01-01T00:00:00Z" };
    const funnel = await a.users.owner.client.rpc("dashboard_funnel", args);
    expect(funnel.error).toBeNull();
    expect(funnel.data!.every((r) => Number(r.companies) === 0)).toBe(true);
    const industries = await a.users.owner.client.rpc("industry_performance", args);
    expect(industries.data).toEqual([]);
    const own = await a.users.owner.client.rpc("dashboard_funnel", { ...args, p_tenant: a.tenantId });
    expect(Number(own.data!.find((r) => r.stage === "discovered")!.companies)).toBeGreaterThan(0);
  });

  it("gives an unauthenticated client nothing", async () => {
    const anon = anonClient();
    const read = await anon.from("companies").select("id");
    expect(read.data ?? []).toEqual([]);
    const write = await insertCompany(anon, a.tenantId, "Anonymous Company");
    expect(write.error).not.toBeNull();
    const rpc = await anon.rpc("dashboard_kpis", { p_tenant: a.tenantId, p_from: "2020-01-01T00:00:00Z", p_to: "2100-01-01T00:00:00Z" });
    expect(rpc.error).not.toBeNull();
  });
});

describe("role-based access", () => {
  it("lets a member create working data but not change configuration", async () => {
    const company = await insertCompany(a.users.member.client, a.tenantId, "Member Created");
    expect(company.error).toBeNull();
    const industry = await a.users.member.client.from("industries").insert({ tenant_id: a.tenantId, name: "Member Industry", slug: "member-industry" });
    expect(industry.error!.code).toBe("42501");
    const workspace = await a.users.member.client.from("workspaces").update({ outbound_kill_switch: true }).eq("id", a.tenantId).select("id");
    expect(workspace.data).toEqual([]);
  });

  it("keeps viewers read-only", async () => {
    const read = await a.users.viewer.client.from("companies").select("id");
    expect(read.data!.length).toBeGreaterThan(0);
    const write = await insertCompany(a.users.viewer.client, a.tenantId, "Viewer Created");
    expect(write.error!.code).toBe("42501");
    const update = await a.users.viewer.client.from("companies").update({ name: "Edited" }).eq("tenant_id", a.tenantId).select("id");
    expect(update.data).toEqual([]);
  });

  it("allows only owners and admins to delete, and to change workspace settings", async () => {
    const company = await insertCompany(a.users.owner.client, a.tenantId, "To Be Deleted");
    const byMember = await a.users.member.client.from("companies").delete().eq("id", company.data!.id).select("id");
    expect(byMember.data).toEqual([]);
    const byOwner = await a.users.owner.client.from("companies").delete().eq("id", company.data!.id).select("id");
    expect(byOwner.data).toHaveLength(1);
    const settings = await a.users.owner.client.from("workspaces").update({ daily_send_limit: 12 }).eq("id", a.tenantId).select("daily_send_limit");
    expect(settings.data![0].daily_send_limit).toBe(12);
  });

  it("keeps the audit log append-only", async () => {
    const insert = await a.users.member.client
      .from("audit_logs")
      .insert({ tenant_id: a.tenantId, actor_user_id: a.users.member.id, action: "test.event", entity_type: "test" })
      .select("id")
      .single();
    expect(insert.error).toBeNull();
    const update = await a.users.owner.client.from("audit_logs").update({ action: "tampered" }).eq("id", insert.data!.id).select("id");
    expect(update.error !== null || (update.data ?? []).length === 0).toBe(true);
    const del = await a.users.owner.client.from("audit_logs").delete().eq("id", insert.data!.id).select("id");
    expect(del.error !== null || (del.data ?? []).length === 0).toBe(true);
    const still = await admin.from("audit_logs").select("action").eq("id", insert.data!.id).single();
    expect(still.data!.action).toBe("test.event");
  });

  it("stops a member recording an audit entry in someone else's name", async () => {
    const { error } = await a.users.member.client
      .from("audit_logs")
      .insert({ tenant_id: a.tenantId, actor_user_id: a.users.owner.id, action: "forged", entity_type: "test" });
    expect(error!.code).toBe("42501");
  });
});

describe("duplicate prevention", () => {
  it("normalises domains and refuses a second company with the same one", async () => {
    const first = await insertCompany(a.users.owner.client, a.tenantId, "Dedup One", "https://www.Dedup-Check.example/about");
    expect(first.error).toBeNull();
    expect(first.data!.normalised_domain).toBe("dedup-check.example");
    const second = await insertCompany(a.users.owner.client, a.tenantId, "Dedup Two", "dedup-check.example");
    expect(second.error!.code).toBe("23505");
  });

  it("allows the same domain in a different tenant", async () => {
    const other = await insertCompany(b.users.owner.client, b.tenantId, "Other Tenant Dedup", "dedup-check.example");
    expect(other.error).toBeNull();
  });

  it("refuses a second contact with the same email, ignoring case", async () => {
    const company = await insertCompany(a.users.owner.client, a.tenantId, "Contact Dedup Co", "contact-dedup.example");
    const base = { tenant_id: a.tenantId, company_id: company.data!.id };
    const first = await a.users.owner.client.from("contacts").insert({ ...base, full_name: "First", email: "Person@Contact-Dedup.example" });
    expect(first.error).toBeNull();
    const second = await a.users.owner.client.from("contacts").insert({ ...base, full_name: "Second", email: "person@contact-dedup.example " });
    expect(second.error!.code).toBe("23505");
  });

  it("flags same-name companies as possible duplicates in the lead view", async () => {
    await insertCompany(a.users.owner.client, a.tenantId, "Same Name Traders", "same-name-1.example");
    await insertCompany(a.users.owner.client, a.tenantId, "SAME NAME  TRADERS!", "same-name-2.example");
    const { data } = await a.users.owner.client.from("leads_view").select("company_name, possible_duplicate").ilike("company_name", "same name%");
    expect(data).toHaveLength(2);
    expect(data!.every((r) => r.possible_duplicate)).toBe(true);
  });

  it("refuses two messages with the same idempotency key", async () => {
    const owner = a.users.owner.client;
    const company = await insertCompany(owner, a.tenantId, "Idempotency Co", "idempotency.example");
    const contact = await owner.from("contacts").insert({ tenant_id: a.tenantId, company_id: company.data!.id, full_name: "Idem Potent", email: "idem@idempotency.example" }).select("id").single();
    const conversation = await owner.from("conversations").insert({ tenant_id: a.tenantId, company_id: company.data!.id, contact_id: contact.data!.id }).select("id").single();
    const message = {
      tenant_id: a.tenantId,
      conversation_id: conversation.data!.id,
      company_id: company.data!.id,
      contact_id: contact.data!.id,
      direction: "outbound" as const,
      body: "Hello",
      status: "draft" as const,
      idempotency_key: "enrolment-1:step:0",
    };
    expect((await owner.from("messages").insert(message)).error).toBeNull();
    expect((await owner.from("messages").insert(message)).error!.code).toBe("23505");
  });
});

describe("compliance guards in the database", () => {
  async function prospect(label: string) {
    const owner = a.users.owner.client;
    const company = await insertCompany(owner, a.tenantId, `Compliance ${label}`, `compliance-${label}.example`);
    const contact = await owner
      .from("contacts")
      .insert({ tenant_id: a.tenantId, company_id: company.data!.id, full_name: `Person ${label}`, email: `person@compliance-${label}.example` })
      .select("id")
      .single();
    return { companyId: company.data!.id, contactId: contact.data!.id, email: `person@compliance-${label}.example` };
  }
  async function campaign() {
    const { data, error } = await a.users.owner.client.from("campaigns").insert({ tenant_id: a.tenantId, name: "Test campaign", channel: "email" }).select("id").single();
    if (error) throw error;
    return data.id;
  }
  const enrol = (campaignId: string, p: { companyId: string; contactId: string }) =>
    a.users.owner.client.from("campaign_contacts").insert({ tenant_id: a.tenantId, campaign_id: campaignId, contact_id: p.contactId, company_id: p.companyId }).select("id").single();

  it("blocks an unsubscribed contact from re-entering any campaign", async () => {
    const p = await prospect("unsub");
    const suppression = await a.users.owner.client.from("suppressions").insert({ tenant_id: a.tenantId, address: p.email, reason: "unsubscribe", contact_id: p.contactId });
    expect(suppression.error).toBeNull();
    const first = await enrol(await campaign(), p);
    expect(first.error).not.toBeNull();
    expect(first.error!.message).toMatch(/suppression list/);
    // A brand new campaign makes no difference.
    const second = await enrol(await campaign(), p);
    expect(second.error!.message).toMatch(/suppression list/);
  });

  it("blocks even the service role, so no code path can bypass it", async () => {
    const p = await prospect("service-role");
    await admin.from("suppressions").insert({ tenant_id: a.tenantId, address: p.email, reason: "complaint" });
    const { error } = await admin.from("campaign_contacts").insert({ tenant_id: a.tenantId, campaign_id: await campaign(), contact_id: p.contactId, company_id: p.companyId });
    expect(error!.message).toMatch(/suppression list/);
  });

  it("blocks a do-not-contact person and a suppressed domain", async () => {
    const dnc = await prospect("dnc");
    await a.users.owner.client.from("contacts").update({ do_not_contact: true }).eq("id", dnc.contactId);
    expect((await enrol(await campaign(), dnc)).error!.message).toMatch(/do-not-contact/);

    const domain = await prospect("domain");
    await a.users.owner.client.from("suppressions").insert({ tenant_id: a.tenantId, address_type: "domain", address: "compliance-domain.example", reason: "manual" });
    expect((await enrol(await campaign(), domain)).error!.message).toMatch(/suppression list/);
  });

  it("stops live enrolments and cancels unsent messages the moment a suppression is added", async () => {
    const owner = a.users.owner.client;
    const p = await prospect("live");
    const enrolment = await enrol(await campaign(), p);
    expect(enrolment.error).toBeNull();
    const conversation = await owner.from("conversations").insert({ tenant_id: a.tenantId, company_id: p.companyId, contact_id: p.contactId }).select("id").single();
    const common = { tenant_id: a.tenantId, conversation_id: conversation.data!.id, company_id: p.companyId, contact_id: p.contactId, direction: "outbound" as const, body: "Hi" };
    await owner.from("messages").insert([
      { ...common, status: "sent", idempotency_key: "live:0", sent_at: new Date().toISOString() },
      { ...common, status: "pending_approval", idempotency_key: "live:1" },
      { ...common, status: "scheduled", idempotency_key: "live:2" },
    ]);

    await owner.from("suppressions").insert({ tenant_id: a.tenantId, address: p.email, reason: "unsubscribe" });

    const after = await owner.from("campaign_contacts").select("status, stop_reason, next_send_at").eq("id", enrolment.data!.id).single();
    expect(after.data).toMatchObject({ status: "stopped", stop_reason: "unsubscribed", next_send_at: null });
    const messages = await owner.from("messages").select("status, idempotency_key").eq("conversation_id", conversation.data!.id).order("idempotency_key");
    expect(messages.data!.map((m) => m.status)).toEqual(["sent", "cancelled", "cancelled"]);
  });

  it("requires the prospect to have chosen the slot before a meeting can be booked", async () => {
    const p = await prospect("meeting");
    const base = {
      tenant_id: a.tenantId,
      company_id: p.companyId,
      contact_id: p.contactId,
      title: "Intro call",
      starts_at: "2027-01-10T05:30:00Z",
      ends_at: "2027-01-10T06:00:00Z",
    };
    const proposed = await a.users.owner.client.from("meetings").insert({ ...base, status: "proposed" });
    expect(proposed.error).toBeNull();
    const booked = await a.users.owner.client.from("meetings").insert({ ...base, status: "booked", slot_selected_by_prospect: false });
    expect(booked.error!.code).toBe("23514");
    const chosen = await a.users.owner.client.from("meetings").insert({ ...base, status: "booked", slot_selected_by_prospect: true });
    expect(chosen.error).toBeNull();
  });

  it("refuses an observed fact that has no evidence URL", async () => {
    const p = await prospect("evidence");
    const base = { tenant_id: a.tenantId, company_id: p.companyId, statement: "Has three branches." };
    const withoutEvidence = await a.users.owner.client.from("research_records").insert({ ...base, kind: "observed_fact" });
    expect(withoutEvidence.error!.code).toBe("23514");
    const hypothesis = await a.users.owner.client.from("research_records").insert({ ...base, kind: "ai_hypothesis" });
    expect(hypothesis.error).toBeNull();
    const withEvidence = await a.users.owner.client.from("research_records").insert({ ...base, kind: "observed_fact", evidence_url: "https://compliance-evidence.example/locations" });
    expect(withEvidence.error).toBeNull();
  });
});

describe("scoring against stored records", () => {
  it("stores research, rescores deterministically and only qualifies with evidence and a reliable contact", async () => {
    const owner = a.users.owner.client;
    const industry = await owner.from("industries").select("id").eq("tenant_id", a.tenantId).eq("slug", "logistics").single();
    const service = await owner.from("service_catalogue").select("id").eq("tenant_id", a.tenantId).eq("slug", "crm-implementation").single();
    const source = await owner.from("sources").insert({ tenant_id: a.tenantId, kind: "website", label: "Company website" }).select("id").single();
    const company = await owner
      .from("companies")
      .insert({ tenant_id: a.tenantId, name: "Rescore Logistics", domain: "rescore-logistics.example", industry_id: industry.data!.id, employee_range: "50-99", branch_count: 3 })
      .select("id")
      .single();
    const companyId = company.data!.id;
    const now = new Date();

    const empty = await rescoreCompany(owner, a.tenantId, companyId, now);
    expect(empty.isQualified).toBe(false);
    expect(empty.disqualificationReasons).toContain("No contact identified");

    await owner.from("contacts").insert({
      tenant_id: a.tenantId,
      company_id: companyId,
      full_name: "Owner Person",
      role_category: "owner_founder",
      email: "owner@rescore-logistics.example",
      phone: "+91 00000 50000",
      is_primary: true,
      source_id: source.data!.id,
      verification_status: "valid",
      last_verified_at: now.toISOString(),
    });
    const facts = await owner.from("research_records").insert(
      [1, 2, 3].map((i) => ({
        tenant_id: a.tenantId,
        company_id: companyId,
        kind: "observed_fact" as const,
        statement: `Observed fact ${i}`,
        evidence_url: `https://rescore-logistics.example/page-${i}`,
      })),
    );
    expect(facts.error).toBeNull();
    await owner.from("buying_signals").insert({
      tenant_id: a.tenantId,
      company_id: companyId,
      signal_type: "new_branch",
      evidence_summary: "Announces a new branch.",
      source_url: "https://rescore-logistics.example/announcements",
      source_type: "company_website",
      observed_at: new Date(now.getTime() - 5 * 86_400_000).toISOString(),
      expires_at: new Date(now.getTime() + 85 * 86_400_000).toISOString(),
      confidence: 0.8,
    });
    await owner.from("opportunities").insert({ tenant_id: a.tenantId, company_id: companyId, service_id: service.data!.id, title: "CRM", estimated_value_inr: 400000 });

    const first = await rescoreCompany(owner, a.tenantId, companyId, now);
    const second = await rescoreCompany(owner, a.tenantId, companyId, now);
    expect(second.total).toBe(first.total);
    expect(first.isQualified).toBe(true);
    expect(first.total).toBeGreaterThanOrEqual(65);

    const stored = await owner.from("companies").select("opportunity_score, priority, is_qualified, lead_stage, qualified_at").eq("id", companyId).single();
    expect(stored.data).toMatchObject({ opportunity_score: first.total, priority: first.priority, is_qualified: true, lead_stage: "qualified" });
    expect(stored.data!.qualified_at).not.toBeNull();

    const snapshots = await owner.from("lead_score_snapshots").select("total_score, inputs, explanations").eq("company_id", companyId).order("computed_at", { ascending: false });
    expect(snapshots.data!.length).toBe(3);
    expect(snapshots.data![0].explanations).toHaveProperty("factors.icpFit.lines");

    // Opting out disqualifies on the next rescore and returns the lead to "verified".
    await owner.from("suppressions").insert({ tenant_id: a.tenantId, address: "owner@rescore-logistics.example", reason: "unsubscribe" });
    const suppressed = await rescoreCompany(owner, a.tenantId, companyId, now);
    expect(suppressed.isQualified).toBe(false);
    const demoted = await owner.from("companies").select("is_qualified, lead_stage").eq("id", companyId).single();
    expect(demoted.data).toEqual({ is_qualified: false, lead_stage: "verified" });
  });
});

describe("demo data", () => {
  it("seeds the requested volumes, flags every row, and resets without touching real records", async () => {
    const owner = b.users.owner;
    const real = await insertCompany(owner.client, b.tenantId, "Real Customer Pvt Ltd", "real-customer.example");

    const summary = await seedDemoData(admin, b.tenantId, owner.id);
    expect(summary).toMatchObject({ companies: 50, contacts: 70, buyingSignals: 100, opportunities: 40 });

    const count = async (table: "companies" | "contacts" | "buying_signals" | "opportunities", demo: boolean) =>
      (await owner.client.from(table).select("id", { count: "exact", head: true }).eq("tenant_id", b.tenantId).eq("is_demo", demo)).count;
    expect(await count("companies", true)).toBe(50);
    expect(await count("contacts", true)).toBe(70);
    expect(await count("buying_signals", true)).toBe(100);
    expect(await count("opportunities", true)).toBe(40);

    const kpis = await owner.client.rpc("dashboard_kpis", { p_tenant: b.tenantId, p_from: new Date(Date.now() - 90 * 86_400_000).toISOString(), p_to: new Date().toISOString() });
    const qualified = await owner.client.from("companies").select("id", { count: "exact", head: true }).eq("tenant_id", b.tenantId).eq("is_qualified", true);
    expect((kpis.data as { total_qualified: { value: number } }).total_qualified.value).toBe(qualified.count);

    // Reset is repeatable and leaves real records alone.
    await seedDemoData(admin, b.tenantId, owner.id);
    expect(await count("companies", true)).toBe(50);
    const stillThere = await owner.client.from("companies").select("name, is_demo").eq("id", real.data!.id).single();
    expect(stillThere.data).toEqual({ name: "Real Customer Pvt Ltd", is_demo: false });
  });
});
