import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { HUNTER_TEST_API_KEY, HunterClient, HunterError, hunterKeyStatus, loadHunterSettings } from "@/server/providers/hunter/client";
import { redactText, setLogSink, type LogRecord } from "@/server/logger";

/**
 * The Hunter client against a fake fetch. Success bodies are the real responses from
 * Hunter's public test credential (fictional "Pied Piper" data), saved as fixtures.
 */
const fixture = (name: string) => JSON.parse(readFileSync(`tests/fixtures/hunter/${name}.json`, "utf8"));
const KEY = "live-unit-test-key-0123456789abcdef";

interface Call {
  url: URL;
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}
const hunterError = (status: number, id: string, details: string, headers: Record<string, string> = {}) =>
  json(status, { errors: [{ id, code: status, details }] }, headers);

function setup(responder: (call: Call, n: number) => Response | Promise<Response>, options: Partial<ConstructorParameters<typeof HunterClient>[0]> = {}) {
  const calls: Call[] = [];
  const sleeps: number[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const call = { url: new URL(String(input instanceof Request ? input.url : input)) };
    calls.push(call);
    void init;
    return responder(call, calls.length);
  }) as unknown as typeof fetch;
  const client = new HunterClient({
    apiKey: KEY,
    fetch: fetchImpl,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 1,
    ...options,
  });
  return { client, calls, sleeps };
}

async function failure(promise: Promise<unknown>): Promise<HunterError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HunterError) return error;
    throw error;
  }
  throw new Error("expected a HunterError");
}

let logs: LogRecord[] = [];
afterEach(() => {
  setLogSink(null);
  logs = [];
  delete process.env.HUNTER_API_KEY;
});
function captureLogs() {
  setLogSink((r) => logs.push(r));
}

describe("requests and parsing", () => {
  it("calls Domain Search with the documented parameters and parses the response", async () => {
    const { client, calls } = setup(() => json(200, fixture("domain-search"), { "x-credits-used": "1", "x-credits-unit": "search" }));
    const result = await client.domainSearch({ domain: "piedpiper.com", limit: 10, type: "personal" });

    expect(calls[0].url.origin + calls[0].url.pathname).toBe("https://api.hunter.io/v2/domain-search");
    expect(Object.fromEntries(calls[0].url.searchParams)).toEqual({ domain: "piedpiper.com", limit: "10", type: "personal", api_key: KEY });
    expect(result.data.data.domain).toBe("piedpiper.com");
    const [person] = result.data.data.emails;
    expect(person).toMatchObject({ value: "richard@piedpiper.com", first_name: "Richard", last_name: "Hendricks", position: "CEO", seniority: "executive" });
    expect(person.verification).toEqual({ date: "2023-01-01", status: "valid" });
    expect(result.meta).toMatchObject({ endpoint: "domain-search", status: 200, attempts: 1, credits: { used: 1, unit: "search" }, testKey: false });
  });

  it("calls Email Finder and Email Verifier with their parameters", async () => {
    const { client, calls } = setup((call) =>
      json(200, fixture(call.url.pathname.endsWith("email-finder") ? "email-finder" : "email-verifier"), { "x-credits-used": "0.5", "x-credits-unit": "verification" }),
    );
    const found = await client.emailFinder({ domain: "piedpiper.com", firstName: "Richard", lastName: "Hendricks" });
    expect(Object.fromEntries(calls[0].url.searchParams)).toEqual({ domain: "piedpiper.com", first_name: "Richard", last_name: "Hendricks", api_key: KEY });
    expect(found.data.data).toMatchObject({ email: "richard@piedpiper.com", score: 99 });

    const verified = await client.emailVerifier({ email: "richard@piedpiper.com" });
    expect(Object.fromEntries(calls[1].url.searchParams)).toEqual({ email: "richard@piedpiper.com", api_key: KEY });
    expect(verified.data.data).toMatchObject({ status: "valid", email: "richard@piedpiper.com", smtp_check: true, accept_all: false });
    expect(verified.meta.credits).toEqual({ used: 0.5, unit: "verification" });
  });

  it("accepts an Email Finder result with no address", async () => {
    const empty = { data: { ...fixture("email-finder").data, email: null, score: null, sources: [] } };
    const { client } = setup(() => json(200, empty));
    expect((await client.emailFinder({ domain: "piedpiper.com", firstName: "No", lastName: "One" })).data.data.email).toBeNull();
  });

  it("keeps Hunter's exact verifier status, including statuses HUNTER does not map", async () => {
    const body = fixture("email-verifier");
    const { client } = setup(() => json(200, { data: { ...body.data, status: "accept_all" } }));
    expect((await client.emailVerifier({ email: "richard@piedpiper.com" })).data.data.status).toBe("accept_all");
  });

  it("recognises Hunter's test credential", () => {
    expect(new HunterClient({ apiKey: HUNTER_TEST_API_KEY }).testKey).toBe(true);
    expect(new HunterClient({ apiKey: KEY }).testKey).toBe(false);
  });

  it("rejects a response that does not match the schema", async () => {
    const { client } = setup(() => json(200, { data: { emails: [] } }));
    const error = await failure(client.domainSearch({ domain: "piedpiper.com" }));
    expect(error.kind).toBe("invalid_response");
    expect(error.message).toContain("data.domain");
  });

  it("rejects a response that is not JSON", async () => {
    const { client } = setup(() => new Response("<html>gateway</html>", { status: 200, headers: { "content-type": "text/html" } }));
    expect((await failure(client.domainSearch({ domain: "piedpiper.com" }))).kind).toBe("invalid_response");
  });
});

