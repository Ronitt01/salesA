import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HunterError, type HunterApi, type HunterResult } from "@/server/providers/hunter/client";
import type { DomainSearchResponse, EmailFinderResponse, EmailVerifierResponse } from "@/server/providers/hunter/schemas";
import { enrichCompanyContacts, verifyContactEmail } from "@/server/services/enrichment/enrich";
import { DEFAULT_POLICY } from "@/server/services/enrichment/policy";
import { adminClient, createTenant, destroyTenant, type Client, type TestTenant } from "./helpers";

/**
 * Contact enrichment against the real local database, with a scripted Hunter fake.
 * No request reaches Hunter.
 */
const admin = adminClient();
let a: TestTenant;
let b: TestTenant;

const verifierTemplate = JSON.parse(readFileSync("tests/fixtures/hunter/email-verifier.json", "utf8")).data;

function meta<T>(endpoint: HunterResult<T>["meta"]["endpoint"], unit: string) {
  return { endpoint, status: 200, attempts: 1, durationMs: 5, credits: { used: 1, unit }, retrievedAt: new Date().toISOString(), testKey: false };
}

interface Person {
  email: string;
  first?: string | null;
  last?: string | null;
  position?: string | null;
  seniority?: string | null;
  confidence?: number;
  type?: string;
}

/** A Hunter fake whose answers are set per test. Records every call. */
class FakeHunter implements HunterApi {
  testKey = false;
  calls: string[] = [];
  people: Person[] = [];
  domainOverride: string | null = null;
  domainError: HunterError | null = null;
  finder: (first: string, last: string) => { email: string | null; score: number } | HunterError = () => ({ email: null, score: 0 });
  verifier: (email: string) => string | HunterError = () => "valid";

  async domainSearch(params: { domain: string }): Promise<HunterResult<DomainSearchResponse>> {
    this.calls.push("domain-search");
    if (this.domainError) throw this.domainError;
    return {
      data: {
        data: {
          domain: this.domainOverride ?? params.domain,
          disposable: false,
          webmail: false,
          accept_all: false,
          pattern: "{first}",
          organization: "Test Org",
          emails: this.people.map((p) => ({
            value: p.email,
            type: p.type ?? "personal",
            confidence: p.confidence ?? 90,
            provenance: "found",
            sources: [{ domain: params.domain, uri: `https://${params.domain}/team`, extracted_on: "2026-10-01", last_seen_on: "2026-11-01", still_on_page: true }],
            first_name: p.first === undefined ? "First" : p.first,
            last_name: p.last === undefined ? "Last" : p.last,
            position: p.position ?? null,
            position_raw: p.position ?? null,
            seniority: p.seniority ?? null,
            department: null,
            decision_maker: null,
            linkedin: null,
            phone_number: null,
            verification: { date: "2026-10-01", status: "valid" },
          })),
        },
      },
      meta: meta("domain-search", "search"),
    };
  }

  async emailFinder(params: { domain: string; firstName: string; lastName: string }): Promise<HunterResult<EmailFinderResponse>> {
    this.calls.push("email-finder");
    const result = this.finder(params.firstName, params.lastName);
    if (result instanceof HunterError) throw result;
    return {
      data: {
        data: {
          first_name: params.firstName,
          last_name: params.lastName,
          email: result.email,
          score: result.score,
          domain: params.domain,
          accept_all: false,
          position: null,
          company: null,
          provenance: "found",
          sources: [],
          verification: null,
        },
      },
      meta: meta("email-finder", "search"),
    };
  }

  async emailVerifier(params: { email: string }): Promise<HunterResult<EmailVerifierResponse>> {
    this.calls.push("email-verifier");
    const status = this.verifier(params.email);
    if (status instanceof HunterError) throw status;
    return { data: { data: { ...verifierTemplate, email: params.email, status, sources: [] } }, meta: meta("email-verifier", "verification") };
  }
}

let companySeq = 0;
async function makeCompany(client: Client, tenantId: string, overrides: Record<string, unknown> = {}) {
  companySeq += 1;
  const domain = `enrich-${companySeq}-${Date.now()}.in`;
  const { data, error } = await client
    .from("companies")
    .insert({
      tenant_id: tenantId,
      name: `Enrichment Test ${companySeq}`,
      domain,
      lead_stage: "researched",
      researched_at: new Date().toISOString(),
      opportunity_score: 70,
      employee_range: "50-99",
      ...overrides,
    })
    .select("id, normalised_domain")
    .single();
  if (error) throw error;
  return { id: data.id, domain: data.normalised_domain as string };
}

