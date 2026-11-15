/**
 * Synthetic demo dataset.
 *
 * Everything produced here is FICTIONAL and flagged is_demo = true. Company names are
 * invented, domains use the reserved ".example" TLD so they can never resolve to a real
 * business, and every record is labelled as demo data in the interface.
 *
 * Scores are not invented: each company's inputs are run through the real scoring
 * engine, and a company only reaches a "qualified" stage if the engine qualifies it.
 */
import type { Database } from "@/server/db/database.types";
import {
  scoreLead,
  type ContactRole,
  type EmployeeRange,
  type ScoringInput,
  type SourceKind,
  type VerificationStatus,
} from "@/server/services/scoring/engine";
import { SERVICE_TEMPLATES, type IndustrySlug, type ServiceSlug } from "./bootstrap";
import { createRng } from "./prng";

type Tables = Database["public"]["Tables"];
type Insert<T extends keyof Tables> = Tables[T]["Insert"];
type Enums = Database["public"]["Enums"];

export interface DemoRefs {
  tenantId: string;
  ownerUserId: string;
  targetCountry: string;
  industries: Record<IndustrySlug, string>;
  services: Record<ServiceSlug, string>;
  /** workflow_key -> workflow_jobs.id */
  jobs: Record<string, string>;
}

export interface DemoDataset {
  sources: Insert<"sources">[];
  industryExperiments: Insert<"industry_experiments">[];
  companies: Insert<"companies">[];
  contacts: Insert<"contacts">[];
  contactVerifications: Insert<"contact_verifications">[];
  researchRecords: Insert<"research_records">[];
  buyingSignals: Insert<"buying_signals">[];
  opportunities: Insert<"opportunities">[];
  leadScoreSnapshots: Insert<"lead_score_snapshots">[];
  campaigns: Insert<"campaigns">[];
  campaignContacts: Insert<"campaign_contacts">[];
  conversations: Insert<"conversations">[];
  messages: Insert<"messages">[];
  consentRecords: Insert<"consent_records">[];
  suppressions: Insert<"suppressions">[];
  meetings: Insert<"meetings">[];
  activities: Insert<"activities">[];
  workflowExecutions: Insert<"workflow_executions">[];
  auditLogs: Insert<"audit_logs">[];
  /** Companies planned for a qualified stage that the engine did not qualify. */
  demotedCount: number;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// [name, industry, city, state] — all fictional.
const COMPANY_SEEDS: ReadonlyArray<readonly [string, IndustrySlug, string, string]> = [
  ["Northstar Industrial Components", "manufacturing", "Ludhiana", "Punjab"],
  ["Vardhan Precision Castings", "manufacturing", "Rajkot", "Gujarat"],
  ["Kaveri Polymers", "manufacturing", "Coimbatore", "Tamil Nadu"],
  ["Shreeji Auto Forgings", "manufacturing", "Pune", "Maharashtra"],
  ["Trident Fasteners India", "manufacturing", "Faridabad", "Haryana"],
  ["Malwa Agro Implements", "manufacturing", "Indore", "Madhya Pradesh"],
  ["Blueline Packaging Works", "manufacturing", "Vapi", "Gujarat"],
  ["Punjab Fresh Distributors", "wholesale-distribution", "Amritsar", "Punjab"],
  ["Deccan Pharma Distributors", "wholesale-distribution", "Hyderabad", "Telangana"],
  ["Sahyadri FMCG Traders", "wholesale-distribution", "Nashik", "Maharashtra"],
  ["Eastern Electricals Wholesale", "wholesale-distribution", "Kolkata", "West Bengal"],
  ["Ganga Building Supplies", "wholesale-distribution", "Kanpur", "Uttar Pradesh"],
  ["Coastal Spice Traders", "wholesale-distribution", "Kochi", "Kerala"],
  ["Meridian Hardware Distribution", "wholesale-distribution", "Jaipur", "Rajasthan"],
  ["Apex Logistics Solutions", "logistics", "Gurugram", "Haryana"],
  ["Swiftline Cargo Movers", "logistics", "Mumbai", "Maharashtra"],
  ["Konkan Cold Chain", "logistics", "Mangaluru", "Karnataka"],
  ["Rapidway Express", "logistics", "Delhi", "Delhi"],
  ["TransIndus Freight", "logistics", "Ahmedabad", "Gujarat"],
  ["Himalaya Fleet Services", "logistics", "Dehradun", "Uttarakhand"],
  ["UrbanNest Properties", "real-estate", "Bengaluru", "Karnataka"],
  ["Skyline Habitat Developers", "real-estate", "Noida", "Uttar Pradesh"],
  ["Greenacre Realty", "real-estate", "Chandigarh", "Chandigarh"],
  ["Marigold Estates", "real-estate", "Lucknow", "Uttar Pradesh"],
  ["Harbourview Homes", "real-estate", "Visakhapatnam", "Andhra Pradesh"],
  ["Aarogya Diagnostics", "healthcare", "Pune", "Maharashtra"],
  ["LifeSpring Clinics", "healthcare", "Chennai", "Tamil Nadu"],
  ["Medipoint Healthcare", "healthcare", "Bhopal", "Madhya Pradesh"],
  ["Sanjeevani Eye Care", "healthcare", "Surat", "Gujarat"],
  ["CarePlus Physiotherapy", "healthcare", "Bengaluru", "Karnataka"],
  ["Nirmal Dental Group", "healthcare", "Jalandhar", "Punjab"],
  ["BrightPath Academy", "education", "Kota", "Rajasthan"],
  ["Vidya Skill Institute", "education", "Patna", "Bihar"],
  ["Lotus International School", "education", "Mysuru", "Karnataka"],
  ["Pinnacle Coaching Centre", "education", "Hyderabad", "Telangana"],
  ["Saraswati EduTech Services", "education", "Nagpur", "Maharashtra"],
  ["GreenBasket Consumer Products", "ecommerce-d2c", "Mumbai", "Maharashtra"],
  ["Kraftloom Handmade", "ecommerce-d2c", "Jaipur", "Rajasthan"],
  ["Zesty Bites Foods", "ecommerce-d2c", "Indore", "Madhya Pradesh"],
  ["Urban Petal Skincare", "ecommerce-d2c", "Delhi", "Delhi"],
  ["Tana Bana Apparel", "ecommerce-d2c", "Varanasi", "Uttar Pradesh"],
  ["HomeHarvest Organics", "ecommerce-d2c", "Pune", "Maharashtra"],
  ["Clearview Accounting Partners", "professional-services", "Ahmedabad", "Gujarat"],
  ["Lexbridge Legal Associates", "professional-services", "Mumbai", "Maharashtra"],
  ["Orbit HR Consultants", "professional-services", "Chennai", "Tamil Nadu"],
  ["Stratum Architecture Studio", "professional-services", "Kochi", "Kerala"],
  ["Saffron Courtyard Hotels", "hospitality", "Udaipur", "Rajasthan"],
  ["Backwater Bliss Resorts", "hospitality", "Alappuzha", "Kerala"],
  ["The Tiffin Room Restaurants", "hospitality", "Bengaluru", "Karnataka"],
  ["Hillcrest Retreats", "hospitality", "Shimla", "Himachal Pradesh"],
];

type Stage = Enums["lead_stage"];

// Planned stage mix for the 50 companies.
const STAGE_PLAN: ReadonlyArray<readonly [Stage, number]> = [
  ["customer", 4],
  ["proposal", 4],
  ["meeting", 6],
  ["positive_reply", 5],
  ["contacted", 8],
  ["qualified", 8],
  ["verified", 4],
  ["researched", 5],
  ["discovered", 4],
  ["rejected", 2],
];

const STAGE_ORDER: Stage[] = [
  "discovered",
  "researched",
  "verified",
  "qualified",
  "contacted",
  "positive_reply",
  "meeting",
  "proposal",
  "customer",
];

const INDUSTRY_PROFILE: Record<
  IndustrySlug,
  {
    segment: string;
    fact: string;
    factPage: Enums["page_type"];
    hypothesis: string;
    services: ServiceSlug[];
    signals: Enums["signal_type"][];
    hiringRole: string;
  }
> = {
  manufacturing: {
    segment: "OEM and aftermarket buyers",
    fact: "Publishes its product catalogue as downloadable PDF price lists.",
    factPage: "products",
    hypothesis: "Order and dispatch updates are probably coordinated by phone and spreadsheets between sales and the plant.",
    services: ["erp-implementation", "workflow-automation", "process-reporting-automation"],
    signals: ["hiring_operations", "product_launch", "new_process", "distribution_expansion"],
    hiringRole: "production planning and dispatch coordinators",
  },
  "wholesale-distribution": {
    segment: "retailers and dealers",
    fact: "Describes a field sales team covering several districts.",
    factPage: "about",
    hypothesis: "Dealer enquiries may be tracked separately by each branch, with no shared pipeline.",
    services: ["crm-implementation", "workflow-automation", "process-reporting-automation"],
    signals: ["distribution_expansion", "new_branch", "hiring_operations", "hiring_support"],
    hiringRole: "area sales executives and order desk staff",
  },
  logistics: {
    segment: "manufacturers and traders",
    fact: "Offers shipment status by phone or email request rather than through a self-service portal.",
    factPage: "services",
    hypothesis: "Status-update calls may take up a large share of the operations team's day.",
    services: ["custom-integrations", "whatsapp-ai-agent", "app-development"],
    signals: ["service_locations", "hiring_operations", "hiring_support", "new_branch"],
    hiringRole: "fleet coordinators and customer support executives",
  },
  "real-estate": {
    segment: "home buyers and investors",
    fact: "Lists several ongoing projects, each with a 'call for a site visit' prompt.",
    factPage: "products",
    hypothesis: "Site-visit enquiries may be followed up individually by sales executives without a shared record.",
    services: ["crm-implementation", "ai-voice-agent", "website-development"],
    signals: ["product_launch", "hiring_support", "new_branch", "new_process"],
    hiringRole: "pre-sales and customer relationship executives",
  },
  healthcare: {
    segment: "walk-in and referred patients",
    fact: "States that appointments are booked by phone during clinic hours.",
    factPage: "contact",
    hypothesis: "Calls outside clinic hours may go unanswered, losing appointment requests.",
    services: ["ai-voice-agent", "whatsapp-ai-agent", "crm-implementation"],
    signals: ["service_locations", "hiring_support", "new_branch", "new_process"],
    hiringRole: "front-desk and patient coordination staff",
  },
  education: {
    segment: "students and parents",
    fact: "Collects admissions enquiries through a generic contact form.",
    factPage: "contact",
    hypothesis: "Counsellors may be following up admissions enquiries from spreadsheets.",
    services: ["crm-implementation", "whatsapp-ai-agent", "website-development"],
    signals: ["new_branch", "hiring_support", "product_launch", "service_locations"],
    hiringRole: "admissions counsellors",
  },
  "ecommerce-d2c": {
    segment: "online consumers",
    fact: "Sells through its own storefront and lists a presence on online marketplaces.",
    factPage: "products",
    hypothesis: "Order, return and support queries across channels may be reconciled by hand.",
    services: ["workflow-automation", "whatsapp-ai-agent", "process-reporting-automation"],
    signals: ["ecommerce_expansion", "product_launch", "hiring_support", "new_process"],
    hiringRole: "customer support and order operations executives",
  },
  "professional-services": {
    segment: "small and mid-sized client businesses",
    fact: "Service pages describe recurring compliance and reporting work for client businesses.",
    factPage: "services",
    hypothesis: "Recurring client reminders and document collection may be handled manually.",
    services: ["workflow-automation", "process-reporting-automation", "website-development"],
    signals: ["hiring_operations", "new_process", "service_locations", "new_branch"],
    hiringRole: "client servicing associates",
  },
  hospitality: {
    segment: "leisure and business guests",
    fact: "Takes reservations by phone and through third-party booking platforms.",
    factPage: "contact",
    hypothesis: "Direct booking enquiries may be handled on personal phones without a shared record.",
    services: ["whatsapp-ai-agent", "website-development", "crm-implementation"],
    signals: ["service_locations", "new_branch", "hiring_support", "product_launch"],
    hiringRole: "reservations and guest relations staff",
  },
};

const SIGNAL_TEMPLATES: Record<
  Enums["signal_type"],
  { summary: (role: string) => string; path: string; sourceType: Enums["signal_source_type"] }
> = {
  hiring_operations: {
    summary: (role) => `Careers page lists openings for ${role}.`,
    path: "/careers",
    sourceType: "careers_page",
  },
  hiring_support: {
    summary: () => "Careers page advertises customer support executive roles.",
    path: "/careers",
    sourceType: "careers_page",
  },
  new_branch: {
    summary: () => "Announces the opening of a new branch.",
    path: "/announcements",
    sourceType: "company_website",
  },
  distribution_expansion: {
    summary: () => "Announces dealer appointments in additional districts.",
    path: "/announcements",
    sourceType: "company_website",
  },
  product_launch: {
    summary: () => "Announces a new product or service line.",
    path: "/announcements",
    sourceType: "company_website",
  },
  ecommerce_expansion: {
    summary: () => "Adds an online ordering option to its website.",
    path: "/products",
    sourceType: "company_website",
  },
  service_locations: {
    summary: () => "Adds new service locations to its locations page.",
    path: "/locations",
    sourceType: "company_website",
  },
  new_process: {
    summary: () => "Mentions introducing a new order or enquiry process.",
    path: "/announcements",
    sourceType: "company_website",
  },
  other: {
    summary: () => "Notes a change in business operations.",
    path: "/about",
    sourceType: "company_website",
  },
};

const FIRST_NAMES = [
  "Aarav", "Ananya", "Arjun", "Bhavna", "Deepak", "Divya", "Farhan", "Gauri", "Harish", "Ishita",
  "Jatin", "Kavita", "Kunal", "Lakshmi", "Manoj", "Meera", "Naveen", "Neha", "Omkar", "Pooja",
  "Rahul", "Rekha", "Rohan", "Sana", "Sanjay", "Shruti", "Suresh", "Tanvi", "Varun", "Vidya",
  "Vikram", "Yamini", "Zubin", "Amit", "Priya", "Nikhil", "Sneha", "Rajesh", "Anjali", "Karthik",
];
const LAST_NAMES = [
  "Agarwal", "Bhatia", "Chauhan", "Desai", "Fernandes", "Gupta", "Iyer", "Joshi", "Kapoor", "Kulkarni",
  "Malhotra", "Menon", "Nair", "Patel", "Rao", "Reddy", "Saxena", "Shah", "Sharma", "Singh",
  "Sinha", "Thakur", "Trivedi", "Varma", "Mehta", "Pillai", "Bose", "Chopra", "Dutta", "Goyal",
];

const TITLES: Record<ContactRole, string[]> = {
  owner_founder: ["Founder", "Managing Director", "Proprietor", "Co-founder"],
  director_cxo: ["Director", "Chief Executive Officer", "Director – Operations"],
  operations: ["Operations Manager", "Head of Operations"],
  sales_marketing: ["Sales Head", "Marketing Manager"],
  it: ["IT Manager"],
  finance: ["Finance Manager"],
  other: ["Office Administrator", "Executive Assistant"],
};

const CHANNEL_WEIGHTS: ReadonlyArray<readonly [Enums["acquisition_channel"], number]> = [
  ["email_outreach", 58],
  ["referral", 13],
  ["inbound", 13],
  ["partnership", 6],
  ["event", 6],
  ["other", 4],
];

const WORKFLOW_ERRORS = [
  "Simulated: search provider returned HTTP 429 (rate limit reached)",
  "Simulated: website fetch timed out after 30s",
  "Simulated: email verification provider returned an unexpected response",
  "Simulated: model output failed schema validation after 2 retries",
  "Simulated: n8n webhook responded with HTTP 502",
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function generateDemoDataset(refs: DemoRefs, now: Date): DemoDataset {
  const rng = createRng(`hunter-demo-v1:${refs.tenantId}`);
  const t = now.getTime();
  const iso = (ms: number) => new Date(Math.min(ms, t)).toISOString();
  const isoAny = (ms: number) => new Date(ms).toISOString();
  const base = { tenant_id: refs.tenantId, is_demo: true } as const;

  const weighted = <T,>(items: ReadonlyArray<readonly [T, number]>): T => {
    const total = items.reduce((s, [, w]) => s + w, 0);
    let roll = rng.next() * total;
    for (const [item, weight] of items) {
      roll -= weight;
      if (roll <= 0) return item;
    }
    return items[items.length - 1][0];
  };

  // --- Sources ------------------------------------------------------------
  const sourceDefs: Array<{
    key: Enums["acquisition_channel"];
    kind: SourceKind;
    label: string;
    provider: string;
  }> = [
    { key: "email_outreach", kind: "search_provider", label: "Synthetic: sample search results", provider: "mock-search" },
    { key: "referral", kind: "referral", label: "Synthetic: client referral", provider: "demo" },
    { key: "inbound", kind: "inbound_form", label: "Synthetic: website enquiry form", provider: "demo" },
    { key: "partnership", kind: "partner", label: "Synthetic: partner introduction", provider: "demo" },
    { key: "event", kind: "event", label: "Synthetic: trade event attendee list", provider: "demo" },
    { key: "other", kind: "manual", label: "Synthetic: manual entry", provider: "demo" },
  ];
  const websiteSourceId = rng.uuid();
  const sources: Insert<"sources">[] = [
    ...sourceDefs.map((s) => ({
      ...base,
      id: rng.uuid(),
      kind: s.kind,
      provider: s.provider,
      label: s.label,
      licence_note: "Synthetic demo record. Not derived from any real source.",
      retrieved_at: iso(t - 90 * DAY),
    })),
    {
      ...base,
      id: websiteSourceId,
      kind: "website",
      provider: "mock-website-research",
      label: "Synthetic: company website pages",
      licence_note: "Synthetic demo record. Not derived from any real source.",
      retrieved_at: iso(t - 90 * DAY),
    },
  ];
  const sourceFor = (channel: Enums["acquisition_channel"]) => {
    const index = sourceDefs.findIndex((s) => s.key === channel);
    return { id: sources[index].id as string, kind: sourceDefs[index].kind };
  };

  // --- Industry experiments -----------------------------------------------
  const industrySlugs = Object.keys(refs.industries) as IndustrySlug[];
  const industryExperiments: Insert<"industry_experiments">[] = industrySlugs.map((slug, i) => ({
    ...base,
    id: rng.uuid(),
    industry_id: refs.industries[slug],
    name: `${slug.replace(/-/g, " ")} exploration`,
    hypothesis: `Synthetic example: ${INDUSTRY_PROFILE[slug].hypothesis}`,
    status: i < 6 ? "running" : "planned",
    started_at: i < 6 ? iso(t - rng.int(40, 85) * DAY) : null,
    target_companies: 40,
    spend_inr: i < 6 ? roundTo(rng.int(4000, 22000), 500) : 0,
    assumed_problem_evidence: rng.int(4, 8),
    assumed_ability_to_pay: rng.int(4, 8),
    assumed_decision_maker_access: rng.int(4, 8),
    assumed_deal_size: rng.int(4, 8),
    assumed_recurring_potential: rng.int(3, 8),
    assumed_delivery_profitability: rng.int(4, 8),
    notes: "Synthetic assumptions for demonstration.",
  }));

  // --- Campaigns ----------------------------------------------------------
  const defaultSequence = [
    { day: 0, kind: "introduction", guidance: "Individual introduction tied to one observed fact." },
    { day: 4, kind: "insight", guidance: "One relevant additional insight. No pressure." },
    { day: 9, kind: "closing", guidance: "Polite closing message. Make it easy to say no." },
  ];
  const campaignDefs: Array<{
    name: string;
    channel: Enums["channel"];
    status: Enums["campaign_status"];
    industry: IndustrySlug | null;
    service: ServiceSlug;
    spend: number;
    startedDaysAgo: number | null;
  }> = [
    { name: "Distribution CRM introduction", channel: "email", status: "active", industry: "wholesale-distribution", service: "crm-implementation", spend: 12000, startedDaysAgo: 78 },
    { name: "Manufacturing operations automation", channel: "email", status: "active", industry: "manufacturing", service: "workflow-automation", spend: 9500, startedDaysAgo: 70 },
    { name: "Healthcare appointment handling", channel: "email", status: "paused", industry: "healthcare", service: "ai-voice-agent", spend: 6000, startedDaysAgo: 62 },
    { name: "Multi-industry introduction", channel: "email", status: "active", industry: null, service: "workflow-automation", spend: 15000, startedDaysAgo: 84 },
    { name: "D2C WhatsApp support (opt-in contacts only)", channel: "whatsapp", status: "draft", industry: "ecommerce-d2c", service: "whatsapp-ai-agent", spend: 0, startedDaysAgo: null },
  ];
  const campaigns: Insert<"campaigns">[] = campaignDefs.map((c) => ({
    ...base,
    id: rng.uuid(),
    name: c.name,
    description: "Synthetic demo campaign.",
    channel: c.channel,
    status: c.status,
    industry_id: c.industry ? refs.industries[c.industry] : null,
    service_id: refs.services[c.service],
    sequence: defaultSequence,
    daily_limit: 20,
    spend_inr: c.spend,
    started_at: c.startedDaysAgo === null ? null : iso(t - c.startedDaysAgo * DAY),
  }));
  const campaignFor = (industry: IndustrySlug): string => {
    const index = campaignDefs.findIndex((c) => c.industry === industry && c.channel === "email");
    return campaigns[index === -1 ? 3 : index].id as string;
  };

  // --- Plan stages --------------------------------------------------------
  const stagePool: Stage[] = [];
  for (const [stage, count] of STAGE_PLAN) for (let i = 0; i < count; i++) stagePool.push(stage);
  const plannedStages = rng.shuffle(stagePool);

  const out: DemoDataset = {
    sources,
    industryExperiments,
    companies: [],
    contacts: [],
    contactVerifications: [],
    researchRecords: [],
    buyingSignals: [],
    opportunities: [],
    leadScoreSnapshots: [],
    campaigns,
    campaignContacts: [],
    conversations: [],
    messages: [],
    consentRecords: [],
    suppressions: [],
    meetings: [],
    activities: [],
    workflowExecutions: [],
    auditLogs: [],
    demotedCount: 0,
  };

  const usedEmails = new Set<string>();
  const strongCompanyIds: string[] = [];
  let strongIndex = 0;
  let qualifiedStageIndex = 0;
  let discoveredStageIndex = 0;
  let contactedOnlyIndex = 0;
  let meetingStageIndex = 0;
  let positiveStageIndex = 0;
  let upcomingMeetingDay = 1;

  const makeContact = (
    companyId: string,
    domain: string,
    role: ContactRole,
    verification: VerificationStatus,
    sourceId: string,
    isPrimary: boolean,
    verifiedDaysAgo: number | null,
    hasPhone: boolean,
  ): Insert<"contacts"> & { id: string; full_name: string; email: string } => {
    let first = rng.pick(FIRST_NAMES);
    let last = rng.pick(LAST_NAMES);
    let email = `${first}.${last}@${domain}`.toLowerCase();
    while (usedEmails.has(email)) {
      first = rng.pick(FIRST_NAMES);
      last = rng.pick(LAST_NAMES);
      email = `${first}.${last}@${domain}`.toLowerCase();
    }
    usedEmails.add(email);
    const lastVerifiedAt = verifiedDaysAgo === null ? null : iso(t - verifiedDaysAgo * DAY);
    const id = rng.uuid();
    if (lastVerifiedAt) {
      out.contactVerifications.push({
        ...base,
        id: rng.uuid(),
        contact_id: id,
        provider: "mock-verifier (synthetic)",
        result: verification,
        detail: { note: "Synthetic verification result." },
        checked_at: lastVerifiedAt,
      });
    }
    return {
      ...base,
      id,
      company_id: companyId,
      full_name: `${first} ${last}`,
      job_title: rng.pick(TITLES[role]),
      role_category: role,
      email,
      // 555-01xx style placeholder numbers are not issued to real subscribers.
      phone: hasPhone ? `+91 00000 5${String(rng.int(1000, 9999))}` : null,
      is_primary: isPrimary,
      source_id: sourceId,
      provenance_note: "Synthetic contact created for the demo dataset.",
      verification_status: verification,
      verification_provider: lastVerifiedAt ? "mock-verifier (synthetic)" : null,
      last_verified_at: lastVerifiedAt,
    };
  };

  COMPANY_SEEDS.forEach(([name, industry, city, state], index) => {
    const planned = plannedStages[index];
    const profile = INDUSTRY_PROFILE[industry];
    const companyId = rng.uuid();
    const domain = `${slugify(name)}.example`;
    const site = `https://${domain}`;
    const channel = weighted(CHANNEL_WEIGHTS);
    const source = sourceFor(channel);

    const strength: "strong" | "weak" | "none" | "reject" =
      planned === "discovered"
        ? "none"
        : planned === "rejected"
          ? "reject"
          : planned === "researched" || planned === "verified"
            ? "weak"
            : "strong";
    // The first 19 strong companies get the fuller evidence profile.
    const tierA = strength === "strong" && strongIndex < 19;
    if (strength === "strong") strongIndex++;

    const employeeRange: EmployeeRange | null =
      strength === "strong"
        ? rng.pick<EmployeeRange>(["10-49", "50-99", "50-99", "100-200", "100-200"])
        : strength === "weak"
          ? rng.pick<EmployeeRange>(["10-49", "50-99", "201-500"])
          : strength === "reject"
            ? rng.pick<EmployeeRange>(["1-9", "500+"])
            : rng.chance(0.5)
              ? rng.pick<EmployeeRange>(["10-49", "50-99"])
              : null;
    const estimateByRange: Record<EmployeeRange, [number, number]> = {
      "1-9": [3, 9],
      "10-49": [12, 48],
      "50-99": [52, 98],
      "100-200": [105, 195],
      "201-500": [210, 480],
      "500+": [520, 900],
    };
    const employeeEstimate = employeeRange ? rng.int(...estimateByRange[employeeRange]) : null;
    const branchCount = strength === "none" ? null : strength === "strong" ? rng.int(1, 6) : rng.int(1, 2);

    // --- Research records --------------------------------------------------
    const factIds: string[] = [];
    const factStatements: string[] = [];
    let researchedOffsetFacts = 0;
    if (strength !== "none") {
      const candidateFacts: Array<{ statement: string; page: Enums["page_type"]; path: string }> = [
        { statement: profile.fact, page: profile.factPage, path: `/${profile.factPage}` },
        {
          statement: `Lists ${branchCount} location${branchCount === 1 ? "" : "s"} in ${state}${(branchCount ?? 0) > 2 ? " and neighbouring states" : ""}.`,
          page: "locations",
          path: "/locations",
        },
        {
          statement: "Shows a phone number and one shared email address for enquiries; no enquiry tracking or booking tool is visible.",
          page: "contact",
          path: "/contact",
        },
        {
          statement: `States a team of about ${employeeEstimate ?? "an unstated number of"} people serving ${profile.segment}.`,
          page: "about",
          path: "/about",
        },
      ];
      const factCount = strength === "strong" ? (tierA ? rng.int(3, 4) : 2) : 1;
      researchedOffsetFacts = factCount;
      for (const fact of candidateFacts.slice(0, factCount)) {
        const id = rng.uuid();
        factIds.push(id);
        factStatements.push(fact.statement);
        out.researchRecords.push({
          ...base,
          id,
          company_id: companyId,
          kind: "observed_fact",
          statement: fact.statement,
          evidence_url: `${site}${fact.path}`,
          evidence_quote: "Synthetic sample text standing in for a quoted passage.",
          page_type: fact.page,
          confidence: 0.9,
          origin: "demo_seed",
          source_id: websiteSourceId,
        });
      }
      out.researchRecords.push({
        ...base,
        id: rng.uuid(),
        company_id: companyId,
        kind: "summary",
        statement: `${name} is a fictional ${industry.replace(/-/g, " ")} business based in ${city}, ${state}, created to demonstrate HUNTER. It serves ${profile.segment}.`,
        origin: "demo_seed",
        source_id: websiteSourceId,
      });
      const hypothesisCount = strength === "strong" ? 2 : 1;
      const hypotheses = [
        profile.hypothesis,
        "Management reporting is likely compiled by hand at the end of each week or month.",
      ];
      for (const statement of hypotheses.slice(0, hypothesisCount)) {
        out.researchRecords.push({
          ...base,
          id: rng.uuid(),
          company_id: companyId,
          kind: "ai_hypothesis",
          statement,
          confidence: 0.5,
          origin: "demo_seed",
          model: "mock (synthetic)",
        });
      }
    }

    // --- Buying signals ------------------------------------------------------
    type PlannedSignal = Insert<"buying_signals"> & { observed_at: string; expires_at: string };
    const companySignals: PlannedSignal[] = [];
    const addSignal = (ageDays: number, verification: Enums["signal_verification"], typeIndex: number) => {
      const type = profile.signals[typeIndex % profile.signals.length];
      const template = SIGNAL_TEMPLATES[type];
      const observed = t - ageDays * DAY - rng.int(0, 20) * HOUR;
      const signal: PlannedSignal = {
        ...base,
        id: rng.uuid(),
        company_id: companyId,
        signal_type: type,
        evidence_summary: template.summary(profile.hiringRole),
        source_url: `${site}${template.path}`,
        source_type: template.sourceType,
        source_id: websiteSourceId,
        observed_at: isoAny(observed),
        confidence: Number((0.55 + rng.next() * 0.4).toFixed(2)),
        // Signals stay live for 90 days from observation.
        expires_at: isoAny(observed + 90 * DAY),
        verification_status: verification,
      };
      companySignals.push(signal);
    };
    if (strength === "strong" && tierA) {
      addSignal(rng.int(3, 26), rng.chance(0.6) ? "verified" : "unverified", 0);
      addSignal(rng.int(10, 55), "unverified", 1);
      addSignal(rng.int(20, 80), rng.chance(0.3) ? "verified" : "unverified", 2);
    } else if (strength === "strong") {
      addSignal(rng.int(32, 58), "unverified", 0);
      addSignal(rng.int(100, 170), "unverified", 1); // expired
    } else if (strength === "weak") {
      addSignal(rng.int(100, 180), rng.chance(0.3) ? "rejected" : "unverified", 0); // expired
    } else if (strength === "reject") {
      addSignal(rng.int(110, 200), "unverified", 0); // expired
    }
    out.buyingSignals.push(...companySignals);

    // --- Contacts ------------------------------------------------------------
    let primary: ReturnType<typeof makeContact> | null = null;
    if (strength === "strong") {
      const role: ContactRole = rng.chance(0.8)
        ? rng.pick<ContactRole>(["owner_founder", "director_cxo"])
        : rng.pick<ContactRole>(["operations", "sales_marketing"]);
      primary = makeContact(companyId, domain, role, "valid", source.id, true, rng.int(2, 25), rng.chance(0.6));
    } else if (strength === "weak") {
      primary =
        planned === "verified"
          ? makeContact(companyId, domain, rng.pick<ContactRole>(["operations", "finance", "other"]), "valid", source.id, true, rng.int(5, 40), false)
          : makeContact(companyId, domain, rng.pick<ContactRole>(["other", "sales_marketing"]), "unverified", source.id, true, null, false);
    } else if (strength === "reject") {
      primary = makeContact(companyId, domain, "other", "unverified", source.id, true, null, false);
    } else if (rng.chance(0.5)) {
      primary = makeContact(companyId, domain, "other", "unverified", source.id, true, null, false);
    }
    if (primary) out.contacts.push(primary);
    if (strength === "strong") strongCompanyIds.push(companyId);

    // --- Opportunity ---------------------------------------------------------
    let opportunity: (Insert<"opportunities"> & { id: string; estimated_value_inr: number }) | null = null;
    const serviceSlug = profile.services[index % profile.services.length];
    const template = SERVICE_TEMPLATES.find((s) => s.slug === serviceSlug)!;
    if (strength === "strong") {
      const value = roundTo(rng.int(template.price_min_inr, Math.round(template.price_max_inr * 0.75)), 5000);
      opportunity = {
        ...base,
        id: rng.uuid(),
        company_id: companyId,
        primary_contact_id: primary?.id ?? null,
        service_id: refs.services[serviceSlug],
        title: `${template.name} for ${name}`,
        stage: "identified",
        estimated_value_inr: value,
        observed_facts: factStatements.slice(0, 2),
        problem_hypothesis: profile.hypothesis,
        recommended_solution: template.description,
        relevance_rationale: `The observed facts suggest a gap this service addresses: ${template.problems_solved[0].toLowerCase()}. This is a hypothesis to validate with the prospect, not a confirmed need.`,
        possible_impact:
          "If the hypothesis holds, the team may spend less time on manual follow-up. No savings, ROI or delivery dates are assumed.",
        validation_questions: [
          "How are enquiries recorded and followed up today?",
          "Who sees the status of an enquiry or order across the team?",
          "Where does the current process break down when volumes rise?",
        ],
        outreach_angle: `Open with the observed fact about how ${name} handles enquiries, then ask one question about follow-up.`,
        origin: "demo_seed",
        acquisition_channel: channel,
        owner_user_id: refs.ownerUserId,
      };
    }

    // --- Score with the real engine -------------------------------------------
    const scoringInput: ScoringInput | null =
      strength === "none"
        ? null
        : {
            targetCountry: refs.targetCountry,
            company: {
              country: "IN",
              domain,
              employeeRange,
              branchCount,
              industryInCatalogue: true,
            },
            observedFactCount: researchedOffsetFacts,
            signals: companySignals.map((s) => ({
              observedAt: s.observed_at,
              expiresAt: s.expires_at,
              verification: s.verification_status ?? "unverified",
            })),
            contact: primary
              ? {
                  role: primary.role_category as ContactRole,
                  verificationStatus: primary.verification_status as VerificationStatus,
                  lastVerifiedAt: primary.last_verified_at ?? null,
                  sourceKind: source.kind,
                  email: primary.email,
                  hasPhone: Boolean(primary.phone),
                  suppressed: false,
                  doNotContact: false,
                }
              : null,
            contactCount: primary ? 1 : 0,
            opportunity: opportunity
              ? { hasActiveServiceMatch: true, estimatedValueInr: opportunity.estimated_value_inr }
              : null,
          };
    const score = scoringInput ? scoreLead(scoringInput, now) : null;

    // A company only keeps a qualified stage if the engine qualified it.
    let stage: Stage = planned;
    if (strength === "strong" && score && !score.isQualified) {
      stage = "verified";
      out.demotedCount++;
    }
    const reached = (s: Stage) =>
      stage !== "rejected" && STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(s);
    const rejectedAfterResearch = stage === "rejected";

    // --- Timeline --------------------------------------------------------------
    const gaps: Record<string, number> = {
      researched: rng.int(20, 70),
      verified: rng.int(10, 40),
      qualified: rng.int(2, 30),
      contacted: rng.int(20, 90),
      positive_reply: rng.int(30, 140),
      meeting: rng.int(10, 80),
      proposal: rng.int(70, 170),
      customer: rng.int(150, 400),
    };
    let chainHours = 0;
    for (const s of STAGE_ORDER.slice(1)) if (reached(s) || (rejectedAfterResearch && s === "researched")) chainHours += gaps[s];
    const windowHours = 88 * 24;
    let slackHours = rng.int(6, Math.max(7, windowHours - chainHours));
    if (stage === "qualified") {
      // Keep the "today" and "yesterday" KPI cards meaningful.
      if (qualifiedStageIndex < 3) slackHours = 0.4 * (qualifiedStageIndex + 1);
      else if (qualifiedStageIndex < 5) slackHours = 26 + qualifiedStageIndex * 2;
      qualifiedStageIndex++;
    }
    if (stage === "discovered") {
      if (discoveredStageIndex < 2) slackHours = 2 + discoveredStageIndex * 3;
      discoveredStageIndex++;
    }
    const discoveredAt = t - (chainHours + slackHours) * HOUR;
    const at: Partial<Record<Stage, number>> = { discovered: discoveredAt };
    let cursor = discoveredAt;
    for (const s of STAGE_ORDER.slice(1)) {
      if (reached(s) || (rejectedAfterResearch && s === "researched")) {
        cursor += gaps[s] * HOUR;
        at[s] = cursor;
      }
    }
    const stamp = (s: Stage) => (at[s] === undefined ? null : iso(at[s]!));

    // Apply research timestamps now that the timeline exists.
    const researchedIso = stamp("researched");
    if (researchedIso) {
      for (const record of out.researchRecords) {
        if (record.company_id === companyId) record.researched_at = researchedIso;
      }
    }

    out.companies.push({
      ...base,
      id: companyId,
      name,
      domain,
      website_url: site,
      description: `Fictional ${industry.replace(/-/g, " ")} business used for demonstration.`,
      industry_id: refs.industries[industry],
      employee_range: employeeRange,
      employee_count_estimate: employeeEstimate,
      city,
      state,
      country: "IN",
      branch_count: branchCount,
      lead_stage: stage,
      acquisition_channel: channel,
      source_id: source.id,
      owner_user_id: refs.ownerUserId,
      tags: tierA && rng.chance(0.4) ? ["multi-branch"] : [],
      opportunity_score: score?.total ?? null,
      priority: score?.priority ?? null,
      is_qualified: Boolean(score?.isQualified) && reached("qualified"),
      discovered_at: iso(discoveredAt),
      researched_at: stamp("researched"),
      verified_at: stamp("verified"),
      qualified_at: stamp("qualified"),
      first_contacted_at: stamp("contacted"),
      first_positive_reply_at: stamp("positive_reply"),
      first_meeting_at: stamp("meeting"),
      customer_at: stamp("customer"),
      last_researched_at: stamp("researched"),
      created_at: iso(discoveredAt),
    });

    out.activities.push({
      ...base,
      id: rng.uuid(),
      company_id: companyId,
      actor_type: "workflow",
      type: "system",
      title: `Discovered via ${sourceDefs.find((s) => s.key === channel)!.label.replace("Synthetic: ", "")}`,
      occurred_at: iso(discoveredAt),
    });
    if (researchedIso) {
      out.activities.push({
        ...base,
        id: rng.uuid(),
        company_id: companyId,
        actor_type: "workflow",
        type: "research",
        title: `Website research recorded ${researchedOffsetFacts} observed fact${researchedOffsetFacts === 1 ? "" : "s"}`,
        occurred_at: researchedIso,
      });
    }

    if (score && scoringInput) {
      const computedAt = stamp("qualified") ?? stamp("verified") ?? stamp("researched") ?? iso(t);
      out.leadScoreSnapshots.push({
        ...base,
        id: rng.uuid(),
        company_id: companyId,
        contact_id: primary?.id ?? null,
        total_score: score.total,
        icp_fit: score.factors.icpFit.points,
        problem_evidence: score.factors.problemEvidence.points,
        decision_maker_access: score.factors.decisionMakerAccess.points,
        commercial_potential: score.factors.commercialPotential.points,
        timing_signal: score.factors.timingSignal.points,
        delivery_fit: score.factors.deliveryFit.points,
        contact_reliability: score.contactReliability?.score ?? null,
        priority: score.priority,
        is_qualified: score.isQualified,
        disqualification_reasons: score.disqualificationReasons,
        inputs: JSON.parse(JSON.stringify(scoringInput)),
        explanations: JSON.parse(
          JSON.stringify({ factors: score.factors, contactReliability: score.contactReliability }),
        ),
        engine_version: score.engineVersion,
        computed_at: computedAt,
      });
      if (primary && score.contactReliability) primary.reliability_score = score.contactReliability.score;
      out.activities.push({
        ...base,
        id: rng.uuid(),
        company_id: companyId,
        actor_type: "system",
        type: "score",
        title: `Scored ${score.total} (Priority ${score.priority})${score.isQualified ? ", qualified" : ", not qualified"}`,
        occurred_at: computedAt,
      });
    }

    // --- Opportunity stage and actuals -------------------------------------------
    if (opportunity) {
      const createdAt = stamp("qualified") ?? stamp("verified") ?? iso(discoveredAt);
      opportunity.created_at = createdAt;
      if (stage === "customer") {
        opportunity.stage = "won";
        opportunity.proposal_sent_at = stamp("proposal");
        opportunity.won_at = stamp("customer");
        opportunity.collected_revenue_inr = roundTo(opportunity.estimated_value_inr * (0.4 + rng.next() * 0.6), 5000);
        opportunity.delivery_cost_inr = roundTo(template.est_implementation_cost_inr * (0.8 + rng.next() * 0.4), 5000);
      } else if (stage === "proposal") {
        opportunity.stage = rng.chance(0.25) ? "negotiation" : "proposal_sent";
        opportunity.proposal_sent_at = stamp("proposal");
      } else if (stage === "meeting") {
        opportunity.stage = "meeting_scheduled";
      } else if (stage === "positive_reply") {
        opportunity.stage = "qualified";
      } else if (stage === "contacted") {
        opportunity.stage = rng.chance(0.5) ? "qualified" : "identified";
      }
      if (reached("meeting")) {
        opportunity.expected_close_date = isoAny(t + rng.int(10, 60) * DAY).slice(0, 10);
      }
      out.opportunities.push(opportunity);
    }

    // --- Outreach, replies and meetings --------------------------------------------
    if (!primary || !opportunity) return;
    const first = primary.full_name.split(" ")[0];
    const subject = `A question about enquiry handling at ${name}`;
    const introBody = [
      `Hello ${first},`,
      "",
      `I was reading ${name}'s website and noticed this: ${factStatements[0] ?? profile.fact}`,
      "",
      `We help ${industry.replace(/-/g, " ")} businesses with ${template.name.toLowerCase()}. I have one question: how does your team currently keep track of follow-ups?`,
      "",
      "If this is not relevant, reply \"unsubscribe\" and I will not write again.",
      "",
      "[Synthetic demo message. It was never sent to anyone.]",
    ].join("\n");

    const makeConversation = (campaignId: string | null): Insert<"conversations"> & { id: string } => ({
      ...base,
      id: rng.uuid(),
      company_id: companyId,
      contact_id: primary!.id,
      campaign_id: campaignId,
      channel: "email",
      subject,
      status: "awaiting_reply",
    });

    // Qualified but not yet contacted: some have a draft waiting for approval.
    if (stage === "qualified") {
      if (qualifiedStageIndex <= 5) {
        const campaignId = campaignFor(industry);
        const enrolmentId = rng.uuid();
        const conversation = makeConversation(campaignId);
        const draftedAt = iso(at.qualified! + 20 * 60_000);
        conversation.status = "open";
        conversation.last_message_at = draftedAt;
        out.campaignContacts.push({
          ...base,
          id: enrolmentId,
          campaign_id: campaignId,
          contact_id: primary.id,
          company_id: companyId,
          status: "pending",
          current_step: 0,
          enrolled_at: draftedAt,
        });
        out.conversations.push(conversation);
        out.messages.push({
          ...base,
          id: rng.uuid(),
          conversation_id: conversation.id,
          campaign_contact_id: enrolmentId,
          company_id: companyId,
          contact_id: primary.id,
          direction: "outbound",
          channel: "email",
          subject,
          body: introBody,
          status: "pending_approval",
          sequence_step: 0,
          origin: "demo_seed",
          model: "mock (synthetic)",
          supporting_fact_ids: factIds.slice(0, 1),
          idempotency_key: `demo:${enrolmentId}:step:0`,
          created_at: draftedAt,
        });
      }
      return;
    }

    if (!reached("contacted")) return;

    const viaCampaign = channel === "email_outreach";
    const campaignId = viaCampaign ? campaignFor(industry) : null;
    const enrolmentId = viaCampaign ? rng.uuid() : null;
    const conversation = makeConversation(campaignId);
    const contactedAt = at.contacted!;
    let lastMessageAt = contactedAt;
    let enrolmentStatus: Enums["enrolment_status"] = "active";
    let stopReason: Enums["stop_reason"] | null = null;
    let stoppedAt: number | null = null;
    let currentStep = 0;
    let nextSendAt: number | null = contactedAt + 4 * DAY;

    const pushOutbound = (step: number, sentAt: number, body: string, key: string) => {
      out.messages.push({
        ...base,
        id: rng.uuid(),
        conversation_id: conversation.id,
        campaign_contact_id: enrolmentId,
        company_id: companyId,
        contact_id: primary!.id,
        direction: "outbound",
        channel: "email",
        subject: step === 0 ? subject : `Re: ${subject}`,
        body,
        status: "sent",
        sequence_step: step,
        origin: "demo_seed",
        model: "mock (synthetic)",
        supporting_fact_ids: factIds.slice(0, 1),
        approved_by: refs.ownerUserId,
        approved_at: iso(sentAt - 15 * 60_000),
        sent_at: iso(sentAt),
        provider: "mock-email (synthetic, nothing sent)",
        idempotency_key: key,
        gate_result: { allowed: true, mode: "human_approval", note: "Synthetic record." },
        created_at: iso(sentAt - 30 * 60_000),
      });
      lastMessageAt = Math.max(lastMessageAt, sentAt);
    };
    const pushInbound = (receivedAt: number, intent: Enums["reply_intent"], body: string) => {
      out.messages.push({
        ...base,
        id: rng.uuid(),
        conversation_id: conversation.id,
        campaign_contact_id: enrolmentId,
        company_id: companyId,
        contact_id: primary!.id,
        direction: "inbound",
        channel: "email",
        subject: `Re: ${subject}`,
        body: `${body}\n\n[Synthetic demo reply.]`,
        status: "received",
        intent,
        intent_confidence: Number((0.78 + rng.next() * 0.2).toFixed(2)),
        processing_history: [
          { step: "classified", intent, by: "mock classifier (synthetic)", at: iso(receivedAt + 60_000) },
        ],
        origin: "demo_seed",
        received_at: iso(receivedAt),
        idempotency_key: `demo:inbound:${conversation.id}:${receivedAt}`,
        created_at: iso(receivedAt),
      });
      lastMessageAt = Math.max(lastMessageAt, receivedAt);
      conversation.last_intent = intent;
      out.activities.push({
        ...base,
        id: rng.uuid(),
        company_id: companyId,
        contact_id: primary!.id,
        actor_type: "system",
        type: "email_received",
        title: `Reply received: ${intent.replace(/_/g, " ")}`,
        occurred_at: iso(receivedAt),
      });
    };

    pushOutbound(0, contactedAt, introBody, `demo:${conversation.id}:step:0`);
    out.activities.push({
      ...base,
      id: rng.uuid(),
      company_id: companyId,
      contact_id: primary.id,
      actor_type: "user",
      actor_user_id: refs.ownerUserId,
      type: "email_sent",
      title: "Introduction approved and recorded as sent",
      occurred_at: iso(contactedAt),
    });
    out.auditLogs.push({
      ...base,
      id: rng.uuid(),
      actor_type: "user",
      actor_user_id: refs.ownerUserId,
      action: "message.approved",
      entity_type: "company",
      entity_id: companyId,
      detail: { step: 0, synthetic: true },
      created_at: iso(contactedAt - 15 * 60_000),
    });
    if (channel === "inbound") {
      out.consentRecords.push({
        ...base,
        id: rng.uuid(),
        contact_id: primary.id,
        channel: "email",
        status: "granted",
        basis: "inbound_enquiry",
        evidence: "Synthetic: enquiry submitted through the website form.",
        source_id: source.id,
        recorded_at: iso(discoveredAt),
      });
    }

    if (reached("positive_reply")) {
      const intent = rng.pick<Enums["reply_intent"]>([
        "interested",
        "wants_meeting",
        "wants_meeting",
        "wants_pricing",
        "requests_information",
      ]);
      const replyBodies: Record<string, string> = {
        interested: "Thanks for reaching out. This is something we have been discussing internally. Tell me more.",
        wants_meeting: "This is relevant for us. Can we speak sometime next week?",
        wants_pricing: "Interesting. What would something like this cost for a team of our size?",
        requests_information: "Could you share a short note on how this works and what you would need from us?",
      };
      pushInbound(at.positive_reply!, intent, replyBodies[intent]);
      enrolmentStatus = "stopped";
      stopReason = "replied";
      stoppedAt = at.positive_reply!;
      nextSendAt = null;
      conversation.status = reached("meeting") ? "closed" : "open";
      pushOutbound(
        1,
        Math.min(at.positive_reply! + rng.int(2, 20) * HOUR, t - 60_000),
        `Hello ${first},\n\nThank you for the reply. I would be glad to walk you through it. Here are a few times that work on our side; please pick whichever suits you.\n\n[Synthetic demo message. It was never sent to anyone.]`,
        `demo:${conversation.id}:reply:1`,
      );

      if (stage === "positive_reply") {
        // Two of these have slots proposed that the prospect has not chosen yet.
        if (positiveStageIndex < 2) {
          const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 3 + positiveStageIndex, 5, 30);
          out.meetings.push({
            ...base,
            id: rng.uuid(),
            company_id: companyId,
            contact_id: primary.id,
            opportunity_id: opportunity.id,
            conversation_id: conversation.id,
            title: `Introductory call with ${name}`,
            status: "proposed",
            starts_at: isoAny(start),
            ends_at: isoAny(start + 30 * 60_000),
            slot_selected_by_prospect: false,
            owner_user_id: refs.ownerUserId,
            provider: "mock-calendar (synthetic)",
          });
        }
        positiveStageIndex++;
      }
    } else {
      // Contacted, no positive reply. A spread of realistic outcomes.
      const scenario = contactedOnlyIndex++ % 8;
      const replyAt = Math.min(contactedAt + rng.int(20, 70) * HOUR, t - 30 * 60_000);
      if (scenario === 0 || scenario === 1) {
        pushInbound(replyAt, "not_interested", "Thanks, but this is not a priority for us right now.");
        enrolmentStatus = "stopped";
        stopReason = "replied";
        stoppedAt = replyAt;
        nextSendAt = null;
        conversation.status = "closed";
      } else if (scenario === 2) {
        pushInbound(replyAt, "out_of_office", "I am out of the office until next week and will reply on my return.");
        conversation.status = "awaiting_reply";
      } else if (scenario === 3) {
        pushInbound(replyAt, "unsubscribe", "Unsubscribe. Please remove me from your list.");
        enrolmentStatus = "stopped";
        stopReason = "unsubscribed";
        stoppedAt = replyAt;
        nextSendAt = null;
        conversation.status = "closed";
        primary.do_not_contact = true;
        out.suppressions.push({
          ...base,
          id: rng.uuid(),
          channel: null,
          address_type: "email",
          address: primary.email,
          reason: "unsubscribe",
          contact_id: primary.id,
          note: "Synthetic: contact replied 'unsubscribe'.",
          created_at: iso(replyAt + 60_000),
        });
        out.consentRecords.push({
          ...base,
          id: rng.uuid(),
          contact_id: primary.id,
          channel: "email",
          status: "withdrawn",
          basis: "b2b_first_contact",
          evidence: "Synthetic: opt-out received by reply.",
          recorded_at: iso(replyAt + 60_000),
        });
        out.auditLogs.push({
          ...base,
          id: rng.uuid(),
          actor_type: "system",
          action: "suppression.added",
          entity_type: "contact",
          entity_id: primary.id,
          detail: { reason: "unsubscribe", synthetic: true },
          created_at: iso(replyAt + 60_000),
        });
      } else if (scenario === 4) {
        pushInbound(replyAt, "objection", "We already use a tool for this. Why would we change?");
        enrolmentStatus = "stopped";
        stopReason = "replied";
        stoppedAt = replyAt;
        nextSendAt = null;
        conversation.status = "needs_review";
      } else {
        // No reply: follow-ups go out on day 4 and day 9 if they are due.
        if (contactedAt + 4 * DAY < t) {
          pushOutbound(
            1,
            contactedAt + 4 * DAY,
            `Hello ${first},\n\nOne more thought that may be useful: businesses at your stage often find follow-ups are the first thing to slip when enquiry volumes rise.\n\nReply "unsubscribe" and I will not write again.\n\n[Synthetic demo message. It was never sent to anyone.]`,
            `demo:${conversation.id}:step:1`,
          );
          currentStep = 1;
          nextSendAt = contactedAt + 9 * DAY;
        }
        if (contactedAt + 9 * DAY < t) {
          pushOutbound(
            2,
            contactedAt + 9 * DAY,
            `Hello ${first},\n\nI will close the loop here so I am not crowding your inbox. If this becomes relevant later, I am happy to help.\n\n[Synthetic demo message. It was never sent to anyone.]`,
            `demo:${conversation.id}:step:2`,
          );
          currentStep = 2;
          enrolmentStatus = "completed";
          nextSendAt = null;
        }
      }
    }

    conversation.last_message_at = iso(lastMessageAt);
    out.conversations.push(conversation);
    if (enrolmentId && campaignId) {
      out.campaignContacts.push({
        ...base,
        id: enrolmentId,
        campaign_id: campaignId,
        contact_id: primary.id,
        company_id: companyId,
        status: enrolmentStatus,
        stop_reason: stopReason,
        current_step: currentStep,
        next_send_at: nextSendAt === null ? null : isoAny(nextSendAt),
        enrolled_at: iso(contactedAt - HOUR),
        stopped_at: stoppedAt === null ? null : iso(stoppedAt),
      });
    }

    // --- Meetings ---------------------------------------------------------------
    if (reached("meeting")) {
      const bookedAt = at.meeting!;
      let status: Enums["meeting_status"] = "attended";
      let startsAt = Math.min(bookedAt + rng.int(30, 90) * HOUR, t - 2 * HOUR);
      if (stage === "meeting") {
        const k = meetingStageIndex++;
        const canBePast = bookedAt + 30 * HOUR < t - 2 * HOUR;
        if (k < 4 || !canBePast) {
          status = "booked";
          startsAt = Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() + upcomingMeetingDay,
            // 10:30, 12:00, 14:30 or 16:00 IST
            [5, 6, 9, 10][k % 4],
            [0, 30, 0, 30][k % 4],
          );
          upcomingMeetingDay += 1;
        } else if (k === 5) {
          status = "no_show";
        }
      }
      out.meetings.push({
        ...base,
        id: rng.uuid(),
        company_id: companyId,
        contact_id: primary.id,
        opportunity_id: opportunity.id,
        conversation_id: conversation.id,
        title: `Introductory call with ${name}`,
        status,
        starts_at: isoAny(startsAt),
        ends_at: isoAny(startsAt + 30 * 60_000),
        slot_selected_by_prospect: true,
        booked_at: iso(bookedAt),
        attended_at: status === "attended" ? isoAny(startsAt) : null,
        outcome_notes:
          status === "attended"
            ? "Synthetic note: walked through the current enquiry process; agreed to share a short proposal."
            : null,
        owner_user_id: refs.ownerUserId,
        provider: "mock-calendar (synthetic)",
      });
      out.activities.push({
        ...base,
        id: rng.uuid(),
        company_id: companyId,
        contact_id: primary.id,
        opportunity_id: opportunity.id,
        actor_type: "system",
        type: "meeting",
        title: "Meeting booked after the prospect selected a slot",
        occurred_at: iso(bookedAt),
      });
    }
    if (stage === "customer") {
      out.activities.push({
        ...base,
        id: rng.uuid(),
        company_id: companyId,
        opportunity_id: opportunity.id,
        actor_type: "user",
        actor_user_id: refs.ownerUserId,
        type: "stage_change",
        title: "Opportunity marked as won",
        occurred_at: stamp("customer")!,
      });
    }
  });

