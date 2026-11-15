/**
 * The compliance gate. Every outbound message, however it was created, passes
 * through `evaluateOutbound` before anything else happens to it.
 *
 * It is a pure function of facts loaded from the database and the environment.
 * No model is involved, nothing here can be configured by chat, and a caller
 * cannot skip a check: the function always evaluates all of them and reports each.
 *
 * `allowed: true` does not on its own mean a message leaves the system. `delivery`
 * says whether it may be transmitted ("live") or only recorded as approved
 * ("held", when live sending is switched off in the server environment).
 */

export type OutreachMode = "draft_only" | "human_approval" | "controlled_autonomy";
export type Channel = "email" | "linkedin" | "whatsapp" | "telegram" | "voice" | "referral" | "inbound";

export interface ChannelPolicy {
  outboundAllowed: boolean;
  automationAllowed: boolean;
  requiresConsent: boolean;
  requiresInboundInitiation: boolean;
  /** 0 means no numeric cap is configured for the channel. */
  dailyLimit: number;
}

export interface GateInput {
  /** OUTBOUND_LIVE_SENDING from the server environment. */
  liveSendingEnabled: boolean;
  workspace: { killSwitch: boolean; outreachMode: OutreachMode; dailySendLimit: number; country: string };
  channel: Channel;
  /** Null when no policy row exists for the country and channel. */
  policy: ChannelPolicy | null;
  campaign: { status: "draft" | "active" | "paused" | "completed" | "archived"; dailyLimit: number; modeOverride: OutreachMode | null } | null;
  contact: { hasAddress: boolean; doNotContact: boolean; addressInvalid: boolean };
  /** True when the address, phone or domain is on the suppression list for this channel. */
  suppressed: boolean;
  consent: { granted: boolean; inboundInitiated: boolean };
  actor: { kind: "human" | "automation"; approvedByHuman: boolean };
  sentToday: { workspace: number; campaign: number; channel: number };
  message: {
    /** True if this message was already sent or another message used its idempotency key. */
    alreadyProcessed: boolean;
    /** Claims in the message that no stored observed fact supports. */
    unsupportedClaims: string[];
    /** Email only: the message tells the recipient how to opt out. */
    hasOptOut: boolean;
  };
}

export interface GateCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface GateDecision {
  allowed: boolean;
  /** live: may be transmitted. held: approved but not transmitted. blocked: must not proceed. */
  delivery: "live" | "held" | "blocked";
  effectiveMode: OutreachMode;
  checks: GateCheck[];
  /** Details of every failed check, in order. Empty when allowed. */
  blockedBy: string[];
}

const MODE_RANK: Record<OutreachMode, number> = { draft_only: 0, human_approval: 1, controlled_autonomy: 2 };

/** A campaign can only make the mode stricter, never looser. */
export function effectiveMode(workspace: OutreachMode, override: OutreachMode | null): OutreachMode {
  if (!override) return workspace;
  return MODE_RANK[override] < MODE_RANK[workspace] ? override : workspace;
}

