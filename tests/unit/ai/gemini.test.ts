import { afterEach, describe, expect, it } from "vitest";
import { createProvider, DEFAULT_GEMINI_MODEL, loadAiConfig } from "@/server/ai/config";
import { AiError } from "@/server/ai/errors";
import { GeminiProvider, parseGeminiRetryDelay, toGeminiJsonSchema } from "@/server/ai/providers/gemini";
import { PROMPTS, PROMPT_LIST } from "@/server/ai/prompts";
import { buildSystemPrompt } from "@/server/ai/prompts/shared";
import { runPrompt } from "@/server/ai/run";
import type { LlmRequest } from "@/server/ai/types";
import { TEST_CONFIG, aiContext, captureLogs, fakeClock, memoryRecorder } from "./helpers";

/**
 * The Gemini adapter is exercised against a fake fetch returning Gemini API-shaped
 * responses. No request leaves the machine and no credentials are needed.
 */
const API_KEY = "AIzaUnitTestKeyNotReal00000000000000000";
const MODEL = "gemini-3.8-flash";
const classifier = PROMPTS.reply_classifier;
const output = { intent: "wants_meeting", confidence: 0.85, rationale: "Asks for a call.", requiresHuman: false, optOutRequested: false };

interface Captured {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function geminiResponse(overrides: Record<string, unknown> = {}, candidate: Record<string, unknown> = {}) {
  return {
    candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(output) }] }, finishReason: "STOP", ...candidate }],
    usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 120, thoughtsTokenCount: 80, cachedContentTokenCount: 30, totalTokenCount: 1100 },
    modelVersion: "gemini-3.8-flash-001",
    responseId: "resp_test_1",
    ...overrides,
  };
}

function apiError(status: number, statusText: string, message: string, details: unknown[] = []) {
  return json(status, { error: { code: status, message, status: statusText, details } });
}

function fakeFetch(responder: (call: Captured, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Captured[] = [];
  const fn = async (input: string | URL | Request, init?: RequestInit) => {
    const call = {
      url: String(input instanceof Request ? input.url : input),
      headers: new Headers(init?.headers),
      body: init?.body ? JSON.parse(String(init.body)) : {},
    };
    calls.push(call);
    return responder(call, init);
  };
  return { calls, fetch: fn as unknown as typeof fetch };
}

function provider(fetchImpl: typeof fetch) {
  return new GeminiProvider({ apiKey: API_KEY, model: MODEL, fetch: fetchImpl });
}

function request(overrides: Partial<LlmRequest> = {}): LlmRequest {
  return {
    promptId: classifier.id,
    promptVersion: classifier.version,
    system: buildSystemPrompt(classifier),
    user: classifier.buildUser(classifier.example),
    outputSchema: classifier.outputSchema,
    maxTokens: classifier.maxTokens,
    effort: classifier.effort,
    timeoutMs: 5_000,
    ...overrides,
  };
}

async function failure(fetchImpl: typeof fetch, req: LlmRequest = request()): Promise<AiError> {
  try {
    await provider(fetchImpl).generate(req);
  } catch (error) {
    if (error instanceof AiError) return error;
    throw error;
  }
  throw new Error("expected the provider to fail");
}

afterEach(() => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.LLM_PROVIDER;
});

describe("Gemini configuration", () => {
  it("selects Gemini with the default model when a key is set", () => {
    const config = loadAiConfig({ LLM_PROVIDER: "gemini", GEMINI_API_KEY: API_KEY });
    expect(config).toMatchObject({ provider: "gemini", model: DEFAULT_GEMINI_MODEL, apiKey: API_KEY });
    expect(DEFAULT_GEMINI_MODEL).toBe("gemini-3.8-flash");
    const created = createProvider(config);
    expect(created).toBeInstanceOf(GeminiProvider);
    expect(created).toMatchObject({ name: "gemini", synthetic: false, model: "gemini-3.8-flash" });
  });

  it("honours GEMINI_MODEL", () => {
    expect(loadAiConfig({ LLM_PROVIDER: "gemini", GEMINI_API_KEY: API_KEY, GEMINI_MODEL: "gemini-3.8-pro" }).model).toBe("gemini-3.8-pro");
  });

  it("refuses Gemini without a key instead of falling back to another provider", () => {
    for (const env of [
      { LLM_PROVIDER: "gemini" },
      { LLM_PROVIDER: "gemini", GEMINI_API_KEY: "  " },
      // An Anthropic key must not make Gemini work, or switch the provider.
      { LLM_PROVIDER: "gemini", ANTHROPIC_API_KEY: "sk-ant-other-key-123456789" },
    ]) {
      expect(() => loadAiConfig(env)).toThrow(/GEMINI_API_KEY is not set/);
    }
  });
});