describe("Hunter-specific status codes", () => {
  it("retries a 403 rate limit after Retry-After", async () => {
    const { client, calls, sleeps } = setup((_c, n) => (n === 1 ? hunterError(403, "too_many_requests", "Slow down", { "retry-after": "2" }) : json(200, fixture("domain-search"))));
    const result = await client.domainSearch({ domain: "piedpiper.com" });
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([2_000]);
    expect(result.meta.attempts).toBe(2);
  });

  it("does not retry a 429 usage limit", async () => {
    const { client, calls } = setup(() => hunterError(429, "too_many_requests", "Usage limit reached"));
    const error = await failure(client.domainSearch({ domain: "piedpiper.com" }));
    expect(error).toMatchObject({ kind: "quota_exhausted", retryable: false, status: 429 });
    expect(calls).toHaveLength(1);
  });

  it("reports a restricted account as such, with Hunter's reason", async () => {
    const { client, calls } = setup(() => hunterError(429, "restricted_account", "Your account was restricted. Please log in to Hunter for more information."));
    const error = await failure(client.emailVerifier({ email: "richard@piedpiper.com" }));
    expect(error).toMatchObject({ kind: "account_restricted", retryable: false });
    expect(error.message).toContain("Your account was restricted");
    expect(calls).toHaveLength(1);
  });

  it.each([
    [400, "wrong_params", "invalid_request"],
    [401, "authentication_failed", "authentication"],
    [404, "not_found", "not_found"],
    [422, "unprocessable", "invalid_request"],
    [451, "claimed_email", "data_processing_objection"],
  ])("maps %i to a non-retryable %s", async (status, id, kind) => {
    const { client, calls } = setup(() => hunterError(status, id, "Problem"));
    const error = await failure(client.emailFinder({ domain: "piedpiper.com", firstName: "A", lastName: "B" }));
    expect(error).toMatchObject({ kind, retryable: false, status });
    expect(calls).toHaveLength(1);
  });

  it("retries server errors with bounded exponential backoff", async () => {
    const { client, calls, sleeps } = setup(() => json(503, { errors: [{ id: "unavailable", code: 503 }] }));
    const error = await failure(client.domainSearch({ domain: "piedpiper.com" }));
    expect(error).toMatchObject({ kind: "provider_unavailable", retryable: true });
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([1_000, 2_000]);
  });

  it("polls a verifier 202 until the result is ready", async () => {
    const { client, calls, sleeps } = setup((_c, n) => (n < 3 ? json(202, { data: null }) : json(200, fixture("email-verifier"))), { verifierPollIntervalMs: 500 });
    const result = await client.emailVerifier({ email: "richard@piedpiper.com" });
    expect(result.data.data.status).toBe("valid");
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([500, 500]);
  });

  it("gives up after a bounded number of 202 polls", async () => {
    const { client, calls } = setup(() => json(202, { data: null }), { verifierMaxPolls: 2, verifierPollIntervalMs: 10 });
    const error = await failure(client.emailVerifier({ email: "richard@piedpiper.com" }));
    expect(error.kind).toBe("verification_pending");
    expect(calls).toHaveLength(3);
  });

  it("does not retry a verifier 222 now", async () => {
    const { client, calls } = setup(() => json(222, { data: null }));
    expect((await failure(client.emailVerifier({ email: "richard@piedpiper.com" }))).kind).toBe("verification_failed");
    expect(calls).toHaveLength(1);
  });

  it("retries network errors and timeouts", async () => {
    const network = setup((_c, n) => {
      if (n === 1) throw new TypeError("fetch failed");
      return json(200, fixture("domain-search"));
    });
    expect((await network.client.domainSearch({ domain: "piedpiper.com" })).meta.attempts).toBe(2);

    const hang = setup(
      () => new Promise<Response>(() => undefined),
      { timeoutMs: 20, maxAttempts: 1 },
    );
    // A fetch that never settles is aborted by the client's timer.
    const slowFetch = (async (_input: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))) as unknown as typeof fetch;
    const timed = new HunterClient({ apiKey: KEY, fetch: slowFetch, timeoutMs: 20, maxAttempts: 1 });
    expect((await failure(timed.domainSearch({ domain: "piedpiper.com" }))).kind).toBe("timeout");
    void hang;
  });

  it("does not wait longer than the retry limit", async () => {
    const { client, sleeps } = setup(() => hunterError(403, "too_many_requests", "Slow down", { "retry-after": "120" }));
    const error = await failure(client.domainSearch({ domain: "piedpiper.com" }));
    expect(error.kind).toBe("rate_limited");
    expect(sleeps).toEqual([]);
  });
});