  // --- Top up to the requested volumes ---------------------------------------------
  // Secondary contacts until there are exactly 70.
  const companyById = new Map(out.companies.map((c) => [c.id as string, c]));
  let cycle = 0;
  while (out.contacts.length < 70 && strongCompanyIds.length > 0) {
    const companyId = strongCompanyIds[cycle % strongCompanyIds.length];
    cycle++;
    const company = companyById.get(companyId)!;
    const sourceId = company.source_id as string;
    out.contacts.push(
      makeContact(
        companyId,
        company.domain as string,
        rng.pick<ContactRole>(["operations", "sales_marketing", "it", "finance"]),
        rng.pick<VerificationStatus>(["valid", "valid", "catch_all", "risky", "unverified"]),
        sourceId,
        false,
        rng.chance(0.7) ? rng.int(5, 120) : null,
        rng.chance(0.4),
      ),
    );
  }

  // Extra opportunities until there are exactly 40. Two of them are lost deals.
  const advanced = out.companies.filter((c) =>
    ["meeting", "proposal", "customer", "positive_reply"].includes(c.lead_stage as string),
  );
  let extra = 0;
  while (out.opportunities.length < 40 && advanced.length > 0) {
    const company = advanced[extra % advanced.length];
    const template = SERVICE_TEMPLATES[(extra * 3 + 1) % SERVICE_TEMPLATES.length];
    const lost = extra < 2;
    const createdAt = (company.qualified_at as string | null) ?? (company.discovered_at as string);
    out.opportunities.push({
      ...base,
      id: rng.uuid(),
      company_id: company.id as string,
      service_id: refs.services[template.slug],
      title: `${template.name} for ${company.name}`,
      stage: lost ? "lost" : "identified",
      estimated_value_inr: roundTo(rng.int(template.price_min_inr, Math.round(template.price_max_inr * 0.6)), 5000),
      problem_hypothesis: "Second, smaller need raised during conversation. To be validated.",
      recommended_solution: template.description,
      validation_questions: ["Is this a current priority or a later phase?"],
      origin: "demo_seed",
      acquisition_channel: company.acquisition_channel,
      owner_user_id: refs.ownerUserId,
      lost_at: lost ? iso(t - rng.int(3, 25) * DAY) : null,
      lost_reason: lost ? "Synthetic: budget deferred to next financial year." : null,
      created_at: createdAt,
    });
    extra++;
  }

