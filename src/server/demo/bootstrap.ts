import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/server/db/database.types";

/**
 * Workspace bootstrap: the configuration every new workspace starts with.
 * This is real configuration, not demo data, so it is NOT flagged is_demo and
 * survives a demo reset. All inserts are idempotent.
 */

type Admin = SupabaseClient<Database>;
type Insert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"];

export const INDUSTRY_CATALOGUE = [
  { slug: "manufacturing", name: "Manufacturing" },
  { slug: "wholesale-distribution", name: "Wholesale and distribution" },
  { slug: "logistics", name: "Logistics" },
  { slug: "real-estate", name: "Real estate" },
  { slug: "healthcare", name: "Healthcare businesses" },
  { slug: "education", name: "Education businesses" },
  { slug: "ecommerce-d2c", name: "E-commerce and D2C" },
  { slug: "professional-services", name: "Professional services" },
  { slug: "hospitality", name: "Hospitality" },
] as const;

export type IndustrySlug = (typeof INDUSTRY_CATALOGUE)[number]["slug"];

/**
 * Service catalogue templates. Commercial figures are PLACEHOLDERS so the product
 * is usable on day one; each row is flagged needs_review until the agency confirms it.
 */
export const SERVICE_TEMPLATES = [
  {
    slug: "crm-implementation",
    name: "CRM development and implementation",
    description: "A central CRM for enquiries, follow-ups and pipeline visibility across teams and branches.",
    ideal_customer_profile: "Businesses with a sales or enquiry team spread across people or locations.",
    problems_solved: [
      "Enquiries tracked in spreadsheets, notebooks or personal phones",
      "No shared view of follow-ups across branches",
      "Leads lost between first call and quotation",
    ],
    deliverables: ["Process mapping", "CRM configuration", "Data migration", "User training", "Reporting dashboards"],
    price_min_inr: 250000,
    price_max_inr: 900000,
    delivery_weeks_min: 4,
    delivery_weeks_max: 10,
    est_implementation_cost_inr: 150000,
    recurring_support_options: ["Monthly support retainer", "Quarterly optimisation review"],
  },
  {
    slug: "workflow-automation",
    name: "n8n workflow automation",
    description: "Automated hand-offs between the tools a business already uses, built on n8n.",
    ideal_customer_profile: "Teams repeating the same data entry or status updates between systems every day.",
    problems_solved: ["Manual copying between systems", "Slow order or enquiry hand-offs", "Missed internal notifications"],
    deliverables: ["Workflow audit", "n8n workflows", "Monitoring and alerting", "Handover documentation"],
    price_min_inr: 80000,
    price_max_inr: 400000,
    delivery_weeks_min: 2,
    delivery_weeks_max: 6,
    est_implementation_cost_inr: 50000,
    recurring_support_options: ["Workflow monitoring retainer"],
  },
  {
    slug: "whatsapp-ai-agent",
    name: "WhatsApp AI agent",
    description: "An assistant on the WhatsApp Business Platform for customers who message the business.",
    ideal_customer_profile: "Businesses already receiving a high volume of inbound WhatsApp enquiries.",
    problems_solved: ["Slow replies to inbound enquiries", "Repetitive questions handled by staff", "After-hours enquiries unanswered"],
    deliverables: ["Conversation design", "WhatsApp Business Platform setup", "Knowledge base", "Human handover flow"],
    price_min_inr: 120000,
    price_max_inr: 450000,
    delivery_weeks_min: 3,
    delivery_weeks_max: 7,
    est_implementation_cost_inr: 70000,
    recurring_support_options: ["Monthly conversation review", "Knowledge base updates"],
  },
  {
    slug: "ai-voice-agent",
    name: "AI voice calling agent",
    description: "A voice agent for inbound calls and permitted callbacks.",
    ideal_customer_profile: "Businesses with a busy reception or support line and predictable call types.",
    problems_solved: ["Missed inbound calls", "Appointment and status calls consuming staff time"],
    deliverables: ["Call flow design", "Telephony integration", "Call summaries into CRM", "Escalation rules"],
    price_min_inr: 180000,
    price_max_inr: 600000,
    delivery_weeks_min: 4,
    delivery_weeks_max: 8,
    est_implementation_cost_inr: 110000,
    recurring_support_options: ["Usage-based support", "Monthly call quality review"],
  },
  {
    slug: "website-development",
    name: "Website development",
    description: "A fast, credible business website with enquiry capture.",
    ideal_customer_profile: "Businesses whose site is dated, slow or does not capture enquiries.",
    problems_solved: ["Outdated web presence", "No structured enquiry capture", "Poor mobile experience"],
    deliverables: ["Design", "Development", "Enquiry forms", "Analytics setup"],
    price_min_inr: 60000,
    price_max_inr: 350000,
    delivery_weeks_min: 2,
    delivery_weeks_max: 6,
    est_implementation_cost_inr: 40000,
    recurring_support_options: ["Hosting and maintenance plan"],
  },
  {
    slug: "app-development",
    name: "Mobile and web application development",
    description: "Custom applications for customers, field teams or internal operations.",
    ideal_customer_profile: "Businesses with a process that off-the-shelf software does not fit.",
    problems_solved: ["Field teams reporting on paper or chat", "Customers lacking self-service"],
    deliverables: ["Discovery", "UX design", "Application build", "Release and support"],
    price_min_inr: 400000,
    price_max_inr: 2000000,
    delivery_weeks_min: 8,
    delivery_weeks_max: 20,
    est_implementation_cost_inr: 260000,
    recurring_support_options: ["Maintenance retainer", "Feature roadmap retainer"],
  },
  {
    slug: "erp-implementation",
    name: "ERP systems",
    description: "Inventory, purchasing, production and accounts in one system.",
    ideal_customer_profile: "Manufacturers and distributors that have outgrown spreadsheets and standalone accounting software.",
    problems_solved: ["Stock mismatches between locations", "No link between orders, stock and accounts"],
    deliverables: ["Requirement study", "ERP configuration", "Data migration", "Training", "Go-live support"],
    price_min_inr: 600000,
    price_max_inr: 2500000,
    delivery_weeks_min: 10,
    delivery_weeks_max: 24,
    est_implementation_cost_inr: 400000,
    recurring_support_options: ["Annual maintenance contract"],
  },
  {
    slug: "process-reporting-automation",
    name: "Business process and reporting automation",
    description: "Automated data entry, consolidation and management reporting.",
    ideal_customer_profile: "Teams compiling the same reports by hand every week or month.",
    problems_solved: ["Hours spent on manual data entry", "Reports that arrive late or disagree"],
    deliverables: ["Process review", "Automated data pipelines", "Dashboards", "Scheduled reports"],
    price_min_inr: 100000,
    price_max_inr: 500000,
    delivery_weeks_min: 3,
    delivery_weeks_max: 8,
    est_implementation_cost_inr: 60000,
    recurring_support_options: ["Reporting support retainer"],
  },
  {
    slug: "custom-integrations",
    name: "Custom software and integrations",
    description: "Integrations between existing systems and bespoke tools around them, including Telegram agents.",
    ideal_customer_profile: "Businesses running several systems that do not talk to each other.",
    problems_solved: ["Disconnected systems", "Duplicate data entry across tools"],
    deliverables: ["Integration design", "API development", "Testing", "Documentation"],
    price_min_inr: 150000,
    price_max_inr: 800000,
    delivery_weeks_min: 3,
    delivery_weeks_max: 12,
    est_implementation_cost_inr: 90000,
    recurring_support_options: ["Integration monitoring retainer"],
  },
] as const;