describe("secret and personal-data protection", () => {
  it("never puts the API key or request URL in errors or logs", async () => {
    process.env.HUNTER_API_KEY = KEY;
    captureLogs();
    const { client } = setup(() => hunterError(400, "wrong_params", `Bad request https://api.hunter.io/v2/domain-search?domain=x&api_key=${KEY}`));
    const error = await failure(client.domainSearch({ domain: "piedpiper.com" }));
    const text = JSON.stringify(logs) + error.message;
    expect(text).not.toContain(KEY);
    expect(text).not.toMatch(/api_key=[^[]/);
  });

  it("logs the endpoint, outcome and credits, but not names or email addresses", async () => {
    captureLogs();
    const { client } = setup((call) =>
      json(200, fixture(call.url.pathname.endsWith("email-finder") ? "email-finder" : "email-verifier"), { "x-credits-used": "1", "x-credits-unit": "credit" }),
    );
    await client.emailFinder({ domain: "piedpiper.com", firstName: "Richard", lastName: "Hendricks" });
    await client.emailVerifier({ email: "richard@piedpiper.com" });
    const text = JSON.stringify(logs);
    expect(logs[0]).toMatchObject({ scope: "hunter", endpoint: "email-finder", domain: "piedpiper.com", creditsUsed: 1, attempts: 1 });
    expect(text).not.toContain("Richard");
    expect(text).not.toContain("Hendricks");
    expect(text).not.toContain("richard@");
  });

  it("redacts api_key query values anywhere in logged text", () => {
    expect(redactText("GET /v2/email-verifier?email=a%40b.com&api_key=abc123secret&x=1")).toBe("GET /v2/email-verifier?email=a%40b.com&api_key=[redacted]&x=1");
  });

  it("reads the key from the environment and reports only its status", () => {
    expect(() => loadHunterSettings({})).toThrow(/HUNTER_API_KEY is not set/);
    expect(loadHunterSettings({ HUNTER_API_KEY: " test-api-key " })).toEqual({ apiKey: "test-api-key", testKey: true });
    expect(hunterKeyStatus({})).toBe("missing");
    expect(hunterKeyStatus({ HUNTER_API_KEY: "test-api-key" })).toBe("test");
    expect(hunterKeyStatus({ HUNTER_API_KEY: KEY })).toBe("live");
  });
});