/**
 * Rescoring after a run can move a test company below the policy's minimum score, which would
 * (correctly) block the re-runs these tests need. The score threshold has its own test below.
 */
const TEST_POLICY = { ...DEFAULT_POLICY, minScore: 0 };
const run = (client: Client, tenantId: string, companyId: string, hunter: FakeHunter, force = false, policy = TEST_POLICY) =>
  enrichCompanyContacts(client, tenantId, companyId, hunter, { actorUserId: null, policy, force });

async function contactsOf(companyId: string) {
  const { data } = await admin.from("contacts").select("*").eq("company_id", companyId).order("created_at");
  return data ?? [];
}

beforeAll(async () => {
  a = await createTenant(admin, "enrich-a", ["owner", "member"]);
  b = await createTenant(admin, "enrich-b", ["owner"]);
});

afterAll(async () => {
  await destroyTenant(admin, a);
  await destroyTenant(admin, b);
});

describe("contact discovery", () => {
  it("adds relevant people with provenance, confidence and Hunter's exact verification result", async () => {
    const client = a.users.member.client;
    const company = await makeCompany(client, a.tenantId);
    const hunter = new FakeHunter();
    hunter.people = [
      { email: `ceo@${company.domain}`, first: "Meera", last: "Shah", position: "CEO", seniority: "executive", confidence: 96 },
      { email: `ops@${company.domain}`, first: "Ravi", last: "Iyer", position: "Head of Operations", confidence: 88 },
      { email: `info@${company.domain}`, first: null, last: null, type: "generic" },
      { email: `intern@${company.domain}`, first: "Tara", last: "Das", position: "Intern", seniority: "junior" },
    ];
    hunter.verifier = (email) => (email.startsWith("ops@") ? "accept_all" : "valid");

    const outcome = await run(client, a.tenantId, company.id, hunter);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.summary).toMatchObject({ created: 2, verified: 2 });
    expect(outcome.summary.skipped).toMatchObject({ generic_mailbox: 1, below_relevance: 1 });
    expect(outcome.summary.calls).toEqual({ "domain-search": 1, "email-verifier": 2 });
    expect(outcome.summary.credits).toEqual({ search: 1, verification: 2 });

    const stored = await contactsOf(company.id);
    expect(stored.map((c) => c.full_name)).toEqual(["Meera Shah", "Ravi Iyer"]);
    const [ceo, ops] = stored;
    expect(ceo).toMatchObject({ email: `ceo@${company.domain}`, email_confidence: 96, is_primary: true, verification_status: "valid", verification_provider: "hunter.io", role_category: "director_cxo" });
    // accept_all is never treated as verified deliverable.
    expect(ops.verification_status).toBe("catch_all");
    expect(ceo.last_verified_at).not.toBeNull();
    const provenance = ceo.field_provenance as Record<string, { source: string; sourceId: string }>;
    expect(provenance.email.source).toBe("hunter.io:domain_search");
    expect(provenance.full_name.source).toBe("hunter.io:domain_search");
    expect(provenance.verification.source).toBe("hunter.io:email_verifier");

    // The run's source row describes the retrieval, without the API key.
    const source = await admin.from("sources").select("*").eq("id", provenance.email.sourceId).single();
    expect(source.data).toMatchObject({ kind: "search_provider", provider: "hunter.io", query: company.domain });
    expect(ceo.source_id).toBe(provenance.email.sourceId);

    const history = await admin.from("contact_verifications").select("provider, result, detail").eq("contact_id", ops.id);
    expect(history.data?.[0]).toMatchObject({ provider: "hunter.io", result: "catch_all" });
    expect((history.data?.[0].detail as { hunter_status: string }).hunter_status).toBe("accept_all");

    const audit = await admin.from("audit_logs").select("action, detail").eq("entity_id", company.id).eq("action", "contacts.enriched").single();
    expect(audit.data?.detail).toMatchObject({ provider: "hunter.io", created: 2, calls: { "domain-search": 1, "email-verifier": 2 } });
    // The company was rescored with its new contacts.
    const snapshots = await admin.from("lead_score_snapshots").select("id", { count: "exact", head: true }).eq("company_id", company.id);
    expect(snapshots.count).toBeGreaterThan(0);
  });

  it("does not create duplicates when run again, and respects the cooldown", async () => {
    const client = a.users.member.client;
    const company = await makeCompany(client, a.tenantId);
    const hunter = new FakeHunter();
    hunter.people = [{ email: `founder@${company.domain}`, first: "Amit", last: "Rao", position: "Founder" }];
    await run(client, a.tenantId, company.id, hunter);

    const blocked = await run(client, a.tenantId, company.id, hunter);
    expect(blocked.ok).toBe(false);
    expect(!blocked.ok && blocked.reason).toContain("day(s) ago");
    expect(hunter.calls.filter((c) => c === "domain-search")).toHaveLength(1);

    const forced = await run(client, a.tenantId, company.id, hunter, true);
    expect(forced.ok && forced.summary.created).toBe(0);
    expect(await contactsOf(company.id)).toHaveLength(1);
  });

  it("preserves data a person entered: email, title and name", async () => {
    const client = a.users.member.client;
    const company = await makeCompany(client, a.tenantId);
    await client.from("contacts").insert({
      tenant_id: a.tenantId,
      company_id: company.id,
      full_name: "Neha Kapoor",
      job_title: "Proprietor",
      email: `neha.k@${company.domain}`,
      is_primary: true,
      field_provenance: { full_name: { source: "manual", retrievedAt: new Date().toISOString() }, email: { source: "manual", retrievedAt: new Date().toISOString() }, job_title: { source: "manual", retrievedAt: new Date().toISOString() } },
    });
    const hunter = new FakeHunter();
    hunter.people = [{ email: `neha@${company.domain}`, first: "Neha", last: "Kapoor", position: "Founder & CEO", confidence: 99 }];

    const outcome = await run(client, a.tenantId, company.id, hunter, true);
    expect(outcome.ok).toBe(true);
    const [contact] = await contactsOf(company.id);
    expect(contact).toMatchObject({ full_name: "Neha Kapoor", job_title: "Proprietor", email: `neha.k@${company.domain}` });
    expect(outcome.ok && outcome.summary.skipped.kept_existing).toBe(1);
  });

  it("never replaces a provider email with a lower-confidence one, but does with a higher one", async () => {
    const client = a.users.member.client;
    const company = await makeCompany(client, a.tenantId);
    const hunter = new FakeHunter();
    hunter.people = [{ email: `vikram@${company.domain}`, first: "Vikram", last: "Joshi", position: "CEO", confidence: 80 }];
    await run(client, a.tenantId, company.id, hunter);

    hunter.people = [{ email: `v.joshi@${company.domain}`, first: "Vikram", last: "Joshi", position: "CEO", confidence: 60 }];
    await run(client, a.tenantId, company.id, hunter, true);
    expect((await contactsOf(company.id))[0].email).toBe(`vikram@${company.domain}`);

    hunter.people = [{ email: `v.joshi@${company.domain}`, first: "Vikram", last: "Joshi", position: "CEO", confidence: 95 }];
    await run(client, a.tenantId, company.id, hunter, true);
    const contacts = await contactsOf(company.id);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ email: `v.joshi@${company.domain}`, email_confidence: 95 });
  });

  it("uses Email Finder only for named contacts without an address", async () => {
    const client = a.users.member.client;
    const company = await makeCompany(client, a.tenantId);
    const seeded = await client.from("contacts").insert([
      { tenant_id: a.tenantId, company_id: company.id, full_name: "Sunil Menon", email: null, is_primary: true },
      { tenant_id: a.tenantId, company_id: company.id, full_name: "Has Email", email: `has@${company.domain}`, is_primary: false },
    ]);
    expect(seeded.error).toBeNull();
    const hunter = new FakeHunter();
    hunter.finder = (first) => ({ email: `${first.toLowerCase()}@${company.domain}`, score: 91 });

    const outcome = await run(client, a.tenantId, company.id, hunter);
    expect(outcome.ok && outcome.summary.findersRun).toBe(1);
    const sunil = (await contactsOf(company.id)).find((c) => c.full_name === "Sunil Menon");
    expect(sunil).toMatchObject({ email: `sunil@${company.domain}`, email_confidence: 91, verification_status: "valid" });
    expect((sunil?.field_provenance as Record<string, { source: string }>).email.source).toBe("hunter.io:email_finder");
  });

  it("stores nothing about a person who asked not to be processed", async () => {
    const client = a.users.member.client;
    const company = await makeCompany(client, a.tenantId);
    await client.from("contacts").insert({ tenant_id: a.tenantId, company_id: company.id, full_name: "Private Person", is_primary: true });
    const hunter = new FakeHunter();
    hunter.people = [{ email: `objector@${company.domain}`, first: "Objecting", last: "Founder", position: "Founder" }];
    hunter.finder = () => new HunterError("data_processing_objection", "Asked not to be processed.", { status: 451 });
    hunter.verifier = (email) => (email.startsWith("objector@") ? new HunterError("data_processing_objection", "Asked not to be processed.", { status: 451 }) : "valid");

    const outcome = await run(client, a.tenantId, company.id, hunter);
    expect(outcome.ok && outcome.summary.skipped.data_processing_objection).toBe(2);
    const contacts = await contactsOf(company.id);
    expect(contacts.map((c) => c.full_name)).toEqual(["Private Person"]);
    expect(contacts[0].email).toBeNull();
  });

  it("skips suppressed addresses and addresses already held by another company", async () => {
    const client = a.users.member.client;
    const company = await makeCompany(client, a.tenantId);
    const other = await makeCompany(client, a.tenantId);
    await client.from("suppressions").insert({ tenant_id: a.tenantId, address: `optout@${company.domain}`, reason: "unsubscribe" });
    await client.from("contacts").insert({ tenant_id: a.tenantId, company_id: other.id, full_name: "Shared Person", email: `shared@${company.domain}` });
    const hunter = new FakeHunter();
    hunter.people = [
      { email: `optout@${company.domain}`, first: "Opted", last: "Out", position: "CEO" },
      { email: `shared@${company.domain}`, first: "Shared", last: "Person", position: "Founder" },
    ];
    const outcome = await run(client, a.tenantId, company.id, hunter);
    expect(outcome.ok && outcome.summary.skipped).toMatchObject({ suppressed: 1, email_on_another_company: 1 });
    expect(await contactsOf(company.id)).toHaveLength(0);
  });
});

