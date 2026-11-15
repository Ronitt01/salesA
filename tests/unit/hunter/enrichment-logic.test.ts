import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PROVIDER_SOURCES,
  decideEmail,
  decideJobTitle,
  finderTargets,
  maskEmail,
  parseProvenance,
  planContactChanges,
  splitName,
  type Candidate,
  type ExistingContact,
  type PlanInput,
} from "@/server/services/enrichment/merge";
import { DEFAULT_POLICY, checkEnrichmentEligibility, isEnrichableDomain, isRecentlyVerified, loadEnrichmentPolicy } from "@/server/services/enrichment/policy";
import { DEFAULT_RANKING, classifyContactRole, rankPeople, relevance, type RankingConfig } from "@/server/services/enrichment/ranking";
import { isConfirmedDeliverable, mapHunterVerification } from "@/server/services/enrichment/verification";

const NOW = new Date("2026-11-17T10:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function person(email: string, position: string | null, extra: Partial<{ seniority: string; department: string; decisionMaker: boolean; confidence: number }> = {}) {
  return { email, position, seniority: extra.seniority ?? null, department: extra.department ?? null, decisionMaker: extra.decisionMaker ?? null, confidence: extra.confidence ?? 80 };
}

describe("relevance ranking", () => {
  it("orders the configured priorities: founder, owner, CEO, MD, operations, sales, CTO, IT", () => {
    const ranked = rankPeople([
      person("it@acme.in", "IT Manager"),
      person("cto@acme.in", "CTO"),
      person("sales@acme.in", "Head of Sales"),
      person("ops@acme.in", "Head of Operations"),
      person("md@acme.in", "Managing Director"),
      person("ceo@acme.in", "Chief Executive Officer"),
      person("owner@acme.in", "Owner"),
      person("founder@acme.in", "Co-Founder"),
      person("intern@acme.in", "Marketing Intern"),
    ]);
    expect(ranked.map((r) => r.email)).toEqual([
      "founder@acme.in",
      "owner@acme.in",
      "ceo@acme.in",
      "md@acme.in",
      "ops@acme.in",
      "sales@acme.in",
      "cto@acme.in",
      "it@acme.in",
      "intern@acme.in",
    ]);
  });

  it("is deterministic, breaking ties by confidence and then by email", () => {
    const people = [person("b@acme.in", "Director", { confidence: 70 }), person("a@acme.in", "Director", { confidence: 70 }), person("c@acme.in", "Director", { confidence: 90 })];
    const first = rankPeople(people).map((p) => p.email);
    expect(first).toEqual(["c@acme.in", "a@acme.in", "b@acme.in"]);
    expect(rankPeople([...people].reverse()).map((p) => p.email)).toEqual(first);
  });

  it("adds seniority, department and decision-maker weight to titles that match no rule", () => {
    expect(relevance(person("x@a.in", "Vice President", { seniority: "executive", department: "management", decisionMaker: true })).score).toBe(30 + 10 + 10);
    expect(relevance(person("y@a.in", "Associate", { seniority: "junior" })).score).toBe(0);
  });

  it("can be reconfigured without code changes to the engine", () => {
    const itFirst: RankingConfig = {
      ...DEFAULT_RANKING,
      priorities: DEFAULT_RANKING.priorities.map((p) => (p.id === "it_head" ? { ...p, weight: 200 } : p)),
    };
    expect(rankPeople([person("ceo@a.in", "CEO"), person("it@a.in", "IT Head")], itFirst)[0].email).toBe("it@a.in");
  });

  it("maps titles to HUNTER contact roles", () => {
    expect(classifyContactRole("Founder & CEO", null)).toBe("owner_founder");
    expect(classifyContactRole("Chief Executive Officer", null)).toBe("director_cxo");
    expect(classifyContactRole("Head of Operations", null)).toBe("operations");
    expect(classifyContactRole("Sales Director", null)).toBe("sales_marketing");
    expect(classifyContactRole("CTO", null)).toBe("it");
    expect(classifyContactRole("Regional Director", null)).toBe("director_cxo");
    expect(classifyContactRole(null, "finance")).toBe("finance");
    expect(classifyContactRole("Analyst", null)).toBe("other");
  });
});