describe("Gemini adapter: request", () => {
  it("sends a structured-output generateContent request with the key in a header", async () => {
    const { calls, fetch } = fakeFetch(() => json(200, geminiResponse()));
    const response = await provider(fetch).generate(request());

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.url).toMatch(/\/models\/gemini-3\.8-flash:generateContent$/);
    expect(call.url).not.toContain(API_KEY);
    expect(call.headers.get("x-goog-api-key")).toBe(API_KEY);
    expect(call.body).toMatchObject({
      systemInstruction: { parts: [{ text: buildSystemPrompt(classifier) }] },
      contents: [{ role: "user", parts: [{ text: classifier.buildUser(classifier.example) }] }],
      generationConfig: {
        maxOutputTokens: classifier.maxTokens,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingLevel: "LOW", includeThoughts: false },
      },
    });
    const schema = (call.body.generationConfig as { responseJsonSchema: Record<string, unknown> }).responseJsonSchema;
    expect(schema).toMatchObject({ type: "object", additionalProperties: false });
    expect(JSON.stringify(call.body)).not.toMatch(/"temperature"|"\$schema"/);

    expect(response).toEqual({
      text: JSON.stringify(output),
      model: "gemini-3.8-flash-001",
      stopReason: "STOP",
      usage: { inputTokens: 900, outputTokens: 200, cacheReadInputTokens: 30, cacheCreationInputTokens: 0 },
      providerRequestId: "resp_test_1",
    });
  });

  it("maps each prompt's effort to a thinking level", async () => {
    const { calls, fetch } = fakeFetch(() => json(200, geminiResponse()));
    for (const effort of ["low", "medium", "high"] as const) await provider(fetch).generate(request({ effort }));
    expect(calls.map((c) => (c.body.generationConfig as { thinkingConfig: { thinkingLevel: string } }).thinkingConfig.thinkingLevel)).toEqual([
      "LOW",
      "MEDIUM",
      "HIGH",
    ]);
  });

  it("ignores thought parts and joins text parts", async () => {
    const { fetch } = fakeFetch(() =>
      json(200, geminiResponse({}, { content: { role: "model", parts: [{ text: "internal reasoning", thought: true }, { text: '{"a":' }, { text: "1}" }] } })),
    );
    expect((await provider(fetch).generate(request())).text).toBe('{"a":1}');
  });

  it("reports null usage when Gemini sends none", async () => {
    const { fetch } = fakeFetch(() => json(200, geminiResponse({ usageMetadata: undefined })));
    expect((await provider(fetch).generate(request())).usage).toBeNull();
  });

  it("does not let the SDK retry on its own", async () => {
    const { calls, fetch } = fakeFetch(() => apiError(503, "UNAVAILABLE", "The model is overloaded."));
    await failure(fetch);
    expect(calls).toHaveLength(1);
  });
});

describe("Gemini adapter: schema for the API", () => {
  it("keeps only keywords Gemini supports; Zod still enforces the rest", () => {
    const schema = JSON.stringify(toGeminiJsonSchema(PROMPTS.company_researcher.outputSchema));
    for (const removed of ['"minLength"', '"maxLength"', '"pattern"', '"$schema"']) expect(schema).not.toContain(removed);
    for (const kept of ['"required"', '"additionalProperties"', '"enum"', '"maxItems"']) expect(schema).toContain(kept);
    const tooLong = { ...PROMPTS.reply_classifier.mockFixture(PROMPTS.reply_classifier.example), rationale: "x".repeat(301) };
    expect(PROMPTS.reply_classifier.outputSchema.safeParse(tooLong).success).toBe(false);
  });

  it.each(PROMPT_LIST.map((p) => [p.id, p] as const))("%s converts to a Gemini schema", (_id, prompt) => {
    expect(toGeminiJsonSchema(prompt.outputSchema)).toMatchObject({ type: "object" });
  });
});