describe("failures never corrupt existing contacts", () => {
  it("writes nothing when Domain Search fails, and records the failure", async () => {
    const client = a.users.member.client;
    const company = await makeCompany(client, a.tenantId);
    await client.from("contacts").insert({ tenant_id: a.tenantId, company_id: company.id, full_name: "Existing Person", email: `existing@${company.domain}`, job_title: "Director", is_primary: true });
    const before = await contactsOf(company.id);

    const hunter = new FakeHunter();
    hunter.domainError = new HunterError("quota_exhausted", "Usage limit reached.", { status: 429 });
    const outcome = await run(client, a.tenantId, company.id, hunter);
    expect(outcome).toMatchObject({ ok: false, kind: "provider_error" });
    expect(await contactsOf(company.id)).toEqual(before);
    const sources = await admin.from("sources").select("id", { count: "exact", head: true }).eq("tenant_id", a.tenantId).eq("query", company.domain);
    expect(sources.count).toBe(0);
    const failure = await admin.from("audit_logs").select("detail").eq("entity_id", company.id).eq("action", "contacts.enrichment_failed").single();
    expect(failure.data?.detail).toMatchObject({ error_kind: "quota_exhausted" });
  });

  it("keeps contacts unverified when the verifier fails, and stops paid calls when the quota runs out", async () => {
    const client = a.users.member.client;
    const company = await makeCompany(client, a.tenantId);
    const hunter = new FakeHunter();
    hunter.people = [
      { email: `one@${company.domain}`, first: "One", last: "Founder", position: "Founder" },
      { email: `two@${company.domain}`, first: "Two", last: "Chief", position: "CEO" },
    ];
    hunter.verifier = () => new HunterError("quota_exhausted", "Usage limit reached.", { status: 429 });
    const outcome = await run(client, a.tenantId, company.id, hunter);
    expect(outcome.ok && outcome.summary).toMatchObject({ created: 2, verified: 0 });
    expect(outcome.ok && outcome.summary.errors).toHaveLength(1);
    expect(hunter.calls.filter((c) => c === "email-verifier")).toHaveLength(1);
    expect((await contactsOf(company.id)).every((c) => c.verification_status === "unverified")).toBe(true);
  });

  it("rejects results for a different domain without storing anything", async () => {
    const client = a.users.member.client;
    const company = await makeCompany(client, a.tenantId);
    const hunter = new FakeHunter();
    hunter.domainOverride = "piedpiper.com";
    hunter.people = [{ email: "richard@piedpiper.com", first: "Richard", last: "Hendricks", position: "CEO" }];
    const outcome = await run(client, a.tenantId, company.id, hunter);
    expect(outcome).toMatchObject({ ok: false, kind: "provider_error" });
    expect(await contactsOf(company.id)).toHaveLength(0);
  });
});