describe("verification status mapping", () => {
  it("treats only valid as verified deliverable", () => {
    expect(mapHunterVerification("valid")).toBe("valid");
    expect(mapHunterVerification("accept_all")).toBe("catch_all");
    expect(mapHunterVerification("unknown")).toBe("unknown");
    expect(mapHunterVerification("webmail")).toBe("risky");
    expect(mapHunterVerification("disposable")).toBe("invalid");
    expect(mapHunterVerification("invalid")).toBe("invalid");
    expect(mapHunterVerification("something_new")).toBe("unknown");
    for (const status of ["accept_all", "unknown", "webmail", "disposable", "invalid"]) expect(isConfirmedDeliverable(status)).toBe(false);
    expect(isConfirmedDeliverable("valid")).toBe(true);
  });
});

describe("enrichment eligibility", () => {
  const company = { isDemo: false, domain: "acme-tools.in", leadStage: "researched" as const, researchedAt: daysAgo(3), opportunityScore: 62 };

  it("allows a researched company at or above the score threshold", () => {
    expect(checkEnrichmentEligibility(company, null, NOW, DEFAULT_POLICY)).toEqual({ eligible: true });
  });

  it.each([
    ["a demo company", { isDemo: true }],
    ["a reserved test domain", { domain: "acme.example" }],
    ["a missing domain", { domain: null }],
    ["an unresearched company", { leadStage: "discovered" as const, researchedAt: null }],
    ["a rejected company", { leadStage: "rejected" as const }],
    ["a low score", { opportunityScore: 40 }],
  ])("refuses %s", (_label, change) => {
    expect(checkEnrichmentEligibility({ ...company, ...change }, null, NOW, DEFAULT_POLICY).eligible).toBe(false);
  });

  it("allows a low score once the company is in a qualified stage", () => {
    expect(checkEnrichmentEligibility({ ...company, leadStage: "qualified", opportunityScore: 40 }, null, NOW, DEFAULT_POLICY).eligible).toBe(true);
  });

  it("applies the cooldown unless forced", () => {
    const recent = checkEnrichmentEligibility(company, daysAgo(5), NOW, DEFAULT_POLICY);
    expect(recent.eligible).toBe(false);
    expect(!recent.eligible && recent.reason).toContain("5 day(s) ago");
    expect(checkEnrichmentEligibility(company, daysAgo(5), NOW, DEFAULT_POLICY, true).eligible).toBe(true);
    expect(checkEnrichmentEligibility(company, daysAgo(31), NOW, DEFAULT_POLICY).eligible).toBe(true);
  });

  it("knows when a recent Hunter verification makes another call unnecessary", () => {
    expect(isRecentlyVerified({ lastVerifiedAt: daysAgo(2), verificationProvider: "hunter.io" }, NOW, DEFAULT_POLICY)).toBe(true);
    expect(isRecentlyVerified({ lastVerifiedAt: daysAgo(40), verificationProvider: "hunter.io" }, NOW, DEFAULT_POLICY)).toBe(false);
    expect(isRecentlyVerified({ lastVerifiedAt: daysAgo(2), verificationProvider: "manual" }, NOW, DEFAULT_POLICY)).toBe(false);
  });

  it("validates domains and reads limits from the environment within bounds", () => {
    expect(isEnrichableDomain("acme-tools.co.in")).toBe(true);
    expect(isEnrichableDomain("localhost")).toBe(false);
    expect(isEnrichableDomain("acme.test")).toBe(false);
    expect(loadEnrichmentPolicy({ HUNTER_MIN_SCORE: "65", HUNTER_MAX_NEW_CONTACTS: "500" })).toMatchObject({ minScore: 65, maxNewContacts: DEFAULT_POLICY.maxNewContacts });
  });
});

function existing(overrides: Partial<ExistingContact> = {}): ExistingContact {
  return {
    id: "c1",
    fullName: "Asha Kulkarni",
    jobTitle: null,
    email: null,
    verificationStatus: "unverified",
    verificationProvider: null,
    emailConfidence: null,
    provenance: {},
    doNotContact: false,
    isPrimary: true,
    ...overrides,
  };
}

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    email: "asha@acme-tools.in",
    firstName: "Asha",
    lastName: "Kulkarni",
    position: "Founder",
    confidence: 90,
    hunterSources: 3,
    hunterStatus: "valid",
    origin: PROVIDER_SOURCES.domainSearch,
    role: "owner_founder",
    relevanceScore: 130,
    generic: false,
    ...overrides,
  };
}