export type ServiceSlug = (typeof SERVICE_TEMPLATES)[number]["slug"];

/**
 * Conservative starting policies for India. They encode HUNTER's own operating
 * rules; they are not legal advice. An admin must review them before live use.
 * A (country, channel) pair with no row blocks outbound entirely.
 */
export const INDIA_CHANNEL_POLICIES: Array<
  Pick<
    Insert<"channel_policies">,
    | "channel"
    | "outbound_allowed"
    | "automation_allowed"
    | "requires_consent"
    | "requires_inbound_initiation"
    | "daily_limit"
    | "notes"
  >
> = [
  {
    channel: "email",
    outbound_allowed: true,
    automation_allowed: true,
    requires_consent: false,
    requires_inbound_initiation: false,
    daily_limit: 30,
    notes:
      "Individualised business email to a role-relevant contact at a business address. Every message identifies the sender and carries a working opt-out. Suppressed addresses are never contacted.",
  },
  {
    channel: "linkedin",
    outbound_allowed: true,
    automation_allowed: false,
    requires_consent: false,
    requires_inbound_initiation: false,
    daily_limit: 0,
    notes: "Human-led activity only. HUNTER prepares notes for a person to use and never automates or scrapes LinkedIn.",
  },
  {
    channel: "whatsapp",
    outbound_allowed: true,
    automation_allowed: false,
    requires_consent: true,
    requires_inbound_initiation: false,
    daily_limit: 0,
    notes:
      "Only contacts with a recorded opt-in. Never message scraped numbers. Requires an approved WhatsApp Business Platform setup before automation can be enabled.",
  },
  {
    channel: "telegram",
    outbound_allowed: true,
    automation_allowed: false,
    requires_consent: false,
    requires_inbound_initiation: true,
    daily_limit: 0,
    notes: "Bots may only message users who started the conversation.",
  },
  {
    channel: "voice",
    outbound_allowed: false,
    automation_allowed: false,
    requires_consent: true,
    requires_inbound_initiation: false,
    daily_limit: 0,
    notes: "Blocked until a compliant business telephony setup is configured. Inbound calls and requested callbacks only.",
  },
  {
    channel: "referral",
    outbound_allowed: true,
    automation_allowed: false,
    requires_consent: false,
    requires_inbound_initiation: false,
    daily_limit: 0,
    notes: "Introductions are made by a person.",
  },
  {
    channel: "inbound",
    outbound_allowed: true,
    automation_allowed: true,
    requires_consent: false,
    requires_inbound_initiation: true,
    daily_limit: 100,
    notes: "Replies to enquiries the prospect submitted themselves.",
  },
];