describe("guards before any paid call", () => {
  it("refuses Hunter's test key, demo companies and ineligible companies without calling Hunter", async () => {
    const client = a.users.member.client;
    const eligible = await makeCompany(client, a.tenantId);
    const test = new FakeHunter();
    test.testKey = true;
    expect(await run(client, a.tenantId, eligible.id, test)).toMatchObject({ ok: false, kind: "test_key" });

    const demo = await makeCompany(client, a.tenantId, { is_demo: true });
    const lowScore = await makeCompany(client, a.tenantId, { opportunity_score: 30 });
    const unresearched = await makeCompany(client, a.tenantId, { lead_stage: "discovered", researched_at: null });
    const hunter = new FakeHunter();
    for (const company of [demo, lowScore, unresearched]) {
      expect(await run(client, a.tenantId, company.id, hunter, false, DEFAULT_POLICY)).toMatchObject({ ok: false, kind: "ineligible" });
    }
    expect(test.calls).toEqual([]);
    expect(hunter.calls).toEqual([]);
  });

  it("cannot enrich another tenant's company", async () => {
    const company = await makeCompany(b.users.owner.client, b.tenantId);
    const hunter = new FakeHunter();
    const outcome = await run(a.users.member.client, b.tenantId, company.id, hunter);
    expect(outcome).toMatchObject({ ok: false, kind: "not_found" });
    expect(hunter.calls).toEqual([]);
  });
});

