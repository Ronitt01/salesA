import { describe, expect, it } from "vitest";
import { effectiveMode, evaluateOutbound, type GateInput } from "@/server/services/compliance/gate";

function input(overrides: Partial<GateInput> = {}): GateInput {
  return {
    liveSendingEnabled: true,
    workspace: { killSwitch: false, outreachMode: "human_approval", dailySendLimit: 30, country: "IN" },
    channel: "email",
    policy: { outboundAllowed: true, automationAllowed: true, requiresConsent: false, requiresInboundInitiation: false, dailyLimit: 30 },
    campaign: { status: "active", dailyLimit: 20, modeOverride: null },
    contact: { hasAddress: true, doNotContact: false, addressInvalid: false },
    suppressed: false,
    consent: { granted: false, inboundInitiated: false },
    actor: { kind: "human", approvedByHuman: true },
    sentToday: { workspace: 0, campaign: 0, channel: 0 },
    message: { alreadyProcessed: false, unsupportedClaims: [], hasOptOut: true },
    ...overrides,
  };
}

const failed = (i: GateInput) => evaluateOutbound(i).checks.filter((c) => !c.passed).map((c) => c.id);

describe("compliance gate", () => {
  it("allows a human-approved, policy-compliant email", () => {
    const d = evaluateOutbound(input());
    expect(d.allowed).toBe(true);
    expect(d.delivery).toBe("live");
    expect(d.blockedBy).toEqual([]);
    expect(d.checks.every((c) => c.passed)).toBe(true);
  });

  it("holds an allowed message when live sending is off in the environment", () => {
    const d = evaluateOutbound(input({ liveSendingEnabled: false }));
    expect(d.allowed).toBe(true);
    expect(d.delivery).toBe("held");
  });

  it("always evaluates every check and is deterministic", () => {
    const a = evaluateOutbound(input());
    const b = evaluateOutbound(input());
    expect(a).toEqual(b);
    expect(a.checks).toHaveLength(17);
    const blocked = evaluateOutbound(input({ workspace: { killSwitch: true, outreachMode: "draft_only", dailySendLimit: 0, country: "IN" }, policy: null }));
    expect(blocked.checks).toHaveLength(17);
  });

  it("blocks everything when the kill switch is on", () => {
    const d = evaluateOutbound(input({ workspace: { killSwitch: true, outreachMode: "controlled_autonomy", dailySendLimit: 30, country: "IN" } }));
    expect(d.allowed).toBe(false);
    expect(d.delivery).toBe("blocked");
    expect(d.blockedBy[0]).toMatch(/kill switch/);
  });

  it("blocks when no channel policy is configured", () => {
    expect(failed(input({ policy: null }))).toEqual(expect.arrayContaining(["policy_exists", "outbound_allowed", "consent", "inbound_initiation"]));
  });

  it("blocks a channel whose policy forbids outbound, such as voice", () => {
    const d = evaluateOutbound(
      input({ channel: "voice", policy: { outboundAllowed: false, automationAllowed: false, requiresConsent: true, requiresInboundInitiation: false, dailyLimit: 0 } }),
    );
    expect(d.allowed).toBe(false);
    expect(d.checks.find((c) => c.id === "outbound_allowed")?.passed).toBe(false);
  });

  it("never lets automation act on a human-only channel such as LinkedIn", () => {
    const linkedin = { outboundAllowed: true, automationAllowed: false, requiresConsent: false, requiresInboundInitiation: false, dailyLimit: 0 };
    const automated = input({
      channel: "linkedin",
      policy: linkedin,
      campaign: null,
      workspace: { killSwitch: false, outreachMode: "controlled_autonomy", dailySendLimit: 30, country: "IN" },
      actor: { kind: "automation", approvedByHuman: false },
    });
    expect(failed(automated)).toContain("automation");
    expect(failed({ ...automated, actor: { kind: "human", approvedByHuman: true } })).toEqual([]);
  });

  it("requires a recorded opt-in for WhatsApp", () => {
    const whatsapp = { outboundAllowed: true, automationAllowed: false, requiresConsent: true, requiresInboundInitiation: false, dailyLimit: 0 };
    expect(failed(input({ channel: "whatsapp", policy: whatsapp, campaign: null }))).toEqual(["consent"]);
    expect(failed(input({ channel: "whatsapp", policy: whatsapp, campaign: null, consent: { granted: true, inboundInitiated: false } }))).toEqual([]);
  });

  it("requires the user to have started the conversation on Telegram", () => {
    const telegram = { outboundAllowed: true, automationAllowed: false, requiresConsent: false, requiresInboundInitiation: true, dailyLimit: 0 };
    expect(failed(input({ channel: "telegram", policy: telegram, campaign: null }))).toEqual(["inbound_initiation"]);
    expect(failed(input({ channel: "telegram", policy: telegram, campaign: null, consent: { granted: false, inboundInitiated: true } }))).toEqual([]);
  });

  it("blocks suppressed and do-not-contact people regardless of mode or approval", () => {
    for (const mode of ["human_approval", "controlled_autonomy"] as const) {
      const workspace = { killSwitch: false, outreachMode: mode, dailySendLimit: 30, country: "IN" };
      expect(failed(input({ workspace, suppressed: true }))).toEqual(["suppression"]);
      expect(failed(input({ workspace, contact: { hasAddress: true, doNotContact: true, addressInvalid: false } }))).toEqual(["do_not_contact"]);
    }
  });

  it("blocks a missing or invalid address", () => {
    expect(failed(input({ contact: { hasAddress: false, doNotContact: false, addressInvalid: false } }))).toEqual(["address"]);
    expect(failed(input({ contact: { hasAddress: true, doNotContact: false, addressInvalid: true } }))).toEqual(["address"]);
  });

  describe("outreach modes", () => {
    const ws = (outreachMode: GateInput["workspace"]["outreachMode"]) => ({ killSwitch: false, outreachMode, dailySendLimit: 30, country: "IN" });

    it("draft only never sends, even with human approval", () => {
      expect(failed(input({ workspace: ws("draft_only") }))).toEqual(["mode"]);
    });

    it("human approval needs a person to have approved", () => {
      expect(failed(input({ actor: { kind: "automation", approvedByHuman: false } }))).toEqual(["mode"]);
      expect(failed(input({ actor: { kind: "human", approvedByHuman: true } }))).toEqual([]);
    });

    it("controlled autonomy lets automation send only where the channel permits it", () => {
      const auto = { kind: "automation" as const, approvedByHuman: false };
      expect(failed(input({ workspace: ws("controlled_autonomy"), actor: auto }))).toEqual([]);
      const humanOnly = { outboundAllowed: true, automationAllowed: false, requiresConsent: false, requiresInboundInitiation: false, dailyLimit: 30 };
      expect(failed(input({ workspace: ws("controlled_autonomy"), actor: auto, policy: humanOnly }))).toEqual(["automation"]);
    });

    it("a campaign can make the mode stricter but never looser", () => {
      expect(effectiveMode("human_approval", "draft_only")).toBe("draft_only");
      expect(effectiveMode("human_approval", "controlled_autonomy")).toBe("human_approval");
      expect(effectiveMode("draft_only", "controlled_autonomy")).toBe("draft_only");
      expect(effectiveMode("controlled_autonomy", null)).toBe("controlled_autonomy");
      const loosened = input({
        campaign: { status: "active", dailyLimit: 20, modeOverride: "controlled_autonomy" },
        actor: { kind: "automation", approvedByHuman: false },
      });
      expect(evaluateOutbound(loosened).effectiveMode).toBe("human_approval");
      expect(failed(loosened)).toEqual(["mode"]);
    });
  });

  it("blocks sends in a campaign that is not active", () => {
    for (const status of ["draft", "paused", "completed", "archived"] as const) {
      expect(failed(input({ campaign: { status, dailyLimit: 20, modeOverride: null } }))).toEqual(["campaign_active"]);
    }
  });

  it("enforces workspace, campaign and channel daily limits at the boundary", () => {
    expect(failed(input({ sentToday: { workspace: 29, campaign: 19, channel: 29 } }))).toEqual([]);
    expect(failed(input({ sentToday: { workspace: 30, campaign: 0, channel: 0 } }))).toEqual(["workspace_limit"]);
    expect(failed(input({ sentToday: { workspace: 0, campaign: 20, channel: 0 } }))).toEqual(["campaign_limit"]);
    expect(failed(input({ sentToday: { workspace: 0, campaign: 0, channel: 30 } }))).toEqual(["channel_limit"]);
    const zeroLimit = input({ workspace: { killSwitch: false, outreachMode: "human_approval", dailySendLimit: 0, country: "IN" } });
    expect(failed(zeroLimit)).toEqual(["workspace_limit"]);
  });

  it("refuses to process the same message twice", () => {
    expect(failed(input({ message: { alreadyProcessed: true, unsupportedClaims: [], hasOptOut: true } }))).toEqual(["idempotency"]);
  });

  it("blocks a message that relies on claims without stored evidence", () => {
    const d = evaluateOutbound(input({ message: { alreadyProcessed: false, unsupportedClaims: ["cited fact 123 does not exist"], hasOptOut: true } }));
    expect(d.allowed).toBe(false);
    expect(d.blockedBy[0]).toContain("cited fact 123 does not exist");
  });

  it("requires an opt-out in email but not on other channels", () => {
    expect(failed(input({ message: { alreadyProcessed: false, unsupportedClaims: [], hasOptOut: false } }))).toEqual(["opt_out"]);
    const inbound = { outboundAllowed: true, automationAllowed: true, requiresConsent: false, requiresInboundInitiation: true, dailyLimit: 100 };
    expect(
      failed(
        input({
          channel: "inbound",
          policy: inbound,
          campaign: null,
          consent: { granted: false, inboundInitiated: true },
          message: { alreadyProcessed: false, unsupportedClaims: [], hasOptOut: false },
        }),
      ),
    ).toEqual([]);
  });

  it("reports every failure, not just the first", () => {
    const d = evaluateOutbound(
      input({
        suppressed: true,
        contact: { hasAddress: true, doNotContact: true, addressInvalid: false },
        sentToday: { workspace: 99, campaign: 99, channel: 99 },
      }),
    );
    expect(d.blockedBy.length).toBe(5);
  });
});