const hunterOwned = { email: { source: PROVIDER_SOURCES.domainSearch, retrievedAt: daysAgo(10), confidence: 80 } };

describe("email merge rules", () => {
  it("fills a missing address", () => {
    expect(decideEmail(existing(), candidate()).action).toBe("set");
  });

  it("never changes an address entered by a person, or one with no recorded provenance", () => {
    expect(decideEmail(existing({ email: "asha.k@acme-tools.in", provenance: { email: { source: "manual", retrievedAt: daysAgo(1) } } }), candidate()).action).toBe("keep");
    expect(decideEmail(existing({ email: "asha.k@acme-tools.in" }), candidate({ confidence: 100 })).action).toBe("keep");
  });

  it("never replaces an address verified by a person", () => {
    expect(
      decideEmail(existing({ email: "asha.k@acme-tools.in", provenance: hunterOwned, verificationProvider: "manual", verificationStatus: "valid" }), candidate({ confidence: 99 })).action,
    ).toBe("keep");
  });

  it("replaces a provider address only with strictly higher confidence, or when it was invalid", () => {
    const owned = existing({ email: "a.k@acme-tools.in", provenance: hunterOwned, emailConfidence: 80 });
    expect(decideEmail(owned, candidate({ confidence: 70 })).action).toBe("keep");
    expect(decideEmail(owned, candidate({ confidence: 80 })).action).toBe("keep");
    expect(decideEmail(owned, candidate({ confidence: 81 })).action).toBe("replace");
    expect(decideEmail({ ...owned, verificationStatus: "invalid" }, candidate({ confidence: 10 })).action).toBe("replace");
  });

  it("refreshes details for the same provider address, case-insensitively", () => {
    expect(decideEmail(existing({ email: "ASHA@acme-tools.in", provenance: hunterOwned }), candidate()).action).toBe("refresh");
  });

  it("fills an empty job title and never overwrites one entered by a person", () => {
    expect(decideJobTitle(existing(), "Founder")).toBe("set");
    expect(decideJobTitle(existing({ jobTitle: "Proprietor" }), "Founder")).toBe("keep");
    expect(decideJobTitle(existing({ jobTitle: "Owner", provenance: { job_title: { source: PROVIDER_SOURCES.domainSearch, retrievedAt: daysAgo(9) } } }), "Founder")).toBe("set");
  });
});

