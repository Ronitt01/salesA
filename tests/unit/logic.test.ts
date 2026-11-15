import { describe, expect, it } from "vitest";
import { calendarDate, resolveRange, startOfDateInTz, tzOffsetMinutes } from "@/lib/date-range";
import { formatInrCompact, formatPercent, formatRelative } from "@/lib/format";
import { leadHref, onlyFilters, toLeadParams } from "@/lib/lead-params";
import { INDUSTRY_CATALOGUE, SERVICE_TEMPLATES, type IndustrySlug, type ServiceSlug } from "@/server/demo/bootstrap";
import { generateDemoDataset } from "@/server/demo/generate";
import { createRng } from "@/server/demo/prng";
import { MIN_SAMPLE_FOR_RATE, buildDailyInsights, buildIndustryRecommendations } from "@/server/services/analytics/insights";
import { FULL_EVIDENCE_AT, scoreIndustry } from "@/server/services/market/industry-score";

describe("date ranges and timezones", () => {
  it("knows India is 5h30 ahead of UTC and has no daylight saving", () => {
    expect(tzOffsetMinutes(new Date("2026-01-15T00:00:00Z"), "Asia/Kolkata")).toBe(330);
    expect(tzOffsetMinutes(new Date("2026-07-15T00:00:00Z"), "Asia/Kolkata")).toBe(330);
  });

  it("handles daylight saving in other timezones", () => {
    expect(tzOffsetMinutes(new Date("2026-01-15T12:00:00Z"), "Europe/London")).toBe(0);
    expect(tzOffsetMinutes(new Date("2026-07-15T12:00:00Z"), "Europe/London")).toBe(60);
    expect(tzOffsetMinutes(new Date("2026-01-15T12:00:00Z"), "America/New_York")).toBe(-300);
    expect(tzOffsetMinutes(new Date("2026-07-15T12:00:00Z"), "America/New_York")).toBe(-240);
  });

  it("finds the start of a calendar day in a timezone", () => {
    expect(startOfDateInTz("2026-11-15", "Asia/Kolkata").toISOString()).toBe("2026-11-14T18:30:00.000Z");
    expect(startOfDateInTz("2026-07-15", "America/New_York").toISOString()).toBe("2026-07-15T04:00:00.000Z");
    expect(startOfDateInTz("2026-11-15", "UTC").toISOString()).toBe("2026-11-15T00:00:00.000Z");
  });

  it("uses the workspace calendar day, not the UTC day", () => {
    // 20:00 UTC on the 14th is already 01:30 on the 15th in India.
    const late = new Date("2026-11-14T20:00:00Z");
    expect(calendarDate(late, "Asia/Kolkata")).toBe("2026-11-15");
    expect(calendarDate(late, "UTC")).toBe("2026-11-14");
    const today = resolveRange({ range: "today" }, "Asia/Kolkata", late);
    expect(today.from).toBe("2026-11-14T18:30:00.000Z");
    expect(today.to).toBe(late.toISOString());
  });

  it("resolves presets, defaulting to 30 days", () => {
    const now = new Date("2026-11-15T10:00:00Z");
    expect(resolveRange({}, "Asia/Kolkata", now).key).toBe("30d");
    expect(resolveRange({ range: "nonsense" }, "Asia/Kolkata", now).key).toBe("30d");
    const week = resolveRange({ range: "7d" }, "Asia/Kolkata", now);
    expect(week.fromDate).toBe("2026-11-09");
    expect(week.toDate).toBe("2026-11-15");
    expect(week.bucket).toBe("day");
    expect(resolveRange({ range: "90d" }, "Asia/Kolkata", now).bucket).toBe("week");
  });

  it("treats a custom end date as inclusive and repairs a reversed range", () => {
    const now = new Date("2026-11-15T10:00:00Z");
    const r = resolveRange({ range: "custom", from: "2026-11-10", to: "2026-11-01" }, "Asia/Kolkata", now);
    expect(r.key).toBe("custom");
    expect(r.fromDate).toBe("2026-11-01");
    expect(r.toDate).toBe("2026-11-10");
    expect(r.from).toBe("2026-10-31T18:30:00.000Z");
    expect(r.to).toBe("2026-11-10T18:30:00.000Z");
  });

  it("falls back to the default when custom dates are malformed", () => {
    const now = new Date("2026-11-15T10:00:00Z");
    expect(resolveRange({ range: "custom", from: "yesterday", to: "2026-11-01" }, "Asia/Kolkata", now).key).toBe("30d");
  });
});