  // Expired signals to reach exactly 100. Expired signals never affect a score.
  const researched = out.companies.filter((c) => c.researched_at);
  let pad = 0;
  while (out.buyingSignals.length < 100 && researched.length > 0) {
    const company = researched[pad % researched.length];
    pad++;
    const observed = t - rng.int(120, 220) * DAY;
    out.buyingSignals.push({
      ...base,
      id: rng.uuid(),
      company_id: company.id as string,
      signal_type: "other",
      evidence_summary: "Older note about a change in business operations (now stale).",
      source_url: `${company.website_url}/about`,
      source_type: "company_website",
      source_id: websiteSourceId,
      observed_at: isoAny(observed),
      confidence: 0.4,
      expires_at: isoAny(observed + 90 * DAY),
      verification_status: "unverified",
    });
  }
  while (out.buyingSignals.length > 100) {
    const index = out.buyingSignals.findLastIndex((s) => new Date(s.expires_at).getTime() <= t);
    if (index === -1) break;
    out.buyingSignals.splice(index, 1);
  }

  // --- Workflow executions ---------------------------------------------------------
  const runsPerDay: Record<string, number[]> = {
    // Hours in UTC. 00:30 UTC is 06:00 IST.
    "WF-01": [0.5],
    "WF-02": [1],
    "WF-03": [1.5],
    "WF-04": [2],
    "WF-05": [3, 6, 9, 12],
    "WF-06": [4, 8, 11],
  };
  const forcedFailures = new Set(["WF-02:1", "WF-05:2", "WF-04:4"]);
  const startOfTodayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let dayBack = 30; dayBack >= 0; dayBack--) {
    const dayStart = startOfTodayUtc - dayBack * DAY;
    const weekday = new Date(dayStart).getUTCDay();
    for (const [key, hours] of Object.entries(runsPerDay)) {
      const jobId = refs.jobs[key];
      if (!jobId) continue;
      const dailyOnly = hours.length === 1;
      if (dailyOnly && weekday === 0) continue; // Daily workflows skip Sunday.
      hours.forEach((hour, runIndex) => {
        const queuedAt = dayStart + hour * HOUR;
        if (queuedAt > t - 10 * 60_000) return;
        const forced = runIndex === 0 && forcedFailures.has(`${key}:${dayBack}`);
        const failed = forced || rng.chance(key === "WF-02" ? 0.09 : 0.05);
        const duration = rng.int(2_000, 90_000);
        out.workflowExecutions.push({
          ...base,
          id: rng.uuid(),
          job_id: jobId,
          workflow_key: key,
          status: failed ? "failed" : "succeeded",
          trigger: rng.chance(0.08) ? "manual" : "schedule",
          mode: "local_simulation",
          queued_at: isoAny(queuedAt),
          started_at: isoAny(queuedAt + 1_500),
          finished_at: isoAny(queuedAt + 1_500 + duration),
          duration_ms: duration,
          items_processed: failed ? 0 : rng.int(1, 24),
          error_message: failed ? rng.pick(WORKFLOW_ERRORS) : null,
          error_detail: failed ? { synthetic: true, attempt: 1 } : null,
          output: failed ? {} : { synthetic: true },
          created_at: isoAny(queuedAt),
        });
      });
    }
  }
  if (refs.jobs["WF-05"]) {
    out.workflowExecutions.push({
      ...base,
      id: rng.uuid(),
      job_id: refs.jobs["WF-05"],
      workflow_key: "WF-05",
      status: "running",
      trigger: "schedule",
      mode: "local_simulation",
      queued_at: isoAny(t - 3 * 60_000),
      started_at: isoAny(t - 2 * 60_000),
      created_at: isoAny(t - 3 * 60_000),
    });
  }
  for (const key of ["WF-03", "WF-04"]) {
    if (!refs.jobs[key]) continue;
    out.workflowExecutions.push({
      ...base,
      id: rng.uuid(),
      job_id: refs.jobs[key],
      workflow_key: key,
      status: "queued",
      trigger: "manual",
      mode: "local_simulation",
      queued_at: isoAny(t - 60_000),
      created_at: isoAny(t - 60_000),
    });
  }

  out.auditLogs.push({
    ...base,
    id: rng.uuid(),
    actor_type: "system",
    action: "demo.seeded",
    entity_type: "workspace",
    entity_id: refs.tenantId,
    detail: {
      companies: out.companies.length,
      contacts: out.contacts.length,
      signals: out.buyingSignals.length,
      opportunities: out.opportunities.length,
    },
    created_at: isoAny(t),
  });

  return out;
}