describe("Gemini adapter: error classification", () => {
  it("maps 429 to a retryable rate limit using Gemini's retryDelay", async () => {
    const error = await failure(
      fakeFetch(() =>
        apiError(429, "RESOURCE_EXHAUSTED", "Quota exceeded.", [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "7s" }]),
      ).fetch,
    );
    expect(error).toMatchObject({ kind: "rate_limited", retryable: true, retryAfterMs: 7_000, status: 429 });
  });

  it.each([
    [500, "INTERNAL"],
    [503, "UNAVAILABLE"],
    [504, "DEADLINE_EXCEEDED"],
  ])("maps %i to a retryable provider_unavailable", async (status, statusText) => {
    const error = await failure(fakeFetch(() => apiError(status, statusText, "Service problem.")).fetch);
    expect(error).toMatchObject({ kind: "provider_unavailable", retryable: true, status });
  });

  it.each([
    [400, "INVALID_ARGUMENT", "API key not valid. Please pass a valid API key.", "authentication"],
    [403, "PERMISSION_DENIED", "Permission denied.", "authentication"],
    [400, "INVALID_ARGUMENT", "Invalid JSON payload received.", "provider_rejected"],
    [404, "NOT_FOUND", "models/gemini-unknown is not found.", "provider_rejected"],
  ])("maps %i %s to a non-retryable error", async (status, statusText, message, kind) => {
    const error = await failure(fakeFetch(() => apiError(status, statusText, message)).fetch);
    expect(error).toMatchObject({ kind, retryable: false, status });
  });

  it("maps a network failure to a retryable network error", async () => {
    const error = await failure(
      fakeFetch(() => {
        throw new TypeError("fetch failed");
      }).fetch,
    );
    expect(error).toMatchObject({ kind: "network", retryable: true });
  });

  it("maps a slow response to a retryable timeout, and a cancellation to deadline_exceeded", async () => {
    const hang = fakeFetch(
      (_call, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
        }),
    ).fetch;
    expect(await failure(hang, request({ timeoutMs: 50 }))).toMatchObject({ kind: "timeout", retryable: true });

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);
    expect(await failure(hang, request({ timeoutMs: 5_000, signal: controller.signal }))).toMatchObject({ kind: "deadline_exceeded" });
  });

  it("maps safety stops and blocked prompts to refused", async () => {
    const safety = await failure(fakeFetch(() => json(200, geminiResponse({}, { finishReason: "SAFETY", content: { parts: [] } }))).fetch);
    expect(safety).toMatchObject({ kind: "refused", retryable: false });
    expect(safety.message).toContain("SAFETY");
    expect(safety.usage?.inputTokens).toBe(900);

    const blocked = await failure(fakeFetch(() => json(200, { promptFeedback: { blockReason: "PROHIBITED_CONTENT" }, usageMetadata: { promptTokenCount: 10 } })).fetch);
    expect(blocked).toMatchObject({ kind: "refused" });
    expect(blocked.message).toContain("PROHIBITED_CONTENT");
  });

  it("maps MAX_TOKENS to truncated and other stops to provider_rejected", async () => {
    expect(await failure(fakeFetch(() => json(200, geminiResponse({}, { finishReason: "MAX_TOKENS" }))).fetch)).toMatchObject({ kind: "truncated" });
    expect(await failure(fakeFetch(() => json(200, geminiResponse({}, { finishReason: "LANGUAGE" }))).fetch)).toMatchObject({ kind: "provider_rejected" });
  });

  it("never puts the API key in an error message", async () => {
    process.env.GEMINI_API_KEY = API_KEY;
    const error = await failure(fakeFetch(() => apiError(400, "INVALID_ARGUMENT", `Bad request for key ${API_KEY}`)).fetch);
    expect(error.message).not.toContain(API_KEY);
  });

  it("parses retryDelay values", () => {
    const body = (delay: string) => JSON.stringify({ error: { details: [{ retryDelay: delay }] } });
    expect(parseGeminiRetryDelay(body("7s"))).toBe(7_000);
    expect(parseGeminiRetryDelay(body("1.5s"))).toBe(1_500);
    expect(parseGeminiRetryDelay(body("soon"))).toBeNull();
    expect(parseGeminiRetryDelay("not json")).toBeNull();
  });
});