describe("formatting", () => {
  it("formats rupees in lakh and crore", () => {
    expect(formatInrCompact(950)).toBe("₹950");
    expect(formatInrCompact(45_000)).toBe("₹45K");
    expect(formatInrCompact(909_000)).toBe("₹9.1L");
    expect(formatInrCompact(9_090_000)).toBe("₹90.9L");
    expect(formatInrCompact(12_500_000)).toBe("₹1.3Cr");
    expect(formatInrCompact(null)).toBe("–");
  });

  it("formats percentages and relative times", () => {
    expect(formatPercent(94.5)).toBe("94.5%");
    expect(formatPercent(80)).toBe("80%");
    expect(formatPercent(null)).toBe("–");
    const now = new Date("2026-11-15T10:00:00Z");
    expect(formatRelative("2026-11-15T07:00:00Z", now)).toBe("3h ago");
    expect(formatRelative("2026-11-17T10:00:00Z", now)).toBe("in 2d");
    expect(formatRelative("2026-11-15T09:59:50Z", now)).toBe("just now");
  });
});

describe("lead explorer URL parameters", () => {
  it("drops defaults and empty values", () => {
    expect(toLeadParams({ q: "", sort: "opportunity_score", dir: "desc", page: 1, per: 25, stage: [], industry: undefined })).toEqual({});
    expect(toLeadParams({ q: "acme", stage: ["qualified", "contacted"], page: 2 })).toEqual({
      q: "acme",
      stage: "qualified,contacted",
      page: "2",
    });
  });

  it("builds links that add, change and remove parameters", () => {
    expect(leadHref({})).toBe("/leads");
    expect(leadHref({ q: "acme" }, { stage: "qualified" })).toBe("/leads?q=acme&stage=qualified");
    expect(leadHref({ q: "acme", page: "3" }, { q: null, page: null })).toBe("/leads");
    expect(leadHref({ sort: "state" }, { sort: "opportunity_score" })).toBe("/leads");
  });

  it("separates filters from sorting and paging", () => {
    expect(onlyFilters({ q: "a", sort: "state", page: "2", industry: "x" })).toEqual({ q: "a", industry: "x" });
  });
});