describe("contact plan", () => {
  const base = (overrides: Partial<PlanInput> = {}): PlanInput => ({
    companyDomain: "acme-tools.in",
    existing: [],
    emailsElsewhere: new Set(),
    isSuppressed: () => false,
    candidates: [],
    maxNewContacts: 5,
    minRelevance: 30,
    sourceId: "src-1",
    retrievedAt: NOW.toISOString(),
    ...overrides,
  });

  it("creates contacts with field-level provenance, marking only the first as primary", () => {
    const plan = planContactChanges(
      base({ candidates: [candidate(), candidate({ email: "ravi@acme-tools.in", firstName: "Ravi", lastName: "Shah", position: "CEO", relevanceScore: 122 })] }),
    );
    expect(plan.creates.map((c) => [c.fullName, c.isPrimary])).toEqual([
      ["Asha Kulkarni", true],
      ["Ravi Shah", false],
    ]);
    expect(plan.creates[0].provenance.email).toMatchObject({ source: "hunter.io:domain_search", sourceId: "src-1", confidence: 90, hunterSources: 3, hunterStatus: "valid" });
    expect(plan.creates[0].provenance.full_name?.source).toBe("hunter.io:domain_search");
  });

  it("does not add a primary when the company already has one", () => {
    const plan = planContactChanges(base({ existing: [existing({ id: "x", fullName: "Someone Else", email: "s@acme-tools.in" })], candidates: [candidate()] }));
    expect(plan.creates[0].isPrimary).toBe(false);
  });

  it("matches existing contacts by email and by name instead of duplicating them", () => {
    const byEmail = planContactChanges(base({ existing: [existing({ email: "asha@acme-tools.in", fullName: "A. Kulkarni" })], candidates: [candidate()] }));
    expect(byEmail.creates).toHaveLength(0);
    const byName = planContactChanges(base({ existing: [existing({ fullName: "ASHA  Kulkarni" })], candidates: [candidate()] }));
    expect(byName.creates).toHaveLength(0);
    expect(byName.updates[0]).toMatchObject({ contactId: "c1", newEmail: "asha@acme-tools.in" });
  });

  it("never changes an existing contact's name", () => {
    const plan = planContactChanges(base({ existing: [existing({ fullName: "Asha Kulkarni" })], candidates: [candidate({ firstName: "Asha", lastName: "Kulkarni" })] }));
    expect(plan.updates[0].patch).not.toHaveProperty("full_name");
  });

  it.each([
    ["a generic mailbox", { generic: true }, "generic_mailbox"],
    ["another domain", { email: "asha@gmail.com" }, "different_domain"],
    ["no person name", { firstName: null }, "no_person_name"],
    ["a low-relevance role", { relevanceScore: 5 }, "below_relevance"],
  ])("skips %s", (_label, change, reason) => {
    const plan = planContactChanges(base({ candidates: [candidate(change as Partial<Candidate>)] }));
    expect(plan.creates).toHaveLength(0);
    expect(plan.skips[0].reason).toBe(reason);
  });

  it("skips suppressed addresses and addresses held by another company's contact", () => {
    expect(planContactChanges(base({ isSuppressed: () => true, candidates: [candidate()] })).skips[0].reason).toBe("suppressed");
    const elsewhere = planContactChanges(base({ emailsElsewhere: new Set(["asha@acme-tools.in"]), candidates: [candidate()] }));
    expect(elsewhere.skips[0].reason).toBe("email_on_another_company");
    // Matched by name, but the address belongs to another company's contact.
    const byName = planContactChanges(base({ existing: [existing()], emailsElsewhere: new Set(["asha@acme-tools.in"]), candidates: [candidate()] }));
    expect(byName.updates).toHaveLength(0);
    expect(byName.skips[0].reason).toBe("email_on_another_company");
  });

  it("respects the per-run limit on new contacts", () => {
    const many = Array.from({ length: 4 }, (_, i) => candidate({ email: `p${i}@acme-tools.in`, firstName: `P${i}`, lastName: "Person" }));
    const plan = planContactChanges(base({ maxNewContacts: 2, candidates: many }));
    expect(plan.creates).toHaveLength(2);
    expect(plan.skips.filter((s) => s.reason === "limit_reached")).toHaveLength(2);
  });

  it("allows subdomain addresses", () => {
    expect(planContactChanges(base({ candidates: [candidate({ email: "asha@mail.acme-tools.in" })] })).creates).toHaveLength(1);
  });
});

describe("helpers", () => {
  it("finds Email Finder targets: named contacts without an address", () => {
    const targets = finderTargets(
      [
        existing({ id: "a", fullName: "Neha Patel" }),
        existing({ id: "b", fullName: "Madhu", email: null }),
        existing({ id: "c", fullName: "Kiran Rao", email: "k@acme.in" }),
        existing({ id: "d", fullName: "Opted Out", doNotContact: true }),
      ],
      new Set(),
    );
    expect(targets.map((t) => [t.id, t.firstName, t.lastName])).toEqual([["a", "Neha", "Patel"]]);
  });

  it("splits names, masks emails and tolerates bad provenance", () => {
    expect(splitName("Dr. Ananya  Rao Iyer")).toEqual({ firstName: "Dr.", lastName: "Iyer" });
    expect(splitName("Madhu")).toBeNull();
    expect(maskEmail("Richard@PiedPiper.com")).toBe("r***@piedpiper.com");
    expect(parseProvenance("not an object")).toEqual({});
    expect(parseProvenance({ email: { source: "manual", retrievedAt: "x" } }).email?.source).toBe("manual");
  });
});

describe("secret handling in source code", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? files(full) : /\.tsx?$/.test(name) ? [full] : [];
    });

  it("reads HUNTER_API_KEY only in the server-only Hunter client", () => {
    const readers = files("src").filter((file) => /\.HUNTER_API_KEY\b/.test(readFileSync(file, "utf8")));
    expect(readers).toEqual([join("src", "server", "providers", "hunter", "client.ts")]);
    expect(readFileSync(readers[0], "utf8")).toMatch(/^import "server-only";/);
  });

  it("never imports the Hunter client or enrichment service from a client component", () => {
    const offenders = files("src").filter((file) => {
      const source = readFileSync(file, "utf8");
      return /^\s*["']use client["']/.test(source) && /from ["']@\/server\/(providers\/hunter|services\/enrichment)/.test(source);
    });
    expect(offenders).toEqual([]);
  });
});