describe("Gemini through the runner", () => {
  it("validates Gemini JSON with the prompt's Zod schema, and does not trust it blindly", async () => {
    const invalid = { ...output, intent: "maybe", extra: true };
    const { calls, fetch } = fakeFetch(() => json(200, geminiResponse({}, { content: { parts: [{ text: JSON.stringify(invalid) }] } })));
    const { records, recorder } = memoryRecorder();
    const result = await runPrompt(classifier, classifier.example, aiContext(recorder), { provider: provider(fetch), config: TEST_CONFIG });
    expect(!result.ok && result.error.kind).toBe("schema_validation");
    expect(calls).toHaveLength(2); // one repair attempt
    expect(records[0]).toMatchObject({ provider: "gemini", status: "failed", errorKind: "schema_validation", output: null });
  });

  it("applies the prompt's guards to Gemini output", async () => {
    const inconsistent = { ...output, intent: "unsubscribe", optOutRequested: false };
    const { fetch } = fakeFetch(() => json(200, geminiResponse({}, { content: { parts: [{ text: JSON.stringify(inconsistent) }] } })));
    const { recorder } = memoryRecorder();
    const result = await runPrompt(classifier, classifier.example, aiContext(recorder), { provider: provider(fetch), config: TEST_CONFIG });
    expect(!result.ok && result.error.kind).toBe("guard_failed");
  });

  it("retries a rate limit after Gemini's retryDelay and records the provider and served model", async () => {
    let n = 0;
    const { calls, fetch } = fakeFetch(() =>
      ++n === 1
        ? apiError(429, "RESOURCE_EXHAUSTED", "Quota exceeded.", [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "3s" }])
        : json(200, geminiResponse()),
    );
    const clock = fakeClock();
    const { records, recorder } = memoryRecorder();
    const result = await runPrompt(classifier, classifier.example, aiContext(recorder), {
      provider: provider(fetch),
      config: TEST_CONFIG,
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(clock.sleeps).toEqual([3_000]);
    expect(result.meta).toMatchObject({ provider: "gemini", model: "gemini-3.8-flash-001", synthetic: false, attempts: 2 });
    expect(records[0]).toMatchObject({ provider: "gemini", model: "gemini-3.8-flash-001", providerRequestId: "resp_test_1", status: "succeeded" });
    expect(records[0].usage).toEqual({ inputTokens: 900, outputTokens: 200, cacheReadInputTokens: 30, cacheCreationInputTokens: 0 });
  });

  it("fails on a Gemini outage without falling back to another provider", async () => {
    const { calls, fetch } = fakeFetch(() => apiError(503, "UNAVAILABLE", "Overloaded."));
    const clock = fakeClock();
    const { records, recorder } = memoryRecorder();
    const result = await runPrompt(classifier, classifier.example, aiContext(recorder), {
      provider: provider(fetch),
      config: TEST_CONFIG,
      now: clock.now,
      sleep: clock.sleep,
      random: () => 1,
    });
    expect(!result.ok && result.error.kind).toBe("provider_unavailable");
    expect(calls).toHaveLength(TEST_CONFIG.maxAttempts);
    expect(result.meta).toMatchObject({ provider: "gemini", synthetic: false });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ provider: "gemini", status: "failed", output: null });
  });

  it("records a configuration failure as gemini when selected without a key", async () => {
    process.env.LLM_PROVIDER = "gemini";
    const { records, recorder } = memoryRecorder();
    const result = await runPrompt(classifier, classifier.example, aiContext(recorder));
    expect(!result.ok && result.error.kind).toBe("configuration");
    expect(records[0]).toMatchObject({ provider: "gemini", status: "failed", synthetic: false });
  });

  it("never logs or records the API key, even on authentication failure", async () => {
    process.env.GEMINI_API_KEY = API_KEY;
    const logs = captureLogs();
    try {
      const { fetch } = fakeFetch(() => apiError(400, "INVALID_ARGUMENT", `API key not valid: ${API_KEY}`));
      const { records, recorder } = memoryRecorder();
      const result = await runPrompt(classifier, classifier.example, aiContext(recorder), { provider: provider(fetch), config: TEST_CONFIG });
      expect(!result.ok && result.error.kind).toBe("authentication");
      for (const text of [JSON.stringify(logs.records), JSON.stringify(records), JSON.stringify(result)]) expect(text).not.toContain(API_KEY);
    } finally {
      logs.stop();
    }
  });
});