describe("industry score", () => {
  const neutral = { problemEvidence: 5, abilityToPay: 5, decisionMakerAccess: 5, dealSize: 5, recurringPotential: 5, deliveryProfitability: 5 };
  const none = { discovered: 0, qualified: 0, contacted: 0, positiveReplies: 0, meetings: 0, won: 0, revenue: 0, grossProfit: 0, acquisitionCost: 0 };

  it("is pure assumption when nothing has been contacted", () => {
    const r = scoreIndustry(neutral, none);
    expect(r.score).toBe(50);
    expect(r.assumedScore).toBe(50);
    expect(r.actualScore).toBeNull();
    expect(r.evidenceWeight).toBe(0);
  });

  it("gives actual results more weight as evidence accumulates", () => {
    const optimistic = { ...neutral, abilityToPay: 10, dealSize: 10, problemEvidence: 10 };
    const poorResults = { ...none, discovered: 40, qualified: 4, positiveReplies: 0, meetings: 0 };
    const few = scoreIndustry(optimistic, { ...poorResults, contacted: 5 });
    const many = scoreIndustry(optimistic, { ...poorResults, contacted: FULL_EVIDENCE_AT });
    expect(few.evidenceWeight).toBeCloseTo(0.2);
    expect(many.evidenceWeight).toBe(1);
    expect(many.score).toBeLessThan(few.score);
    expect(many.score).toBe(many.actualScore);
  });

  it("does not let replies alone outrank profitable revenue", () => {
    const replies = scoreIndustry(neutral, { ...none, discovered: 30, qualified: 30, contacted: 30, positiveReplies: 30, meetings: 30 });
    const profit = scoreIndustry(neutral, {
      ...none,
      discovered: 30,
      qualified: 10,
      contacted: 30,
      positiveReplies: 3,
      meetings: 2,
      won: 2,
      revenue: 1_200_000,
      grossProfit: 800_000,
      acquisitionCost: 50_000,
    });
    expect(replies.actualScore).toBeLessThanOrEqual(45);
    expect(profit.score).toBeGreaterThan(replies.score);
  });

  it("stays within 0 to 100 for extreme inputs", () => {
    const r = scoreIndustry(
      { ...neutral, problemEvidence: 99, abilityToPay: -5 },
      { ...none, discovered: 1, qualified: 50, contacted: 1, positiveReplies: 90, meetings: 90, won: 9, revenue: 9e9, grossProfit: 9e9, acquisitionCost: 1 },
    );
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

describe("insights and recommendations", () => {
  const row = (over: Partial<Parameters<typeof buildIndustryRecommendations>[0][number]>) => ({
    industryId: "i",
    industry: "Test",
    qualified: 0,
    contacted: 0,
    positiveReplies: 0,
    positiveReplyRate: null,
    meetings: 0,
    proposals: 0,
    won: 0,
    revenue: 0,
    grossProfit: 0,
    acquisitionCost: 0,
    ...over,
  });

  it("recommends investing only where profit exceeds acquisition cost", () => {
    const [rec] = buildIndustryRecommendations([row({ contacted: 10, won: 1, revenue: 500_000, grossProfit: 300_000, acquisitionCost: 20_000 })]);
    expect(rec.action).toBe("invest");
  });

  it("refuses to judge an industry on a tiny sample", () => {
    const [rec] = buildIndustryRecommendations([row({ contacted: MIN_SAMPLE_FOR_RATE - 1, positiveReplies: 3, positiveReplyRate: 75 })]);
    expect(rec.action).toBe("insufficient_data");
  });

  it("ranks proven profit above a high reply rate", () => {
    const recs = buildIndustryRecommendations([
      row({ industryId: "replies", industry: "Replies", contacted: 20, positiveReplies: 18, positiveReplyRate: 90, meetings: 4 }),
      row({ industryId: "profit", industry: "Profit", contacted: 8, won: 1, revenue: 400_000, grossProfit: 250_000, acquisitionCost: 10_000 }),
    ]);
    expect(recs[0].industryId).toBe("profit");
  });

  it("states the figures behind every insight and never invents a reply-rate winner from small samples", () => {
    const metric = (value: number | null) => ({ value, previous: 0 });
    const insights = buildDailyInsights({
      kpis: {
        new_qualified_today: metric(3),
        positive_replies: metric(2),
        meetings_booked: metric(4),
        meetings_attended: metric(1),
        workflow_success_rate: metric(90),
      },
      industries: [row({ contacted: 2, positiveReplies: 2, positiveReplyRate: 100 })],
      channels: [],
      workflows: [{ key: "WF-02", name: "Research", succeeded: 8, failed: 2 }],
      dailyTarget: 8,
      rangeLabel: "Last 30 days",
    });
    for (const insight of insights) expect(insight.basis.length).toBeGreaterThan(0);
    expect(insights.find((i) => i.id === "target")?.text).toContain("3 of 8");
    expect(insights.find((i) => i.id === "reply-rate")?.text).toContain("not yet comparable");
    expect(insights.find((i) => i.id === "meetings")?.text).toContain("4 meetings were booked and 1 attended");
    expect(insights.find((i) => i.id === "workflow")?.basis).toContain("2 of 10 runs failed");
  });
});

describe("synthetic demo dataset", () => {
  const refs = {
    tenantId: "00000000-0000-4000-8000-000000000001",
    ownerUserId: "00000000-0000-4000-8000-000000000002",
    targetCountry: "IN",
    industries: Object.fromEntries(INDUSTRY_CATALOGUE.map((i, n) => [i.slug, `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`])) as Record<IndustrySlug, string>,
    services: Object.fromEntries(SERVICE_TEMPLATES.map((s, n) => [s.slug, `00000000-0000-4000-8000-0000000002${String(n).padStart(2, "0")}`])) as Record<ServiceSlug, string>,
    jobs: Object.fromEntries(["WF-01", "WF-02", "WF-03", "WF-04", "WF-05", "WF-06"].map((k, n) => [k, `00000000-0000-4000-8000-00000000030${n}`])),
  };
  const now = new Date("2026-11-15T10:00:00Z");
  const data = generateDemoDataset(refs, now);

  it("produces exactly the requested volumes", () => {
    expect(data.companies).toHaveLength(50);
    expect(data.contacts).toHaveLength(70);
    expect(data.buyingSignals).toHaveLength(100);
    expect(data.opportunities).toHaveLength(40);
    expect(data.campaigns.length).toBeGreaterThan(0);
    expect(data.conversations.length).toBeGreaterThan(0);
    expect(data.meetings.length).toBeGreaterThan(0);
    expect(data.workflowExecutions.length).toBeGreaterThan(0);
  });

  it("is reproducible for the same tenant and time", () => {
    expect(JSON.stringify(generateDemoDataset(refs, now))).toBe(JSON.stringify(data));
  });

  it("flags every record as demo data and uses only reserved .example domains", () => {
    for (const [name, rows] of Object.entries(data)) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows as Array<{ is_demo?: boolean }>) expect(row.is_demo, `${name} row is not flagged`).toBe(true);
    }
    for (const company of data.companies) expect(company.domain).toMatch(/\.example$/);
    for (const contact of data.contacts) expect(contact.email).toMatch(/\.example$/);
    for (const signal of data.buyingSignals) expect(signal.source_url).toMatch(/^https:\/\/[a-z0-9-]+\.example\//);
  });

  it("only marks a company qualified when the scoring engine qualified it", () => {
    const snapshots = new Map(data.leadScoreSnapshots.map((s) => [s.company_id, s]));
    for (const company of data.companies) {
      if (!company.is_qualified) continue;
      const snapshot = snapshots.get(company.id as string);
      expect(snapshot?.is_qualified).toBe(true);
      expect(company.opportunity_score).toBe(snapshot?.total_score);
    }
    expect(data.companies.filter((c) => c.is_qualified).length).toBeGreaterThan(20);
  });

  it("never dates anything in the future except scheduled meetings and signal expiries", () => {
    const limit = now.toISOString();
    for (const c of data.companies) {
      for (const key of ["discovered_at", "researched_at", "qualified_at", "first_contacted_at", "customer_at"] as const) {
        const value = c[key];
        if (value) expect(value <= limit, `${c.name} ${key}`).toBe(true);
      }
    }
    for (const m of data.messages) {
      if (m.sent_at) expect(m.sent_at <= limit).toBe(true);
      if (m.received_at) expect(m.received_at <= limit).toBe(true);
    }
  });

  it("gives every booked meeting a prospect-selected slot", () => {
    for (const m of data.meetings) {
      if (m.status !== "proposed") expect(m.slot_selected_by_prospect).toBe(true);
      else expect(m.booked_at ?? null).toBeNull();
    }
  });

  it("generates unique emails and message idempotency keys", () => {
    const emails = data.contacts.map((c) => c.email);
    expect(new Set(emails).size).toBe(emails.length);
    const keys = data.messages.map((m) => m.idempotency_key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has a seeded generator that is stable and produces well-formed UUIDs", () => {
    const a = createRng("seed");
    const b = createRng("seed");
    expect([a.next(), a.int(1, 10), a.uuid()]).toEqual([b.next(), b.int(1, 10), b.uuid()]);
    expect(createRng("x").uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