describe("single email verification", () => {
  it("records Hunter's exact result, and skips a second call within the cooldown", async () => {
    const client = a.users.member.client;
    const company = await makeCompany(client, a.tenantId);
    const inserted = await client.from("contacts").insert({ tenant_id: a.tenantId, company_id: company.id, full_name: "Kiran Bose", email: `kiran@${company.domain}` }).select("id").single();
    const hunter = new FakeHunter();
    hunter.verifier = () => "unknown";

    const first = await verifyContactEmail(client, a.tenantId, inserted.data!.id, hunter, { actorUserId: null, policy: DEFAULT_POLICY });
    expect(first).toMatchObject({ ok: true, cached: false, status: "unknown", hunterStatus: "unknown" });
    const second = await verifyContactEmail(client, a.tenantId, inserted.data!.id, hunter, { actorUserId: null, policy: DEFAULT_POLICY });
    expect(second).toMatchObject({ ok: true, cached: true, hunterStatus: "unknown" });
    expect(hunter.calls).toEqual(["email-verifier"]);
  });

  it("never changes a status verified by a person, but keeps Hunter's result in the history", async () => {
    const client = a.users.member.client;
    const company = await makeCompany(client, a.tenantId);
    const inserted = await client
      .from("contacts")
      .insert({ tenant_id: a.tenantId, company_id: company.id, full_name: "Manual Check", email: `manual@${company.domain}`, verification_status: "valid", verification_provider: "manual", last_verified_at: new Date().toISOString() })
      .select("id")
      .single();
    const hunter = new FakeHunter();
    hunter.verifier = () => "invalid";
    const outcome = await verifyContactEmail(client, a.tenantId, inserted.data!.id, hunter, { actorUserId: null, policy: DEFAULT_POLICY, force: true });
    expect(outcome).toMatchObject({ ok: true, manualPreserved: true, status: "valid" });
    const contact = await admin.from("contacts").select("verification_status, verification_provider").eq("id", inserted.data!.id).single();
    expect(contact.data).toEqual({ verification_status: "valid", verification_provider: "manual" });
    const history = await admin.from("contact_verifications").select("result, detail").eq("contact_id", inserted.data!.id).single();
    expect(history.data).toMatchObject({ result: "invalid", detail: { hunter_status: "invalid" } });
  });

  it("leaves the contact unchanged when the verifier fails, and refuses demo contacts", async () => {
    const client = a.users.member.client;
    const company = await makeCompany(client, a.tenantId);
    const inserted = await client.from("contacts").insert({ tenant_id: a.tenantId, company_id: company.id, full_name: "Steady State", email: `steady@${company.domain}` }).select("*").single();
    const hunter = new FakeHunter();
    hunter.verifier = () => new HunterError("provider_unavailable", "Down.", { status: 503 });
    const outcome = await verifyContactEmail(client, a.tenantId, inserted.data!.id, hunter, { actorUserId: null, policy: DEFAULT_POLICY });
    expect(outcome).toMatchObject({ ok: false, kind: "provider_error" });
    const after = await admin.from("contacts").select("*").eq("id", inserted.data!.id).single();
    expect(after.data).toEqual(inserted.data);

    const demoCompany = await makeCompany(client, a.tenantId, { is_demo: true });
    const demo = await client.from("contacts").insert({ tenant_id: a.tenantId, company_id: demoCompany.id, full_name: "Demo Person", email: `demo@${demoCompany.domain}`, is_demo: true }).select("id").single();
    const calls = hunter.calls.length;
    expect(await verifyContactEmail(client, a.tenantId, demo.data!.id, hunter, { actorUserId: null, policy: DEFAULT_POLICY })).toMatchObject({ ok: false, kind: "ineligible" });
    expect(hunter.calls.length).toBe(calls);
  });
});