export function evaluateOutbound(input: GateInput): GateDecision {
  const checks: GateCheck[] = [];
  const check = (id: string, label: string, passed: boolean, pass: string, fail: string) =>
    checks.push({ id, label, passed, detail: passed ? pass : fail });

  const { workspace, policy, campaign, contact, actor, message } = input;
  const mode = effectiveMode(workspace.outreachMode, campaign?.modeOverride ?? null);
  const where = `${workspace.country} / ${input.channel}`;

  check("kill_switch", "Kill switch", !workspace.killSwitch, "Kill switch is off.", "The outbound kill switch is on. Nothing can be sent.");

  check(
    "policy_exists",
    "Channel policy configured",
    policy !== null,
    `A policy exists for ${where}.`,
    `No channel policy is configured for ${where}. Outbound is blocked until one is.`,
  );

  check(
    "outbound_allowed",
    "Outbound permitted on channel",
    policy?.outboundAllowed === true,
    "The channel policy permits outbound.",
    policy ? `The channel policy for ${where} does not permit outbound.` : "No policy to permit outbound.",
  );

  check(
    "automation",
    "Automation permitted",
    actor.kind === "human" || policy?.automationAllowed === true,
    actor.kind === "human" ? "A person is taking this action." : "The channel policy permits automated sending.",
    "This channel is human-led only. Automated sending is not permitted.",
  );

  check(
    "consent",
    "Consent on record",
    policy !== null && (!policy.requiresConsent || input.consent.granted),
    policy?.requiresConsent ? "A recorded opt-in exists." : "This channel does not require a prior opt-in.",
    "This channel requires a recorded opt-in and none exists for this contact.",
  );

  check(
    "inbound_initiation",
    "Contact initiated where required",
    policy !== null && (!policy.requiresInboundInitiation || input.consent.inboundInitiated),
    policy?.requiresInboundInitiation ? "The contact started the conversation." : "This channel does not require the contact to make first contact.",
    "On this channel the contact must start the conversation, and they have not.",
  );

  check("do_not_contact", "Not marked do-not-contact", !contact.doNotContact, "The contact is contactable.", "The contact is marked do-not-contact.");

  check("suppression", "Not on the suppression list", !input.suppressed, "The address is not suppressed.", "The address is on the suppression list.");

  check(
    "address",
    "Usable address",
    contact.hasAddress && !contact.addressInvalid,
    "The contact has a usable address for this channel.",
    contact.hasAddress ? "The contact's address failed verification." : "The contact has no address for this channel.",
  );

  check(
    "mode",
    "Outreach mode permits sending",
    mode !== "draft_only" && (mode === "controlled_autonomy" || actor.approvedByHuman),
    mode === "human_approval" ? "A person approved this message." : "Controlled autonomy is enabled.",
    mode === "draft_only" ? "Outreach mode is draft only. Messages are prepared but never sent." : "Outreach mode requires a person to approve each message.",
  );

  check(
    "campaign_active",
    "Campaign is active",
    campaign === null || campaign.status === "active",
    campaign === null ? "The message is not part of a campaign." : "The campaign is active.",
    `The campaign is ${campaign?.status ?? "inactive"}, not active.`,
  );

  check(
    "workspace_limit",
    "Workspace daily limit",
    input.sentToday.workspace < workspace.dailySendLimit,
    `${input.sentToday.workspace} of ${workspace.dailySendLimit} sent today.`,
    `The workspace daily limit of ${workspace.dailySendLimit} has been reached.`,
  );

  check(
    "campaign_limit",
    "Campaign daily limit",
    campaign === null || input.sentToday.campaign < campaign.dailyLimit,
    campaign === null ? "No campaign limit applies." : `${input.sentToday.campaign} of ${campaign.dailyLimit} sent today in this campaign.`,
    `The campaign daily limit of ${campaign?.dailyLimit ?? 0} has been reached.`,
  );

  const channelCap = policy?.dailyLimit ?? 0;
  check(
    "channel_limit",
    "Channel daily limit",
    channelCap === 0 || input.sentToday.channel < channelCap,
    channelCap === 0 ? "No numeric cap is set for this channel." : `${input.sentToday.channel} of ${channelCap} sent today on this channel.`,
    `The channel daily limit of ${channelCap} has been reached.`,
  );

  check("idempotency", "Not already processed", !message.alreadyProcessed, "This message has not been sent before.", "This message was already processed. It will not be sent twice.");

  check(
    "supported_facts",
    "Only supported facts",
    message.unsupportedClaims.length === 0,
    "Every cited fact is on record with evidence.",
    `The message relies on ${message.unsupportedClaims.length} claim${message.unsupportedClaims.length === 1 ? "" : "s"} with no stored evidence: ${message.unsupportedClaims.join("; ")}`,
  );

  check(
    "opt_out",
    "Opt-out included",
    input.channel !== "email" || message.hasOptOut,
    input.channel === "email" ? "The message tells the recipient how to opt out." : "Not required on this channel.",
    "The email does not tell the recipient how to opt out.",
  );

  const blockedBy = checks.filter((c) => !c.passed).map((c) => c.detail);
  const allowed = blockedBy.length === 0;
  return {
    allowed,
    delivery: !allowed ? "blocked" : input.liveSendingEnabled ? "live" : "held",
    effectiveMode: mode,
    checks,
    blockedBy,
  };
}
