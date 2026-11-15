import "server-only";
import type { SessionContext } from "@/server/auth/context";

/** Read models for the Companies, Contacts, Opportunities, Campaigns, Conversations and Meetings screens. */

function sanitise(q: string): string {
  return q.replace(/[,()*%\\"':]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

function fail(what: string, message: string): never {
  throw new Error(`Could not load ${what}: ${message}`);
}

export async function listCompanies(ctx: SessionContext, q: string | undefined, industryId: string | undefined) {
  let query = ctx.supabase
    .from("companies")
    .select(
      "id, name, domain, city, state, employee_range, lead_stage, opportunity_score, priority, is_qualified, last_researched_at, is_demo, industries(name), contacts(count), opportunities(stage, estimated_value_inr)",
    )
    .eq("tenant_id", ctx.tenantId)
    .order("name", { ascending: true })
    .limit(500);
  const term = q ? sanitise(q) : "";
  if (term) query = query.or(`name.ilike.%${term}%,domain.ilike.%${term}%,city.ilike.%${term}%`);
  if (industryId) query = query.eq("industry_id", industryId);
  const { data, error } = await query;
  if (error) fail("companies", error.message);
  return data.map((c) => {
    const open = c.opportunities.filter((o) => o.stage !== "won" && o.stage !== "lost");
    return {
      ...c,
      contactCount: c.contacts[0]?.count ?? 0,
      opportunityCount: c.opportunities.length,
      openValue: open.reduce((sum, o) => sum + Number(o.estimated_value_inr ?? 0), 0),
    };
  });
}

export async function listContacts(ctx: SessionContext, q: string | undefined) {
  let query = ctx.supabase
    .from("contacts")
    .select(
      "id, full_name, job_title, role_category, email, phone, is_primary, verification_status, last_verified_at, reliability_score, email_confidence, do_not_contact, is_demo, company_id, companies(name), sources(kind, label)",
    )
    .eq("tenant_id", ctx.tenantId)
    .order("full_name", { ascending: true })
    .limit(500);
  const term = q ? sanitise(q) : "";
  if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,job_title.ilike.%${term}%`);
  const { data, error } = await query;
  if (error) fail("contacts", error.message);
  return data;
}

export async function listOpportunities(ctx: SessionContext) {
  const { data, error } = await ctx.supabase
    .from("opportunities")
    .select(
      "id, title, stage, estimated_value_inr, collected_revenue_inr, delivery_cost_inr, expected_close_date, created_at, won_at, lost_at, lost_reason, is_demo, company_id, companies(name), service_catalogue(name)",
    )
    .eq("tenant_id", ctx.tenantId)
    .order("estimated_value_inr", { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) fail("opportunities", error.message);
  return data;
}

export async function getOpportunityFormOptions(ctx: SessionContext) {
  const [companies, services] = await Promise.all([
    ctx.supabase.from("companies").select("id, name").eq("tenant_id", ctx.tenantId).order("name").limit(500),
    ctx.supabase.from("service_catalogue").select("id, name").eq("tenant_id", ctx.tenantId).eq("is_active", true).order("name"),
  ]);
  if (companies.error) fail("companies", companies.error.message);
  if (services.error) fail("services", services.error.message);
  return { companies: companies.data, services: services.data };
}

export async function listCampaigns(ctx: SessionContext) {
  const [campaigns, enrolments, messages] = await Promise.all([
    ctx.supabase
      .from("campaigns")
      .select("id, name, description, channel, status, sequence, daily_limit, spend_inr, started_at, is_demo, industries(name), service_catalogue(name)")
      .eq("tenant_id", ctx.tenantId)
      .order("started_at", { ascending: false, nullsFirst: false }),
    ctx.supabase.from("campaign_contacts").select("campaign_id, status, stop_reason").eq("tenant_id", ctx.tenantId).limit(5000),
    ctx.supabase
      .from("messages")
      .select("direction, status, intent, company_id, campaign_contacts(campaign_id)")
      .eq("tenant_id", ctx.tenantId)
      .not("campaign_contact_id", "is", null)
      .limit(10000),
  ]);
  if (campaigns.error) fail("campaigns", campaigns.error.message);
  if (enrolments.error) fail("campaign enrolments", enrolments.error.message);
  if (messages.error) fail("campaign messages", messages.error.message);

  const positive = new Set(["interested", "wants_meeting", "wants_pricing", "requests_information"]);
  return campaigns.data.map((c) => {
    const mine = enrolments.data.filter((e) => e.campaign_id === c.id);
    const msgs = messages.data.filter((m) => m.campaign_contacts?.campaign_id === c.id);
    const contacted = new Set(msgs.filter((m) => m.direction === "outbound" && m.status === "sent").map((m) => m.company_id));
    const replied = new Set(msgs.filter((m) => m.direction === "inbound").map((m) => m.company_id));
    const positiveReplied = new Set(
      msgs.filter((m) => m.direction === "inbound" && m.intent && positive.has(m.intent)).map((m) => m.company_id),
    );
    return {
      ...c,
      enrolled: mine.length,
      active: mine.filter((e) => e.status === "active" || e.status === "pending").length,
      stopped: mine.filter((e) => e.status === "stopped").length,
      optedOut: mine.filter((e) => e.stop_reason === "unsubscribed" || e.stop_reason === "opted_out").length,
      pendingApproval: msgs.filter((m) => m.status === "pending_approval").length,
      contacted: contacted.size,
      replied: replied.size,
      positive: positiveReplied.size,
      replyRate: contacted.size === 0 ? null : (replied.size / contacted.size) * 100,
      positiveRate: contacted.size === 0 ? null : (positiveReplied.size / contacted.size) * 100,
    };
  });
}

export async function listConversations(ctx: SessionContext, view: "all" | "approvals" | "review") {
  let query = ctx.supabase
    .from("conversations")
    .select(
      "id, subject, status, last_intent, human_takeover, last_message_at, channel, is_demo, company_id, companies(name), contacts(full_name, do_not_contact), messages(status)",
    )
    .eq("tenant_id", ctx.tenantId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (view === "review") query = query.eq("status", "needs_review");
  const { data, error } = await query;
  if (error) fail("conversations", error.message);
  const rows = data.map((c) => ({
    ...c,
    pendingApproval: c.messages.filter((m) => m.status === "pending_approval").length,
    messageCount: c.messages.length,
  }));
  return view === "approvals" ? rows.filter((c) => c.pendingApproval > 0) : rows;
}

export async function getConversation(ctx: SessionContext, id: string) {
  const { data, error } = await ctx.supabase
    .from("conversations")
    .select(
      "id, subject, status, last_intent, human_takeover, channel, is_demo, company_id, companies(name), contacts(full_name, email, do_not_contact), campaigns(name), messages(id, direction, status, subject, body, intent, intent_confidence, origin, model, sent_at, received_at, created_at, sequence_step, processing_history, gate_result)",
    )
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error) fail("conversation", error.message);
  if (!data) return null;
  return {
    ...data,
    messages: [...data.messages].sort((a, b) => a.created_at.localeCompare(b.created_at)),
  };
}

export async function listMeetings(ctx: SessionContext) {
  const { data, error } = await ctx.supabase
    .from("meetings")
    .select(
      "id, title, status, starts_at, ends_at, host_timezone, prospect_timezone, booked_at, attended_at, slot_selected_by_prospect, outcome_notes, provider, is_demo, company_id, companies(name), contacts(full_name)",
    )
    .eq("tenant_id", ctx.tenantId)
    .order("starts_at", { ascending: false })
    .limit(300);
  if (error) fail("meetings", error.message);
  return data;
}
