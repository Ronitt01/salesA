import { describe, expect, it } from "vitest";
import {
  PRIORITY_THRESHOLDS,
  SCORE_WEIGHTS,
  activeSignals,
  normaliseDomain,
  priorityFor,
  scoreContactReliability,
  scoreLead,
  type ContactInput,
  type ScoringInput,
} from "@/server/services/scoring/engine";

const NOW = new Date("2026-11-15T10:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const daysAhead = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

const strongContact: ContactInput = {
  role: "owner_founder",
  verificationStatus: "valid",
  lastVerifiedAt: daysAgo(5),
  sourceKind: "website",
  email: "owner@acme.example",
  hasPhone: true,
  suppressed: false,
  doNotContact: false,
};

function strongInput(overrides: Partial<ScoringInput> = {}): ScoringInput {
  return {
    targetCountry: "IN",
    company: { country: "IN", domain: "acme.example", employeeRange: "100-200", branchCount: 4, industryInCatalogue: true },
    observedFactCount: 4,
    signals: [
      { observedAt: daysAgo(10), expiresAt: daysAhead(80), verification: "verified" },
      { observedAt: daysAgo(20), expiresAt: daysAhead(70), verification: "unverified" },
      { observedAt: daysAgo(40), expiresAt: daysAhead(50), verification: "unverified" },
    ],
    contact: strongContact,
    contactCount: 2,
    opportunity: { hasActiveServiceMatch: true, estimatedValueInr: 600_000 },
    ...overrides,
  };
}

describe("scoring engine", () => {
  it("uses the agreed weights, which sum to 100", () => {
    expect(SCORE_WEIGHTS).toEqual({
      icpFit: 30,
      problemEvidence: 25,
      decisionMakerAccess: 15,
      commercialPotential: 15,
      timingSignal: 10,
      deliveryFit: 5,
    });
    expect(Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("is deterministic: the same input always gives the same result", () => {
    const first = scoreLead(strongInput(), NOW);
    for (let i = 0; i < 25; i++) expect(scoreLead(strongInput(), NOW)).toEqual(first);
  });

  it("does not mutate its input", () => {
    const input = strongInput();
    const snapshot = JSON.stringify(input);
    scoreLead(input, NOW);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("gives a fully evidenced ICP company the maximum score and qualifies it", () => {
    const result = scoreLead(strongInput(), NOW);
    expect(result.total).toBe(100);
    expect(result.priority).toBe("A");
    expect(result.isQualified).toBe(true);
    expect(result.disqualificationReasons).toEqual([]);
  });

  it("keeps every factor within its weight and the total equal to the sum of factors", () => {
    const inputs = [
      strongInput(),
      strongInput({ observedFactCount: 0, signals: [], contact: null, contactCount: 0, opportunity: null }),
      strongInput({ company: { country: "US", domain: null, employeeRange: null, branchCount: null, industryInCatalogue: false } }),
      strongInput({ observedFactCount: 99, contactCount: 99 }),
    ];
    for (const input of inputs) {
      const r = scoreLead(input, NOW);
      const sum = Object.values(r.factors).reduce((s, f) => s + f.points, 0);
      expect(r.total).toBe(sum);
      for (const f of Object.values(r.factors)) {
        expect(f.points).toBeGreaterThanOrEqual(0);
        expect(f.points).toBeLessThanOrEqual(f.max);
      }
      expect(r.total).toBeGreaterThanOrEqual(0);
      expect(r.total).toBeLessThanOrEqual(100);
    }
  });

  it("maps scores to priority bands at the documented thresholds", () => {
    expect(PRIORITY_THRESHOLDS).toEqual({ A: 80, B: 65 });
    expect(priorityFor(100)).toBe("A");
    expect(priorityFor(80)).toBe("A");
    expect(priorityFor(79)).toBe("B");
    expect(priorityFor(65)).toBe("B");
    expect(priorityFor(64)).toBe("C");
    expect(priorityFor(0)).toBe("C");
  });

  describe("qualification gate: a high score alone never qualifies a lead", () => {
    it("rejects a high score with too little evidence", () => {
      const r = scoreLead(strongInput({ observedFactCount: 1 }), NOW);
      expect(r.total).toBeGreaterThanOrEqual(PRIORITY_THRESHOLDS.B);
      expect(r.isQualified).toBe(false);
      expect(r.disqualificationReasons.join(" ")).toMatch(/observed fact/);
    });

    it("rejects a lead with no live buying signal", () => {
      const r = scoreLead(strongInput({ signals: [] }), NOW);
      expect(r.isQualified).toBe(false);
      expect(r.disqualificationReasons).toContain("No live buying signal");
    });

    it("rejects a lead with no contact", () => {
      const r = scoreLead(strongInput({ contact: null, contactCount: 0 }), NOW);
      expect(r.isQualified).toBe(false);
      expect(r.disqualificationReasons).toContain("No contact identified");
    });

    it("rejects a lead whose contact email is unverified", () => {
      const r = scoreLead(strongInput({ contact: { ...strongContact, verificationStatus: "unverified", lastVerifiedAt: null } }), NOW);
      expect(r.isQualified).toBe(false);
      expect(r.disqualificationReasons.join(" ")).toMatch(/unverified/);
    });

    it("rejects a suppressed contact however strong the company is", () => {
      const r = scoreLead(strongInput({ contact: { ...strongContact, suppressed: true } }), NOW);
      expect(r.contactReliability?.score).toBe(0);
      expect(r.contactReliability?.blocked).toBe(true);
      expect(r.isQualified).toBe(false);
    });

    it("rejects a do-not-contact contact", () => {
      const r = scoreLead(strongInput({ contact: { ...strongContact, doNotContact: true } }), NOW);
      expect(r.isQualified).toBe(false);
    });

    it("rejects companies outside the target size and those of unknown size", () => {
      for (const employeeRange of ["1-9", "500+", null] as const) {
        const r = scoreLead(strongInput({ company: { ...strongInput().company, employeeRange } }), NOW);
        expect(r.isQualified).toBe(false);
      }
    });
  });

  describe("buying signals", () => {
    it("ignores expired and rejected signals", () => {
      const signals = [
        { observedAt: daysAgo(200), expiresAt: daysAgo(110), verification: "verified" as const },
        { observedAt: daysAgo(5), expiresAt: daysAhead(85), verification: "rejected" as const },
        { observedAt: daysAgo(5), expiresAt: daysAhead(85), verification: "unverified" as const },
      ];
      expect(activeSignals(signals, NOW)).toHaveLength(1);
      expect(scoreLead(strongInput({ signals }), NOW).activeSignalCount).toBe(1);
    });

    it("scores timing as zero when every signal has expired", () => {
      const r = scoreLead(
        strongInput({ signals: [{ observedAt: daysAgo(200), expiresAt: daysAgo(110), verification: "verified" }] }),
        NOW,
      );
      expect(r.factors.timingSignal.points).toBe(0);
    });

    it("a signal that is live today stops counting once the clock passes its expiry", () => {
      const signals = [{ observedAt: daysAgo(80), expiresAt: daysAhead(10), verification: "verified" as const }];
      const today = scoreLead(strongInput({ signals }), NOW);
      const later = scoreLead(strongInput({ signals }), new Date(NOW.getTime() + 11 * 86_400_000));
      expect(today.activeSignalCount).toBe(1);
      expect(later.activeSignalCount).toBe(0);
      expect(later.isQualified).toBe(false);
    });
  });

  describe("contact reliability", () => {
    it("scores a verified, domain-matched owner at the top of the range", () => {
      const r = scoreContactReliability({ ...strongContact, sourceKind: "inbound_form" }, "acme.example", NOW);
      expect(r.score).toBe(100);
    });

    it("penalises a mismatched email domain", () => {
      const matched = scoreContactReliability(strongContact, "acme.example", NOW).score;
      const mismatched = scoreContactReliability({ ...strongContact, email: "owner@gmail.com" }, "acme.example", NOW).score;
      expect(mismatched).toBe(matched - 12);
    });

    it("decays as the last verification ages", () => {
      const at = (days: number) => scoreContactReliability({ ...strongContact, lastVerifiedAt: daysAgo(days) }, "acme.example", NOW).score;
      expect(at(10)).toBeGreaterThan(at(60));
      expect(at(60)).toBeGreaterThan(at(150));
      expect(at(150)).toBeGreaterThan(at(400));
    });

    it("scores an invalid email lower than an unverified one", () => {
      const s = (verificationStatus: ContactInput["verificationStatus"]) =>
        scoreContactReliability({ ...strongContact, verificationStatus }, "acme.example", NOW).score;
      expect(s("invalid")).toBeLessThan(s("unverified"));
      expect(s("unverified")).toBeLessThan(s("valid"));
    });
  });

  it("normalises domains the same way the database does", () => {
    expect(normaliseDomain("https://www.Acme.Example/about?x=1")).toBe("acme.example");
    expect(normaliseDomain("  ACME.example  ")).toBe("acme.example");
    expect(normaliseDomain("http://acme.example#top")).toBe("acme.example");
    expect(normaliseDomain("")).toBeNull();
    expect(normaliseDomain(null)).toBeNull();
  });
});