export const WORKFLOW_DEFINITIONS = [
  {
    workflow_key: "WF-01",
    name: "Company Discovery",
    description: "Generates search queries per industry and geography, collects candidates, deduplicates and creates company records.",
    schedule_cron: "0 6 * * 1-6",
  },
  {
    workflow_key: "WF-02",
    name: "Company Research and Signal Detection",
    description: "Reads permitted public pages, records observed facts with evidence and detects buying signals.",
    schedule_cron: "30 6 * * 1-6",
  },
  {
    workflow_key: "WF-03",
    name: "Contact Verification and Qualification",
    description: "Verifies contact details, computes contact reliability and runs the deterministic scoring engine.",
    schedule_cron: "0 7 * * 1-6",
  },
  {
    workflow_key: "WF-04",
    name: "Opportunity and Outreach Draft Generation",
    description: "Matches evidenced problems to services and drafts outreach for human approval.",
    schedule_cron: "30 7 * * 1-6",
  },
  {
    workflow_key: "WF-05",
    name: "Incoming Reply Processing",
    description: "Classifies replies, stops sequences, applies opt-outs and drafts responses.",
    schedule_cron: "*/30 * * * *",
  },
  {
    workflow_key: "WF-06",
    name: "Meeting Scheduling and CRM Update",
    description: "Proposes slots, records bookings the prospect selects and updates the activity history.",
    schedule_cron: "0 * * * *",
  },
] as const;

const PROVIDER_CATEGORIES: Database["public"]["Enums"]["provider_category"][] = [
  "llm",
  "search",
  "discovery",
  "website_research",
  "enrichment",
  "email_verification",
  "email_delivery",
  "calendar",
  "n8n",
];

function fail(step: string, message: string): never {
  throw new Error(`Workspace bootstrap failed at ${step}: ${message}`);
}

export async function bootstrapWorkspace(admin: Admin, tenantId: string): Promise<void> {
  const industries = INDUSTRY_CATALOGUE.map((i) => ({ tenant_id: tenantId, slug: i.slug, name: i.name }));
  const r1 = await admin.from("industries").upsert(industries, { onConflict: "tenant_id,slug", ignoreDuplicates: true });
  if (r1.error) fail("industries", r1.error.message);

  const services = SERVICE_TEMPLATES.map((s) => ({
    tenant_id: tenantId,
    slug: s.slug,
    name: s.name,
    description: s.description,
    ideal_customer_profile: s.ideal_customer_profile,
    problems_solved: [...s.problems_solved],
    deliverables: [...s.deliverables],
    price_min_inr: s.price_min_inr,
    price_max_inr: s.price_max_inr,
    delivery_weeks_min: s.delivery_weeks_min,
    delivery_weeks_max: s.delivery_weeks_max,
    est_implementation_cost_inr: s.est_implementation_cost_inr,
    recurring_support_options: [...s.recurring_support_options],
    needs_review: true,
  }));
  const r2 = await admin
    .from("service_catalogue")
    .upsert(services, { onConflict: "tenant_id,slug", ignoreDuplicates: true });
  if (r2.error) fail("service_catalogue", r2.error.message);

  const policies = INDIA_CHANNEL_POLICIES.map((p) => ({ ...p, tenant_id: tenantId, country: "IN" }));
  const r3 = await admin
    .from("channel_policies")
    .upsert(policies, { onConflict: "tenant_id,country,channel", ignoreDuplicates: true });
  if (r3.error) fail("channel_policies", r3.error.message);

  const jobs = WORKFLOW_DEFINITIONS.map((w) => ({
    tenant_id: tenantId,
    workflow_key: w.workflow_key,
    name: w.name,
    description: w.description,
    schedule_cron: w.schedule_cron,
    mode: "local_simulation" as const,
  }));
  const r4 = await admin
    .from("workflow_jobs")
    .upsert(jobs, { onConflict: "tenant_id,workflow_key", ignoreDuplicates: true });
  if (r4.error) fail("workflow_jobs", r4.error.message);

  const providers = PROVIDER_CATEGORIES.map((category) => ({
    tenant_id: tenantId,
    category,
    provider: category === "n8n" ? "local_simulation" : "mock",
  }));
  const r5 = await admin
    .from("provider_settings")
    .upsert(providers, { onConflict: "tenant_id,category", ignoreDuplicates: true });
  if (r5.error) fail("provider_settings", r5.error.message);
}
