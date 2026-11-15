import type { Database } from "@/server/db/database.types";

/**
 * Display labels for every enumerated value. This is the English dictionary;
 * a future locale adds a sibling file with the same keys.
 */
type Enums = Database["public"]["Enums"];

export const LEAD_STAGE_LABEL: Record<Enums["lead_stage"], string> = {
  discovered: "Discovered",
  researched: "Researched",
  verified: "Verified",
  qualified: "Qualified",
  contacted: "Contacted",
  positive_reply: "Positive reply",
  meeting: "Meeting",
  proposal: "Proposal",
  customer: "Customer",
  nurture: "Nurture",
  rejected: "Rejected",
};

export const FUNNEL_STAGE_LABEL: Record<string, string> = {
  discovered: "Discovered",
  researched: "Researched",
  verified: "Verified",
  qualified: "Qualified",
  contacted: "Contacted",
  positive_reply: "Positive reply",
  meeting: "Meeting",
  customer: "Customer",
};

export const OPPORTUNITY_STAGE_LABEL: Record<Enums["opportunity_stage"], string> = {
  identified: "Identified",
  qualified: "Qualified",
  meeting_scheduled: "Meeting scheduled",
  proposal_sent: "Proposal sent",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

export const SIGNAL_TYPE_LABEL: Record<Enums["signal_type"], string> = {
  hiring_operations: "Hiring operations staff",
  hiring_support: "Hiring support staff",
  new_branch: "New branch",
  distribution_expansion: "Distribution expansion",
  product_launch: "Product launch",
  ecommerce_expansion: "E-commerce expansion",
  service_locations: "More service locations",
  new_process: "New business process",
  other: "Other change",
};

export const ACQUISITION_CHANNEL_LABEL: Record<Enums["acquisition_channel"], string> = {
  email_outreach: "Email",
  referral: "Referrals",
  inbound: "Inbound",
  partnership: "Partnerships",
  event: "Events",
  other: "Other",
};

export const CHANNEL_LABEL: Record<Enums["channel"], string> = {
  email: "Email",
  linkedin: "LinkedIn (human-led)",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  voice: "Voice",
  referral: "Referral",
  inbound: "Inbound",
};

export const VERIFICATION_LABEL: Record<Enums["verification_status"], string> = {
  unverified: "Unverified",
  valid: "Valid",
  risky: "Risky",
  catch_all: "Catch-all",
  invalid: "Invalid",
  unknown: "Unknown",
};

export const SOURCE_KIND_LABEL: Record<Enums["source_kind"], string> = {
  search_provider: "Search provider",
  website: "Website",
  directory: "Directory",
  referral: "Referral",
  inbound_form: "Inbound form",
  manual: "Manual entry",
  import: "Import",
  event: "Event",
  partner: "Partner",
  demo_seed: "Demo seed",
};

export const REPLY_INTENT_LABEL: Record<Enums["reply_intent"], string> = {
  interested: "Interested",
  wants_meeting: "Wants a meeting",
  wants_pricing: "Wants pricing",
  requests_information: "Requests information",
  objection: "Objection",
  not_interested: "Not interested",
  unsubscribe: "Unsubscribe",
  out_of_office: "Out of office",
  complaint: "Complaint",
  human_review: "Human review required",
};

export const MESSAGE_STATUS_LABEL: Record<Enums["message_status"], string> = {
  draft: "Draft",
  pending_approval: "Awaiting approval",
  approved: "Approved",
  scheduled: "Scheduled",
  sent: "Sent",
  delivered: "Delivered",
  bounced: "Bounced",
  failed: "Failed",
  rejected: "Rejected",
  cancelled: "Cancelled",
  received: "Received",
};

export const MEETING_STATUS_LABEL: Record<Enums["meeting_status"], string> = {
  proposed: "Slots proposed",
  booked: "Booked",
  rescheduled: "Rescheduled",
  cancelled: "Cancelled",
  attended: "Attended",
  no_show: "No-show",
};

export const CAMPAIGN_STATUS_LABEL: Record<Enums["campaign_status"], string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
};

export const EXECUTION_STATUS_LABEL: Record<Enums["execution_status"], string> = {
  queued: "Queued",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const OUTREACH_MODE_LABEL: Record<Enums["outreach_mode"], string> = {
  draft_only: "Draft only",
  human_approval: "Human approval",
  controlled_autonomy: "Controlled autonomy",
};

export const ROLE_LABEL: Record<Enums["member_role"], string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export const CONTACT_ROLE_LABEL: Record<Enums["contact_role"], string> = {
  owner_founder: "Owner / founder",
  director_cxo: "Director / CXO",
  operations: "Operations",
  sales_marketing: "Sales and marketing",
  it: "IT",
  finance: "Finance",
  other: "Other",
};

export const EMPLOYEE_RANGES: Enums["employee_range"][] = ["1-9", "10-49", "50-99", "100-200", "201-500", "500+"];

export const PRIORITY_LABEL: Record<Enums["lead_priority"], string> = {
  A: "Priority A",
  B: "Priority B",
  C: "Research or reject",
};

export const INDIAN_STATES = [
  "Andhra Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh", "Delhi", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Odisha", "Punjab",
  "Rajasthan", "Tamil Nadu", "Telangana", "Uttar Pradesh", "Uttarakhand", "West Bengal",
] as const;
